import { C } from "./palette";

const fmtCache = new Map<number, Intl.NumberFormat>();

/** Nombre au format français (virgule), « — » si absent, vrai signe moins. */
export function nf(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "—";
  let f = fmtCache.get(digits);
  if (!f) {
    f = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    fmtCache.set(digits, f);
  }
  return f.format(value).replace(/ /g, " ").replace("-", "−");
}

export function signed(value: number | null | undefined, digits = 0): string {
  if (value == null) return "—";
  const s = nf(Math.abs(value), digits);
  return value > 0 ? `+${s}` : value < 0 ? `−${s}` : s;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 1 000 m ÷ vitesse (m/s) → « 5:48 » */
export function fmtPace(speedMs: number | null | undefined): string {
  if (!speedMs || speedMs < 0.3) return "—";
  return fmtPaceSec(1000 / speedMs);
}

export function fmtPaceSec(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !Number.isFinite(secPerKm)) return "—";
  let m = Math.floor(secPerKm / 60);
  let s = Math.round(secPerKm % 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${pad(s)}`;
}

/** Chrono : 1:01:52 ou 24:40 */
export function fmtClock(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "—";
  const t = Math.round(totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Chrono arrondi à la minute : « 1:58 » (pour une estimation, les secondes n'ont pas de sens) */
export function fmtClockMin(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "—";
  const m = Math.round(totalSeconds / 60);
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
}

/** Durée lisible : « 4 h 12 » ou « 42 min » */
export function fmtHM(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)}`;
}

export function fmtDeltaClock(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const a = Math.abs(Math.round(sec));
  const m = Math.floor(a / 60);
  const s = a % 60;
  const body = a >= 3600 ? fmtClock(a) : m > 0 ? `${m}:${pad(s)}` : `${s} s`;
  return sec < 0 ? `−${body}` : sec > 0 ? `+${body}` : body;
}

/* ---------- Dates (YYYY-MM-DD interprétée en local) ---------- */
export function parseDay(day: string): Date {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function weekStart(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (c.getDay() + 6) % 7; // lundi = 0
  c.setDate(c.getDate() - dow);
  return c;
}

export function dayLabel(day: string): string {
  return parseDay(day).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

export function dayLabelLong(day: string): string {
  return parseDay(day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function shortDay(day: string): string {
  return parseDay(day).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export const timeOf = (start: string) => start.slice(11, 16);

export function relativeTime(iso: string): string {
  const t = new Date(iso.includes("T") ? iso : iso.replace(" ", "T")).getTime();
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return `il y a ${Math.floor(diff / 86400)} j`;
}

/* ---------- Sports ---------- */
export type SportGroup = "run" | "trail" | "bike" | "walk" | "strength" | "other";

export function sportGroup(type?: string | null): SportGroup {
  const t = (type ?? "").toLowerCase();
  if (t.includes("trail")) return "trail";
  if (t.includes("run")) return "run";
  if (t.includes("bik") || t.includes("cycl") || t.includes("ride")) return "bike";
  if (t.includes("walk") || t.includes("hik")) return "walk";
  if (t.includes("strength")) return "strength";
  return "other";
}

export const isFoot = (type?: string | null) => ["run", "trail", "walk"].includes(sportGroup(type));
export const isRunning = (type?: string | null) => ["run", "trail"].includes(sportGroup(type));

export const SPORT_LABEL: Record<SportGroup, string> = {
  run: "Course à pied",
  trail: "Trail",
  bike: "Vélo",
  walk: "Marche",
  strength: "Musculation",
  other: "Activité",
};

/** Allure (course/marche) ou vitesse (vélo) à partir de m/s */
export function speedDisplay(type: string | null | undefined, ms: number | null | undefined) {
  if (!ms || ms < 0.3) return { value: "—", unit: "" };
  if (isFoot(type)) return { value: fmtPace(ms), unit: "/km" };
  return { value: nf(ms * 3.6, 1), unit: "km/h" };
}

/* ---------- Interprétations ---------- */
export function teInfo(v: number | null | undefined): { label: string; color: string } | null {
  if (v == null) return null;
  if (v < 1) return { label: "Aucun effet", color: C.gray };
  if (v < 2) return { label: "Effet mineur", color: C.cyan };
  if (v < 3) return { label: "Maintien", color: C.blue };
  if (v < 4) return { label: "Amélioration", color: C.green };
  if (v < 5) return { label: "Forte amélioration", color: C.orange };
  return { label: "Surcharge", color: C.red };
}

export function tsbInfo(v: number | null | undefined): { label: string; color: string; hint: string } | null {
  if (v == null) return null;
  if (v > 25) return { label: "Transition", color: C.violet, hint: "Très reposé : risque de perte de forme si ça dure." };
  if (v > 5) return { label: "Frais", color: C.cyan, hint: "Bien reposé : bon moment pour une course ou une séance clé." };
  if (v > -10) return { label: "Neutre", color: C.gray, hint: "Charge et fatigue équilibrées." };
  if (v > -30) return { label: "Productif", color: C.green, hint: "Fatigue d'entraînement normale : la forme progresse." };
  return { label: "Surcharge", color: C.red, hint: "Fatigue élevée : risque de blessure, allège la charge." };
}

export const TRAINING_STATUS: Record<string, { label: string; color: string }> = {
  PEAKING: { label: "Pic de forme", color: C.green },
  PRODUCTIVE: { label: "Productif", color: C.green },
  MAINTAINING: { label: "Maintien", color: C.blue },
  RECOVERY: { label: "Récupération", color: C.cyan },
  UNPRODUCTIVE: { label: "Improductif", color: C.orange },
  DETRAINING: { label: "Désentraînement", color: C.orange },
  OVERREACHING: { label: "Surcharge", color: C.red },
  NO_STATUS: { label: "Sans statut", color: C.gray },
};

export function trainingStatus(raw: string | null | undefined) {
  if (!raw) return null;
  const key = raw.replace(/_\d+$/, "");
  return TRAINING_STATUS[key] ?? { label: key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, " "), color: C.gray };
}

export function hrvStatus(raw: string | null | undefined) {
  switch ((raw ?? "").toUpperCase()) {
    case "BALANCED":
      return { label: "Équilibrée", color: C.green };
    case "UNBALANCED":
      return { label: "Déséquilibrée", color: C.orange };
    case "LOW":
    case "POOR":
      return { label: "Basse", color: C.red };
    case "":
      return null;
    default:
      return { label: "Non classée", color: C.gray };
  }
}

/** Zones Garmin : rouge 0-24, orange 25-49, vert 50-74, bleu 75-94, violet 95-100. */
export const READINESS_ZONES = [
  { from: 0, to: 25, label: "Très faible", color: "#FF453A" },
  { from: 25, to: 50, label: "Faible", color: "#FF9F0A" },
  { from: 50, to: 75, label: "Modérée", color: "#30D158" },
  { from: 75, to: 95, label: "Élevée", color: "#0A84FF" },
  { from: 95, to: 100.01, label: "Optimale", color: "#BF5AF2" },
] as const;

export function readinessInfo(score: number | null | undefined) {
  if (score == null) return null;
  const z = READINESS_ZONES.find((z) => score >= z.from && score < z.to) ?? READINESS_ZONES[0];
  return { label: z.label, color: z.color };
}

export function acwrInfo(status: string | null | undefined) {
  switch ((status ?? "").toUpperCase()) {
    case "OPTIMAL":
      return { label: "Optimal", color: C.green };
    case "LOW":
      return { label: "Charge basse", color: C.cyan };
    case "HIGH":
      return { label: "Charge haute", color: C.orange };
    case "VERY_HIGH":
      return { label: "Charge très haute", color: C.red };
    default:
      return status ? { label: status, color: C.gray } : null;
  }
}

/** Équilibre temps de contact G/D : écart à 50 % en points */
export function balanceInfo(leftPct: number | null | undefined) {
  if (leftPct == null) return null;
  const gap = Math.abs(leftPct - 50);
  const side = leftPct > 50 ? "gauche" : "droite";
  if (gap <= 1.5) return { level: "ok" as const, label: "Équilibré", color: C.green, gap, side };
  if (gap <= 2.5) return { level: "watch" as const, label: "Léger déséquilibre", color: C.orange, gap, side };
  return { level: "alert" as const, label: "Déséquilibre marqué", color: C.red, gap, side };
}

export const ZONE_META = [
  { name: "Récupération", color: C.gray },
  { name: "Endurance", color: C.blue },
  { name: "Tempo", color: C.green },
  { name: "Seuil", color: C.orange },
  { name: "Anaérobie", color: C.red },
];

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mean(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
