"""
Synchronisation Garmin Connect -> SQLite (incrémentale, sans doublons).

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
"""

import argparse
import json
import sys
import threading
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Optional

from garminconnect.activity_details import parse_activity_detail_metrics

import db

CTL_DAYS = 42
ATL_DAYS = 7
WARMUP_DAYS = 90
MAX_CHART_POINTS = 600
MAX_TRACK_POINTS = 800
DETAIL_MAX_TRIES = 5          # essais de détail d'une sortie avant d'abandonner (activité sans données)
HEALTH_DETAIL_VERSION = 1     # à augmenter quand une nouvelle mesure détaillée est ajoutée aux jours passés
HEALTH_BACKFILL_PER_SYNC = 20  # jours passés complétés par synchro complète (2 appels chacun)

SYNC_LOCK = threading.Lock()


# ---------------------------------------------------------------------------
# Helpers (même philosophie que le serveur MCP : absent = None, jamais 0)
# ---------------------------------------------------------------------------


def num(value: Any, digits: Optional[int] = None) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return round(value, digits) if digits is not None else value


def pick(source: Any, *candidates: str) -> Any:
    if not isinstance(source, dict):
        return None
    for key in candidates:
        if source.get(key) is not None:
            return source[key]
    return None


def deep_find(obj: Any, *keys: str) -> Any:
    """Cherche récursivement la première clé présente (structures Garmin instables)."""
    if isinstance(obj, dict):
        for k in keys:
            if obj.get(k) is not None:
                return obj[k]
        for v in obj.values():
            found = deep_find(v, *keys)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = deep_find(v, *keys)
            if found is not None:
                return found
    return None


def safe(label: str, errors: list, fn: Callable, *args, **kwargs) -> Any:
    try:
        return fn(*args, **kwargs)
    except Exception as exc:  # une erreur sur un endpoint ne bloque pas la synchro
        errors.append(f"{label}: {type(exc).__name__}: {exc}")
        return None


def downsample(items: list, max_items: int) -> list:
    if len(items) <= max_items:
        return items
    step = len(items) / max_items
    out = [items[int(i * step)] for i in range(max_items)]
    out[-1] = items[-1]
    return out


def daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


# ---------------------------------------------------------------------------
# Activités
# ---------------------------------------------------------------------------


def activity_summary_row(act: dict) -> dict:
    start = act.get("startTimeLocal")
    return {
        "activity_id": act.get("activityId"),
        "name": act.get("activityName"),
        "sport_type": (act.get("activityType") or {}).get("typeKey"),
        "start_time_local": start,
        "activity_date": start[:10] if start else None,
        "distance_m": num(act.get("distance"), 1),
        "duration_s": num(act.get("duration"), 1),
        "moving_duration_s": num(act.get("movingDuration"), 1),
        "elevation_gain_m": num(act.get("elevationGain"), 1),
        "elevation_loss_m": num(act.get("elevationLoss"), 1),
        "avg_speed_ms": num(act.get("averageSpeed"), 3),
        "max_speed_ms": num(act.get("maxSpeed"), 3),
        "avg_gap_speed_ms": num(act.get("avgGradeAdjustedSpeed"), 3),
        "avg_hr": num(act.get("averageHR"), 0),
        "max_hr": num(act.get("maxHR"), 0),
        "aerobic_te": num(act.get("aerobicTrainingEffect"), 1),
        "anaerobic_te": num(act.get("anaerobicTrainingEffect"), 1),
        "training_load": num(act.get("activityTrainingLoad"), 1),
        "vo2max": num(act.get("vO2MaxValue"), 1),
        "calories": num(act.get("calories"), 0),
        "avg_cadence_spm": num(
            pick(act, "averageRunningCadenceInStepsPerMinute", "averageRunCadence"), 1
        ),
        "ground_contact_ms": num(pick(act, "avgGroundContactTime", "groundContactTime"), 1),
        "gct_balance_left_pct": num(
            pick(act, "avgGroundContactBalance", "groundContactBalanceLeft"), 1
        ),
        "vertical_oscillation_cm": num(
            pick(act, "avgVerticalOscillation", "verticalOscillation"), 2
        ),
        "vertical_ratio_pct": num(pick(act, "avgVerticalRatio", "verticalRatio"), 2),
        "stride_length_cm": num(pick(act, "avgStrideLength", "strideLength"), 1),
        "avg_power_w": num(act.get("avgPower"), 0),
        "max_power_w": num(act.get("maxPower"), 0),
    }


SUMMARY_HASH_FIELDS = (
    "sport_type", "start_time_local", "distance_m", "duration_s", "moving_duration_s", "elevation_gain_m",
    "avg_hr", "max_hr", "aerobic_te", "training_load", "avg_power_w",
)


def summary_hash(row: dict) -> str:
    """Empreinte des champs du résumé qui, s'ils changent, rendent le détail stocké périmé.

    Le nom n'en fait pas partie : il est mis à jour par le résumé lui-même à chaque synchro."""
    import hashlib

    return hashlib.sha1("|".join(str(row.get(k)) for k in SUMMARY_HASH_FIELDS).encode()).hexdigest()[:16]


def upsert_summary(conn, act: dict) -> Optional[int]:
    """Enregistre le résumé d'une sortie ; si Garmin l'a modifiée depuis, son détail sera retéléchargé."""
    row = activity_summary_row(act)
    aid = row["activity_id"]
    if not aid:
        return None
    h = summary_hash(row)
    old = conn.execute("SELECT summary_hash FROM activities WHERE activity_id = ?", (aid,)).fetchone()
    db.upsert(conn, "activities", "activity_id", row, keep_existing=("notes", "ai_analysis"))
    if old is None or old["summary_hash"] is None:
        conn.execute("UPDATE activities SET summary_hash = ? WHERE activity_id = ?", (h, aid))
    elif old["summary_hash"] != h:
        conn.execute(
            "UPDATE activities SET summary_hash = ?, details_synced = 0, detail_tries = 0 WHERE activity_id = ?",
            (h, aid),
        )
    return aid


def activity_detail_row(client, activity_id: int, errors: list) -> dict:
    row: dict[str, Any] = {"activity_id": activity_id}
    tag = f"activité {activity_id}"

    raw = safe(f"{tag} get_activity", errors, client.get_activity, activity_id) or {}
    s = raw.get("summaryDTO") or {}
    if s:
        row.update(
            {
                "moving_duration_s": num(s.get("movingDuration"), 1),
                "elevation_gain_m": num(s.get("elevationGain"), 1),
                "elevation_loss_m": num(s.get("elevationLoss"), 1),
                "avg_gap_speed_ms": num(s.get("avgGradeAdjustedSpeed"), 3),
                "aerobic_te": num(s.get("trainingEffect"), 1),
                "anaerobic_te": num(s.get("anaerobicTrainingEffect"), 1),
                "te_label": s.get("trainingEffectLabel"),
                "training_load": num(s.get("activityTrainingLoad"), 1),
                "avg_cadence_spm": num(s.get("averageRunCadence"), 1),
                "ground_contact_ms": num(s.get("groundContactTime"), 1),
                "gct_balance_left_pct": num(s.get("groundContactBalanceLeft"), 1),
                "vertical_oscillation_cm": num(s.get("verticalOscillation"), 2),
                "vertical_ratio_pct": num(s.get("verticalRatio"), 2),
                "stride_length_cm": num(s.get("strideLength"), 1),
                "avg_power_w": num(s.get("averagePower"), 0),
                "max_power_w": num(s.get("maxPower"), 0),
            }
        )

    # Zones FC
    zones = safe(f"{tag} hr_zones", errors, client.get_activity_hr_in_timezones, activity_id)
    if isinstance(zones, list):
        row["hr_zones_json"] = db.to_json(
            [
                {
                    "zone": z.get("zoneNumber"),
                    "low_bpm": z.get("zoneLowBoundary"),
                    "secs": num(z.get("secsInZone"), 0),
                }
                for z in zones
            ]
        )

    # Splits (tours)
    splits = safe(f"{tag} splits", errors, client.get_activity_splits, activity_id) or {}
    row["splits_json"] = db.to_json(laps_from_splits(splits))

    # Phases course / marche / arrêt détectées par la montre (sorties à pied)
    type_key = (raw.get("activityTypeDTO") or {}).get("typeKey")
    if is_foot_type(type_key):
        typed = safe(f"{tag} typed_splits", errors, client.get_activity_typed_splits, activity_id)
        if typed is not None:
            row["segments_json"] = json.dumps(parse_segments(typed), separators=(",", ":"))

    # Série temporelle + trace GPS
    details = safe(
        f"{tag} details",
        errors,
        client.get_activity_details,
        str(activity_id),
        maxchart=MAX_CHART_POINTS,
        maxpoly=MAX_TRACK_POINTS * 2,
    )
    if details:
        row.update(parse_details(details))

    # Courbe de puissance de la séance (vide sans capteur de puissance)
    curve = safe(f"{tag} power_curve", errors, client.get_activity_power_curve, activity_id)
    if curve:
        row["power_curve_json"] = db.to_json(
            {"source": "garmin", "curve": compact_power_curve(curve)}
        )
    elif row.get("timeseries_json"):
        row["power_curve_json"] = db.to_json(power_curve_from_series(row["timeseries_json"]))

    # « Détaillée » seulement si l'essentiel a répondu : sinon la sortie sera retentée à la synchro suivante.
    row["_ok"] = bool(raw) and details is not None
    return row


def store_detail(conn, row: dict) -> bool:
    """Écrit le détail d'une sortie ; ne la marque « détaillée » que si les appels essentiels ont réussi."""
    ok = row.pop("_ok", True)
    aid = row["activity_id"]
    if ok:
        row["details_synced"] = 1
    db.upsert(conn, "activities", "activity_id", row, keep_existing=("notes", "ai_analysis"))
    if not ok:
        conn.execute(
            "UPDATE activities SET detail_tries = COALESCE(detail_tries, 0) + 1, "
            "details_synced = CASE WHEN COALESCE(detail_tries, 0) + 1 >= ? THEN 1 ELSE details_synced END "
            "WHERE activity_id = ?",
            (DETAIL_MAX_TRIES, aid),
        )
    return ok


FOOT_HINTS = ("run", "walk", "hik")


def is_foot_type(type_key: Optional[str]) -> bool:
    return bool(type_key) and any(h in type_key for h in FOOT_HINTS)


SEGMENT_NAMES = {"RWD_RUN": "run", "RWD_WALK": "walk", "RWD_STAND": "stand"}


def _ts(value: Optional[str]) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(value.replace("Z", "")) if value else None
    except (ValueError, AttributeError):
        return None


def parse_segments(typed: Any) -> list:
    """Phases course / marche / arrêt détectées par la montre.

    Chaque phase : type, début (s depuis le départ), durée, durée en mouvement,
    distance, FC moyenne. Liste vide = la montre n'a rien détecté.
    """
    splits = (typed or {}).get("splits") if isinstance(typed, dict) else None
    if not splits:
        return []
    starts = [_ts(sp.get("startTimeGMT")) for sp in splits]
    starts = [t for t in starts if t]
    if not starts:
        return []
    t0 = min(starts)
    out = []
    for sp in splits:
        kind = SEGMENT_NAMES.get(sp.get("type"))
        st = _ts(sp.get("startTimeGMT"))
        if not kind or not st:
            continue
        out.append(
            {
                "type": kind,
                "start_s": int((st - t0).total_seconds()),
                "dur_s": num(sp.get("elapsedDuration") or sp.get("duration"), 0),
                "moving_s": num(sp.get("movingDuration"), 0),
                "dist_m": num(sp.get("distance"), 1),
                "hr": num(sp.get("averageHR"), 0),
            }
        )
    out.sort(key=lambda x: x["start_s"])
    return out


def laps_from_splits(splits: Any) -> list:
    laps = []
    for i, lap in enumerate((splits or {}).get("lapDTOs") or [], start=1):
        laps.append(
            {
                "n": i,
                "intensity": lap.get("intensityType"),
                "distance_m": num(lap.get("distance"), 1),
                "duration_s": num(lap.get("duration"), 1),
                "moving_s": num(lap.get("movingDuration"), 1),
                "avg_speed_ms": num(lap.get("averageSpeed"), 3),
                "gap_speed_ms": num(lap.get("avgGradeAdjustedSpeed"), 3),
                "avg_hr": num(lap.get("averageHR"), 0),
                "max_hr": num(lap.get("maxHR"), 0),
                "elev_gain_m": num(lap.get("elevationGain"), 0),
                "elev_loss_m": num(lap.get("elevationLoss"), 0),
                "cadence_spm": num(lap.get("averageRunCadence"), 1),
                "gct_ms": num(lap.get("groundContactTime"), 1),
                "gct_balance_left_pct": num(lap.get("groundContactBalanceLeft"), 1),
                "stride_cm": num(lap.get("strideLength"), 1),
                "vosc_cm": num(lap.get("verticalOscillation"), 2),
                "vratio_pct": num(lap.get("verticalRatio"), 2),
                "power_w": num(lap.get("averagePower"), 0),
            }
        )
    return [{k: v for k, v in lap.items() if v is not None} for lap in laps]


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


def backfill_segments(client, conn, errors: list, log=print, limit: int = 40) -> int:
    """Complète les anciennes sorties à pied : phases course/marche/arrêt + temps en mouvement des tours.

    `limit` sorties par synchro pour rester léger ; on relance la synchro jusqu'à 0.
    """
    rows = conn.execute(
        "SELECT activity_id, sport_type FROM activities "
        "WHERE segments_json IS NULL AND details_synced = 1 "
        "ORDER BY activity_date DESC"
    ).fetchall()
    todo = [r for r in rows if is_foot_type(r["sport_type"])][:limit]
    if not todo:
        return 0
    log(f"      segments course/marche/arrêt : {len(todo)} sortie(s) à compléter...")
    for r in todo:
        aid = r["activity_id"]
        typed = safe(f"activité {aid} typed_splits", errors, client.get_activity_typed_splits, aid)
        if typed is None:
            continue  # erreur réseau : on réessaiera à la prochaine synchro
        seg = parse_segments(typed)
        splits = safe(f"activité {aid} splits", errors, client.get_activity_splits, aid)
        sets, params = ["segments_json = ?"], [json.dumps(seg, separators=(",", ":"))]
        if splits:
            sets.append("splits_json = ?")
            params.append(db.to_json(laps_from_splits(splits)))
        conn.execute(f"UPDATE activities SET {', '.join(sets)} WHERE activity_id = ?", [*params, aid])
        conn.commit()
    return len(todo)


CHANNELS = {
    "t": ("sumElapsedDuration", "sumDuration"),
    "d": ("sumDistance",),
    "hr": ("directHeartRate",),
    "cad": ("directDoubleCadence", "directRunCadence", "directBikeCadence"),
    "spd": ("directSpeed",),
    "alt": ("directElevation",),
    "gct": ("directGroundContactTime",),
    "bal": ("directGroundContactBalanceLeft",),
    "vosc": ("directVerticalOscillation",),
    "vratio": ("directVerticalRatio",),
    "stride": ("directStrideLength",),
    "pwr": ("directPower",),
}


def parse_details(details: dict) -> dict:
    units = {}
    for d in details.get("metricDescriptors") or []:
        unit = (d.get("unit") or {}).get("key")
        for label, keys in CHANNELS.items():
            if d.get("key") in keys and unit:
                units.setdefault(label, unit)

    samples = parse_activity_detail_metrics(details)
    series, gps = [], []
    for s in samples:
        point = {}
        for label, keys in CHANNELS.items():
            for k in keys:
                if s.get(k) is not None:
                    v = num(s[k], 2)
                    if k == "directRunCadence":  # Garmin : cadence d'une seule jambe
                        v = round(v * 2, 1)
                    point[label] = v
                    break
        if point:
            series.append(point)
        lat, lon = s.get("directLatitude"), s.get("directLongitude")
        if lat is not None and lon is not None:
            gps.append([round(lat, 6), round(lon, 6), num(s.get("directElevation"), 1)])

    # Trace : la polyline Garmin est plus dense que les échantillons
    poly = ((details.get("geoPolylineDTO") or {}).get("polyline")) or []
    track = [
        [round(p["lat"], 6), round(p["lon"], 6), num(p.get("altitude"), 1)]
        for p in poly
        if p.get("lat") is not None and p.get("lon") is not None
    ] or gps

    return {
        "timeseries_json": db.to_json({"units": units, "series": series} if series else None),
        "track_json": db.to_json(downsample(track, MAX_TRACK_POINTS)),
    }


def compact_power_curve(curve: Any) -> Any:
    """Réduit la courbe à [[durée_s, watts], ...] quand la structure est reconnue."""
    entries = curve
    if isinstance(curve, dict):
        entries = pick(curve, "entries", "powerCurve", "curve", "values") or curve
    if isinstance(entries, list):
        out = []
        for e in entries:
            if isinstance(e, dict):
                dur = pick(e, "duration", "durationInSeconds", "seconds")
                pw = pick(e, "power", "value", "watts")
                if dur is not None and pw is not None:
                    out.append([num(dur, 0), num(pw, 0)])
            elif isinstance(e, (list, tuple)) and len(e) >= 2:
                out.append([num(e[0], 0), num(e[1], 0)])
        if out:
            return out
    return curve  # structure inconnue : conservée brute


CURVE_DURATIONS = (5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600, 5400, 7200)


def power_curve_from_series(timeseries_json: Optional[str]) -> Optional[dict]:
    """Courbe de puissance (meilleure moyenne par durée) calculée à partir de la série.

    Utilisée quand l'endpoint Garmin powerCurve renvoie vide (cas fréquent pour la
    puissance de course native). La série est ré-échantillonnée à 1 s par maintien
    de la dernière valeur ; les durées courtes (< 30 s) restent approximatives car
    Garmin échantillonne la série (~600 points par sortie).
    """
    ts = db.from_json(timeseries_json) or {}
    pts = [(p["t"], p["pwr"]) for p in ts.get("series") or [] if p.get("t") is not None and p.get("pwr") is not None]
    if len(pts) < 10:
        return None
    pts.sort()
    t0, t_end = int(pts[0][0]), int(pts[-1][0])
    per_sec, j = [], 0
    for t in range(t0, t_end + 1):
        while j + 1 < len(pts) and pts[j + 1][0] <= t:
            j += 1
        per_sec.append(pts[j][1])
    cum = [0.0]
    for w in per_sec:
        cum.append(cum[-1] + w)
    curve = []
    for d in CURVE_DURATIONS:
        if d > len(per_sec):
            break
        best = max(cum[i + d] - cum[i] for i in range(len(per_sec) - d + 1)) / d
        curve.append([d, round(best)])
    return {"source": "calcul local (série Garmin ré-échantillonnée)", "curve": curve} if curve else None


def backfill_power_curves(conn) -> int:
    rows = conn.execute(
        "SELECT activity_id, timeseries_json FROM activities "
        "WHERE power_curve_json IS NULL AND timeseries_json LIKE '%\"pwr\"%'"
    ).fetchall()
    n = 0
    for r in rows:
        curve = power_curve_from_series(r["timeseries_json"])
        if curve:
            conn.execute(
                "UPDATE activities SET power_curve_json = ? WHERE activity_id = ?",
                (db.to_json(curve), r["activity_id"]),
            )
            n += 1
    return n


# ---------------------------------------------------------------------------
# Santé quotidienne
# ---------------------------------------------------------------------------


# Phases de sommeil : niveaux Garmin (0 profond, 1 léger, 2 paradoxal, 3 éveil) -> lettres courtes
_SLEEP_LEVEL = {0: "deep", 1: "light", 2: "rem", 3: "awake"}


def _gmt_ms(s: Optional[str]) -> Optional[int]:
    if not s:
        return None
    try:
        return int(datetime.fromisoformat(s.replace(".0", "").rstrip("Z")).replace(tzinfo=timezone.utc).timestamp() * 1000)
    except ValueError:
        return None


def sleep_details(sleep: dict) -> Optional[dict]:
    """Détail d'une nuit pour la page Sommeil : phases, hypnogramme, besoin et heure de coucher conseillée."""
    dto = (sleep or {}).get("dailySleepDTO") or {}
    if not dto.get("sleepTimeSeconds"):
        return None
    start_gmt, start_loc = dto.get("sleepStartTimestampGMT"), dto.get("sleepStartTimestampLocal")
    offset = (start_loc - start_gmt) if start_gmt and start_loc else 0
    levels = []
    for lv in sleep.get("sleepLevels") or []:
        a, b = _gmt_ms(lv.get("startGMT")), _gmt_ms(lv.get("endGMT"))
        stage = _SLEEP_LEVEL.get(int(round(lv.get("activityLevel", -1))))
        if a is None or b is None or stage is None or not start_gmt:
            continue
        levels.append([round((a - start_gmt) / 60000, 1), round((b - start_gmt) / 60000, 1), stage])
    scores = dto.get("sleepScores") or {}
    need = dto.get("sleepNeed") or {}
    nxt = dto.get("nextSleepNeed") or {}
    return {
        "start_local_ms": start_loc,
        "end_local_ms": dto.get("sleepEndTimestampLocal"),
        "offset_ms": offset,
        "deep_s": dto.get("deepSleepSeconds"),
        "light_s": dto.get("lightSleepSeconds"),
        "rem_s": dto.get("remSleepSeconds"),
        "awake_s": dto.get("awakeSleepSeconds"),
        "awake_count": dto.get("awakeCount"),
        "avg_hr": dto.get("avgHeartRate"),
        "nap_s": dto.get("napTimeSeconds"),
        "qualifiers": {k: (v or {}).get("qualifierKey") for k, v in scores.items() if isinstance(v, dict)},
        "need_min": need.get("actual"),
        "need_baseline_min": need.get("baseline"),
        "next_need_min": nxt.get("actual"),
        "next_need_baseline_min": nxt.get("baseline"),
        "bedtime_start_min": nxt.get("recommendedBedtimeStartMins"),
        "bedtime_end_min": nxt.get("recommendedBedtimeEndMins"),
        "levels": levels,
    }


def heart_details(hr: Optional[dict]) -> Optional[dict]:
    """FC de la journée résumée heure par heure (min, max) pour la page Forme et santé."""
    if not isinstance(hr, dict):
        return None
    values = hr.get("heartRateValues") or []
    hours: list = [None] * 24
    gmt0 = _gmt_ms(hr.get("startTimestampGMT"))
    for item in values:
        if not isinstance(item, (list, tuple)) or len(item) < 2 or item[0] is None or item[1] is None or gmt0 is None:
            continue
        h = int((item[0] - gmt0) // 3600000)
        if 0 <= h < 24:
            lo_hi = hours[h]
            hours[h] = [min(lo_hi[0], item[1]), max(lo_hi[1], item[1])] if lo_hi else [item[1], item[1]]
    return {
        "min": hr.get("minHeartRate"),
        "max": hr.get("maxHeartRate"),
        "resting": hr.get("restingHeartRate"),
        "resting_7d": hr.get("lastSevenDaysAvgRestingHeartRate"),
        "hours": hours,
    }


def daily_health_row(client, day: str, errors: list, skip_night: bool = False, out: Optional[dict] = None) -> dict:
    """Mesures de santé d'un jour.

    `skip_night` : la nuit (sommeil, VFC) est déjà en base et ne change plus dans la journée, on ne la
    redemande pas. `out` reçoit le résumé du jour de Garmin (`stats`) pour éviter un second appel.
    Le jour n'est marqué « synchronisé » que si aucun appel n'a échoué."""
    row: dict[str, Any] = {"date": day}
    n_errors = len(errors)

    if not skip_night:
        sleep = safe(f"{day} sleep", errors, client.get_sleep_data, day) or {}
        dto = sleep.get("dailySleepDTO") or {}
        scores = dto.get("sleepScores") or {}
        row.update(
            {
                "sleep_score": num((scores.get("overall") or {}).get("value"), 0),
                "sleep_duration_s": num(dto.get("sleepTimeSeconds"), 0),
                "deep_sleep_s": num(dto.get("deepSleepSeconds"), 0),
                "rem_sleep_s": num(dto.get("remSleepSeconds"), 0),
            }
        )

        row["sleep_json"] = db.to_json(sleep_details(sleep))

        hrv = (safe(f"{day} hrv", errors, client.get_hrv_data, day) or {}).get("hrvSummary") or {}
        row.update(
            {
                "hrv_last_night_ms": num(hrv.get("lastNightAvg"), 0),
                "hrv_weekly_avg_ms": num(hrv.get("weeklyAvg"), 0),
                "hrv_status": hrv.get("status"),
            }
        )

    stats = safe(f"{day} stats", errors, client.get_stats, day) or {}
    if out is not None:
        out["stats"] = stats
    row.update(
        {
            "resting_hr": num(stats.get("restingHeartRate"), 0),
            "body_battery_max": num(stats.get("bodyBatteryHighestValue"), 0),
            "body_battery_min": num(stats.get("bodyBatteryLowestValue"), 0),
            "body_battery_now": num(stats.get("bodyBatteryMostRecentValue"), 0),
            "body_battery_charged": num(stats.get("bodyBatteryChargedValue"), 0),
            "body_battery_drained": num(stats.get("bodyBatteryDrainedValue"), 0),
            "stress_avg": num(stats.get("averageStressLevel"), 0),
        }
    )

    row["heart_json"] = db.to_json(heart_details(safe(f"{day} heart", errors, client.get_heart_rates, day)))

    status = safe(f"{day} training_status", errors, client.get_daily_training_status, day)
    if status:
        row.update(
            {
                "training_status": deep_find(
                    status, "trainingStatusFeedbackPhrase", "trainingStatusPhrase"
                ),
                "acute_load": num(deep_find(status, "dailyTrainingLoadAcute"), 0),
                "chronic_load": num(deep_find(status, "dailyTrainingLoadChronic"), 0),
                "acwr": num(deep_find(status, "dailyAcuteChronicWorkloadRatio"), 2),
                "acwr_status": deep_find(status, "acwrStatus"),
            }
        )

    # Garmin Connect affiche le score le plus récent de la journée (il bouge après le sommeil, les séances…),
    # pas celui du réveil : on prend la première entrée de get_training_readiness, et le score du matin en secours.
    readiness = None
    latest = safe(f"{day} readiness", errors, client.get_training_readiness, day)
    if isinstance(latest, list) and latest and isinstance(latest[0], dict) and latest[0].get("score") is not None:
        readiness = latest[0]
    elif isinstance(latest, dict) and latest.get("score") is not None:
        readiness = latest
    if readiness is None:
        readiness = safe(f"{day} readiness (matin)", errors, client.get_morning_training_readiness, day)
    if isinstance(readiness, dict):
        row.update(
            {
                "readiness_score": num(readiness.get("score"), 0),
                "readiness_level": readiness.get("level"),
                "recovery_time_h": (
                    None
                    if readiness.get("recoveryTime") is None
                    else round(readiness["recoveryTime"] / 60.0, 1)
                ),
            }
        )

    if len(errors) == n_errors:
        row["health_synced"] = 1
        if not skip_night:
            row["detail_v"] = HEALTH_DETAIL_VERSION
    return row


def backfill_health_details(client, conn, errors: list, log=print, limit: int = HEALTH_BACKFILL_PER_SYNC) -> int:
    """Complète les jours passés auxquels il manque les mesures détaillées (phases de sommeil, FC horaire).

    Les jours les plus récents d'abord, `limit` jours par synchro complète pour ménager l'API Garmin.
    Un jour est marqué à la version courante même s'il n'y a rien à récupérer (montre non portée),
    pour ne pas être redemandé indéfiniment ; en cas d'erreur réseau il sera retenté."""
    rows = conn.execute(
        "SELECT date FROM daily_health WHERE date >= ? AND date < ? AND COALESCE(detail_v, 0) < ? "
        "AND (sleep_json IS NULL OR heart_json IS NULL) ORDER BY date DESC LIMIT ?",
        (db.HISTORY_START.isoformat(), (date.today() - timedelta(days=2)).isoformat(), HEALTH_DETAIL_VERSION, limit),
    ).fetchall()
    if not rows:
        return 0
    log(f"      mesures détaillées : {len(rows)} jour(s) à compléter...")
    n = 0
    for r in rows:
        day = r["date"]
        n_errors = len(errors)
        sleep = safe(f"{day} sleep", errors, client.get_sleep_data, day)
        heart = safe(f"{day} heart", errors, client.get_heart_rates, day)
        if len(errors) != n_errors:
            continue
        conn.execute(
            "UPDATE daily_health SET sleep_json = COALESCE(?, sleep_json), heart_json = COALESCE(?, heart_json), "
            "detail_v = ? WHERE date = ?",
            (db.to_json(sleep_details(sleep or {})), db.to_json(heart_details(heart)), HEALTH_DETAIL_VERSION, day),
        )
        conn.commit()
        n += 1
    return n


# ---------------------------------------------------------------------------
# Scores de condition (VO2 max, âge physique, endurance, montée)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Prédictions de chrono
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# CTL / ATL / TSB
# ---------------------------------------------------------------------------


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


class GarminUnreachable(RuntimeError):
    """Garmin n'a pas répondu à l'appel de base : la synchro est abandonnée et sera retentée."""


def _fetch_activities(client, start: date, end: date) -> list:
    try:
        return client.get_activities_by_date(start.isoformat(), end.isoformat()) or []
    except Exception as exc:
        from garmin_client import reset_client

        reset_client()  # la prochaine synchro se reconnectera avec le jeton enregistré
        raise GarminUnreachable(f"Garmin ne répond pas ({type(exc).__name__} : {exc})") from exc


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


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
