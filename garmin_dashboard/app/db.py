"""
Base SQLite locale (garmin_local.db) : schéma, connexion et upsert générique.

Principe hérité du serveur MCP : une donnée absente vaut NULL, jamais 0.
Les réponses brutes de Garmin les plus volumineuses (trace, séries, splits)
sont stockées en JSON compact dans des colonnes *_json.
"""

import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Iterable, Optional

# GARMIN_DB permet de placer la base ailleurs (add-on Home Assistant : /data)
DB_PATH = Path(os.getenv("GARMIN_DB") or Path(__file__).resolve().parent / "garmin_local.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS activities (
    activity_id            INTEGER PRIMARY KEY,
    name                   TEXT,
    sport_type             TEXT,
    start_time_local       TEXT,          -- 'YYYY-MM-DD HH:MM:SS'
    activity_date          TEXT,          -- 'YYYY-MM-DD' (index)
    distance_m             REAL,
    duration_s             REAL,
    moving_duration_s      REAL,
    elevation_gain_m       REAL,
    elevation_loss_m       REAL,
    avg_speed_ms           REAL,
    max_speed_ms           REAL,
    avg_gap_speed_ms       REAL,          -- allure ajustée à la pente
    avg_hr                 REAL,
    max_hr                 REAL,
    aerobic_te             REAL,
    anaerobic_te           REAL,
    te_label               TEXT,
    training_load          REAL,          -- activityTrainingLoad (EPOC)
    vo2max                 REAL,
    calories               REAL,
    avg_cadence_spm        REAL,
    -- Dynamiques de course (HRM-600)
    ground_contact_ms      REAL,
    gct_balance_left_pct   REAL,
    vertical_oscillation_cm REAL,
    vertical_ratio_pct     REAL,
    stride_length_cm       REAL,
    avg_power_w            REAL,
    max_power_w            REAL,
    -- Blocs JSON
    hr_zones_json          TEXT,          -- [{zone, low_bpm, secs}]
    power_curve_json       TEXT,
    splits_json            TEXT,
    track_json             TEXT,          -- [[lat, lon, alt], ...]
    timeseries_json        TEXT,          -- {units:{}, series:[{...}]}
    segments_json          TEXT,          -- phases détectées par la montre : course / marche / arrêt
    -- Notes
    notes                  TEXT,
    ai_analysis            TEXT,
    details_synced         INTEGER DEFAULT 0,
    updated_at             TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(activity_date);

CREATE TABLE IF NOT EXISTS daily_health (
    date                   TEXT PRIMARY KEY,
    sleep_score            REAL,
    sleep_duration_s       REAL,
    deep_sleep_s           REAL,
    rem_sleep_s            REAL,
    hrv_last_night_ms      REAL,
    hrv_weekly_avg_ms      REAL,
    hrv_status             TEXT,
    resting_hr             REAL,
    body_battery_max       REAL,
    body_battery_min       REAL,
    stress_avg             REAL,
    training_status        TEXT,
    acute_load             REAL,
    chronic_load           REAL,
    acwr                   REAL,
    acwr_status            TEXT,
    readiness_score        REAL,
    readiness_level        TEXT,
    recovery_time_h        REAL,
    -- Calculés localement à partir de activities.training_load
    daily_load             REAL,
    ctl                    REAL,          -- forme (42 j)
    atl                    REAL,          -- fatigue (7 j)
    tsb                    REAL,          -- fraîcheur = CTL - ATL
    health_synced          INTEGER DEFAULT 0,
    updated_at             TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS race_predictions (
    date                   TEXT PRIMARY KEY,
    time_5k_s              REAL,
    time_10k_s             REAL,
    time_half_s            REAL,
    time_marathon_s        REAL,
    updated_at             TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS thresholds (
    date                   TEXT PRIMARY KEY,   -- jour de la synchro
    lthr_bpm               REAL,               -- FC au seuil lactique
    lt_speed_ms            REAL,               -- vitesse au seuil (m/s)
    lt_date                TEXT,               -- date de la mesure du seuil
    run_ftp_w              REAL,               -- puissance seuil de course
    run_wkg                REAL,
    weight_kg              REAL,
    run_ftp_date           TEXT,
    run_ftp_stale          INTEGER,
    bike_ftp_w             REAL,
    bike_ftp_stale         INTEGER,
    max_hr_bpm             REAL,
    resting_hr_bpm         REAL,
    updated_at             TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_log (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at             TEXT,
    finished_at            TEXT,
    days                   INTEGER,
    summary_json           TEXT
);
"""


def connect(db_path: Optional[Path] = None) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path or DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(db_path: Optional[Path] = None) -> None:
    with connect(db_path) as conn:
        conn.executescript(SCHEMA)
        # Migration : colonnes ajoutées après la création de la base
        have = {r["name"] for r in conn.execute("PRAGMA table_info(activities)")}
        if "segments_json" not in have:
            conn.execute("ALTER TABLE activities ADD COLUMN segments_json TEXT")
        dh = {r["name"] for r in conn.execute("PRAGMA table_info(daily_health)")}
        for col, typ in (
            ("vo2max", "REAL"), ("fitness_age", "REAL"), ("chrono_age", "REAL"),
            ("endurance_score", "REAL"), ("hill_score", "REAL"),
            ("endurance_class", "REAL"), ("endurance_limits_json", "TEXT"), ("hill_class", "REAL"),
            ("hill_strength", "REAL"), ("hill_endurance", "REAL"), ("fitness_age_target", "REAL"),
            ("body_battery_now", "REAL"), ("body_battery_charged", "REAL"),
            ("body_battery_drained", "REAL"), ("body_battery_json", "TEXT"),
        ):
            if col not in dh:
                conn.execute(f"ALTER TABLE daily_health ADD COLUMN {col} {typ}")


def to_json(value: Any) -> Optional[str]:
    if value is None or value == [] or value == {}:
        return None
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def from_json(value: Optional[str]) -> Any:
    return json.loads(value) if value else None


def upsert(
    conn: sqlite3.Connection,
    table: str,
    key: str,
    row: dict,
    keep_existing: Iterable[str] = (),
) -> None:
    """INSERT ... ON CONFLICT DO UPDATE.

    - Les valeurs None ne remplacent jamais une valeur déjà connue
      (COALESCE), pour qu'une synchro partielle n'efface rien.
    - `keep_existing` : colonnes jamais écrasées (notes de l'utilisateur).
    """
    cols = list(row.keys())
    placeholders = ", ".join(f":{c}" for c in cols)
    updates = []
    for c in cols:
        if c == key or c in keep_existing:
            continue
        updates.append(f"{c} = COALESCE(excluded.{c}, {table}.{c})")
    updates.append("updated_at = datetime('now')")
    sql = (
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT({key}) DO UPDATE SET {', '.join(updates)}"
    )
    conn.execute(sql, row)
