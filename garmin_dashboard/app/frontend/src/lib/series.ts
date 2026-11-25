import type { ActivityDetail, SeriesPoint } from "./api";
import { isFoot, mean, median } from "./format";

export interface Prepared {
  n: number;
  /** abscisse commune : km si distance exploitable, sinon minutes */
  x: number[];
  xKind: "km" | "min";
  dist: number[]; // m
  time: number[]; // s
  hr: (number | null)[];
  alt: (number | null)[];
  spd: (number | null)[]; // m/s lissé
  pace: (number | null)[]; // s/km lissé (course/marche)
  cad: (number | null)[]; // pas/min, double jambe
  gct: (number | null)[];
  bal: (number | null)[];
  vosc: (number | null)[];
  stride: (number | null)[];
  pwr: (number | null)[];
  totalDist: number;
  foot: boolean;
}

function col(series: SeriesPoint[], key: keyof SeriesPoint): (number | null)[] {
  return series.map((p) => (typeof p[key] === "number" && Number.isFinite(p[key]) ? (p[key] as number) : null));
}

function ffill(arr: (number | null)[]): number[] {
  let last: number | null = arr.find((v) => v != null) ?? 0;
  return arr.map((v) => {
    if (v != null) last = v;
    return last ?? 0;
  });
}

export function smooth(arr: (number | null)[], half: number): (number | null)[] {
  return arr.map((v, i) => {
    if (v == null) return null;
    let sum = 0;
    let c = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      const w = arr[j];
      if (w != null) {
        sum += w;
        c++;
      }
    }
    return c ? sum / c : null;
  });
}

export function prepare(a: ActivityDetail): Prepared | null {
  const s = a.timeseries?.series;
  if (!s || s.length < 8) return null;
  const n = s.length;
  const foot = isFoot(a.sport_type);

  const dRaw = col(s, "d");
  const dist = ffill(dRaw);
  const time = ffill(col(s, "t")).map((t, i) => (t === 0 && i > 0 ? i : t));
  const totalDist = dist.length ? Math.max(...dist) : 0;
  const hasDist = totalDist >= 300 && dRaw.filter((v) => v != null).length / n > 0.5;

  const x = hasDist ? dist.map((d) => d / 1000) : time.map((t) => t / 60);
  const spd = smooth(col(s, "spd"), 3);
  const pace = spd.map((v) => (v != null && v > 0.5 ? Math.min(720, Math.max(150, 1000 / v)) : null));

  // Cadence : certaines synchros anciennes stockent la cadence d'une seule jambe (~80 au lieu de ~160)
  const cadRaw = col(s, "cad");
  const med = median(cadRaw.filter((v): v is number => v != null));
  const cadFactor = foot && med != null && med < 110 ? 2 : 1;

  return {
    n,
    x,
    xKind: hasDist ? "km" : "min",
    dist,
    time,
    hr: col(s, "hr"),
    alt: col(s, "alt"),
    spd,
    pace,
    cad: cadRaw.map((v) => (v == null ? null : v * cadFactor)),
    gct: col(s, "gct"),
    bal: col(s, "bal"),
    vosc: col(s, "vosc"),
    stride: col(s, "stride"),
    pwr: col(s, "pwr"),
    totalDist: hasDist ? totalDist : 0,
    foot,
  };
}

/** Moyenne du premier et du dernier tiers de la séance (dérive en cours d'effort). */
export function drift(values: (number | null)[]): { start: number; end: number } | null {
  const third = Math.floor(values.length / 3);
  if (third < 5) return null;
  const a = mean(values.slice(0, third));
  const b = mean(values.slice(-third));
  return a != null && b != null ? { start: a, end: b } : null;
}

/** Indice du point de la série le plus proche d'une distance (m) — recherche dichotomique. */
export function indexAtDistance(dist: number[], m: number): number {
  let lo = 0;
  let hi = dist.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dist[mid] < m) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(dist[lo - 1] - m) < Math.abs(dist[lo] - m)) return lo - 1;
  return lo;
}

export function range90(values: (number | null)[]): [number, number] | null {
  const v = values.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (v.length < 4) return null;
  const lo = v[Math.floor(v.length * 0.05)];
  const hi = v[Math.floor(v.length * 0.95)];
  return hi > lo ? [lo, hi] : null;
}
