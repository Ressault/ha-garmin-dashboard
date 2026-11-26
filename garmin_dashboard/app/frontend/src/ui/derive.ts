import type { ActivityListItem, FitnessDay } from "@/lib/api";
import { addDays, isoDate, parseDay, weekStart } from "@/lib/format";

/* Calculs propres à la refonte : préparation sur 10, plages personnelles, volumes par sport. */

export function meanSd(values: (number | null | undefined)[]): { mean: number; sd: number } | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  if (v.length < 5) return null;
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
  return { mean, sd: Math.max(sd, 1) };
}

/** Plage personnelle = moyenne ± 1 écart-type sur les 30 derniers jours (valeurs aberrantes exclues). */
export function personalBand(series: FitnessDay[], key: keyof FitnessDay, minValid = 0): [number, number] | null {
  const raw = series.slice(-30).map((d) => d[key] as number | null).filter((v): v is number => v != null && v > minValid);
  const first = meanSd(raw);
  if (!first) return null;
  const trimmed = raw.filter((v) => Math.abs(v - first.mean) <= 2.5 * first.sd);
  const ms = meanSd(trimmed) ?? first;
  return [Math.round(ms.mean - ms.sd), Math.round(ms.mean + ms.sd)];
}

/** Dernière ligne (parmi les `back` derniers jours) qui a une valeur pour `key` : le jour en cours est vide après minuit. */
export function lastWith(series: FitnessDay[], key: keyof FitnessDay, back = 2): FitnessDay | null {
  for (let i = series.length - 1; i >= Math.max(0, series.length - back); i--) if (series[i][key] != null) return series[i];
  return null;
}
export const lastVal = (series: FitnessDay[], key: keyof FitnessDay, back = 2): number | null => (lastWith(series, key, back)?.[key] as number | null | undefined) ?? null;

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export interface Readiness {
  score: number;
  status: "Récupérer" | "Modéré" | "Prêt" | "Optimal";
  hrv: { value: number | null; band: [number, number] | null; label: string; ok: boolean };
  sleep: { value: number | null; label: string; ok: boolean };
  load: { tsb: number | null; label: string; ok: boolean };
}

/** Préparation sur 10 : VFC 40 %, sommeil 30 %, charge 30 %. */
export function readiness(series: FitnessDay[]): Readiness | null {
  const today = series[series.length - 1];
  if (!today) return null;
  const hrvBand = personalBand(series, "hrv_last_night_ms", 30);
  const ms = meanSd(series.slice(-30).map((d) => d.hrv_last_night_ms).filter((v) => v != null && v > 30));
  const hrv = lastVal(series, "hrv_last_night_ms");
  const hrvScore = hrv != null && ms ? clamp(0.6 + ((hrv - ms.mean) / ms.sd) * 0.2) : 0.5;
  const sleep = lastVal(series, "sleep_score");
  const sleepScore = sleep != null ? clamp(sleep / 100) : 0.5;
  const tsb = today.tsb;
  const loadScore = tsb != null ? clamp(0.8 + tsb / 50) : 0.6;
  const score = Math.round(10 * (0.4 * hrvScore + 0.3 * sleepScore + 0.3 * loadScore));
  const status = score <= 3 ? "Récupérer" : score <= 6 ? "Modéré" : score <= 8 ? "Prêt" : "Optimal";
  const hrvLabel = hrv == null || !hrvBand ? "—" : hrv < hrvBand[0] ? "Sous ta plage" : hrv > hrvBand[1] ? "Au-dessus" : "Dans ta plage";
  const sleepLabel = sleep == null ? "—" : sleep >= 80 ? "Bon" : sleep >= 60 ? "Correct" : "Faible";
  const loadLabel = tsb == null ? "—" : tsb > 5 ? "Frais" : tsb >= -10 ? "Équilibrée" : tsb >= -30 ? "Productive" : "Fatigue élevée";
  return {
    score,
    status,
    hrv: { value: hrv, band: hrvBand, label: hrvLabel, ok: hrvLabel !== "Sous ta plage" },
    sleep: { value: sleep, label: sleepLabel, ok: sleep == null || sleep >= 60 },
    load: { tsb, label: loadLabel, ok: tsb == null || tsb >= -30 },
  };
}

/* ---------- Sports regroupés ---------- */
export type Group = "foot" | "road" | "mtb" | "walk" | "gym" | "other";
export function groupOf(type?: string | null): Group {
  const t = (type ?? "").toLowerCase();
  if (t.includes("run")) return "foot"; // course + trail
  if (t.includes("mountain") || t.includes("gravel")) return "mtb";
  if (t.includes("bik") || t.includes("cycl") || t.includes("ride")) return "road";
  if (t.includes("walk") || t.includes("hik")) return "walk";
  if (t.includes("strength") || t.includes("fitness") || t.includes("cardio")) return "gym";
  return "other";
}
export const GROUP_META: Record<Group, { label: string; color: string; bg: string }> = {
  foot: { label: "Course et trail", color: "#FF2D55", bg: "#FFE5EA" },
  road: { label: "Vélo de route", color: "#0A84FF", bg: "#E1F4FF" },
  mtb: { label: "VTT", color: "#FF9F0A", bg: "#FFF0DB" },
  walk: { label: "Marche et rando", color: "#34C759", bg: "#E3F7E8" },
  gym: { label: "Musculation", color: "#AF52DE", bg: "#EFE6FB" },
  other: { label: "Autre", color: "#8E8E93", bg: "#EDEDF2" },
};
export const GROUP_ORDER: Group[] = ["foot", "road", "mtb", "walk", "gym"];

export interface Totals { secs: number; km: number; dplus: number; count: number }
const zero = (): Totals => ({ secs: 0, km: 0, dplus: 0, count: 0 });

export function totals(acts: ActivityListItem[], from: string, to: string, group?: Group | "all"): Totals {
  const t = zero();
  for (const a of acts) {
    if (a.activity_date < from || a.activity_date > to) continue;
    if (group && group !== "all" && groupOf(a.sport_type) !== group) continue;
    t.secs += a.duration_s ?? 0;
    t.km += (a.distance_m ?? 0) / 1000;
    t.dplus += a.elevation_gain_m ?? 0;
    t.count += 1;
  }
  return t;
}
export function byGroup(acts: ActivityListItem[], from: string, to: string): Record<Group, Totals> {
  const out = Object.fromEntries((Object.keys(GROUP_META) as Group[]).map((g) => [g, zero()])) as Record<Group, Totals>;
  for (const a of acts) {
    if (a.activity_date < from || a.activity_date > to) continue;
    const t = out[groupOf(a.sport_type)];
    t.secs += a.duration_s ?? 0;
    t.km += (a.distance_m ?? 0) / 1000;
    t.dplus += a.elevation_gain_m ?? 0;
    t.count += 1;
  }
  return out;
}

/** Bornes utiles : 7 derniers jours, 7 jours d'avant, semaine en cours et même moment la semaine précédente. */
export function windows(today = new Date()) {
  const t = isoDate(today);
  const ws = weekStart(today);
  const dayIdx = Math.round((parseDay(t).getTime() - ws.getTime()) / 86400000);
  return {
    today: t,
    last7: [isoDate(addDays(today, -6)), t] as const,
    prev7: [isoDate(addDays(today, -13)), isoDate(addDays(today, -7))] as const,
    week: [isoDate(ws), isoDate(addDays(ws, 6))] as const,
    weekToDate: [isoDate(ws), t] as const,
    prevWeekToDate: [isoDate(addDays(ws, -7)), isoDate(addDays(ws, dayIdx - 7))] as const,
    weekStart: ws,
    dayIdx,
  };
}

export function pct(now: number, prev: number): number | null {
  if (!prev) return null;
  return ((now - prev) / prev) * 100;
}

/* ---------- Piliers de forme ---------- */
export type PillarStatus = "Optimal" | "Bon" | "À surveiller";
export const PILLAR_TONE: Record<PillarStatus, "green" | "blue" | "orange"> = { Optimal: "green", Bon: "blue", "À surveiller": "orange" };
export const PILLAR_COLOR: Record<PillarStatus, string> = { Optimal: "#34C759", Bon: "#0A84FF", "À surveiller": "#FF9500" };

export interface EnduranceLimits { [k: string]: number }
export function enduranceLevels(json: string | null | undefined): { name: string; min: number }[] {
  let L: EnduranceLimits = {};
  try {
    L = json ? JSON.parse(json) : {};
  } catch {
    L = {};
  }
  const pick = (k: string) => (typeof L[k] === "number" ? L[k] : null);
  return [
    ["Intermédiaire", pick("classificationLowerLimitIntermediate")],
    ["Entraîné", pick("classificationLowerLimitTrained")],
    ["Bien entraîné", pick("classificationLowerLimitWellTrained")],
    ["Expert", pick("classificationLowerLimitExpert")],
    ["Supérieur", pick("classificationLowerLimitSuperior")],
    ["Élite", pick("classificationLowerLimitElite")],
  ].filter((x): x is [string, number] => x[1] != null).map(([name, min]) => ({ name, min }));
}
export function enduranceClass(score: number | null | undefined, json: string | null | undefined) {
  const lv = enduranceLevels(json);
  if (score == null || !lv.length) return null;
  let cur: { name: string; min: number } | null = null;
  let next: { name: string; min: number } | null = null;
  for (const l of lv) {
    if (score >= l.min) cur = l;
    else if (!next) next = l;
  }
  return { cur, next, levels: lv };
}

export interface RunDyn { cadence: number | null; balance: number | null; gct: number | null; vosc: number | null; vratio: number | null }

export function pillars(series: FitnessDay[], latest: FitnessDay | null, dyn: RunDyn | null) {
  const L = latest;
  // Endurance
  const ec = enduranceClass(L?.endurance_score, L?.endurance_limits_json);
  const endur: PillarStatus = !ec?.cur ? "Bon" : ["Bien entraîné", "Expert", "Supérieur", "Élite"].includes(ec.cur.name) ? "Optimal" : ec.cur.name === "Entraîné" ? "Bon" : "À surveiller";
  // Récupération
  const band = personalBand(series, "hrv_last_night_ms", 30);
  const week = L?.hrv_weekly_avg_ms ?? null;
  const sleeps = series.slice(-7).map((d) => d.sleep_score).filter((v): v is number => v != null);
  const low = sleeps.filter((v) => v < 70).length;
  const inBand = band && week != null ? week >= band[0] && week <= band[1] + 5 : true;
  const recov: PillarStatus = inBand && low <= 1 ? "Optimal" : inBand && low <= 2 ? "Bon" : "À surveiller";
  // Charge
  const tsb = L?.tsb ?? null, acwr = L?.acwr ?? null;
  const load: PillarStatus = tsb != null && tsb < -30 ? "À surveiller" : acwr != null && acwr >= 0.8 && acwr <= 1.3 ? "Optimal" : "Bon";
  // Dynamiques
  const devBal = dyn?.balance != null ? Math.abs(dyn.balance - 50) : null;
  const dynS: PillarStatus | null = !dyn ? null : (devBal != null && devBal > 2) || (dyn.cadence != null && dyn.cadence < 160) ? "À surveiller" : "Bon";
  return { endur, ec, recov, band, week, low, load, tsb, acwr, dyn: dynS, devBal };
}
