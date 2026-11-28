import type { ActivityDetail, ActivityListItem, Segment, Thresholds } from "./api";
import { fmtPaceSec, isFoot, mean, median, nf, ZONE_META } from "./format";
import { drift, indexAtDistance, smooth, type Prepared } from "./series";

/* ---------- Kilomètres (tableau façon Strava) ---------- */
export interface KmRow {
  km: number; // numéro (1, 2, …)
  dist_m: number; // longueur réelle (le dernier peut être partiel)
  pace: number; // s/km
  spd: number; // m/s
  elev: number | null; // dénivelé net (m)
  hr: number | null;
}

export function kmRows(p: Prepared): KmRow[] {
  if (p.xKind !== "km" || p.totalDist < 900) return [];
  const rows: KmRow[] = [];
  const alt = smooth(p.alt, 2);
  const last = Math.floor(p.totalDist / 1000);
  const ends: number[] = [];
  for (let k = 1; k <= last; k++) ends.push(k * 1000);
  if (p.totalDist - last * 1000 > 250) ends.push(p.totalDist);
  let from = 0;
  for (let i = 0; i < ends.length; i++) {
    const i0 = indexAtDistance(p.dist, from);
    const i1 = indexAtDistance(p.dist, ends[i]);
    // temps en mouvement : on écarte les pas où l'on est quasi à l'arrêt (feux, pauses)
    let dt = 0;
    for (let j = i0 + 1; j <= i1; j++) {
      const st = p.time[j] - p.time[j - 1];
      const sd = p.dist[j] - p.dist[j - 1];
      if (st > 0 && sd / st >= 0.6) dt += st;
    }
    const dd = p.dist[i1] - p.dist[i0];
    if (dt > 0 && dd > 100) {
      const hrs = p.hr.slice(i0, i1 + 1).filter((v): v is number => v != null);
      const a0 = alt[i0];
      const a1 = alt[i1];
      rows.push({
        km: i + 1,
        dist_m: dd,
        pace: dt / (dd / 1000),
        spd: dd / dt,
        elev: a0 != null && a1 != null ? a1 - a0 : null,
        hr: hrs.length ? hrs.reduce((s, v) => s + v, 0) / hrs.length : null,
      });
    }
    from = ends[i];
  }
  return rows;
}

/* ---------- Statistiques de séries ---------- */
const nums = (a: (number | null)[]) => a.filter((v): v is number => v != null && Number.isFinite(v));

export function maxOf(a: (number | null)[]): number | null {
  const v = nums(a);
  return v.length ? Math.max(...v) : null;
}
export function minOf(a: (number | null)[]): number | null {
  const v = nums(a);
  return v.length ? Math.min(...v) : null;
}
export function avgOf(a: (number | null)[]): number | null {
  const v = nums(a);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

/** Puissance moyenne pondérée (moyenne glissante 30 s, puis moyenne 4ᵉ puissance). */
export function normalizedPower(p: Prepared): number | null {
  const v = p.pwr;
  const ok = nums(v);
  if (ok.length < 60) return null;
  const total = p.time[p.n - 1] - p.time[0];
  const dt = total > 0 ? total / (p.n - 1) : 1;
  const w = Math.max(1, Math.round(30 / dt));
  const f = v.map((x) => x ?? 0);
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < f.length; i++) {
    sum += f[i];
    if (i >= w) sum -= f[i - w];
    if (i >= w - 1) out.push(sum / w);
  }
  if (!out.length) return null;
  return Math.pow(out.reduce((s, x) => s + x ** 4, 0) / out.length, 0.25);
}

/* ---------- Phrases de bilan ---------- */
const trend = (vals: (number | null)[], tol: number): "up" | "down" | "flat" | null => {
  const d = drift(vals);
  if (!d || !d.start) return null;
  const r = (d.end - d.start) / d.start;
  return r > tol ? "up" : r < -tol ? "down" : "flat";
};

export function paceInsight(rows: KmRow[], foot: boolean, th?: Thresholds | null): string | null {
  if (rows.length < 3) return null;
  const sp = rows.map((r) => r.pace);
  const lo = Math.min(...sp);
  const hi = Math.max(...sp);
  const m = sp.reduce((s, v) => s + v, 0) / sp.length;
  const half = Math.floor(sp.length / 2);
  const first = sp.slice(0, half).reduce((s, v) => s + v, 0) / half;
  const second = sp.slice(-half).reduce((s, v) => s + v, 0) / half;
  const d = (second - first) / first;
  const unit = foot ? "/km" : "";
  let s = (hi - lo) / m < 0.07 ? `Allure très régulière, autour de ${fmtPaceSec(m)} ${unit}` : `Allure comprise entre ${fmtPaceSec(lo)} et ${fmtPaceSec(hi)} ${unit}`;
  if (d < -0.02) s += ", progression en fin de sortie";
  else if (d > 0.03) s += ", ralentissement en fin de sortie";
  else s += ", sans dérive d'un bout à l'autre";
  s = s.replace(/\s+,/, ",");
  if (foot && th?.lt_speed_ms) {
    const thr = 1000 / th.lt_speed_ms;
    const gap = m - thr;
    s += gap > 0 ? `. Allure moyenne ${fmtPaceSec(m)}, soit ${fmtPaceSec(gap)} /km plus lente que ton allure seuil (${fmtPaceSec(thr)})` : `. Allure moyenne plus rapide que ton allure seuil (${fmtPaceSec(thr)})`;
  }
  return s + ".";
}

export function hrInsight(a: ActivityDetail, p: Prepared | null, th?: Thresholds | null): string | null {
  const avg = a.avg_hr ?? avgOf(p?.hr ?? []);
  const max = a.max_hr ?? maxOf(p?.hr ?? []);
  if (!avg) return null;
  let s = `FC moyenne ${nf(avg)} BPM${max ? `, pic à ${nf(max)} BPM` : ""}`;
  const z = a.hr_zones?.filter((x) => x.secs) ?? [];
  const tot = z.reduce((t, x) => t + (x.secs ?? 0), 0);
  if (tot > 0) {
    const top = z.reduce((b, x) => ((x.secs ?? 0) > (b.secs ?? 0) ? x : b), z[0]);
    const pct = Math.round(((top.secs ?? 0) / tot) * 100);
    s += `, majorité en zone ${ZONE_META[top.zone - 1]?.name ?? `Z${top.zone}`} (${pct} %)`;
  }
  if (th?.lthr_bpm) s += `. FC moyenne à ${Math.round((avg / th.lthr_bpm) * 100)} % de ta FC seuil (${nf(th.lthr_bpm)} BPM)`;
  const t = p ? trend(p.hr, 0.04) : null;
  if (t === "up") s += ". La FC monte en fin de sortie";
  return s + ".";
}

export function cadInsight(p: Prepared): string | null {
  const v = nums(p.cad);
  if (v.length < 30) return null;
  const avg = v.reduce((s, x) => s + x, 0) / v.length;
  const t = trend(p.cad, 0.03);
  let s = `Cadence moyenne ${nf(avg)} ppm`;
  if (t === "up") s += ", en hausse en fin de sortie";
  else if (t === "down") s += ", en baisse en fin de sortie";
  else if (t === "flat") s += ", stable du début à la fin";
  return s + ".";
}

export function pwrInsight(p: Prepared, avgW: number | null, th?: Thresholds | null): string | null {
  const avg = avgW ?? avgOf(p.pwr);
  const np = normalizedPower(p);
  const mx = maxOf(p.pwr);
  if (!avg) return null;
  let s = `Puissance moyenne ${nf(avg)} W${mx ? `, pic à ${nf(mx)} W` : ""}`;
  if (np) s += np / avg < 1.05 ? ". Effort régulier, sans à-coups" : `. Effort irrégulier (puissance pondérée ${nf(np)} W)`;
  if (np && th?.run_ftp_w) s += `. Intensité ${Math.round((np / th.run_ftp_w) * 100)} % de ton seuil de puissance (${nf(th.run_ftp_w)} W)`;
  return s + ".";
}

export function altInsight(a: ActivityDetail, p: Prepared): string | null {
  const hi = maxOf(p.alt);
  const lo = minOf(p.alt);
  if (hi == null || lo == null) return null;
  const gain = a.elevation_gain_m ?? 0;
  const prof = gain < 25 ? "Parcours quasi plat" : gain < 100 ? "Parcours vallonné" : "Parcours avec beaucoup de dénivelé";
  return `${prof} : ${nf(gain)} m de D+, entre ${nf(lo)} et ${nf(hi)} m d'altitude.`;
}

/* ---------- Comparaison à l'historique ---------- */
export interface Context {
  pace: { text: string; faster: boolean } | null;
  effort: { value: number; ratio: number | null; avg: number | null; text: string } | null;
  headline: string | null;
}

export function context(a: ActivityDetail, history: ActivityListItem[]): Context {
  const foot = isFoot(a.sport_type);
  const hour = Number((a.start_time_local || "").slice(11, 13));
  const when = hour < 12 ? "matinale" : hour < 18 ? "de l'après-midi" : "du soir";
  const noun = foot ? "course" : "sortie";

  const before = history.filter((h) => h.activity_id !== a.activity_id && h.start_time_local < a.start_time_local);
  const same = before.filter((h) => h.sport_type === a.sport_type);

  let pace: Context["pace"] = null;
  const dist = a.distance_m ?? 0;
  const near = same.filter((h) => h.avg_speed_ms && h.distance_m && dist > 0 && Math.abs(h.distance_m - dist) / dist < 0.35);
  if (a.avg_speed_ms && near.length >= 3) {
    const ref = median(near.map((h) => h.avg_speed_ms as number));
    if (ref) {
      const r = a.avg_speed_ms / ref - 1;
      pace = { faster: r > 0, text: Math.abs(r) < 0.02 ? "au même rythme que d'habitude" : r > 0 ? "plus rapide que d'habitude" : "plus lente que d'habitude" };
    }
  }

  let effort: Context["effort"] = null;
  const cutoff = new Date(a.start_time_local.slice(0, 10)).getTime() - 21 * 86400000;
  const recent = before.filter((h) => h.training_load && new Date(h.activity_date).getTime() >= cutoff);
  if (a.training_load) {
    const avg = recent.length >= 2 ? mean(recent.map((h) => h.training_load)) : null;
    const ratio = avg ? a.training_load / avg : null;
    const text = ratio == null ? "" : ratio > 1.3 ? "Effort plus intense que ta moyenne des 3 dernières semaines." : ratio < 0.7 ? "Effort plus léger que ta moyenne des 3 dernières semaines." : "Bravo, tu as su gérer ton effort.";
    effort = { value: a.training_load, ratio, avg, text };
  }

  let headline: string | null = null;
  if (pace) {
    const ctl = !foot ? "sortie" : noun;
    headline = pace.faster
      ? `Jolie ${ctl} ${when}, plus rapide que d'habitude sur des distances comparables.`
      : pace.text === "au même rythme que d'habitude"
        ? `${ctl[0].toUpperCase() + ctl.slice(1)} ${when} au rythme habituel pour cette distance.`
        : `${ctl[0].toUpperCase() + ctl.slice(1)} ${when} plus tranquille que d'habitude sur cette distance.`;
  }
  return { pace, effort, headline };
}

/* ---------- Marche et arrêts détectés par la montre ---------- */
export function segmentsInsight(segs: Segment[] | null | undefined): string | null {
  if (!segs || !segs.length) return null;
  const walk = segs.filter((x) => x.type === "walk");
  const stand = segs.filter((x) => x.type === "stand");
  if (!walk.length && !stand.length) return "Ta montre n'a détecté aucune marche ni arrêt : course continue.";
  const sum = (a: Segment[], k: "dur_s" | "dist_m") => a.reduce((t, x) => t + (x[k] ?? 0), 0);
  const bits: string[] = [];
  if (walk.length) bits.push(`${walk.length} passage${walk.length > 1 ? "s" : ""} à la marche (${nf(sum(walk, "dur_s"))} s, ${nf(sum(walk, "dist_m"))} m)`);
  if (stand.length) bits.push(`${stand.length} arrêt${stand.length > 1 ? "s" : ""} (${nf(sum(stand, "dur_s"))} s)`);
  return `Ta montre a détecté ${bits.join(" et ")}.`;
}

export function secToIndex(time: number[], s: number): number {
  let lo = 0;
  let hi = time.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (time[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
