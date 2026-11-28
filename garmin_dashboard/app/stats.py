"""Statistiques agrégées (équivalents des écrans « Progrès » de Strava Premium)."""

from bisect import bisect_left
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Query

import db

router = APIRouter(prefix="/api/stats")


def sport_group(t: Optional[str]) -> str:
    t = (t or "").lower()
    if "trail" in t:
        return "trail"
    if "run" in t:
        return "run"
    if "bik" in t or "cycl" in t or "ride" in t:
        return "bike"
    if "walk" in t or "hik" in t:
        return "walk"
    if "strength" in t:
        return "strength"
    return "other"


def matches(sport: str, sport_type: Optional[str]) -> bool:
    """Filtre par famille de sports Garmin (typeKey de l'activité)."""
    t = (sport_type or "").lower()
    g = sport_group(t)
    if sport == "all":
        return True
    if sport == "foot":
        return g in ("run", "trail")
    if sport in ("run", "trail", "bike", "strength"):
        return g == sport
    if sport == "bikes":
        return g == "bike"
    if sport == "mtb":
        return g == "bike" and "mountain" in t
    if sport == "road":
        return g == "bike" and "mountain" not in t
    if sport == "walk":
        return "walk" in t
    if sport == "hike":
        return "hik" in t
    if sport == "swim":
        return "swim" in t
    return g == sport


def _rows(conn, start: str, end: str, sport: str):
    rows = conn.execute(
        "SELECT activity_id, name, sport_type, activity_date, distance_m, "
        "CASE "
        "WHEN sport_type LIKE 'strength%' OR sport_type LIKE '%swim%' THEN duration_s "
        "WHEN sport_type IN ('hiking','walking') THEN COALESCE(moving_duration_s, duration_s) "
        "+ 0.5 * (COALESCE(duration_s, 0) - COALESCE(moving_duration_s, duration_s, 0)) "
        "ELSE COALESCE(moving_duration_s, duration_s) END AS duration_s, "
        "elevation_gain_m, training_load, hr_zones_json FROM activities "
        "WHERE activity_date BETWEEN ? AND ? ORDER BY activity_date",
        (start, end),
    ).fetchall()
    return [r for r in rows if matches(sport, r["sport_type"])]


def _sum(rows) -> dict:
    return {
        "secs": sum(r["duration_s"] or 0 for r in rows),
        "km": sum((r["distance_m"] or 0) for r in rows) / 1000,
        "dplus": sum(r["elevation_gain_m"] or 0 for r in rows),
        "count": len(rows),
    }


def monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


@router.get("/weekly")
def weekly(weeks: int = Query(12, ge=2, le=104), sport: str = "all") -> dict:
    today = date.today()
    first = monday(today) - timedelta(weeks=weeks - 1)
    with db.connect() as conn:
        rows = _rows(conn, first.isoformat(), today.isoformat(), sport)
    buckets = {(first + timedelta(weeks=i)).isoformat(): [] for i in range(weeks)}
    for r in rows:
        k = monday(date.fromisoformat(r["activity_date"])).isoformat()
        if k in buckets:
            buckets[k].append(r)
    series = [{"week": k, **_sum(v)} for k, v in buckets.items()]
    return {"sport": sport, "series": series, "current": series[-1]}


PERIODS = {"7d": 7, "1m": 30}
# Strava découpe 3 mois, 6 mois et 1 an en semaines complètes (lundi → dimanche), semaine en cours incluse.
WEEK_PERIODS = {"3m": 12, "6m": 24, "1y": 52}


def _period_range(period: str, today: date):
    """(début, fin, début précédent, fin précédente) ; la période précédente a la même durée."""
    if period == "ytd":
        start = date(today.year, 1, 1)
        span = (today - start).days + 1
        try:
            prev_start = start.replace(year=today.year - 1)
        except ValueError:
            prev_start = date(today.year - 1, 1, 1)
        return start, today, prev_start, prev_start + timedelta(days=span - 1)
    if period in WEEK_PERIODS:
        n = WEEK_PERIODS[period] * 7
        end = monday(today) + timedelta(days=6)
        start = end - timedelta(days=n - 1)
        return start, end, start - timedelta(days=n), start - timedelta(days=1)
    n = PERIODS[period]
    start = today - timedelta(days=n - 1)
    return start, today, start - timedelta(days=n), start - timedelta(days=1)


@router.get("/period")
def period(period: str = Query("1m", pattern="^(7d|1m|3m|6m|ytd|1y)$"), sport: str = "all") -> dict:
    """Totaux, évolution par rapport à la période précédente et série du graphique."""
    today = date.today()
    start, end, p_start, p_end = _period_range(period, today)
    with db.connect() as conn:
        rows = _rows(conn, p_start.isoformat(), end.isoformat(), sport)
        first_row = conn.execute("SELECT MIN(activity_date) AS d FROM activities").fetchone()
    first_date = first_row["d"] if first_row else None
    # La période précédente doit être entièrement couverte par l'historique, sinon le % est trompeur.
    prev_complete = bool(first_date) and p_start.isoformat() >= first_date
    cur = [r for r in rows if r["activity_date"] >= start.isoformat()]
    prev = [r for r in rows if r["activity_date"] <= p_end.isoformat()]
    t_cur, t_prev = _sum(cur), _sum(prev)

    def pct(a: float, b: float) -> Optional[float]:
        return round((a - b) / b * 100, 1) if b and prev_complete else None

    daily = period in ("7d", "1m")
    if daily:
        keys = [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]
        key_of = lambda d: d.isoformat()
    else:
        first = monday(start)
        keys = [(first + timedelta(weeks=i)).isoformat() for i in range((monday(end) - first).days // 7 + 1)]
        key_of = lambda d: monday(d).isoformat()
    buckets: dict = {k: [] for k in keys}
    for r in cur:
        k = key_of(date.fromisoformat(r["activity_date"]))
        if k in buckets:
            buckets[k].append(r)
    return {
        "period": period,
        "sport": sport,
        "granularity": "day" if daily else "week",
        "from": start.isoformat(),
        "to": end.isoformat(),
        "prev_from": p_start.isoformat(),
        "prev_to": p_end.isoformat(),
        "days": (end - start).days + 1,
        "prev_complete": prev_complete,
        "first_date": first_date,
        "current": t_cur,
        "previous": t_prev,
        "delta_pct": {
            "secs": pct(t_cur["secs"], t_prev["secs"]),
            "km": pct(t_cur["km"], t_prev["km"]),
            "dplus": pct(t_cur["dplus"], t_prev["dplus"]),
        },
        "series": [{"date": k, **_sum(v)} for k, v in buckets.items()],
    }


_ZONE_CACHE: dict = {}


def _stream_zones(row, bounds: tuple) -> Optional[list]:
    """Temps par zone (s) d'une sortie, calculé sur sa courbe de FC avec des bornes données."""
    key = (row["activity_id"], row["updated_at"], bounds)
    if key in _ZONE_CACHE:
        return _ZONE_CACHE[key]
    ts = (db.from_json(row["timeseries_json"]) or {}).get("series") if row["timeseries_json"] else None
    out = None
    if ts:
        out = [0.0] * 5
        for a, b in zip(ts, ts[1:]):
            hr, ta, tb = a.get("hr"), a.get("t"), b.get("t")
            if hr is None or ta is None or tb is None:
                continue
            dt = tb - ta
            if 0 < dt <= 30:
                out[sum(hr >= x for x in bounds)] += dt
    if len(_ZONE_CACHE) > 5000:
        _ZONE_CACHE.clear()
    _ZONE_CACHE[key] = out
    return out


@router.get("/zones")
def zones(
    days: int = Query(30, ge=7, le=730),
    sport: str = "all",
    bounds: Optional[str] = Query(None, description="bornes basses Z2..Z5 en bpm, ex. 125,156,171,186"),
) -> dict:
    """Temps par zone de FC. Sans `bounds` : zones Garmin ; avec : recalcul sur la courbe de FC."""
    custom = tuple(int(x) for x in bounds.split(",")) if bounds else None
    if custom and len(custom) != 4:
        custom = None
    today = date.today()
    cur_start = today - timedelta(days=days - 1)
    prev_start = cur_start - timedelta(days=days)

    def agg(a: date, b: date, conn):
        secs = [0.0] * 5
        with_z = total = 0
        rows = conn.execute(
            "SELECT activity_id, sport_type, activity_date, updated_at, hr_zones_json, "
            + ("timeseries_json" if custom else "NULL AS timeseries_json")
            + " FROM activities WHERE activity_date BETWEEN ? AND ?",
            (a.isoformat(), b.isoformat()),
        ).fetchall()
        for r in rows:
            if not matches(sport, r["sport_type"]):
                continue
            total += 1
            z = _stream_zones(r, custom) if custom else None
            if not custom:
                zz = db.from_json(r["hr_zones_json"])
                if zz:
                    z = [0.0] * 5
                    for item in zz:
                        i = int(item["zone"]) - 1
                        if 0 <= i < 5:
                            z[i] += item.get("secs") or 0
            if not z:
                continue
            with_z += 1
            secs = [x + y for x, y in zip(secs, z)]
        return {"secs": secs, "total": sum(secs), "activities": total, "with_zones": with_z,
                "from": a.isoformat(), "to": b.isoformat()}

    with db.connect() as conn:
        current = agg(cur_start, today, conn)
        previous = agg(prev_start, cur_start - timedelta(days=1), conn)
        out_bounds: list = [0, *custom] if custom else [None] * 5
        if not custom:
            for r in conn.execute(
                "SELECT hr_zones_json FROM activities WHERE hr_zones_json IS NOT NULL "
                "AND hr_zones_json LIKE '%\"low_bpm\":%' AND hr_zones_json NOT LIKE '%\"low_bpm\":null%' "
                "ORDER BY activity_date DESC LIMIT 1"
            ):
                for item in db.from_json(r["hr_zones_json"]) or []:
                    i = int(item["zone"]) - 1
                    if 0 <= i < 5:
                        out_bounds[i] = item.get("low_bpm")
    return {"days": days, "sport": sport, "scheme": "custom" if custom else "garmin",
            "current": current, "previous": previous, "bounds": out_bounds}


@router.get("/monthly")
def monthly(months: int = Query(12, ge=2, le=36), sport: str = "all") -> dict:
    today = date.today()
    y, m = today.year, today.month - (months - 1)
    while m <= 0:
        m += 12
        y -= 1
    first = date(y, m, 1)
    with db.connect() as conn:
        rows = _rows(conn, first.isoformat(), today.isoformat(), sport)
    keys = []
    yy, mm = first.year, first.month
    for _ in range(months):
        keys.append(f"{yy}-{mm:02d}")
        mm += 1
        if mm > 12:
            mm, yy = 1, yy + 1
    buckets = {k: [] for k in keys}
    for r in rows:
        buckets.setdefault(r["activity_date"][:7], []).append(r)
    series = [{"month": k, **_sum(buckets.get(k, []))} for k in keys]

    def cumulative(key: str):
        yr, mo = int(key[:4]), int(key[5:])
        nxt = date(yr + (mo == 12), mo % 12 + 1, 1)
        n_days = (nxt - date(yr, mo, 1)).days
        per_day = [[0.0, 0.0, 0.0] for _ in range(n_days)]
        for r in buckets.get(key, []):
            d = int(r["activity_date"][8:]) - 1
            per_day[d][0] += r["duration_s"] or 0
            per_day[d][1] += (r["distance_m"] or 0) / 1000
            per_day[d][2] += r["elevation_gain_m"] or 0
        out, acc = [], [0.0, 0.0, 0.0]
        for d, v in enumerate(per_day):
            acc = [acc[i] + v[i] for i in range(3)]
            out.append({"day": d + 1, "secs": acc[0], "km": acc[1], "dplus": acc[2]})
        return out

    cur_key = keys[-1]
    prev_key = keys[-2]
    cur = cumulative(cur_key)
    return {
        "sport": sport,
        "series": series,
        "current_month": cur_key,
        "previous_month": prev_key,
        "cumulative": {"current": cur[: today.day], "previous": cumulative(prev_key)},
    }


def _pct(sorted_vals: list, p: float) -> float:
    if not sorted_vals:
        return 0.0
    i = (len(sorted_vals) - 1) * p
    lo, hi = int(i), min(int(i) + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (i - lo)


@router.get("/effort")
def effort(weeks: int = Query(12, ge=4, le=52)) -> dict:
    """Effort relatif = charge d'entraînement Garmin cumulée dans la semaine (lundi → dimanche)."""
    today = date.today()
    first = monday(today) - timedelta(weeks=weeks - 1)
    with db.connect() as conn:
        rows = _rows(conn, first.isoformat(), today.isoformat(), "all")
    per_week: dict[str, list[float]] = {
        (first + timedelta(weeks=i)).isoformat(): [0.0] * 7 for i in range(weeks)
    }
    for r in rows:
        d = date.fromisoformat(r["activity_date"])
        k = monday(d).isoformat()
        if k in per_week:
            per_week[k][d.weekday()] += r["training_load"] or 0
    keys = list(per_week)

    def cum(k: str, upto: int = 7):
        acc, out = 0.0, []
        for v in per_week[k][:upto]:
            acc += v
            out.append(round(acc, 1))
        return out

    # Semaines complètes passées : plage habituelle (25e–75e centile) du cumul à chaque jour
    past = [cum(k) for k in keys[:-1] if sum(per_week[k]) > 0]
    typical_lo = [round(_pct(sorted(c[i] for c in past), 0.25)) for i in range(7)] if past else None
    typical_hi = [round(_pct(sorted(c[i] for c in past), 0.75)) for i in range(7)] if past else None
    wd = today.weekday()
    current = cum(keys[-1], wd + 1)
    status = None
    if past:
        status = "below" if current[-1] < typical_lo[wd] else "above" if current[-1] > typical_hi[wd] else "ok"
    return {
        "current": current[-1],
        "previous_total": cum(keys[-2])[-1],
        "previous_to_date": cum(keys[-2])[wd],
        "weekday": wd,
        "status": status,
        "typical": {"lo": typical_lo, "hi": typical_hi},
        "cumulative": {"current": current, "previous": cum(keys[-2])},
        "weeks": [{"week": k, "load": round(sum(per_week[k]), 1)} for k in keys],
    }


EFFORTS = {
    "foot": [
        (400, "400 m"), (804.672, "1/2 mile"), (1000, "1 km"), (1609.344, "1 mile"), (3218.688, "2 miles"),
        (5000, "5 km"), (10000, "10 km"), (15000, "15 km"), (16093.44, "10 miles"), (20000, "20 km"),
        (21097.5, "Semi-marathon"), (30000, "30 km"), (42195, "Marathon"),
    ],
    "bike": [(5000, "5 km"), (10000, "10 km"), (20000, "20 km"), (30000, "30 km"), (40000, "40 km"),
             (50000, "50 km"), (100000, "100 km")],
}


# Vitesse au-delà de laquelle un effort est jugé faux (2'34/km à pied, 79 km/h à vélo)
MAX_SPEED_MS = {"foot": 6.5, "bike": 22.0}


def best_time(ts: list, dist: float, max_speed: Optional[float] = None) -> Optional[float]:
    """Plus petit temps pour couvrir `dist` mètres, fenêtre glissante interpolée.

    La courbe est échantillonnée (quelques centaines de points) : on teste les fenêtres qui
    commencent sur un point puis celles qui finissent sur un point, pour ne pas rater le meilleur
    départ entre deux échantillons.

    Avec `max_speed` (m/s), toute fenêtre qui traverse un passage durablement plus rapide que cette
    vitesse est écartée : un saut du GPS ou une montre restée allumée en voiture ne doit pas produire un record,
    même noyé dans une distance plus longue dont la moyenne reste plausible.
    """
    pts = [(p.get("d"), p.get("t")) for p in ts]
    pts = [(a, b) for a, b in pts if a is not None and b is not None]
    if len(pts) < 10 or pts[-1][0] < dist:
        return None
    ds = [a for a, _ in pts]
    tt = [b for _, b in pts]
    n = len(pts)
    best = None

    # Tronçon k = points k → k+1. Un tronçon isolé et court au-delà de la vitesse maximale est un
    # simple à-coup du GPS (toléré) ; deux tronçons de suite, ou un seul de plus de 30 m, sont un
    # vrai passage impossible : bad[k] en compte le nombre parmi les k premiers tronçons.
    fast = [False] * max(n - 1, 0)
    if max_speed is not None:
        for k in range(n - 1):
            dd, dt = ds[k + 1] - ds[k], tt[k + 1] - tt[k]
            fast[k] = dd > 0 and (dt <= 0 or dd / dt > max_speed)
    bad = [0] * n
    for k in range(n - 1):
        sustained = fast[k] and (
            ds[k + 1] - ds[k] > 30 or (k > 0 and fast[k - 1]) or (k + 1 < n - 1 and fast[k + 1])
        )
        bad[k + 1] = bad[k] + (1 if sustained else 0)

    def clean(a: int, b: int) -> bool:
        # aucun tronçon impossible entre les points a et b
        return bad[max(a, min(b, n - 1))] - bad[max(0, min(a, n - 1))] == 0

    def interp(k: int, target: float) -> float:
        # temps auquel la distance cumulée vaut `target`, entre les points k-1 et k
        if k <= 0:
            return tt[0]
        if ds[k] > ds[k - 1]:
            return tt[k - 1] + (tt[k] - tt[k - 1]) * (target - ds[k - 1]) / (ds[k] - ds[k - 1])
        return tt[k]

    for i in range(n):  # départ sur un point
        target = ds[i] + dist
        if target > ds[-1]:
            break
        k = bisect_left(ds, target, i)
        if not clean(i, k):
            continue
        el = interp(k, target) - tt[i]
        if el > 0 and (best is None or el < best):
            best = el
    for j in range(n - 1, -1, -1):  # arrivée sur un point
        target = ds[j] - dist
        if target < ds[0]:
            break
        k = bisect_left(ds, target, 0, j + 1)
        if not clean(max(k - 1, 0), j):
            continue
        el = tt[j] - interp(k, target)
        if el > 0 and (best is None or el < best):
            best = el
    return best


_EFFORT_CACHE: dict = {}


def _activity_efforts(row, kind: str) -> dict:
    """Meilleur temps de cette sortie sur chaque distance (mis en cache)."""
    key = (row["activity_id"], row["updated_at"], kind)
    if key in _EFFORT_CACHE:
        return _EFFORT_CACHE[key]
    out: dict = {}
    ts = (db.from_json(row["timeseries_json"]) or {}).get("series") if row["timeseries_json"] else None
    if ts:
        for dist, label in EFFORTS[kind]:
            if (row["distance_m"] or 0) < dist * 0.98:
                continue
            # Un trou ou un saut du GPS donne des « records » impossibles (400 m en 48 s) : toute
            # fenêtre qui contient un tronçon au-delà de la vitesse maximale est écartée.
            t = best_time(ts, dist, MAX_SPEED_MS[kind])
            if t and dist / t <= MAX_SPEED_MS[kind]:
                out[label] = round(t, 1)
    if len(_EFFORT_CACHE) > 4000:
        _EFFORT_CACHE.clear()
    _EFFORT_CACHE[key] = out
    return out


@router.get("/efforts")
def efforts(
    kind: str = Query("foot", pattern="^(foot|bike)$"),
    sport: Optional[str] = Query(None, pattern="^(run|trail|bike)$"),
) -> dict:
    """Pour chaque distance : le meilleur temps de chaque sortie, dans l'ordre chronologique.

    Comme Strava, `sport` sépare la course à pied (run), le trail (trail) et le vélo (bike) :
    les records de chacun sont distincts. Sans `sport`, `kind=foot` regroupe course et trail.
    """
    if sport:
        kind = "bike" if sport == "bike" else "foot"
        groups: tuple = (sport,)
    else:
        groups = ("run", "trail") if kind == "foot" else ("bike",)
    with db.connect() as conn:
        acts = conn.execute(
            "SELECT activity_id, name, sport_type, activity_date, distance_m, updated_at, timeseries_json "
            "FROM activities ORDER BY activity_date"
        ).fetchall()
        cand = [a for a in acts if sport_group(a["sport_type"]) in groups]
        per = [(a, _activity_efforts(a, kind)) for a in cand]
    distances = []
    for dist, label in EFFORTS[kind]:
        items = [
            {"activity_id": a["activity_id"], "date": a["activity_date"], "name": a["name"], "time_s": e[label]}
            for a, e in per if label in e
        ]
        if items:
            distances.append({"distance_m": dist, "label": label, "efforts": items})
    return {"kind": kind, "sport": sport, "distances": distances,
            "analysed": {"activities": len(cand), "with_detail": sum(1 for a in cand if a["timeseries_json"])}}


@router.get("/records")
def records() -> dict:
    with db.connect() as conn:
        acts = conn.execute(
            "SELECT activity_id, name, sport_type, activity_date, distance_m, duration_s, "
            "elevation_gain_m, timeseries_json FROM activities ORDER BY activity_date"
        ).fetchall()
        total = len(acts)
        out: dict = {"efforts": [], "totals": []}
        detailed = 0

        def ref(a):
            return {"activity_id": a["activity_id"], "name": a["name"], "date": a["activity_date"],
                    "sport_type": a["sport_type"]}

        for kind, groups in (("foot", ("run", "trail")), ("bike", ("bike",))):
            cand = [a for a in acts if sport_group(a["sport_type"]) in groups]
            detailed += sum(1 for a in cand if a["timeseries_json"])

        def top(label, kind, key, groups=None, unit=""):
            cand = [a for a in acts if (groups is None or sport_group(a["sport_type"]) in groups) and a[key]]
            if not cand:
                return
            a = max(cand, key=lambda x: x[key])
            out["totals"].append({"label": label, "kind": kind, "value": a[key], "unit": unit, **ref(a)})

        top("Sortie à pied la plus longue", "foot", "distance_m", ("run", "trail"), "m")
        top("Sortie à vélo la plus longue", "bike", "distance_m", ("bike",), "m")
        top("Plus gros dénivelé positif", "elev", "elevation_gain_m", None, "m")
        top("Sortie la plus longue en durée", "time", "duration_s", None, "s")
        out["analysed"] = {"activities": total, "with_detail": detailed}
    return out
