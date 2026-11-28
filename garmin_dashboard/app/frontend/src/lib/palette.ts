/* Couleurs côté JavaScript (ECharts, Leaflet, badges).
   Aucune couleur n'est écrite ici : tout renvoie aux jetons de index.css, qui changent seuls avec le thème. */

export const C = {
  blue: "var(--sys-blue)",
  green: "var(--sys-green)",
  orange: "var(--sys-orange)",
  red: "var(--sys-red)",
  pink: "var(--sys-pink)",
  cyan: "var(--sys-cyan)",
  violet: "var(--sys-purple)",
  yellow: "var(--sys-yellow)",
  gray: "var(--c-gray)",
  label: "var(--foreground)",
  label2: "var(--label2)",
  label3: "var(--chart-muted)",
  card: "var(--card)",
  fill: "var(--secondary)",
  grid: "var(--chart-grid)",
  pointer: "var(--chart-pointer)",
  faint: "var(--chart-faint)",
  tipBg: "var(--tip-bg)",
  tipBorder: "var(--tip-border)",
  tipShadow: "var(--tip-shadow)",
} as const;

export type ThemeMode = "light" | "dark";

/** Version translucide d'une couleur (jeton ou autre) : `pct` % de couleur, le reste transparent. */
export const alpha = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** Zones de FC, de Z1 à Z5. */
export const ZONE_COLORS = ["var(--zone-1)", "var(--zone-2)", "var(--zone-3)", "var(--zone-4)", "var(--zone-5)"] as const;

/** Médailles des records : fond, texte, libellé. */
export const MEDALS = [
  { bg: "var(--medal-1)", fg: "var(--medal-1-fg)", t: "PR", a: "Record personnel" },
  { bg: "var(--medal-2)", fg: "var(--medal-2-fg)", t: "2", a: "2e meilleur temps" },
  { bg: "var(--medal-3)", fg: "var(--medal-3-fg)", t: "3", a: "3e meilleur temps" },
] as const;

/* ---------- Valeurs réelles des jetons ----------
 * La carte (Leaflet en canvas) et la balise theme-color ne comprennent pas var(--…) : on lit la valeur du jeton. */
const resolved = new Map<string, string>();
const listeners: (() => void)[] = [];
/** Pour les modules qui gardent des objets dérivés du thème. */
export const onPaletteChange = (fn: () => void) => listeners.push(fn);

/** À appeler après avoir posé la classe du thème : les valeurs lues avant ne valent plus. */
export function applyPalette(_mode: ThemeMode) {
  resolved.clear();
  heat = null;
  listeners.forEach((fn) => fn());
}

/** Valeur actuelle d'un jeton CSS, ex. token("--sys-blue"). */
export function token(name: string): string {
  let v = resolved.get(name);
  if (v === undefined) {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) resolved.set(name, v);
  }
  return v || "gray";
}

// Dégradé allure / FC (lent → rapide, bas → haut) : six jetons --heat-0 … --heat-5, interpolés ici
const HEAT_STEPS = 6;
let heat: number[][] | null = null;
const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

export const heatGradient = () => `linear-gradient(90deg,${Array.from({ length: HEAT_STEPS }, (_, i) => `var(--heat-${i})`).join(",")})`;

export function heatColor(t: number): string {
  heat ??= Array.from({ length: HEAT_STEPS }, (_, i) => rgbOf(token(`--heat-${i}`)));
  const x = Math.min(1, Math.max(0, t)) * (HEAT_STEPS - 1);
  const i = Math.min(HEAT_STEPS - 2, Math.floor(x));
  const f = x - i;
  const m = heat[i].map((v, k) => Math.round(v + (heat![i + 1][k] - v) * f));
  return m.some(Number.isNaN) ? "gray" : `rgb(${m[0]},${m[1]},${m[2]})`;
}
