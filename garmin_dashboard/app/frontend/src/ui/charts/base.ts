import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/* Graphiques SVG légers, dessinés comme dans l'app Santé d'Apple.
   Les éléments neutres (grilles, textes) suivent le thème via les classes fill-label2 / stroke-sep.
   Ce fichier : les outils communs à tous les graphiques. */

/** Classe des textes neutres (graduations, légendes) */
export const T = "fill-label2";

/** Largeur réelle du graphique : le dessin suit la carte (texte toujours à 11 px), 322 px tant qu'il n'est pas mesuré */
export function useW(def = 322): [RefObject<SVGSVGElement>, number] {
  const ref = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(def);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = () => { const x = Math.round(el.getBoundingClientRect().width); if (x > 0) setW((o) => (o === x ? o : x)); };
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Marge droite des courbes : le point final (rayon 5 + liseré 2) reste entier dans le cadre */
export const PAD = 8;

/** Courbe lissée sans dépassement (monotone, Fritsch-Carlson) : ne crée jamais de valeur entre deux points */
export function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n < 3) return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); m.push(dx[i] ? (pts[i + 1][1] - pts[i][1]) / dx[i] : 0); }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]));
  t.push(m[n - 2]);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = dx[i] / 3;
    d += ` C${(x0 + h).toFixed(1)},${(y0 + t[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - t[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

/** Ligne brisée simple */
export const pathOf = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
