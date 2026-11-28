"""Programme : rapprochement séance / sortie, à un jour près."""

from datetime import date

import plans


def run(aid, km):
    return {"activity_id": aid, "distance_m": km * 1000}


def session(day, km, title="Footing", typ="endurance"):
    return {"date": day, "title": title, "type": typ, "km": km, "description": "", "steps": []}


TODAY = date(2026, 11, 27)


def test_same_day_done_and_partial():
    out = plans.match_sessions([session("2026-11-24", 10), session("2026-11-26", 10)],
                               {"2026-11-24": [run(1, 10.0)], "2026-11-26": [run(2, 5.0)]}, TODAY)
    assert [s["status"] for s in out] == ["done", "partial"]
    assert out[0]["shift_days"] == 0


def test_long_run_done_the_next_day():
    """Sortie longue prévue le samedi, courue le dimanche (jour sans séance) : faite, décalée d'un jour."""
    out = plans.match_sessions([session("2026-11-14", 15, "Sortie longue")], {"2026-11-15": [run(9, 15.0)]}, TODAY)
    assert out[0]["status"] == "done" and out[0]["shift_days"] == 1 and out[0]["activity_id"] == 9


def test_neighbour_day_with_its_own_session_is_not_borrowed():
    out = plans.match_sessions([session("2026-11-14", 15), session("2026-11-15", 15)], {"2026-11-15": [run(9, 15.0)]}, TODAY)
    assert [s["status"] for s in out] == ["missed", "done"]


def test_one_run_validates_only_one_session():
    out = plans.match_sessions([session("2026-11-10", 10), session("2026-11-12", 10)], {"2026-11-11": [run(5, 10.0)]}, TODAY)
    assert sorted(s["status"] for s in out) == ["done", "missed"]


def test_too_short_run_next_day_does_not_count():
    out = plans.match_sessions([session("2026-10-31", 14)], {"2026-11-01": [run(3, 5.0)]}, TODAY)
    assert out[0]["status"] == "missed"


def test_future_and_rest_sessions():
    out = plans.match_sessions([session("2026-11-28", 16), session("2026-11-08", None, "Repos", "repos")], {}, TODAY)
    assert [s["status"] for s in out] == ["upcoming", "info"]
