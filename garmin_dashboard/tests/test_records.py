"""Records : le filtre des faux records et le meilleur temps sur une distance."""

import stats
from conftest import add_run, series, steady


def test_best_time_regular_run():
    ts = series(steady(3.0, 1200))  # 3 m/s pendant 20 min = 3,6 km
    assert abs(stats.best_time(ts, 1000) - 1000 / 3.0) < 0.5


def test_best_time_too_short_returns_none():
    assert stats.best_time(series(steady(3.0, 200)), 1000) is None


def test_gps_jump_does_not_make_a_record():
    """Sortie du 16 août : 60 s à 38 km/h en fin de sortie (montre non arrêtée). Aucune fenêtre ne doit en profiter."""
    run = steady(3.5, 480, step=2)                      # 8 min à 3,5 m/s
    t0, d0 = run[-1][0], run[-1][1]
    jump = [(t0 + t, d0 + 10.5 * t, 150) for t in range(2, 62, 2)]  # 10,5 m/s = 38 km/h
    ts = series(run + jump)
    for dist in (804.672, 1000, 1609.344):
        t = stats.best_time(ts, dist, stats.MAX_SPEED_MS["foot"])
        assert t is not None
        assert abs(dist / t - 3.5) < 0.02, f"{dist} m : le passage impossible a servi au record"
    # Sans le filtre (ancien comportement), le saut donnait un faux record : le test échoue si on le retire
    assert stats.best_time(ts, 1000) < stats.best_time(ts, 1000, stats.MAX_SPEED_MS["foot"]) - 20


def test_isolated_glitch_is_tolerated():
    """Un seul point aberrant (10 m en 1 s) sur un semi ne doit pas effacer le record de la sortie."""
    a = steady(2.9, 3600, step=10)
    t0, d0 = a[-1][0], a[-1][1]
    glitch = [(t0 + 1, d0 + 10, 150)]
    b = steady(2.9, 4200, step=10, t0=t0 + 1, d0=d0 + 10)[1:]
    ts = series(a + glitch + b)
    assert stats.best_time(ts, 21097.5, stats.MAX_SPEED_MS["foot"]) is not None


def test_efforts_endpoint_ranks_real_runs(conn):
    add_run(conn, 1, "2026-09-16", steady(3.5, 1500))   # 5 km en 23:49
    add_run(conn, 2, "2026-11-26", steady(3.26, 1700))  # 5 km en 25:34
    out = stats.efforts(kind="foot", sport="run")
    five = next(d for d in out["distances"] if d["label"] == "5 km")
    best = min(five["efforts"], key=lambda e: e["time_s"])
    assert best["activity_id"] == 1 and abs(best["time_s"] - 5000 / 3.5) < 1
