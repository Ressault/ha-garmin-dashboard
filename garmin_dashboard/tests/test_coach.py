"""Test de seuil, estimation du semi, charge (CTL / ATL / TSB)."""

import json
from datetime import date, timedelta

import coach
import sync
from conftest import add_run, series, steady


def test_best_distance_over_30_min():
    warm = steady(2.6, 720, hr=140)                                     # 12 min d'échauffement
    t0, d0 = warm[-1][0], warm[-1][1]
    test = steady(3.224, 1800, hr=173, t0=t0, d0=d0)[1:]                # 30 min à 5:10 /km
    t1, d1 = test[-1][0], test[-1][1]
    cool = steady(2.4, 600, hr=135, t0=t1, d0=d1)[1:]
    ts = series(warm + test + cool)
    dist, a, b = coach.best_distance(ts, 1800)
    assert abs(dist - 3.224 * 1800) < 5 and abs(a - 720) <= 5
    assert abs(coach.mean_hr(ts, b - 1200, b) - 173) < 1


def test_threshold_test_found_from_plan_and_name(conn):
    warm = steady(2.6, 720, hr=140)
    test = steady(3.224, 1800, hr=173, t0=warm[-1][0], d0=warm[-1][1])[1:]
    add_run(conn, 7, "2026-11-26", warm + test, name="Perrusson - S7 TEST 30 min")
    add_run(conn, 8, "2026-11-24", steady(2.8, 3600), name="Footing")
    out = coach.threshold_test(conn)
    assert out["activity_id"] == 7
    assert out["pace_s_km"] == 310 and out["lthr_bpm"] == 173  # 5:10 /km, 173 BPM


def test_riegel_and_half_estimate(conn):
    assert abs(coach.riegel(1535, 5000, 21097.5) - 7062) < 5      # 25:35 sur 5 km → 1:57:42
    add_run(conn, 1, "2026-11-26", steady(5000 / 1535, 1700))
    est = coach.half_estimate(conn, date(2026, 11, 27))
    assert est and abs(est["low_s"] - 7062) < 20
    # un record trop ancien n'entre pas dans l'estimation
    assert coach.half_estimate(conn, date(2027, 6, 1)) is None


def test_fitness_model_matches_hand_computation(conn):
    """CTL / ATL / TSB : une charge de 100 pendant 10 jours, recalcul à la main."""
    today = date.today()
    for i in range(10):
        d = (today - timedelta(days=9 - i)).isoformat()
        conn.execute(
            "INSERT INTO activities (activity_id, sport_type, activity_date, start_time_local, training_load) VALUES (?,?,?,?,?)",
            (100 + i, "running", d, f"{d} 08:00:00", 100.0),
        )
    conn.commit()
    sync.recompute_fitness(conn)
    conn.commit()
    ctl = atl = 0.0
    for _ in range(10):
        ctl += (100 - ctl) / 42
        atl += (100 - atl) / 7
    row = conn.execute("SELECT ctl, atl, tsb FROM daily_health WHERE date = ?", (today.isoformat(),)).fetchone()
    assert abs(row["ctl"] - ctl) < 0.06 and abs(row["atl"] - atl) < 0.06 and abs(row["tsb"] - (ctl - atl)) < 0.11
