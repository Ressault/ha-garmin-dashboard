"""Synchronisation Garmin Connect -> SQLite (incrémentale, sans doublons).

Usage en ligne de commande :
    python sync.py --days 30            # synchro incrémentale
    python sync.py --days 30 --force    # re-télécharge tout le détail

Ce que fait une synchro de N jours :
  1. Résumés d'activités sur N + 90 jours (un seul appel paginé, léger) :
     ils servent à amorcer correctement CTL (42 j) / ATL (7 j).
  2. Détail complet des activités des N derniers jours pas encore détaillées :
     dynamiques HRM-600, zones FC, splits, trace GPS, série temporelle,
     courbe de puissance.
  3. Santé quotidienne sur N jours (les jours déjà complets sont sautés,
     sauf les 2 derniers qui peuvent encore évoluer).
  4. Prédictions de chrono (historique quotidien sur la fenêtre).
  5. Recalcul CTL / ATL / TSB sur tout l'historique en base.

Le code est réparti par thème :
  sync_utils.py       aides communes
  sync_activities.py  résumé et détail des sorties
  sync_health.py      santé jour par jour
  sync_scores.py      seuils, scores, prédictions, charge (CTL / ATL / TSB)
  sync.py (ce fichier) l'enchaînement : synchro complète et synchro légère
"""

import argparse
import json
import sys
import threading
import time
from datetime import date, datetime, timedelta
from typing import Any

import db
from sync_utils import daterange
from sync_activities import activity_detail_row, backfill_power_curves, backfill_segments, store_detail, upsert_summary
from sync_health import backfill_health_details, daily_health_row
from sync_scores import backfill_fitness_history, recompute_fitness, sync_fitness_scores, sync_predictions, sync_thresholds

WARMUP_DAYS = 90

SYNC_LOCK = threading.Lock()


class GarminUnreachable(RuntimeError):
    """Garmin n'a pas répondu à l'appel de base : la synchro est abandonnée et sera retentée."""


def _fetch_activities(client, start: date, end: date) -> list:
    try:
        return client.get_activities_by_date(start.isoformat(), end.isoformat()) or []
    except Exception as exc:
        from garmin_client import reset_client

        reset_client()  # la prochaine synchro se reconnectera avec le jeton enregistré
        raise GarminUnreachable(f"Garmin ne répond pas ({type(exc).__name__} : {exc})") from exc


def run_sync(days: int = 30, force: bool = False, client=None, log=print) -> dict:
    if not SYNC_LOCK.acquire(blocking=False):
        raise RuntimeError("Une synchronisation est déjà en cours.")
    try:
        return _run_sync(days, force, client, log)
    finally:
        SYNC_LOCK.release()


def _run_sync(days: int, force: bool, client, log) -> dict:
    if client is None:
        from garmin_client import get_garmin_client

        client = get_garmin_client()

    db.init_db()
    started = datetime.now().isoformat(timespec="seconds")
    t0 = time.time()
    today = date.today()
    window_start = today - timedelta(days=days - 1)
    recent_cutoff = (today - timedelta(days=2)).isoformat()
    errors: list[str] = []
    summary: dict[str, Any] = {"days": days, "force": force}

    with db.connect() as conn:
        # 1. Résumés (fenêtre + amorçage CTL)
        warm_start = window_start - timedelta(days=WARMUP_DAYS)
        log(f"[1/5] Résumés d'activités du {warm_start} au {today}...")
        acts = _fetch_activities(client, warm_start, today)
        for act in acts:
            aid = upsert_summary(conn, act)
            if aid:
                # Zones de FC issues du résumé (sans bornes) tant que le détail n'a pas été récupéré
                zsecs = [act.get(f"hrTimeInZone_{i}") for i in range(1, 6)]
                if any(v is not None for v in zsecs):
                    conn.execute(
                        "UPDATE activities SET hr_zones_json = ? WHERE activity_id = ? AND hr_zones_json IS NULL",
                        (db.to_json([{"zone": i + 1, "low_bpm": None, "secs": float(v or 0)}
                                     for i, v in enumerate(zsecs)]), aid),
                    )
        conn.commit()
        summary["activities_summaries"] = len(acts)

        # 2. Détail des activités de la fenêtre
        todo = [
            r["activity_id"]
            for r in conn.execute(
                "SELECT activity_id FROM activities WHERE activity_date >= ? "
                "AND (details_synced = 0 OR ?) "
                "ORDER BY activity_date",
                (window_start.isoformat(), int(force)),
            )
        ]
        log(f"[2/5] Détail de {len(todo)} activité(s)...")
        for i, aid in enumerate(todo, 1):
            store_detail(conn, activity_detail_row(client, aid, errors))
            conn.commit()
            log(f"      {i}/{len(todo)} : {aid}")
        summary["activities_detailed"] = len(todo)
        summary["segments_backfilled"] = backfill_segments(client, conn, errors, log)

        # 3. Santé quotidienne
        done = {
            r["date"]
            for r in conn.execute(
                "SELECT date FROM daily_health WHERE health_synced = 1 AND date < ?",
                (recent_cutoff,),
            )
        }
        days_todo = [
            d.isoformat()
            for d in daterange(window_start, today)
            if force or d.isoformat() not in done
        ]
        log(f"[3/5] Santé quotidienne : {len(days_todo)} jour(s)...")
        for day in days_todo:
            db.upsert(conn, "daily_health", "date", daily_health_row(client, day, errors))
            conn.commit()
        summary["health_days"] = len(days_todo)
        summary["health_details_backfilled"] = backfill_health_details(client, conn, errors, log)

        # 4. Prédictions
        log("[4/5] Prédictions de chrono...")
        summary["predictions"] = sync_predictions(client, conn, window_start, today, errors)
        conn.commit()
        summary["thresholds"] = sync_thresholds(client, conn, errors)
        summary["fitness_scores"] = sync_fitness_scores(client, conn, errors)
        summary["fitness_history"] = backfill_fitness_history(client, conn, errors)
        conn.commit()

        # 5. CTL / ATL / TSB
        log("[5/5] Calcul CTL / ATL / TSB + courbes de puissance manquantes...")
        summary["fitness_days"] = recompute_fitness(conn)
        summary["power_curves_backfilled"] = backfill_power_curves(conn)

        summary["errors"] = errors[:50]
        summary["error_count"] = len(errors)
        summary["duration_s"] = round(time.time() - t0, 1)
        conn.execute(
            "INSERT INTO sync_log (started_at, finished_at, days, summary_json) VALUES (?,?,?,?)",
            (started, datetime.now().isoformat(timespec="seconds"), days,
             json.dumps(summary, ensure_ascii=False)),
        )
        conn.commit()

    log(f"Terminé en {summary['duration_s']} s — {len(errors)} erreur(s) non bloquante(s).")
    return summary


def run_light_sync(client=None, log=print) -> dict:
    """Synchro légère (toutes les 30 min) : les 3 derniers jours d'activités, la santé et la Body Battery du jour.

    Elle laisse de côté les prédictions, les seuils, les scores et l'historique de forme, qui bougent peu et
    coûtent le plus de requêtes : la synchro complète s'en charge (toutes les 6 heures).
    Environ 6 appels à Garmin, 8 tant que la nuit n'est pas reçue."""
    if not SYNC_LOCK.acquire(blocking=False):
        raise RuntimeError("Une synchronisation est déjà en cours.")
    try:
        if client is None:
            from garmin_client import get_garmin_client

            client = get_garmin_client()
        db.init_db()
        started = datetime.now().isoformat(timespec="seconds")
        t0 = time.time()
        today = date.today()
        since = today - timedelta(days=2)
        errors: list[str] = []
        summary: dict[str, Any] = {"days": 3, "light": True}
        with db.connect() as conn:
            acts = _fetch_activities(client, since, today)
            for act in acts:
                upsert_summary(conn, act)
            conn.commit()
            summary["activities_summaries"] = len(acts)

            # Détail seulement des sorties pas encore détaillées (nouvelles)
            todo = [
                r["activity_id"]
                for r in conn.execute(
                    "SELECT activity_id FROM activities WHERE activity_date >= ? AND details_synced = 0 ORDER BY activity_date",
                    (since.isoformat(),),
                )
            ]
            for aid in todo:
                store_detail(conn, activity_detail_row(client, aid, errors))
                conn.commit()
            summary["activities_detailed"] = len(todo)

            # La nuit (sommeil, VFC) ne change plus une fois reçue : on ne la redemande pas toutes les 30 min
            night = conn.execute(
                "SELECT 1 FROM daily_health WHERE date = ? AND sleep_score IS NOT NULL "
                "AND hrv_last_night_ms IS NOT NULL AND sleep_json IS NOT NULL",
                (today.isoformat(),),
            ).fetchone()
            got: dict = {}
            db.upsert(conn, "daily_health", "date",
                      daily_health_row(client, today.isoformat(), errors, skip_night=bool(night), out=got))
            conn.commit()
            summary["health_days"] = 1
            summary["fitness_scores"] = sync_fitness_scores(client, conn, errors, light=True, stats=got.get("stats"))
            conn.commit()
            if todo:
                summary["fitness_days"] = recompute_fitness(conn)
                summary["power_curves_backfilled"] = backfill_power_curves(conn)
            summary["errors"] = errors[:50]
            summary["error_count"] = len(errors)
            summary["duration_s"] = round(time.time() - t0, 1)
            conn.execute(
                "INSERT INTO sync_log (started_at, finished_at, days, summary_json) VALUES (?,?,?,?)",
                (started, datetime.now().isoformat(timespec="seconds"), 3, json.dumps(summary, ensure_ascii=False)),
            )
            conn.commit()
        log(f"Synchro légère terminée en {summary['duration_s']} s — {len(errors)} erreur(s) non bloquante(s).")
        return summary
    finally:
        SYNC_LOCK.release()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Synchro Garmin -> garmin_local.db")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    result = run_sync(args.days, args.force)
    print(json.dumps(result, ensure_ascii=False, indent=2))
