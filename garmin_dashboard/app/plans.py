"""
Programmes d'entraînement : import, liste, suivi et suppression.

Un programme est une liste de séances datées (date, titre, type, distance prévue, description).
Chaque séance est comparée aux sorties à pied réellement synchronisées pour savoir si elle est faite.
"""

import json
import re
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

import db
from stats import monday, sport_group

router = APIRouter(prefix="/api/plans", tags=["plans"])

DDL = """
CREATE TABLE IF NOT EXISTS training_plans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    goal_name   TEXT,
    goal_date   TEXT,
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    data_json   TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
);
"""

ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _check_date(v: Optional[str]) -> Optional[str]:
    if v in (None, ""):
        return None
    if not ISO.match(v):
        raise ValueError(f"Date invalide « {v} » : le format attendu est AAAA-MM-JJ.")
    date.fromisoformat(v)
    return v


class SessionIn(BaseModel):
    date: str
    title: str = Field(min_length=1, max_length=160)
    type: str = Field(default="endurance", max_length=30)
    km: Optional[float] = Field(default=None, ge=0, le=400)
    description: str = Field(default="", max_length=3000)
    steps: list[str] = Field(default_factory=list, max_length=60)

    @field_validator("date")
    @classmethod
    def _date(cls, v: str) -> str:
        return _check_date(v) or ""


class PlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    goal_name: Optional[str] = Field(default=None, max_length=160)
    goal_date: Optional[str] = None
    sessions: list[SessionIn] = Field(min_length=1, max_length=2000)

    @field_validator("goal_date")
    @classmethod
    def _goal(cls, v: Optional[str]) -> Optional[str]:
        return _check_date(v)


def _ensure(conn) -> None:
    conn.executescript(DDL)


def _summary(row, data: dict) -> dict:
    sessions = data["sessions"]
    return {
        "id": row["id"],
        "name": row["name"],
        "goal_name": row["goal_name"],
        "goal_date": row["goal_date"],
        "start_date": row["start_date"],
        "end_date": row["end_date"],
        "sessions": len(sessions),
        "total_km": round(sum(s.get("km") or 0 for s in sessions), 1),
        "created_at": row["created_at"],
    }


@router.get("")
def list_plans() -> dict:
    with db.connect() as conn:
        _ensure(conn)
        rows = conn.execute("SELECT * FROM training_plans ORDER BY start_date DESC, id DESC").fetchall()
    return {"plans": [_summary(r, json.loads(r["data_json"])) for r in rows]}


@router.post("")
def create_plan(plan: PlanIn) -> dict:
    sessions = sorted((s.model_dump() for s in plan.sessions), key=lambda s: s["date"])
    start, end = sessions[0]["date"], sessions[-1]["date"]
    name = plan.name.strip()
    payload = json.dumps({"sessions": sessions}, ensure_ascii=False)
    with db.connect() as conn:
        _ensure(conn)
        # Réimporter un programme du même nom le met à jour (pratique pour corriger un fichier)
        old = conn.execute("SELECT id FROM training_plans WHERE name = ?", (name,)).fetchone()
        if old:
            conn.execute(
                "UPDATE training_plans SET goal_name=?, goal_date=?, start_date=?, end_date=?, data_json=? WHERE id=?",
                (plan.goal_name, plan.goal_date, start, end, payload, old["id"]),
            )
            conn.commit()
            return {"id": old["id"], "replaced": True}
        cur = conn.execute(
            "INSERT INTO training_plans (name, goal_name, goal_date, start_date, end_date, data_json) VALUES (?,?,?,?,?,?)",
            (name, plan.goal_name, plan.goal_date, start, end, payload),
        )
        conn.commit()
        return {"id": cur.lastrowid, "replaced": False}


@router.delete("/{plan_id}")
def delete_plan(plan_id: int) -> dict:
    with db.connect() as conn:
        _ensure(conn)
        cur = conn.execute("DELETE FROM training_plans WHERE id = ?", (plan_id,))
        conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(404, "Programme introuvable")
    return {"deleted": plan_id}


@router.get("/{plan_id}")
def get_plan(plan_id: int) -> dict:
    today = date.today()
    with db.connect() as conn:
        _ensure(conn)
        row = conn.execute("SELECT * FROM training_plans WHERE id = ?", (plan_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Programme introuvable")
        data = json.loads(row["data_json"])
        start = monday(date.fromisoformat(row["start_date"]))
        end = date.fromisoformat(row["end_date"])
        acts = conn.execute(
            "SELECT activity_id, name, sport_type, activity_date, distance_m FROM activities "
            "WHERE activity_date BETWEEN ? AND ? ORDER BY activity_date",
            (start.isoformat(), (end + timedelta(days=7)).isoformat()),
        ).fetchall()
    runs = [a for a in acts if sport_group(a["sport_type"]) in ("run", "trail")]
    by_day: dict[str, list] = {}
    for a in runs:
        by_day.setdefault(a["activity_date"], []).append(a)

    out = []
    for s in data["sessions"]:
        day = by_day.get(s["date"], [])
        done_km = round(sum((a["distance_m"] or 0) for a in day) / 1000, 2)
        km = s.get("km")
        d = date.fromisoformat(s["date"])
        if km is None or km <= 0:
            status = "info"
        elif day:
            status = "done" if done_km >= km * 0.8 else "partial"
        elif d < today:
            status = "missed"
        elif d == today:
            status = "today"
        else:
            status = "upcoming"
        out.append({**s, "status": status, "done_km": done_km if day else None, "activity_id": day[0]["activity_id"] if day else None})

    # volume prévu / réalisé par semaine (toutes les sorties à pied comptent, prévues ou non)
    weeks = []
    w = start
    last = monday(end)
    while w <= last:
        wk = w.isoformat()
        we = (w + timedelta(days=6)).isoformat()
        planned = sum(s.get("km") or 0 for s in data["sessions"] if wk <= s["date"] <= we)
        actual = sum((a["distance_m"] or 0) for a in runs if wk <= a["activity_date"] <= we) / 1000
        weeks.append({"week": wk, "planned_km": round(planned, 1), "done_km": round(actual, 1)})
        w += timedelta(days=7)

    return {**_summary(row, data), "today": today.isoformat(), "sessions_detail": out, "weeks": weeks}
