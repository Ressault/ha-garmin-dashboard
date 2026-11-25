// Couleurs système Apple (sombre) — partagées par ECharts, Leaflet et les badges
const ACCENTS = {
  blue: "#0A84FF",
  green: "#30D158",
  orange: "#FF9F0A",
  red: "#FF453A",
  pink: "#FF375F",
  cyan: "#64D2FF",
  violet: "#BF5AF2",
  yellow: "#FFD60A",
  gray: "#8E8E93",
};

const NEUTRALS = {
  dark: {
    label: "#F5F5F7",
    label2: "#98989D",
    label3: "#636366",
    card: "#1C1C1E",
    fill: "#2C2C2E",
    grid: "rgba(255,255,255,0.07)",
    pointer: "rgba(255,255,255,0.35)",
    ghost: "rgba(255,255,255,0.28)",
    faint: "rgba(255,255,255,0.05)",
    tipBg: "rgba(44,44,46,0.94)",
    tipBorder: "rgba(255,255,255,0.1)",
    tipShadow: "rgba(0,0,0,.5)",
  },
  light: {
    label: "#1C1C1E",
    label2: "#6C6C70",
    label3: "#AEAEB2",
    card: "#FFFFFF",
    fill: "#E9E9EE",
    grid: "rgba(0,0,0,0.07)",
    pointer: "rgba(0,0,0,0.3)",
    ghost: "rgba(0,0,0,0.25)",
    faint: "rgba(0,0,0,0.05)",
    tipBg: "rgba(255,255,255,0.96)",
    tipBorder: "rgba(0,0,0,0.1)",
    tipShadow: "rgba(0,0,0,.18)",
  },
};

export type ThemeMode = "light" | "dark";

/** Couleurs partagées par ECharts, Leaflet et les badges. Les neutres changent avec le thème (voir applyPalette). */
export const C: typeof ACCENTS & typeof NEUTRALS.dark = { ...ACCENTS, ...NEUTRALS.dark };

const listeners: (() => void)[] = [];
/** Pour les modules qui gardent des objets dérivés de C (ex. options ECharts communes). */
export const onPaletteChange = (fn: () => void) => listeners.push(fn);

export function applyPalette(mode: ThemeMode) {
  Object.assign(C, NEUTRALS[mode]);
  listeners.forEach((fn) => fn());
}

export type TremorColor = "blue" | "pink" | "green" | "orange" | "red" | "cyan" | "violet" | "gray" | "yellow";

export const hexToTremor: Record<string, TremorColor> = {
  [ACCENTS.blue]: "blue",
  [ACCENTS.green]: "green",
  [ACCENTS.orange]: "orange",
  [ACCENTS.red]: "red",
  [ACCENTS.pink]: "pink",
  [ACCENTS.cyan]: "cyan",
  [ACCENTS.violet]: "violet",
  [ACCENTS.gray]: "gray",
  [ACCENTS.yellow]: "yellow",
};

// Dégradé allure / FC (lent → rapide, bas → haut)
export const HEAT = ["#5E5CE6", "#0A84FF", "#30D158", "#FFD60A", "#FF9F0A", "#FF453A"];

export function heatColor(t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (HEAT.length - 1);
  const i = Math.min(HEAT.length - 2, Math.floor(x));
  const f = x - i;
  const a = hex(HEAT[i]);
  const b = hex(HEAT[i + 1]);
  const m = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

function hex(h: string): number[] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}
