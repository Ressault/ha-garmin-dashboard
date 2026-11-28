"""
API REST locale du tableau de bord Garmin.

Lancement :  uvicorn main:app --host 127.0.0.1 --port 8000
Doc interactive : http://127.0.0.1:8000/docs
"""

from datetime import date, timedelta
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import json
import os
from pathlib import Path

import auth
import coach
import db
import plans
import stats
import sync

app = FastAPI(title="Garmin Dashboard local", version="0.1.0")
# Pas de réglage CORS : l'interface et l'API ont la même origine (en développement, Vite relaie /api).
# Un autre site web ouvert dans le navigateur ne peut donc pas lire l'API.

# Compression des réponses (interface ~2 Mo → ~600 Ko, JSON ÷ 6) : l'appli s'ouvre bien plus vite sur téléphone.
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def _cache_headers(request, call_next):
    """Les fichiers de /assets portent un hash dans leur nom : le navigateur peut les garder sans rien redemander."""
    # Code d'accès : toutes les routes /api sauf l'état de santé et l'écran de saisie du code
    if auth.needs_auth(request.url.path) and not auth.is_authorized(request):
        return JSONResponse({"detail": "Code d'accès requis."}, status_code=401)
    resp = await call_next(request)
    if request.url.path.startswith("/assets/"):
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif request.url.path in ("/", "/index.html", "/manifest.webmanifest", "/sw.js"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


app.include_router(auth.router)
app.include_router(stats.router)
app.include_router(plans.router)
app.include_router(coach.router)

JSON_COLS = ("hr_zones_json", "power_curve_json", "splits_json", "track_json", "timeseries_json", "segments_json")
LIST_COLS = (
    "activity_id, name, sport_type, start_time_local, activity_date, distance_m, duration_s, moving_duration_s, "
    "elevation_gain_m, elevation_loss_m, avg_speed_ms, avg_hr, max_hr, aerobic_te, "
    "anaerobic_te, training_load, ground_contact_ms, gct_balance_left_pct, "
    "vertical_oscillation_cm, stride_length_cm, avg_power_w, avg_cadence_spm, vertical_ratio_pct, "
    "notes IS NOT NULL OR ai_analysis IS NOT NULL AS has_notes, track_json"
)


AUTO_SYNC_MINUTES = 30  # synchro légère (Body Battery, disponibilité, nouvelles sorties)
FULL_SYNC_MINUTES = 360  # synchro complète (prédictions, seuils, scores, historique de forme)
QUIET_HOURS = (0, 6)  # pas de synchro légère la nuit : la montre n'envoie rien avant le réveil
HISTORY_START = db.HISTORY_START
# GARMIN_AUTO_SYNC : "on" (défaut, add-on Home Assistant), "startup" (une synchro au lancement puis plus
# rien : copie d'essai sur le PC, pour ne pas doubler les appels à Garmin), "off".
AUTO_SYNC = (os.getenv("GARMIN_AUTO_SYNC") or "on").strip().lower()
ALERT_AFTER_FAILURES = 3  # synchros ratées de suite avant de prévenir dans Home Assistant


def _record_sync_result(error: Optional[str]) -> int:
    """Mémorise le résultat de la dernière tentative (affiché dans l'appli). Renvoie le nombre d'échecs de suite."""
    from datetime import datetime

    now = datetime.now().isoformat(timespec="seconds")
    with db.connect() as conn:
        fails = int(db.get_setting(conn, "sync_fail_count", "0") or 0)
        if error:
            fails += 1
            db.set_setting(conn, "sync_last_error", error[:300])
            db.set_setting(conn, "sync_last_error_at", now)
        else:
            fails = 0
            db.set_setting(conn, "sync_last_ok_at", now)
        db.set_setting(conn, "sync_fail_count", str(fails))
        conn.commit()
    return fails


def _ha_notify(message: Optional[str]) -> None:
    """Notification persistante dans Home Assistant (add-on seulement). `None` efface l'alerte."""
    token = os.getenv("SUPERVISOR_TOKEN")
    if not token:
        return
    import urllib.request

    service = "create" if message else "dismiss"
    body: dict = {"notification_id": "garmin_dashboard_sync"}
    if message:
        body.update({"title": "Garmin Dashboard", "message": message})
    try:
        req = urllib.request.Request(
            f"http://supervisor/core/api/services/persistent_notification/{service}",
            data=json.dumps(body).encode(),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10).close()
    except Exception as exc:  # l'alerte est un plus : son échec ne doit rien casser
        print(f"[auto-sync] notification Home Assistant impossible : {exc}")


def _sync_done(error: Optional[str]) -> None:
    fails = _record_sync_result(error)
    if error and fails == ALERT_AFTER_FAILURES:
        _ha_notify(f"La synchronisation Garmin échoue depuis {fails} essais. Dernière erreur : {error[:200]}")
    elif not error:
        _ha_notify(None)


def _auto_sync_loop() -> None:
    """Synchro complète au démarrage, puis une synchro légère toutes les 30 min et une complète toutes les 6 h."""
    import time
    from datetime import datetime

    time.sleep(5)
    # Premier démarrage (base vide) : historique plus long, ex. add-on Home Assistant (GARMIN_INITIAL_DAYS)
    days = 30
    try:
        initial = int(os.getenv("GARMIN_INITIAL_DAYS") or 0)
        if initial > days:
            with db.connect() as conn:
                if conn.execute("SELECT COUNT(*) FROM activities").fetchone()[0] == 0:
                    days = initial
    except Exception:
        pass
    # Rattrapage unique de tout l'historique depuis HISTORY_START (la montre date de 2025)
    backfill = False
    try:
        with db.connect() as conn:
            done = conn.execute("SELECT value FROM profile WHERE key = 'history_backfill'").fetchone()
        need = (date.today() - HISTORY_START).days + 1
        if (not done or done["value"] != HISTORY_START.isoformat()) and need > days:
            days, backfill = need, True
    except Exception:
        pass
    last_full = 0.0
    while True:
        try:
            if not sync.SYNC_LOCK.locked():
                if time.time() - last_full >= FULL_SYNC_MINUTES * 60 - 60:
                    sync.run_sync(days=days)
                    if backfill:
                        with db.connect() as conn:
                            db.set_setting(conn, "history_backfill", HISTORY_START.isoformat())
                            conn.commit()
                        backfill = False
                    days = 30
                    last_full = time.time()
                    _sync_done(None)
                elif not (QUIET_HOURS[0] <= datetime.now().hour < QUIET_HOURS[1]):
                    sync.run_light_sync()
                    _sync_done(None)
        except Exception as exc:  # réseau, jeton expiré... : on réessaiera au prochain tour
            print(f"[auto-sync] {exc}")
            _sync_done(str(exc))
            try:
                import garmin_client

                garmin_client.reset_client()
            except Exception:
                pass
        if AUTO_SYNC == "startup":
            return
        time.sleep(AUTO_SYNC_MINUTES * 60)


@app.on_event("startup")
def _startup() -> None:
    import threading

    db.init_db()
    if AUTO_SYNC != "off":
        threading.Thread(target=_auto_sync_loop, daemon=True, name="auto-sync").start()


# ---------------------------------------------------------------------------
# Formatage
# ---------------------------------------------------------------------------


def is_foot(sport: Optional[str]) -> bool:
    s = (sport or "").lower()
    return any(k in s for k in ("run", "trail", "hik", "walk"))


def pace(speed_ms: Optional[float]) -> Optional[str]:
    if not speed_ms or speed_ms <= 0:
        return None
    sec = 1000.0 / speed_ms
    m, s = int(sec // 60), int(round(sec % 60))
    if s == 60:
        m, s = m + 1, 0
    return f"{m}:{s:02d}"


def hms(seconds: Optional[float]) -> Optional[str]:
    if seconds is None:
        return None
    t = int(round(seconds))
    h, m, s = t // 3600, (t % 3600) // 60, t % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def speed_label(sport: Optional[str], speed_ms: Optional[float]) -> Optional[str]:
    if speed_ms is None:
        return None
    return f"{pace(speed_ms)} /km" if is_foot(sport) else f"{speed_ms * 3.6:.1f} km/h"


def row_to_activity(row, full: bool = False) -> dict:
    d = dict(row)
    d["pace"] = speed_label(d.get("sport_type"), d.get("avg_speed_ms"))
    d["duration"] = hms(d.get("duration_s"))
    if full:
        d["gap_pace"] = speed_label(d.get("sport_type"), d.get("avg_gap_speed_ms"))
        for col in JSON_COLS:
            d[col.removesuffix("_json")] = db.from_json(d.pop(col, None))
    else:
        d["mini_track"] = _mini_track(d.pop("track_json", None))
    return d


def _mini_track(raw, n: int = 40):
    """~40 points [lat, lon] du tracé, pour le mini-tracé de la liste."""
    track = db.from_json(raw)
    if not track or len(track) < 2:
        return None
    step = max(1, (len(track) - 1) // (n - 1))
    pts = [[round(p[0], 5), round(p[1], 5)] for p in track[::step]]
    last = [round(track[-1][0], 5), round(track[-1][1], 5)]
    if pts[-1] != last:
        pts.append(last)
    return pts


def get_activity_row(conn, activity_id: int):
    row = conn.execute("SELECT * FROM activities WHERE activity_id = ?", (activity_id,)).fetchone()
    if not row:
        raise HTTPException(404, f"Activité {activity_id} introuvable en base.")
    return row


# ---------------------------------------------------------------------------
# Synchronisation
# ---------------------------------------------------------------------------


@app.post("/api/sync")
def trigger_sync(
    days: int = Query(30, ge=1, le=1500), force: bool = Query(False)
) -> dict:
    """Synchro incrémentale (bloquante : renvoie le résumé à la fin)."""
    try:
        out = sync.run_sync(days=days, force=force)
    except RuntimeError as exc:
        busy = "déjà en cours" in str(exc)
        if not busy:
            _sync_done(str(exc))
        raise HTTPException(409 if busy else 502, str(exc))
    _sync_done(None)
    return out


@app.get("/api/sync/status")
def sync_status() -> dict:
    """État de la synchro : dernière réussite, dernière erreur, heure de la dernière mesure de la montre."""
    from datetime import datetime

    with db.connect() as conn:
        last = conn.execute("SELECT * FROM sync_log ORDER BY id DESC LIMIT 1").fetchone()
        ok_at = db.get_setting(conn, "sync_last_ok_at") or (last["finished_at"] if last else None)
        err = db.get_setting(conn, "sync_last_error")
        err_at = db.get_setting(conn, "sync_last_error_at")
        fails = int(db.get_setting(conn, "sync_fail_count", "0") or 0)
        measured = db.get_setting(conn, "last_measure_at")
        upload = db.get_setting(conn, "watch_upload_at")
    now = datetime.now()

    def age_min(iso: Optional[str]) -> Optional[int]:
        try:
            return max(0, int((now - datetime.fromisoformat(iso)).total_seconds() // 60)) if iso else None
        except ValueError:
            return None

    return {
        "running": sync.SYNC_LOCK.locked(),
        "last": None if not last else {**dict(last), "summary_json": db.from_json(last["summary_json"])},
        "now": now.isoformat(timespec="seconds"),
        "auto": AUTO_SYNC,
        "interval_min": AUTO_SYNC_MINUTES,
        "last_ok_at": ok_at,
        "last_ok_age_min": age_min(ok_at),
        "failing": fails > 0,
        "fail_count": fails,
        "last_error": err if fails > 0 else None,
        "last_error_at": err_at if fails > 0 else None,
        "last_measure_at": measured,
        "last_measure_age_min": age_min(measured),
        # dernier envoi de la montre à Garmin : aucune synchro ne peut ramener plus récent
        "watch_upload_at": upload,
        "watch_upload_age_min": age_min(upload),
    }


# ---------------------------------------------------------------------------
# Activités
# ---------------------------------------------------------------------------


@app.get("/api/activities")
def list_activities(
    limit: int = Query(50, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    sport: Optional[str] = Query(None, description="filtre partiel, ex. 'running'"),
    start: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="YYYY-MM-DD"),
) -> dict:
    where, params = [], []
    if sport:
        where.append("sport_type LIKE ?")
        params.append(f"%{sport}%")
    if start:
        where.append("activity_date >= ?")
        params.append(start)
    if end:
        where.append("activity_date <= ?")
        params.append(end)
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    with db.connect() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM activities {clause}", params).fetchone()[0]
        rows = conn.execute(
            f"SELECT {LIST_COLS} FROM activities {clause} "
            "ORDER BY start_time_local DESC LIMIT ? OFFSET ?",
            [*params, limit, offset],
        ).fetchall()
    return {"total": total, "items": [row_to_activity(r) for r in rows]}


@app.get("/api/thresholds")
def thresholds() -> dict:
    """Derniers seuils connus de la montre (FC, allure, puissance de course, FTP vélo)."""
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM thresholds ORDER BY date DESC LIMIT 1").fetchone()
        test = coach.threshold_test(conn)
        source = db.get_setting(conn, "threshold_source", "garmin")
    d = dict(row) if row else {}
    d["available"] = bool(row) or bool(test)
    # Valeurs de la montre, toujours renvoyées telles quelles
    d["garmin_lt_speed_ms"] = d.get("lt_speed_ms")
    d["garmin_lthr_bpm"] = d.get("lthr_bpm")
    d["test"] = test
    d["source"] = "test" if source == "test" and test else "garmin"
    if d["source"] == "test":
        # Seuil adopté depuis le test de terrain : c'est lui qui sert de repère partout dans l'appli
        d["lt_speed_ms"] = test["speed_ms"]
        d["lt_date"] = test["date"]
        if test.get("lthr_bpm"):
            d["lthr_bpm"] = test["lthr_bpm"]
    d["lt_pace"] = speed_label("running", d.get("lt_speed_ms"))
    return d


class ThresholdSourceIn(BaseModel):
    source: str


@app.put("/api/thresholds/source")
def set_threshold_source(body: ThresholdSourceIn) -> dict:
    """Choisit le seuil de référence : celui de la montre (« garmin ») ou celui du test de terrain (« test »)."""
    if body.source not in ("garmin", "test"):
        raise HTTPException(400, "Source inconnue.")
    with db.connect() as conn:
        db.set_setting(conn, "threshold_source", body.source)
        conn.commit()
    return thresholds()


@app.get("/api/activities/{activity_id}")
def activity_detail(activity_id: int) -> dict:
    with db.connect() as conn:
        return row_to_activity(get_activity_row(conn, activity_id), full=True)


class NotesIn(BaseModel):
    notes: Optional[str] = None
    ai_analysis: Optional[str] = None


@app.patch("/api/activities/{activity_id}/notes")
def save_notes(activity_id: int, body: NotesIn) -> dict:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(400, "Fournir 'notes' et/ou 'ai_analysis'.")
    with db.connect() as conn:
        get_activity_row(conn, activity_id)
        sets = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE activities SET {sets}, updated_at = datetime('now') WHERE activity_id = ?",
            [*fields.values(), activity_id],
        )
        conn.commit()
        row = conn.execute(
            "SELECT activity_id, notes, ai_analysis, updated_at FROM activities WHERE activity_id = ?",
            (activity_id,),
        ).fetchone()
    return dict(row)


# ---------------------------------------------------------------------------
# Forme, santé, prédictions
# ---------------------------------------------------------------------------


# Mesures reprises du dernier jour connu quand le jour en cours est vide (champ → ancienneté maximale, en jours)
CARRY_DAYS = {
    "vo2max": 90, "fitness_age": 30, "chrono_age": 30, "fitness_age_target": 90,
    "endurance_score": 60, "endurance_class": 60, "endurance_limits_json": 60,
    "hill_score": 60, "hill_class": 60, "hill_strength": 60, "hill_endurance": 60,
    "hrv_last_night_ms": 2, "hrv_weekly_avg_ms": 3, "hrv_status": 3,
    "sleep_score": 2, "sleep_duration_s": 2, "resting_hr": 3, "training_status": 5,
}


@app.get("/api/fitness")
def fitness(days: int = Query(90, ge=7, le=730)) -> dict:
    start = (date.today() - timedelta(days=days - 1)).isoformat()
    with db.connect() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT date, daily_load, ctl, atl, tsb, acute_load, chronic_load, acwr, acwr_status, "
            "training_status, hrv_last_night_ms, hrv_weekly_avg_ms, hrv_status, sleep_score, "
            "sleep_duration_s, resting_hr, body_battery_max, body_battery_min, stress_avg, "
            "readiness_score, readiness_level, recovery_time_h, vo2max, fitness_age, chrono_age, "
            "endurance_score, hill_score, endurance_class, endurance_limits_json, hill_class, hill_strength, hill_endurance, fitness_age_target, body_battery_now, body_battery_charged, body_battery_drained "
            "FROM daily_health WHERE date >= ? ORDER BY date",
            (start,),
        )]
    latest = next((r for r in reversed(rows) if r.get("ctl") is not None), None)
    if latest:
        # Une mesure absente du jour (VO2 max pas recalculé, nuit pas encore synchronisée, après minuit…)
        # reprend la dernière valeur connue, tant qu'elle n'est pas trop ancienne.
        latest = dict(latest)
        carried: dict = {}
        with db.connect() as conn:
            for col, max_age in CARRY_DAYS.items():
                if latest.get(col) is not None:
                    continue
                since = (date.fromisoformat(latest["date"]) - timedelta(days=max_age)).isoformat()
                r = conn.execute(
                    f"SELECT date, {col} AS v FROM daily_health WHERE date < ? AND date >= ? AND {col} IS NOT NULL "
                    "ORDER BY date DESC LIMIT 1",
                    (latest["date"], since),
                ).fetchone()
                if r:
                    latest[col] = r["v"]
                    carried[col] = r["date"]
        latest["carried"] = carried
    with db.connect() as conn:
        tl = conn.execute(
            "SELECT date, body_battery_json FROM daily_health WHERE body_battery_json IS NOT NULL ORDER BY date DESC LIMIT 1"
        ).fetchone()
        measured_at = db.get_setting(conn, "last_measure_at")
    bb_timeline = {"date": tl["date"], "points": json.loads(tl["body_battery_json"])} if tl else None
    return {"days": days, "latest": latest, "series": rows, "bb_timeline": bb_timeline,
            "measured_at": measured_at, "today": date.today().isoformat()}


class ProfileIn(BaseModel):
    name: Optional[str] = None
    photo: Optional[str] = None  # image JPEG en data-URL (redimensionnée côté navigateur) ; "" = supprimer
    coach_note: Optional[str] = None  # points personnels à surveiller, ajoutés au bilan copié pour analyse


@app.get("/api/profile")
def get_profile() -> dict:
    with db.connect() as conn:
        rows = conn.execute("SELECT key, value FROM profile").fetchall()
    d = {r["key"]: r["value"] for r in rows}
    return {"name": d.get("name") or "", "photo": d.get("photo") or "", "coach_note": d.get("coach_note") or ""}


@app.put("/api/profile")
def save_profile(body: ProfileIn) -> dict:
    fields = body.model_dump(exclude_unset=True)
    if "name" in fields:
        fields["name"] = (fields["name"] or "").strip()[:40]
    if "coach_note" in fields:
        fields["coach_note"] = (fields["coach_note"] or "").strip()[:500]
    photo = fields.get("photo")
    if photo:
        if not photo.startswith("data:image/") or len(photo) > 400_000:
            raise HTTPException(400, "Photo invalide ou trop lourde.")
    with db.connect() as conn:
        for k, v in fields.items():
            conn.execute("INSERT INTO profile(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (k, v or ""))
        conn.commit()
    return get_profile()


@app.get("/api/health/details")
def health_details() -> dict:
    """Dernière nuit (phases, hypnogramme, besoin) et FC heure par heure d'aujourd'hui et d'hier."""
    with db.connect() as conn:
        s = conn.execute(
            "SELECT date, sleep_json FROM daily_health WHERE sleep_json IS NOT NULL ORDER BY date DESC LIMIT 1"
        ).fetchone()
        h = conn.execute(
            "SELECT date, heart_json FROM daily_health WHERE heart_json IS NOT NULL ORDER BY date DESC LIMIT 2"
        ).fetchall()
    return {
        "sleep": {"date": s["date"], **json.loads(s["sleep_json"])} if s else None,
        "heart": [{"date": r["date"], **json.loads(r["heart_json"])} for r in h],
    }


def fmt_race(sec: Optional[float]) -> Optional[str]:
    return hms(sec)


@app.get("/api/predictions")
def predictions(days: int = Query(365, ge=1, le=3650)) -> dict:
    start = (date.today() - timedelta(days=days - 1)).isoformat()
    with db.connect() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT date, time_5k_s, time_10k_s, time_half_s, time_marathon_s "
            "FROM race_predictions WHERE date >= ? ORDER BY date",
            (start,),
        )]
    for r in rows:
        for k in ("5k", "10k", "half", "marathon"):
            r[k] = fmt_race(r[f"time_{k}_s"])
    latest = rows[-1] if rows else None
    first = rows[0] if rows else None
    delta = None
    if latest and first and latest is not first:
        delta = {
            k: (None if latest[f"time_{k}_s"] is None or first[f"time_{k}_s"] is None
                else int(latest[f"time_{k}_s"] - first[f"time_{k}_s"]))
            for k in ("5k", "10k", "half", "marathon")
        }
    return {"latest": latest, "delta_s_since_first": delta, "history": rows}


# ---------------------------------------------------------------------------
# Export compact pour analyse par Claude
# ---------------------------------------------------------------------------


def _avg(values: list) -> Optional[float]:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def drift_line(timeseries: Optional[dict]) -> Optional[str]:
    """Compare le 1er et le dernier tiers de la séance : dérive FC, GCT, équilibre, cadence."""
    series = (timeseries or {}).get("series") or []
    if len(series) < 30:
        return None
    third = len(series) // 3
    a, b = series[:third], series[-third:]
    parts = []
    for key, label, fmt in (
        ("hr", "FC", "{:.0f}"),
        ("gct", "GCT", "{:.0f}"),
        ("bal", "balG", "{:.1f}"),
        ("cad", "cad", "{:.0f}"),
        ("stride", "foulée", "{:.0f}"),
        ("vosc", "VO", "{:.1f}"),
    ):
        va, vb = _avg([p.get(key) for p in a]), _avg([p.get(key) for p in b])
        if va is not None and vb is not None:
            parts.append(f"{label} {fmt.format(va)}→{fmt.format(vb)}")
    return " · ".join(parts) if parts else None


def _v(x, fmt="{:.0f}", suffix="") -> str:
    if x is None:
        return "-"
    out = fmt.format(x)
    if out.startswith("-") and float(out) == 0:
        out = out[1:]  # pas de "-0"
    return out + suffix


def _join(parts) -> str:
    """Assemble des fragments en sautant ceux dont la valeur est absente."""
    return " · ".join(p for p in parts if p)


@app.get("/api/activities/{activity_id}/export-prompt", response_class=PlainTextResponse)
def export_prompt(activity_id: int) -> str:
    with db.connect() as conn:
        a = row_to_activity(get_activity_row(conn, activity_id), full=True)
        day = a.get("activity_date") or date.today().isoformat()
        d0 = (date.fromisoformat(day) - timedelta(days=7)).isoformat()
        ctx = [dict(r) for r in conn.execute(
            "SELECT date, daily_load, sleep_score, sleep_duration_s, hrv_last_night_ms, hrv_status, "
            "resting_hr, body_battery_max, readiness_score, ctl, atl, tsb, acwr, acwr_status, "
            "training_status FROM daily_health WHERE date BETWEEN ? AND ? ORDER BY date",
            (d0, day),
        )]
    foot = is_foot(a.get("sport_type"))
    L = []
    L.append(f"# {day} · {a.get('sport_type')} · {a.get('name') or ''}".rstrip())
    dist = a.get("distance_m")
    L.append(_join([
        dist is not None and f"{dist / 1000:.2f} km",
        a.get("duration"),
        f"D+ {_v(a.get('elevation_gain_m'))} / D- {_v(a.get('elevation_loss_m'))} m",
        a.get("pace") and a["pace"] + (f" (GAP {a['gap_pace']})" if a.get("gap_pace") else ""),
        a.get("avg_hr") is not None and f"FC {_v(a['avg_hr'])}/{_v(a.get('max_hr'))}",
    ]))
    L.append(
        f"TE aéro {_v(a.get('aerobic_te'), '{:.1f}')} / ana {_v(a.get('anaerobic_te'), '{:.1f}')}"
        f"{' (' + a['te_label'] + ')' if a.get('te_label') else ''} · charge {_v(a.get('training_load'))}"
        + (f" · P {_v(a.get('avg_power_w'))} W" if a.get("avg_power_w") else "")
    )
    if foot and any(a.get(k) is not None for k in ("ground_contact_ms", "gct_balance_left_pct")):
        g = a.get
        L.append("Dyn: " + _join([
            g("avg_cadence_spm") is not None and f"cad {_v(g('avg_cadence_spm'))}",
            g("ground_contact_ms") is not None and f"GCT {_v(g('ground_contact_ms'))} ms",
            g("gct_balance_left_pct") is not None and f"bal G {_v(g('gct_balance_left_pct'), '{:.1f}')}%",
            g("vertical_oscillation_cm") is not None and f"VO {_v(g('vertical_oscillation_cm'), '{:.1f}')} cm",
            g("vertical_ratio_pct") is not None and f"VR {_v(g('vertical_ratio_pct'), '{:.1f}')}%",
            g("stride_length_cm") is not None and f"foulée {_v(g('stride_length_cm'))} cm",
        ]))
    drift = drift_line(a.get("timeseries"))
    if drift:
        L.append(f"Dérive 1er→dernier tiers: {drift}")
    pc = a.get("power_curve") or {}
    curve = dict((int(d), w) for d, w in (pc.get("curve") or []) if d in (60, 300, 1200, 3600))
    if curve:
        L.append("P max: " + " · ".join(f"{d // 60}min {w} W" for d, w in sorted(curve.items())))
    zones = a.get("hr_zones") or []
    if zones:
        L.append("Zones FC (min): " + " · ".join(
            f"Z{z.get('zone')} {round((z.get('secs') or 0) / 60)}" for z in zones))

    splits = a.get("splits") or []
    if splits:
        hdr = "n|km|" + ("allure|GAP" if foot else "km/h") + "|FC|D+|D-"
        dyn = foot and any(s.get("gct_ms") for s in splits)
        if dyn:
            hdr += "|cad|GCT|balG"
        L.append("## Splits\n" + hdr)
        for s in splits[:40]:
            spd = s.get("avg_speed_ms")
            cells = [str(s.get("n")), _v((s.get("distance_m") or 0) / 1000, "{:.2f}")]
            if foot:
                cells += [pace(spd) or "-", pace(s.get("gap_speed_ms")) or "-"]
            else:
                cells.append(_v(spd and spd * 3.6, "{:.1f}"))
            cells += [_v(s.get("avg_hr")), _v(s.get("elev_gain_m")), _v(s.get("elev_loss_m"))]
            if dyn:
                cells += [_v(s.get("cadence_spm")), _v(s.get("gct_ms")),
                          _v(s.get("gct_balance_left_pct"), "{:.1f}")]
            L.append("|".join(cells))
        if len(splits) > 40:
            L.append(f"(+{len(splits) - 40} tours non affichés)")

    if ctx:
        L.append("## Contexte J-7→J\ndate|charge|sommeil|h|VFC|FCr|BB|ready|TSB")
        for r in ctx:
            L.append("|".join([
                r["date"][5:], _v(r.get("daily_load")), _v(r.get("sleep_score")),
                _v(r.get("sleep_duration_s") and r["sleep_duration_s"] / 3600, "{:.1f}"),
                _v(r.get("hrv_last_night_ms")) + (f"({r['hrv_status'][:3].lower()})" if r.get("hrv_status") else ""),
                _v(r.get("resting_hr")), _v(r.get("body_battery_max")),
                _v(r.get("readiness_score")), _v(r.get("tsb")),
            ]))
        last = ctx[-1]
        L.append(
            f"Forme J: CTL {_v(last.get('ctl'))} · ATL {_v(last.get('atl'))} · TSB {_v(last.get('tsb'))}"
            + (f" · ACWR {last['acwr']:.2f} ({last.get('acwr_status') or '?'})" if last.get("acwr") else "")
            + (f" · statut {last['training_status']}" if last.get("training_status") else "")
        )
    if a.get("notes"):
        L.append(f"## Ressenti\n{a['notes']}")
    with db.connect() as conn:
        note = db.get_setting(conn, "coach_note")
    if note:
        L.append(f"Profil: {note}")
    return "\n".join(L)


@app.get("/api/health")
def health() -> dict[str, Any]:
    with db.connect() as conn:
        n = conn.execute("SELECT COUNT(*) FROM activities").fetchone()[0]
    return {"ok": True, "activities": n}


# ---------------------------------------------------------------------------
# Interface web (build de production) : servie par l'API quand FRONTEND_DIR existe.
# En développement, Vite sert l'interface et proxifie /api, donc rien n'est monté.
# Doit rester en dernier : le montage sur "/" capte tout ce que les routes /api n'ont pas pris.
# ---------------------------------------------------------------------------
_web = Path(os.getenv("FRONTEND_DIR", ""))
if os.getenv("FRONTEND_DIR") and _web.is_dir():
    app.mount("/", StaticFiles(directory=str(_web), html=True), name="web")
