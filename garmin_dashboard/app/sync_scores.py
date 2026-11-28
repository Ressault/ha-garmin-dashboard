"""Synchro Garmin : scores et indicateurs de forme.

Seuils de la montre, VO2 max, âge physique, endurance, montée, Body Battery du jour, prédictions de chrono,
et le calcul local de la charge (CTL / ATL / TSB).
"""

import json
from datetime import date, datetime, timedelta
from typing import Any, Optional

import db
from sync_utils import num, pick, deep_find, safe, downsample, daterange

CTL_DAYS = 42
ATL_DAYS = 7


def sync_thresholds(client, conn, errors: list) -> int:
    """Seuils de la montre : FC et allure au seuil lactique, puissance seuil de course, FTP vélo."""
    lt = safe("seuil lactique", errors, client.get_lactate_threshold, latest=True) or {}
    shr = lt.get("speed_and_heart_rate") or {}
    pw = lt.get("power") or {}
    bike = safe("FTP vélo", errors, client.get_cycling_ftp)
    if isinstance(bike, list):
        bike = bike[0] if bike else {}
    zones = safe("zones FC", errors, client.get_heart_rate_zones)
    z = next((x for x in (zones or []) if x.get("sport") == "DEFAULT"), (zones or [{}])[0] if zones else {})

    speed = num(shr.get("speed"))
    row = {
        "date": date.today().isoformat(),
        "lthr_bpm": num(shr.get("heartRate"), 0),
        # Garmin renvoie cette vitesse en dizaines de m/s (0,3639 -> 3,64 m/s = 4:35 /km),
        # vérifié contre l'écran « Seuil lactique de course » de l'appli Garmin Connect.
        "lt_speed_ms": round(speed * 10, 3) if speed else None,
        "lt_date": (shr.get("calendarDate") or "")[:10] or None,
        "run_ftp_w": num(pw.get("functionalThresholdPower"), 0),
        "run_wkg": num(pw.get("powerToWeight"), 2),
        "weight_kg": num(pw.get("weight"), 1),
        "run_ftp_date": (pw.get("ftpCreateTime") or pw.get("calendarDate") or "")[:10] or None,
        "run_ftp_stale": int(bool(pw.get("isStale"))) if pw else None,
        "bike_ftp_w": num((bike or {}).get("functionalThresholdPower"), 0),
        "bike_ftp_stale": int(bool((bike or {}).get("isStale"))) if bike else None,
        "max_hr_bpm": num(z.get("maxHeartRateUsed"), 0),
        "resting_hr_bpm": num(z.get("restingHeartRateUsed"), 0),
    }
    if all(v is None for k, v in row.items() if k != "date"):
        return 0
    db.upsert(conn, "thresholds", "date", row)
    return 1


def sync_fitness_scores(client, conn, errors: list, light: bool = False, stats: Optional[dict] = None) -> int:
    """Relève les scores du jour ; chaque synchro ajoute un point à l'historique.

    `light` : seulement la Body Battery (les autres scores bougent au plus une fois par jour,
    la synchro complète s'en charge). `stats` : résumé du jour déjà téléchargé, s'il l'est."""
    day = date.today().isoformat()
    row: dict[str, Any] = {"date": day}
    if light:
        return _sync_body_battery(client, conn, errors, day, row, stats)

    mm = safe("max_metrics", errors, client.get_max_metrics, day)
    row["vo2max"] = num(deep_find(mm, "vo2MaxPreciseValue", "vo2MaxValue"), 1) if mm else None
    if row["vo2max"] is None:
        ts = safe("training_status", errors, client.get_training_status, day)
        row["vo2max"] = num(deep_find(ts, "vo2MaxPreciseValue", "vo2MaxValue"), 1) if ts else None

    fa = safe("fitness_age", errors, client.get_fitnessage_data, day)
    if isinstance(fa, dict):
        row["fitness_age"] = num(fa.get("fitnessAge"), 1)
        row["chrono_age"] = num(fa.get("chronologicalAge"), 0)
        row["fitness_age_target"] = num(fa.get("achievableFitnessAge"), 1)
    if row.get("fitness_age") is None and mm:
        row["fitness_age"] = num(deep_find(mm, "fitnessAge"), 1)

    en = safe("endurance_score", errors, client.get_endurance_score, day)
    row["endurance_score"] = num(deep_find(en, "overallScore"), 0) if en else None
    if isinstance(en, dict) and en.get("overallScore") is not None:
        row["endurance_class"] = num(en.get("classification"), 0)
        limits = {k: en.get(k) for k in (
            "gaugeLowerLimit", "classificationLowerLimitIntermediate", "classificationLowerLimitTrained",
            "classificationLowerLimitWellTrained", "classificationLowerLimitExpert",
            "classificationLowerLimitSuperior", "classificationLowerLimitElite", "gaugeUpperLimit",
        )}
        if all(isinstance(v, (int, float)) for v in limits.values()):
            row["endurance_limits_json"] = json.dumps(limits, separators=(",", ":"))
    hs = safe("hill_score", errors, client.get_hill_score, day)
    row["hill_score"] = num(deep_find(hs, "overallScore"), 0) if hs else None
    if isinstance(hs, dict):
        row["hill_class"] = num(hs.get("hillScoreClassificationId"), 0)
        row["hill_strength"] = num(hs.get("strengthScore"), 0)
        row["hill_endurance"] = num(hs.get("enduranceScore"), 0)

    return _sync_body_battery(client, conn, errors, day, row, stats)


def _sync_body_battery(client, conn, errors: list, day: str, row: dict, stats: Optional[dict] = None) -> int:
    bb = safe("body_battery", errors, client.get_body_battery, day, day)
    tl = _bb_timeline(bb) if bb else None
    # Valeur « maintenant » : celle que Garmin donne dans le résumé du jour (la même que Garmin Connect).
    # La courbe détaillée peut s'arrêter plusieurs heures avant, on ne s'en sert qu'en secours.
    if not stats:
        stats = safe("body_battery_now", errors, client.get_stats, day) or {}
    # Heure de la dernière donnée reçue de la montre (fin de la plage couverte par le résumé du jour)
    measured = str(stats.get("wellnessEndTimeLocal") or "").split(".")[0] if isinstance(stats, dict) else ""
    if measured:
        db.set_setting(conn, "last_measure_at", measured)
    now_val = num(stats.get("bodyBatteryMostRecentValue"), 0) if isinstance(stats, dict) else None
    if tl:
        if now_val is not None and tl[-1][1] != now_val:
            end = str(stats.get("wellnessEndTimeLocal") or "")
            try:
                t = datetime.fromisoformat(end.split(".")[0]) if end else datetime.now()
            except ValueError:
                t = datetime.now()
            minute = t.hour * 60 + t.minute
            if minute > tl[-1][0]:
                tl.append([minute, int(now_val)])
        row["body_battery_json"] = json.dumps(tl, separators=(",", ":"))
        row["body_battery_now"] = float(now_val if now_val is not None else tl[-1][1])
    elif now_val is not None:
        row["body_battery_now"] = float(now_val)

    if all(v is None for k, v in row.items() if k != "date"):
        return 0
    conn.execute("INSERT OR IGNORE INTO daily_health (date) VALUES (?)", (day,))
    db.upsert(conn, "daily_health", "date", row)
    return 1


def _bb_timeline(raw) -> Optional[list]:
    """Courbe Body Battery du jour : [[minute_locale, valeur], ...] (≈ 1 point / 10 min)."""
    items = raw if isinstance(raw, list) else [raw]
    pts: list[list[float]] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        for p in it.get("bodyBatteryValuesArray") or []:
            if not isinstance(p, (list, tuple)) or len(p) < 2:
                continue
            ts = p[0]
            val = next((x for x in p[1:] if isinstance(x, (int, float)) and not isinstance(x, bool)), None)
            if ts is None or val is None:
                continue
            t = datetime.fromtimestamp(float(ts) / 1000.0)
            pts.append([t.hour * 60 + t.minute, int(val)])
    if not pts:
        return None
    pts.sort()
    return downsample(pts, 150)


def _collect_dated(obj: Any, keys: tuple, out: dict) -> None:
    """Parcourt une réponse Garmin et relève {date: valeur} pour les clés de score données."""
    if isinstance(obj, dict):
        day = obj.get("calendarDate") or obj.get("date")
        val = next((obj.get(k) for k in keys if isinstance(obj.get(k), (int, float))), None)
        if day and val is not None:
            out[str(day)[:10]] = float(val)
        for k, v in obj.items():
            if isinstance(v, dict) and len(str(k)) == 10 and str(k)[4] == "-":
                val = next((v.get(x) for x in keys if isinstance(v.get(x), (int, float))), None)
                if val is not None:
                    out.setdefault(str(k), float(val))
            _collect_dated(v, keys, out)
    elif isinstance(obj, list):
        for v in obj:
            _collect_dated(v, keys, out)


def backfill_fitness_history(client, conn, errors: list, days: int = 120) -> int:
    """Historique des scores d'endurance / montée (plages Garmin) et du VO2 max (activités)."""
    today = date.today()
    start = (today - timedelta(days=days)).isoformat()
    n = 0
    for col, fn, keys in (
        ("endurance_score", client.get_endurance_score, ("overallScore", "groupAverage")),
        ("hill_score", client.get_hill_score, ("overallScore",)),
    ):
        have = conn.execute(f"SELECT COUNT(*) FROM daily_health WHERE {col} IS NOT NULL").fetchone()[0]
        if have >= 20:
            continue
        found: dict[str, float] = {}
        resp = safe(f"{col} range", errors, fn, start, today.isoformat())
        if resp:
            _collect_dated(resp, keys, found)
        for d, v in found.items():
            conn.execute("INSERT OR IGNORE INTO daily_health (date) VALUES (?)", (d,))
            conn.execute(f"UPDATE daily_health SET {col} = ? WHERE date = ? AND {col} IS NULL", (round(v), d))
            n += 1
    # VO2 max : valeur de la dernière sortie avec mesure, reportée jour après jour
    last = None
    for r in conn.execute(
        "SELECT activity_date AS d, vo2max FROM activities WHERE vo2max IS NOT NULL AND activity_date >= ? ORDER BY activity_date",
        (start,),
    ):
        conn.execute("INSERT OR IGNORE INTO daily_health (date) VALUES (?)", (r["d"][:10],))
        conn.execute("UPDATE daily_health SET vo2max = ? WHERE date = ? AND vo2max IS NULL", (r["vo2max"], r["d"][:10]))
        n += 1
    return n


def prediction_row(entry: dict) -> Optional[dict]:
    day = pick(entry, "calendarDate", "date", "fromCalendarDate")
    if not day:
        return None
    return {
        "date": str(day)[:10],
        "time_5k_s": num(entry.get("time5K"), 0),
        "time_10k_s": num(entry.get("time10K"), 0),
        "time_half_s": num(entry.get("timeHalfMarathon"), 0),
        "time_marathon_s": num(entry.get("timeMarathon"), 0),
    }


def sync_predictions(client, conn, start: date, end: date, errors: list) -> int:
    count = 0
    data = safe(
        "race_predictions daily",
        errors,
        client.get_race_predictions,
        start.isoformat(),
        end.isoformat(),
        "daily",
    )
    entries = data if isinstance(data, list) else (data or {}).get("racePredictions") or []
    latest = safe("race_predictions latest", errors, client.get_race_predictions)
    if isinstance(latest, dict):
        latest.setdefault("calendarDate", end.isoformat())
        entries = list(entries) + [latest]
    for e in entries:
        row = prediction_row(e) if isinstance(e, dict) else None
        if row:
            db.upsert(conn, "race_predictions", "date", row)
            count += 1
    return count


def recompute_fitness(conn) -> int:
    """Modèle impulsion-réponse (Banister / PMC) sur la charge Garmin par jour.

    CTL_j = CTL_{j-1} + (charge_j - CTL_{j-1}) / 42
    ATL_j = ATL_{j-1} + (charge_j - ATL_{j-1}) / 7
    TSB_j = CTL_j - ATL_j
    """
    loads = {
        r["activity_date"]: r["load"]
        for r in conn.execute(
            "SELECT activity_date, SUM(training_load) AS load FROM activities "
            "WHERE activity_date IS NOT NULL GROUP BY activity_date"
        )
    }
    first = conn.execute(
        "SELECT MIN(d) FROM (SELECT MIN(activity_date) d FROM activities "
        "UNION SELECT MIN(date) FROM daily_health)"
    ).fetchone()[0]
    if not first:
        return 0

    ctl = atl = 0.0
    n = 0
    for d in daterange(date.fromisoformat(first), date.today()):
        key = d.isoformat()
        load = loads.get(key) or 0.0
        ctl += (load - ctl) / CTL_DAYS
        atl += (load - atl) / ATL_DAYS
        tsb = ctl - atl
        if d < db.HISTORY_START:
            continue  # sert seulement à amorcer le calcul : aucun jour vide n'est créé avant l'historique
        conn.execute(
            "INSERT INTO daily_health (date, daily_load, ctl, atl, tsb) VALUES (?,?,?,?,?) "
            "ON CONFLICT(date) DO UPDATE SET daily_load=excluded.daily_load, "
            "ctl=excluded.ctl, atl=excluded.atl, tsb=excluded.tsb",
            (key, round(load, 1), round(ctl, 1), round(atl, 1), round(tsb, 1) + 0.0),
        )
        n += 1
    # Jours antérieurs à l'historique et sans aucune mesure Garmin : restes d'anciennes synchros
    conn.execute(
        "DELETE FROM daily_health WHERE date < ? AND sleep_score IS NULL AND hrv_last_night_ms IS NULL "
        "AND resting_hr IS NULL AND body_battery_max IS NULL AND vo2max IS NULL AND readiness_score IS NULL",
        (db.HISTORY_START.isoformat(),),
    )
    return n
