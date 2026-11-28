
import { T, useW } from "./base";

/* Graphiques en barres : nuits, kilomètres, VFC, Body Battery, jours empilés, FC heure par heure. */

/* ---------- Barres verticales (7 nuits, km par semaine, charge…) ---------- */
export function Bars({ items, max, color, light, height = 96, unit, label }: { items: { label: string; value: number | null; strong?: boolean }[]; max?: number; color: string; light: string; height?: number; unit?: string; label: string }) {
  const [ref, W] = useW(), base = height - 24, step = W / items.length;
  const mx = max ?? Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <svg ref={ref} width="100%" height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
      {items.map((it, i) => {
        const h = it.value ? (it.value / mx) * (base - 18) : 0;
        const bw = Math.min(22, step * 0.62), x = i * step + step / 2 - bw / 2;
        return (
          <g key={i}>
            {it.value ? <rect x={x} y={base - h} width={bw} height={h} rx={Math.min(7, bw / 2)} fill={it.strong ? color : light} /> : <rect x={x} y={base - 5} width={bw} height="5" rx="2.5" className="fill-fill2" />}
            {it.value != null && it.value > 0 && (
              <text x={x + bw / 2} y={base - h - 5} fontSize="11" fontWeight="600" textAnchor="middle" className={it.strong ? "fill-foreground" : T}>
                {Math.round(it.value)}
                {unit}
              </text>
            )}
            <text x={x + bw / 2} y={height - 6} fontSize="11" textAnchor="middle" className={T}>
              {it.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Barres verticales avec plage personnelle (VFC) ---------- */
export function BandBars({ values, band, lo, hi, labels, color, light, bandColor, bandText, label }: { values: (number | null)[]; band: [number, number]; lo: number; hi: number; labels: [string, string, string]; color: string; light: string; bandColor: string; bandText: string; label: string }) {
  const [ref, W] = useW(), H = 100, top = 18, step = W / Math.max(values.length, 1);
  const y = (v: number) => top + H - ((v - lo) / (hi - lo)) * H;
  return (
    <svg ref={ref} width="100%" height="150" viewBox={`0 0 ${W} 150`} role="img" aria-label={label}>
      <text x={W} y="11" fontSize="11" fontWeight="600" textAnchor="end" fill={color}>
        {bandText}
      </text>
      <rect x="0" y={y(band[1])} width={W} height={y(band[0]) - y(band[1])} rx="6" fill={bandColor} />
      {values.map((v, i) => {
        if (v == null) return null;
        const yy = Math.max(top + 4, y(v));
        const last = i === values.length - 1;
        const inb = v >= band[0] && v <= band[1];
        return <rect key={i} x={i * step + step * 0.3} y={yy} width={step * 0.4} height={top + H - yy} rx="4.5" fill={last ? color : inb ? color : light} opacity={last ? 1 : inb ? 0.6 : 1} />;
      })}
      <line x1="0" y1={top + H + 0.5} x2={W} y2={top + H + 0.5} className="stroke-sep" />
      <text x="0" y="136" fontSize="11" className={T}>{labels[0]}</text>
      <text x={W / 2} y="136" fontSize="11" textAnchor="middle" className={T}>{labels[1]}</text>
      <text x={W} y="136" fontSize="11" textAnchor="end" className={T}>{labels[2]}</text>
    </svg>
  );
}

/* ---------- Niveau heure par heure (Body Battery) : barre pleine = l'heure recharge, pâle = elle dépense ---------- */
export function LevelBars({ points, color, label }: { points: [number, number][]; color: string; label: string }) {
  const [ref, W] = useW();
  const H = 84, step = W / 24, bw = Math.max(4, step * 0.58);
  const hours: (number | null)[] = Array.from({ length: 24 }, (_, h) => {
    const inH = points.filter(([m]) => m >= h * 60 && m < (h + 1) * 60);
    return inH.length ? inH[inH.length - 1][1] : null;
  });
  let prev: number | null = points.length ? points[0][1] : null;
  return (
    <svg ref={ref} width="100%" height={H + 22} viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={label}>
      {[50, 100].map((v) => <line key={v} x1="0" x2={W} y1={H - (v / 100) * (H - 4)} y2={H - (v / 100) * (H - 4)} className="stroke-sep" strokeDasharray={v === 50 ? "2 4" : undefined} />)}
      {hours.map((v, h) => {
        const x = h * step + (step - bw) / 2;
        if (v == null) return <rect key={h} x={x} y={H - 4} width={bw} height="4" rx="2" className="fill-fill2" />;
        const up = prev == null || v >= prev;
        prev = v;
        const hh = Math.max(4, (v / 100) * (H - 4));
        return <rect key={h} x={x} y={H - hh} width={bw} height={hh} rx={Math.min(bw / 2, 3)} fill={color} fillOpacity={up ? 1 : 0.35} />;
      })}
      {[["0 h", 0], ["6 h", 6], ["12 h", 12], ["18 h", 18], ["24 h", 24]].map(([t, hr], i) => (
        <text key={i} x={(Number(hr) / 24) * W} y={H + 18} fontSize="11" textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} className={T}>{t}</text>
      ))}
    </svg>
  );
}

/* ---------- Temps par jour, empilé par sport ---------- */
export function StackedDays({ days, max = 100, label }: { days: { label: string; strong?: boolean; parts: { color: string; v: number }[] }[]; max?: number; label: string }) {
  const [ref, W] = useW(), H = 96, step = W / days.length;
  const mx = Math.max(max, ...days.map((d) => d.parts.reduce((s, p) => s + p.v, 0)));
  return (
    <svg ref={ref} width="100%" height="124" viewBox={`0 0 ${W} 124`} role="img" aria-label={label}>
      {days.map((d, i) => {
        const x = i * step + step / 2 - 12;
        let base = H + 4;
        return (
          <g key={i}>
            {d.parts.length === 0 && <rect x={x} y={base - 6} width="24" height="6" rx="3" className="fill-fill2" />}
            {d.parts.map((p, j) => {
              const h = (p.v / mx) * H;
              const r = <rect key={j} x={x} y={base - h + 1} width="24" height={Math.max(h - 2, 2)} rx="6" fill={p.color} />;
              base -= h;
              return r;
            })}
            <text x={x + 12} y="120" fontSize="11" textAnchor="middle" fontWeight={d.strong ? 600 : 400} className={d.strong ? "fill-foreground" : T}>
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- FC heure par heure (min-max) ---------- */
export function HourRanges({ hours, label }: { hours: ([number, number] | null)[]; label: string }) {
  const lo = 40, hi = Math.max(170, ...hours.map((h) => (h ? h[1] + 5 : 0))), H = 110;
  const [ref, W] = useW(), step = W / 24;
  const y = (v: number) => 8 + H - ((v - lo) / (hi - lo)) * H;
  let peak = -1, peakV = 0;
  hours.forEach((h, i) => h && h[1] > peakV && ((peak = i), (peakV = h[1])));
  return (
    <svg ref={ref} width="100%" height="148" viewBox={`0 0 ${W} 148`} role="img" aria-label={label}>
      {[60, 100, 140].map((v) => (
        <g key={v}>
          <line x1="0" y1={y(v)} x2={W} y2={y(v)} className="stroke-sep" />
          <text x={W} y={y(v) - 3} fontSize="10" textAnchor="end" className={T}>{v}</text>
        </g>
      ))}
      {hours.map((h, i) => h && <rect key={i} x={i * step + step / 2 - 3.5} y={y(h[1])} width="7" height={Math.max(y(h[0]) - y(h[1]), 7)} rx="3.5" fill="var(--sys-pink)" opacity={h[1] > 120 ? 1 : 0.42} />)}
      {peak >= 0 && <circle cx={peak * step + step / 2} cy={y(peakV)} r="5" fill="var(--sys-pink)" className="stroke-card" strokeWidth="2" />}
      {[["0 h", 0], ["6 h", 6], ["12 h", 12], ["18 h", 18], ["24 h", 24]].map(([t, h], i) => (
        <text key={i} x={(Number(h) / 24) * W} y="144" fontSize="11" textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} className={T}>{t}</text>
      ))}
    </svg>
  );
}
