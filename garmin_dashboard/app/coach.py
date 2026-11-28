"""
Aide à la décision : résultat du test de seuil, estimation de chrono tirée des records,
courses objectif. Tout est calculé à partir des sorties déjà en base.
"""

import json
import re
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import db
from stats import MAX_SPEED_MS, _activity_efforts, sport_group

router = APIRouter(prefix="/api/coach", tags=["coach"])

TEST_SECONDS = 30 * 60       # durée du test de seuil
LTHR_TAIL_SECONDS = 20 * 60  # la FC seuil est la moyenne des 20 dernières minutes du test
TEST_NAME = re.compile(r"test.*(seuil|30\s*min)|(seuil|30\s*min).*test", re.I)


def best_distance(ts: list, seconds: float) -> Optional[tuple]:
    """Plus grande distance couverte en `seconds` : (distance_m, t_début, t_fin). Fenêtre glissante interpolée."""
    pts = [(p.get("t"), p.get("d")) for p in ts]
    pts = [(t, d) for t, d in pts if t is not None and d is not None]
    if len(pts) < 10 or pts[-1][0] - pts[0][0] < seconds:
        return None
    best = None
    j = 0
    for i, (t0, d0) in enumerate(pts):
        target = t0 + seconds
        if target > pts[-1][0]:
            break
        while pts[j][0] < target:
            j += 1
        (ta, da), (tb, db_) = pts[j - 1], pts[j]
        d_end = db_ if tb == ta else da + (db_ - da) * (target - ta) / (tb - ta)
        dist = d_end - d0
        if best is None or dist > best[0]:
            best = (dist, t0, target)
    return best


def mean_hr(ts: list, t0: float, t1: float) -> Optional[float]:
    """FC moyenne pondérée par le temps entre t0 et t1."""
    total = weight = 0.0
    pts = [(p.get("t"), p.get("hr")) for p in ts if p.get("t") is not None and p.get("hr") is not None]
    for (ta, ha), (tb, _) in zip(pts, pts[1:]):
        lo, hi = max(ta, t0), min(tb, t1)
        if hi > lo and tb - ta <= 30:
            total += ha * (hi - lo)
            weight += hi - lo
    return total / weight if weight > 60 else None


def _plan_test_dates(conn) -> set:
    """Dates des séances « test de seuil » des programmes importés."""
    out = set()
    try:
        rows = conn.execute("SELECT data_json FROM training_plans").fetchall()
    except Exception:
        return out
    for r in rows:
        for s in json.loads(r["data_json"]).get("sessions", []):
            if (s.get("type") or "").lower() == "test" and re.search(r"seuil|30\s*min", s.get("title") or "", re.I):
                out.add(s["date"])
    return out


def threshold_test(conn) -> Optional[dict]:
    """Dernier test de seuil de 30 min : allure moyenne des 30 min, FC moyenne des 20 dernières."""
    planned = _plan_test_dates(conn)
    rows = conn.execute(
        "SELECT activity_id, name, sport_type, activity_date, duration_s FROM activities "
        "WHERE duration_s >= ? AND timeseries_json IS NOT NULL ORDER BY activity_date DESC",
        (TEST_SECONDS,),
    ).fetchall()
    rows = [a for a in rows if sport_group(a["sport_type"]) == "run"]
    run_days = {a["activity_date"] for a in rows}

    def shifted(day: str) -> bool:
        # test couru la veille ou le lendemain du jour prévu, sans sortie le jour prévu
        d = date.fromisoformat(day)
        return any(
            p in planned and p not in run_days
            for p in ((d - timedelta(days=1)).isoformat(), (d + timedelta(days=1)).isoformat())
        )

    for a in rows:
        day = a["activity_date"]
        if not (TEST_NAME.search(a["name"] or "") or day in planned or shifted(day)):
            continue
        raw = conn.execute("SELECT timeseries_json FROM activities WHERE activity_id = ?", (a["activity_id"],)).fetchone()
        ts = (db.from_json(raw["timeseries_json"]) or {}).get("series") or []
        best = best_distance(ts, TEST_SECONDS)
        if not best:
            continue
        dist, t0, t1 = best
        speed = dist / TEST_SECONDS
        if speed > MAX_SPEED_MS["foot"] or speed < 1.5:
            continue
        hr = mean_hr(ts, t1 - LTHR_TAIL_SECONDS, t1)
        return {
            "activity_id": a["activity_id"],
            "name": a["name"],
            "date": a["activity_date"],
            "distance_m": round(dist),
            "speed_ms": round(speed, 3),
            "pace_s_km": round(1000 / speed),
            "lthr_bpm": round(hr) if hr else None,
        }
    return None


def riegel(time_s: float, from_m: float, to_m: float, k: float = 1.06) -> float:
    """Formule de Riegel : temps sur une autre distance, à niveau de forme égal."""
    return time_s * (to_m / from_m) ** k


ESTIMATE_DAYS = 120  # les records plus anciens ne reflètent plus le niveau du moment
HALF_M = 21097.5


def half_estimate(conn, today: Optional[date] = None) -> Optional[dict]:
    """Fourchette de chrono sur semi tirée des meilleurs 5 km et 10 km récents (course sur route)."""
    today = today or date.today()
    since = (today - timedelta(days=ESTIMATE_DAYS)).isoformat()
    acts = conn.execute(
        "SELECT activity_id, name, sport_type, activity_date, distance_m, updated_at, timeseries_json "
        "FROM activities WHERE activity_date >= ? ORDER BY activity_date",
        (since,),
    ).fetchall()
    bases = []
    for label, dist in (("5 km", 5000.0), ("10 km", 10000.0)):
        best = None
        for a in acts:
            if sport_group(a["sport_type"]) != "run":
                continue
            t = _activity_efforts(a, "foot").get(label)
            if t and (best is None or t < best["time_s"]):
                best = {"label": label, "distance_m": dist, "time_s": t, "date": a["activity_date"],
                        "activity_id": a["activity_id"]}
        if best:
            best["half_s"] = round(riegel(best["time_s"], dist, HALF_M))
            bases.append(best)
    if not bases:
        return None
    lo, hi = min(b["half_s"] for b in bases), max(b["half_s"] for b in bases)
    return {"low_s": lo, "high_s": hi, "pace_low_s_km": round(lo / (HALF_M / 1000)),
            "pace_high_s_km": round(hi / (HALF_M / 1000)), "bases": bases, "days": ESTIMATE_DAYS}


# ---------------------------------------------------------------------------
# Courses objectif (enregistrées dans le profil, pas dans le code)
# ---------------------------------------------------------------------------


class RaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    km: Optional[float] = Field(default=None, ge=0, le=400)


def get_races(conn) -> list:
    try:
        return sorted(json.loads(db.get_setting(conn, "races") or "[]"), key=lambda r: r["date"])
    except (ValueError, KeyError, TypeError):
        return []


@router.get("/races")
def races() -> dict:
    with db.connect() as conn:
        return {"races": get_races(conn), "today": date.today().isoformat()}


@router.put("/races")
def save_races(items: list[RaceIn]) -> dict:
    if len(items) > 20:
        raise HTTPException(400, "20 courses au plus.")
    for r in items:
        date.fromisoformat(r.date)
    with db.connect() as conn:
        db.set_setting(conn, "races", json.dumps([r.model_dump() for r in items], ensure_ascii=False))
        conn.commit()
        return {"races": get_races(conn), "today": date.today().isoformat()}


@router.get("/estimate")
def estimate() -> dict:
    with db.connect() as conn:
        return {"half": half_estimate(conn)}
