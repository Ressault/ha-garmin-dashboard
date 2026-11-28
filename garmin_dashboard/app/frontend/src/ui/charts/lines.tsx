import { useId } from "react";

import { PAD, pathOf, smoothPath, T, useW } from "./base";

/* Courbes : charge (forme, fatigue, fraîcheur), aires, plage personnelle, effort cumulé. */

/* ---------- Charge : forme et fatigue en courbes, fraîcheur en barres autour de zéro ---------- */
export function LoadChart({ ctl, atl, tsb, labels }: { ctl: (number | null)[]; atl: (number | null)[]; tsb: (number | null)[]; labels: [string, string] }) {
  const [ref, W] = useW();
  const n = Math.max(ctl.length, 2), G = 30, PW = W - G; // gouttière droite pour les graduations
  const X = (i: number) => 4 + (i * (PW - 12)) / (n - 1);
  const top = [...ctl, ...atl].filter((v): v is number => v != null);
  const lo1 = Math.floor((Math.min(...top, 50) - 5) / 10) * 10, hi1 = Math.ceil((Math.max(...top, 100) + 5) / 10) * 10;
  const Y1 = (v: number) => 8 + 92 - ((v - lo1) / (hi1 - lo1)) * 92;
  const tv = tsb.filter((v): v is number => v != null);
  const lo2 = Math.min(-40, ...tv) - 2, hi2 = Math.max(15, ...tv) + 2;
  const Y2 = (v: number) => 140 + 64 - ((v - lo2) / (hi2 - lo2)) * 64;
  const pts = (arr: (number | null)[]) => arr.map((v, i) => (v == null ? null : ([X(i), Y1(v)] as [number, number]))).filter(Boolean) as [number, number][];
  const pc = pts(ctl), pa = pts(atl);
  const bw = Math.max(2, ((PW - 12) / n) * 0.62);
  const tsbColor = (v: number) => (v < -30 ? "var(--sys-orange)" : v <= -10 ? "var(--sys-green)" : v > 5 ? "var(--sys-blue)" : "var(--label3)");
  const mid = (lo1 + hi1) / 2;
  return (
    <svg ref={ref} width="100%" height="232" viewBox={`0 0 ${W} 232`} role="img" aria-label="Forme et fatigue en courbes, fraîcheur en barres autour de zéro">
      {[hi1, mid, lo1].map((v) => (
        <g key={v}>
          <line x1="0" x2={PW} y1={Y1(v)} y2={Y1(v)} className="stroke-sep" />
          <text x={W} y={Y1(v) + 4} fontSize="11" textAnchor="end" className={T}>{Math.round(v)}</text>
        </g>
      ))}
      <path d={smoothPath(pa)} fill="none" stroke="var(--sys-pink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity=".85" />
      <path d={smoothPath(pc)} fill="none" stroke="var(--sys-blue)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {pa.length > 0 && <circle cx={pa[pa.length - 1][0]} cy={pa[pa.length - 1][1]} r="4" fill="var(--sys-pink)" className="stroke-card" strokeWidth="2" />}
      {pc.length > 0 && <circle cx={pc[pc.length - 1][0]} cy={pc[pc.length - 1][1]} r="5" fill="var(--sys-blue)" className="stroke-card" strokeWidth="2" />}
      <text x="0" y="128" fontSize="12" fontWeight="600" className="fill-foreground">Fraîcheur</text>
      <text x={PW} y="128" fontSize="11" textAnchor="end" fill="var(--sys-green)">■ zone de progression (−10 à −30)</text>
      <rect x="0" y={Y2(-10)} width={PW} height={Y2(-30) - Y2(-10)} rx="4" fill="var(--sys-green)" fillOpacity=".1" />
      <line x1="0" x2={PW} y1={Y2(0)} y2={Y2(0)} className="stroke-sep" />
      <text x={W} y={Y2(0) + 4} fontSize="11" textAnchor="end" className={T}>0</text>
      {tsb.map((v, i) => {
        if (v == null) return null;
        const y0 = Y2(0), y1 = Y2(v);
        return <rect key={i} x={X(i) - bw / 2} y={Math.min(y0, y1)} width={bw} height={Math.max(Math.abs(y1 - y0), 1.5)} rx={Math.min(bw / 2, 2)} fill={tsbColor(v)} />;
      })}
      <text x="0" y="228" fontSize="11" className={T}>{labels[0]}</text>
      <text x={PW} y="228" fontSize="11" textAnchor="end" className={T}>{labels[1]}</text>
    </svg>
  );
}

/* ---------- Courbe avec aire dégradée (Body Battery, condition physique) ---------- */
export function AreaLine({ points, xMax, yMin, yMax, color, height = 92, xLabels, yLabels, label, dots }: { points: [number, number][]; xMax: number; yMin: number; yMax: number; color: string; height?: number; xLabels: { x: number; t: string }[]; yLabels?: { v: number; t: string }[]; label: string; dots?: boolean }) {
  const id = useId().replace(/:/g, "");
  const [ref, W0] = useW(), H = height - 22;
  const W = W0 - (yLabels ? 46 : 0); // gouttière droite pour les graduations
  const Yv = (v: number) => 8 + (H - 8) - ((v - yMin) / (yMax - yMin)) * (H - 8);
  const xy = points.map(([x, v]) => [(x / xMax) * (W - PAD), Yv(v)] as [number, number]);
  if (!xy.length) return null;
  const line = smoothPath(xy);
  const last = xy[xy.length - 1];
  return (
    <svg ref={ref} width="100%" height={height} viewBox={`0 0 ${W0} ${height}`} role="img" aria-label={label}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".3" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {yLabels?.map((l, i) => (
        <g key={`y${i}`}>
          <line x1="0" x2={W} y1={Yv(l.v)} y2={Yv(l.v)} className="stroke-sep" />
          <text x={W0} y={Yv(l.v) + 4} fontSize="11" textAnchor="end" className={T}>{l.t}</text>
        </g>
      ))}
      <path d={`${line} L${last[0].toFixed(1)},${H} L${xy[0][0].toFixed(1)},${H} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      {dots && xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill={color} />)}
      <circle cx={last[0]} cy={last[1]} r="5" fill={color} className="stroke-card" strokeWidth="2" />
      {xLabels.map((l, i) => (
        <text key={i} x={i === xLabels.length - 1 ? W : (l.x / xMax) * (W - PAD)} y={height - 4} fontSize="11" textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"} className={T}>
          {l.t}
        </text>
      ))}
    </svg>
  );
}

/* ---------- Courbe avec plage personnelle (FC au repos) ---------- */
export function LineBand({ values, band, lo, hi, color, bandText, labels, label }: { values: (number | null)[]; band: [number, number]; lo: number; hi: number; color: string; bandText: string; labels: [string, string]; label: string }) {
  const [ref, W] = useW(), H = 90, n = Math.max(values.length, 2);
  const y = (v: number) => 24 + H - ((v - lo) / (hi - lo)) * H;
  const pv = values.map((v, i) => (v == null ? null : { v, p: [(i * (W - PAD)) / (n - 1), y(v)] as [number, number] })).filter(Boolean) as { v: number; p: [number, number] }[];
  const pts = pv.map((q) => q.p);
  const last = pts[pts.length - 1];
  return (
    <svg ref={ref} width="100%" height="140" viewBox={`0 0 ${W} 140`} role="img" aria-label={label}>
      <text x={W} y="11" fontSize="11" fontWeight="600" textAnchor="end" fill={color}>{bandText}</text>
      <rect x="0" y={y(band[1])} width={W} height={y(band[0]) - y(band[1])} rx="6" fill={color} fillOpacity=".12" />
      <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {pv.map((q, i) => (q.v < band[0] || q.v > band[1]) && <circle key={i} cx={q.p[0]} cy={q.p[1]} r="3" fill={color} className="stroke-card" strokeWidth="1.5" />)}
      {last && <circle cx={last[0]} cy={last[1]} r="5" fill={color} className="stroke-card" strokeWidth="2" />}
      <text x="0" y="134" fontSize="11" className={T}>{labels[0]}</text>
      <text x={W} y="134" fontSize="11" textAnchor="end" className={T}>{labels[1]}</text>
    </svg>
  );
}

/* ---------- Effort cumulé de la semaine vs fourchette habituelle ---------- */
export function EffortChart({ current, previous, lo, hi }: { current: number[]; previous: number[]; lo: number[] | null; hi: number[] | null }) {
  const [ref, W] = useW(), H = 120;
  const mx = Math.max(100, ...current, ...previous, ...(hi ?? [])) * 1.05;
  const X = (i: number) => (i * (W - PAD)) / 6, Y = (v: number) => 8 + H - (v / mx) * H;
  const band = lo && hi ? `${pathOf(hi.map((v, i) => [X(i), Y(v)]))} L${pathOf(lo.map((v, i) => [X(i), Y(v)] as [number, number]).reverse()).slice(1)} Z` : null;
  const last = current.length - 1;
  return (
    <svg ref={ref} width="100%" height="150" viewBox={`0 0 ${W} 150`} role="img" aria-label="Effort cumulé cette semaine comparé à la semaine dernière et à ta fourchette habituelle">
      {band && <path d={band} fill="var(--sys-blue)" fillOpacity=".12" />}
      <path d={smoothPath(previous.map((v, i) => [X(i), Y(v)]))} fill="none" className="stroke-label2" strokeOpacity=".7" strokeWidth="2" strokeDasharray="4 4" />
      {current.length > 0 && <path d={smoothPath(current.map((v, i) => [X(i), Y(v)]))} fill="none" stroke="var(--sys-blue)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {last >= 0 && <circle cx={X(last)} cy={Y(current[last])} r="5.5" fill="var(--sys-blue)" className="stroke-card" strokeWidth="2" />}
      {["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."].map((d, i) => (
        <text key={d} x={i === 6 ? W : X(i)} y="146" fontSize="11" textAnchor={i === 0 ? "start" : i === 6 ? "end" : "middle"} className={T}>{d}</text>
      ))}
    </svg>
  );
}
