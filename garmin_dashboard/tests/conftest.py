"""Chaque test travaille sur une base SQLite vide et jetable : rien ne touche la vraie base ni Garmin."""

import os
import sys
import tempfile
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"
sys.path.insert(0, str(APP))

_tmp = tempfile.mkdtemp(prefix="gd-tests-")
os.environ["GARMIN_DB"] = str(Path(_tmp) / "test.db")
os.environ["GARMIN_AUTO_SYNC"] = "off"
os.environ.pop("ACCESS_CODE", None)

import pytest  # noqa: E402

import db  # noqa: E402


@pytest.fixture()
def conn():
    """Base vide, schéma à jour."""
    if db.DB_PATH.exists():
        db.DB_PATH.unlink()
    for ext in ("-wal", "-shm"):
        p = Path(str(db.DB_PATH) + ext)
        if p.exists():
            p.unlink()
    db.init_db()
    c = db.connect()
    import plans
    import stats

    stats._EFFORT_CACHE.clear()  # caches en mémoire indexés par identifiant de sortie : repartir de zéro
    stats._ZONE_CACHE.clear()

    plans._ensure(c)
    yield c
    c.close()


def series(points):
    """[(t, d, hr?)] → série temporelle au format stocké."""
    return [{"t": p[0], "d": p[1], **({"hr": p[2]} if len(p) > 2 else {})} for p in points]


def steady(speed_ms: float, seconds: int, step: int = 5, hr: int = 150, t0: float = 0, d0: float = 0):
    """Course régulière : un point toutes les `step` secondes."""
    return [(t0 + t, d0 + speed_ms * t, hr) for t in range(0, seconds + 1, step)]


def add_run(conn, aid, day, pts, name="Course", sport="running"):
    import json

    dist = pts[-1][1] - pts[0][1]
    dur = pts[-1][0] - pts[0][0]
    conn.execute(
        "INSERT INTO activities (activity_id, name, sport_type, start_time_local, activity_date, distance_m, duration_s, "
        "timeseries_json, details_synced) VALUES (?,?,?,?,?,?,?,?,1)",
        (aid, name, sport, f"{day} 10:00:00", day, dist, dur, json.dumps({"series": series(pts)})),
    )
    conn.commit()
