"""Synchro Garmin : la santé jour par jour (sommeil, VFC, FC, Body Battery, disponibilité).
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import db
from sync_utils import num, deep_find, safe

HEALTH_DETAIL_VERSION = 1     # à augmenter quand une nouvelle mesure détaillée est ajoutée aux jours passés
HEALTH_BACKFILL_PER_SYNC = 20  # jours passés complétés par synchro complète (2 appels chacun)


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
