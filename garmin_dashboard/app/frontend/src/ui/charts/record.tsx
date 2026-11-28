import { useId } from "react";

import { MEDALS } from "@/lib/palette";

import { smoothPath, T, useW } from "./base";

/* Records : temps d'un même effort au fil des sorties. */

/** Temps d'un même effort au fil des sorties. Chaque point et chaque médaille est posé sur le temps réel de la
 *  sortie ; la courbe bleue n'est qu'une tendance (meilleur des 4 dernières sorties, lissé) et ne porte aucune valeur. */
export type RecordPoint = { t: number; v: number; medal?: 0 | 1 | 2 };
export function RecordChart({ points, fmtY, label }: { points: RecordPoint[]; fmtY: (v: number) => string; label: string }) {
  const [ref, W] = useW(340);
  const gid = `rc${useId().replace(/:/g, "")}`;
  const H = 204, T0 = 40, B = 26, G = 58; // G : gouttière droite pour les graduations
  if (points.length === 0) return null;
  // une sortie = une ligne verticale = une ligne de la liste ; les efforts aberrants (très lents) restent affichés
  // mais ne comptent pas dans l'échelle, pour ne pas écraser la courbe
  const pts = [...points].sort((a, b) => a.t - b.t);
  const med = [...pts.map((p) => p.v)].sort((a, b) => a - b)[Math.floor(pts.length / 2)];
  const inScale = (p: RecordPoint) => p.medal != null || p.v >= med * 0.82;
  const n = pts.length;
  // courbe de forme : meilleur effort sur les 4 dernières sorties (elle peut redescendre, comme sur Strava)
  const WIN = 4;
  const raw = pts.map((_, i) => Math.max(...pts.slice(Math.max(0, i - WIN + 1), i + 1).map((p) => p.v)));
  // adoucit les plateaux : trois passes de moyenne [1 2 1] (bords prolongés) → vraie courbe, plus de marches
  const soften = (a: number[]) => a.map((_, i) => (a[Math.max(0, i - 1)] + 2 * a[i] + a[Math.min(a.length - 1, i + 1)]) / 4);
  const form = soften(soften(soften(raw)));
  const vs = [...pts.filter(inScale).map((p) => p.v), ...form];
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const padV = (hi - lo) * 0.12;
  lo -= padV; hi += padV;
  const PW = W - G;
  const X = (i: number) => (n === 1 ? PW / 2 : 14 + (i / (n - 1)) * (PW - 28)); // sorties espacées régulièrement
  const Y = (v: number) => Math.min(H - B - 4, T0 + (1 - (v - lo) / (hi - lo)) * (H - T0 - B));
  const line: [number, number][] = form.map((v, i) => [X(i), Y(v)]);
  const d = n > 1 ? smoothPath(line) : "";
  const baseY = H - B;
  const area = d ? `${d} L${line[n - 1][0].toFixed(1)},${baseY} L${line[0][0].toFixed(1)},${baseY} Z` : "";
  const grid = [hi - padV, (lo + hi) / 2, lo + padV];
  const dateTxt = (t: number) => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
  const t0 = pts[0].t, t1 = pts[n - 1].t;
  // médailles : rangée au-dessus du tracé, espacées d'au moins 23 px, reliées à leur point
  const medals = pts.map((p, i) => ({ p, x: X(i), y: Y(p.v) })).filter((m) => m.p.medal != null);
  const lane = medals.map((m) => ({ ...m, bx: m.x }));
  lane.forEach((m, i) => { if (i) m.bx = Math.max(m.bx, lane[i - 1].bx + 23); });
  const over = lane.length ? lane[lane.length - 1].bx - (PW - 10) : 0;
  if (over > 0) lane.forEach((m) => { m.bx -= over; });
  lane.forEach((m, i) => { if (i === 0) m.bx = Math.max(10, m.bx); else m.bx = Math.max(m.bx, lane[i - 1].bx + 23); });
  return (
    <svg ref={ref} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--sys-blue)" stopOpacity=".18" />
          <stop offset="1" stopColor="var(--sys-blue)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {pts.map((_, i) => <line key={`v${i}`} x1={X(i)} x2={X(i)} y1={T0 - 6} y2={baseY} className="stroke-sep" strokeOpacity=".55" />)}
      {grid.map((v, i) => (
        <g key={i}>
          <line x1="0" x2={PW} y1={Y(v)} y2={Y(v)} className="stroke-sep" />
          <text x={W} y={Y(v) + 4} fontSize="11" textAnchor="end" className={T}>{fmtY(v)}</text>
        </g>
      ))}
      {area && <path d={area} fill={`url(#${gid})`} />}
      {pts.map((p, i) => p.medal == null ? <circle key={i} cx={X(i)} cy={Y(p.v)} r="3.5" className="fill-label2" fillOpacity={inScale(p) ? 0.55 : 0.3} /> : null)}
      {d && <path d={d} fill="none" stroke="var(--sys-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      {lane.map(({ p, x, y, bx }, i) => {
        const m = MEDALS[p.medal as number];
        return (
          <g key={`m${i}`}>
            <line x1={x} y1={y} x2={bx} y2={22} stroke={m.bg} strokeWidth="1.5" />
            <circle cx={x} cy={y} r="5" fill={m.bg} className="stroke-card" strokeWidth="2" />
            <g transform={`translate(${bx},12)`}>
              <circle r="10" fill={m.bg} className="stroke-card" strokeWidth="2" />
              <text textAnchor="middle" dy="3.4" fontSize={p.medal === 0 ? 8.5 : 10.5} fontWeight="800" fill={m.fg}>{m.t}</text>
            </g>
          </g>
        );
      })}
      <text x="0" y={H - 6} fontSize="11" className={T}>{dateTxt(t0)} – {dateTxt(t1)}</text>
    </svg>
  );
}
