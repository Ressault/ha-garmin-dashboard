"""Synchro Garmin : les sorties.

Résumé (un appel pour toute la fenêtre), détail (dynamiques HRM-600, zones FC, tours, trace GPS, série
temporelle, courbe de puissance), phases course / marche / arrêt.
"""

import json
from datetime import datetime
from typing import Any, Optional

from garminconnect.activity_details import parse_activity_detail_metrics

import db
from sync_utils import num, pick, safe, downsample

MAX_CHART_POINTS = 600
MAX_TRACK_POINTS = 800
DETAIL_MAX_TRIES = 5          # essais de détail d'une sortie avant d'abandonner (activité sans données)


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
