import { useId, type ReactNode } from "react";

/* Graphiques SVG légers, dessinés comme dans l'app Santé d'Apple.
   Les éléments neutres (grilles, textes) suivent le thème via les classes fill-label2 / stroke-sep. */

const T = "fill-label2";

/* ---------- Jauge semi-circulaire (préparation 0-10) ---------- */
export function Gauge({ value, max = 10, color = "#3E8EF7", size = 150, label }: { value: number | null; max?: number; color?: string; size?: number; label: string }) {
  const r = 60, cx = 75, cy = 82;
  const t = value == null ? 0 : Math.max(0, Math.min(1, value / max));
  const ang = Math.PI * (1 - t);
  const px = cx + r * Math.cos(ang), py = cy - r * Math.sin(ang);
  // petit arc clair autour de la valeur, comme Apple
  const a0 = Math.PI * (1 - Math.max(0, t - 0.14)), a1 = Math.PI * (1 - Math.min(1, t + 0.06));
  const arc = (a: number) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy - r * Math.sin(a)).toFixed(1)}`;
  return (
    <svg width={size} height={(size * 92) / 150} viewBox="0 0 150 92" role="img" aria-label={label}>
      <path d={`M15 82a60 60 0 0 1 120 0`} fill="none" className="stroke-fill2" strokeWidth="16" strokeLinecap="round" />
      {value != null && <path d={`M${arc(a0)} A60 60 0 0 1 ${arc(a1)}`} fill="none" stroke={color} strokeOpacity=".3" strokeWidth="16" strokeLinecap="round" />}
      {value != null && <circle cx={px} cy={py} r="6.5" fill={color} className="stroke-card" strokeWidth="2.5" />}
      <text x="75" y="84" fontSize="44" fontWeight="600" fill={color} textAnchor="middle">
        {value == null ? "–" : Math.round(value)}
      </text>
    </svg>
  );
}

/* ---------- Anneau segmenté (phases de sommeil, score) ---------- */
export function Ring({ segments, size = 132, stroke = 16, gap = 5, children, label }: { segments: { v: number; color: string }[]; size?: number; stroke?: number; gap?: number; children?: ReactNode; label: string }) {
  const r = 50, C = 2 * Math.PI * r;
  const tot = segments.reduce((s, x) => s + Math.max(0, x.v), 0) || 1;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 132 132" role="img" aria-label={label}>
      <circle cx="66" cy="66" r={r} fill="none" className="stroke-fill2" strokeWidth={stroke} />
      {segments.map((s, i) => {
        const L = (Math.max(0, s.v) / tot) * C;
        const el = L > 0 && (
          <circle key={i} cx="66" cy="66" r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${Math.max(L - gap - stroke, 0.1).toFixed(1)} ${C.toFixed(1)}`} strokeDashoffset={(-(off + stroke / 2 + gap / 2)).toFixed(1)} transform="rotate(-90 66 66)" />
        );
        off += L;
        return el;
      })}
      {children}
    </svg>
  );
}

/* ---------- Pétales (volume par sport, formes pâles = période précédente) ---------- */
export interface Petal { now: number; prev: number; color: string; icon: ReactNode; label: string }
export function Petals({ items, size = 176, label }: { items: Petal[]; size?: number; label: string }) {
  const mx = Math.max(1, ...items.map((p) => Math.max(p.now, p.prev)));
  const R = (m: number) => (m > 0 ? 34 + 62 * Math.sqrt(m / mx) : 0);
  const n = items.length, span = 360 / n, pad = 12, rr = 24;
  const pt = (a: number, r: number) => [110 + r * Math.sin((a * Math.PI) / 180), 110 - r * Math.cos((a * Math.PI) / 180)];
  const path = (a0: number, a1: number, r0: number, r1: number) => {
    const [x0, y0] = pt(a0, r0), [x1, y1] = pt(a0, r1), [x2, y2] = pt(a1, r1), [x3, y3] = pt(a1, r0);
    return `M${x0},${y0} L${x1},${y1} A${r1},${r1} 0 0 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 0 0 ${x0},${y0}Z`;
  };
  const ang = (i: number) => [i * span - span / 2 + pad / 2 + rr * 0.35, (i + 1) * span - span / 2 - pad / 2 - rr * 0.35];
  return (
    <svg width={size} height={size} viewBox="0 0 220 220" role="img" aria-label={label}>
      {items.map((p, i) => {
        const [a0, a1] = ang(i);
        return p.prev > 0 && <path key={`g${i}`} d={path(a0, a1, 22 + rr / 2, Math.max(R(p.prev) - rr / 2, 22 + rr / 2 + 1))} fill={p.color} stroke={p.color} strokeWidth={rr} strokeLinejoin="round" opacity=".2" />;
      })}
      {items.map((p, i) => {
        const [a0, a1] = ang(i);
        return p.now > 0 && <path key={`p${i}`} d={path(a0, a1, 22 + rr / 2, Math.max(R(p.now) - rr / 2, 22 + rr / 2 + 1))} fill={p.color} stroke={p.color} strokeWidth={rr} strokeLinejoin="round" />;
      })}
      {items.map((p, i) => {
        if (!p.now && !p.prev) return null;
        const rm = (22 + R(p.now || p.prev)) / 2 + 6;
        const [x, y] = pt(i * span, rm);
        return (
          <g key={`i${i}`} transform={`translate(${x - 9} ${y - 9}) scale(.75)`} color={p.now ? "#fff" : p.color}>
            {p.icon}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Barres verticales (7 nuits, km par semaine, charge…) ---------- */
export function Bars({ items, max, color, light, height = 96, unit, label }: { items: { label: string; value: number | null; strong?: boolean }[]; max?: number; color: string; light: string; height?: number; unit?: string; label: string }) {
  const W = 322, base = height - 24, step = W / items.length;
  const mx = max ?? Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
      {items.map((it, i) => {
        const h = it.value ? (it.value / mx) * (base - 18) : 0;
        const x = i * step + step / 2 - 11;
        return (
          <g key={i}>
            {it.value ? <rect x={x} y={base - h} width="22" height={h} rx="7" fill={it.strong ? color : light} /> : <rect x={x} y={base - 5} width="22" height="5" rx="2.5" className="fill-fill2" />}
            {it.value != null && it.value > 0 && (
              <text x={x + 11} y={base - h - 5} fontSize="11" fontWeight="600" textAnchor="middle" className={it.strong ? "fill-foreground" : T}>
                {Math.round(it.value)}
                {unit}
              </text>
            )}
            <text x={x + 11} y={height - 6} fontSize="11" textAnchor="middle" className={T}>
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
  const W = 322, H = 100, step = W / Math.max(values.length, 1);
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  return (
    <svg width="100%" height="132" viewBox="0 0 322 132" role="img" aria-label={label}>
      <rect x="0" y={y(band[1])} width={W} height={y(band[0]) - y(band[1])} rx="6" fill={bandColor} />
      <text x={W - 4} y={y(band[1]) - 5} fontSize="11" fontWeight="600" textAnchor="end" fill={color}>
        {bandText}
      </text>
      {values.map((v, i) => {
        if (v == null) return null;
        const yy = Math.max(4, y(v));
        const last = i === values.length - 1;
        const inb = v >= band[0] && v <= band[1];
        return <rect key={i} x={i * step + step * 0.3} y={yy} width={step * 0.4} height={H - yy} rx="4.5" fill={last ? color : inb ? color : light} opacity={last ? 1 : inb ? 0.6 : 1} />;
      })}
      <line x1="0" y1={H + 0.5} x2={W} y2={H + 0.5} className="stroke-sep" />
      <text x="0" y="118" fontSize="11" className={T}>{labels[0]}</text>
      <text x={W / 2} y="118" fontSize="11" textAnchor="middle" className={T}>{labels[1]}</text>
      <text x={W} y="118" fontSize="11" textAnchor="end" className={T}>{labels[2]}</text>
    </svg>
  );
}

/* ---------- Tirets dans une bande (VFC des piliers) ---------- */
export function DashBand({ values, band, lo = 40, hi = 75, caption, label }: { values: (number | null)[]; band: [number, number]; lo?: number; hi?: number; caption: string; label: string }) {
  const H = 64, W = 322, step = W / Math.max(values.length, 1);
  const y = (v: number) => H - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * H;
  return (
    <svg width="100%" height="86" viewBox="0 0 322 86" role="img" aria-label={label}>
      <rect x="0" y={y(band[1])} width={W} height={y(band[0]) - y(band[1])} rx="8" fill="#3E8EF7" fillOpacity=".12" />
      {values.map((v, i) => v != null && <rect key={i} x={i * step + 3} y={y(v) - 3} width={step - 6} height="6" rx="3" fill="#3E8EF7" opacity={v >= band[0] && v <= band[1] ? 1 : 0.4} />)}
      <text x="0" y="82" fontSize="11" className={T}>{caption}</text>
    </svg>
  );
}

const pathOf = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/* ---------- Forme / fatigue en haut, fraîcheur en bas ---------- */
export function LoadChart({ ctl, atl, tsb, labels }: { ctl: (number | null)[]; atl: (number | null)[]; tsb: (number | null)[]; labels: [string, string] }) {
  const W = 322, n = Math.max(ctl.length, 2);
  const top = [...ctl, ...atl].filter((v): v is number => v != null);
  const lo1 = Math.min(...top, 50) - 5, hi1 = Math.max(...top, 100) + 5;
  const X = (i: number) => (i * W) / (n - 1);
  const Y1 = (v: number) => 80 - ((v - lo1) / (hi1 - lo1)) * 80;
  const tv = tsb.filter((v): v is number => v != null);
  const lo2 = Math.min(-40, ...tv) - 5, hi2 = Math.max(15, ...tv) + 3;
  const Y2 = (v: number) => 96 + 66 - ((v - lo2) / (hi2 - lo2)) * 66;
  const line = (arr: (number | null)[], Y: (v: number) => number) => pathOf(arr.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean) as [number, number][]);
  return (
    <svg width="100%" height="190" viewBox="0 0 322 190" role="img" aria-label="Forme et fatigue en haut, fraîcheur en bas">
      <path d={line(atl, Y1)} fill="none" stroke="#FF6B5E" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <path d={line(ctl, Y1)} fill="none" stroke="#3E62FF" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <rect x="0" y={Y2(-10)} width={W} height={Y2(-30) - Y2(-10)} fill="#34C759" fillOpacity=".14" />
      <text x="4" y={Y2(-10) - 4} fontSize="11" fill="#34A853">zone de progression</text>
      <line x1="0" y1={Y2(0)} x2={W} y2={Y2(0)} className="stroke-sep" strokeDasharray="3 4" />
      <path d={line(tsb, Y2)} fill="none" stroke="#34A853" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <text x="0" y="184" fontSize="11" className={T}>{labels[0]}</text>
      <text x={W} y="184" fontSize="11" textAnchor="end" className={T}>{labels[1]}</text>
    </svg>
  );
}

/* ---------- Courbe avec aire dégradée (Body Battery, condition physique) ---------- */
export function AreaLine({ points, xMax, yMin, yMax, color, height = 92, xLabels, label, dots }: { points: [number, number][]; xMax: number; yMin: number; yMax: number; color: string; height?: number; xLabels: { x: number; t: string }[]; label: string; dots?: boolean }) {
  const id = useId().replace(/:/g, "");
  const W = 322, H = height - 22;
  const xy = points.map(([x, v]) => [(x / xMax) * W, 4 + (H - 4) - ((v - yMin) / (yMax - yMin)) * (H - 4)] as [number, number]);
  if (!xy.length) return null;
  const line = pathOf(xy);
  const last = xy[xy.length - 1];
  return (
    <svg width="100%" height={height} viewBox={`0 0 322 ${height}`} role="img" aria-label={label}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".3" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${last[0].toFixed(1)},${H} L${xy[0][0].toFixed(1)},${H} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      {dots && xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill={color} />)}
      <circle cx={last[0]} cy={last[1]} r="5" fill={color} className="stroke-card" strokeWidth="2" />
      {xLabels.map((l, i) => (
        <text key={i} x={(l.x / xMax) * W} y={height - 4} fontSize="11" textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"} className={T}>
          {l.t}
        </text>
      ))}
    </svg>
  );
}

/* ---------- Courbe avec plage personnelle (FC au repos) ---------- */
export function LineBand({ values, band, lo, hi, color, bandText, labels, label }: { values: (number | null)[]; band: [number, number]; lo: number; hi: number; color: string; bandText: string; labels: [string, string]; label: string }) {
  const W = 322, H = 90, n = Math.max(values.length, 2);
  const y = (v: number) => 8 + H - ((v - lo) / (hi - lo)) * H;
  const pts = values.map((v, i) => (v == null ? null : ([(i * W) / (n - 1), y(v)] as [number, number]))).filter(Boolean) as [number, number][];
  const last = pts[pts.length - 1];
  return (
    <svg width="100%" height="124" viewBox="0 0 322 124" role="img" aria-label={label}>
      <rect x="0" y={y(band[1])} width={W} height={y(band[0]) - y(band[1])} rx="6" fill={color} fillOpacity=".12" />
      <text x="4" y={y(band[1]) - 4} fontSize="11" fontWeight="600" fill={color}>{bandText}</text>
      <path d={pathOf(pts)} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, yy], i) => <circle key={i} cx={x} cy={yy} r="2.2" fill={color} />)}
      {last && <circle cx={last[0]} cy={last[1]} r="5" fill={color} className="stroke-card" strokeWidth="2" />}
      <text x="0" y="118" fontSize="11" className={T}>{labels[0]}</text>
      <text x={W} y="118" fontSize="11" textAnchor="end" className={T}>{labels[1]}</text>
    </svg>
  );
}

/* ---------- Temps par jour, empilé par sport ---------- */
export function StackedDays({ days, max = 100, label }: { days: { label: string; strong?: boolean; parts: { color: string; v: number }[] }[]; max?: number; label: string }) {
  const W = 322, H = 96, step = W / days.length;
  const mx = Math.max(max, ...days.map((d) => d.parts.reduce((s, p) => s + p.v, 0)));
  return (
    <svg width="100%" height="124" viewBox="0 0 322 124" role="img" aria-label={label}>
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

/* ---------- Hypnogramme ---------- */
const STAGE_ROW = { awake: 0, rem: 1, light: 2, deep: 3 } as const;
export const STAGE_COLOR = { awake: "#FF836B", rem: "#2EB8D6", light: "#3E62FF", deep: "#3A2FA8" } as const;
export function Hypnogram({ levels, total, start, end }: { levels: [number, number, keyof typeof STAGE_ROW][]; total: number; start: string; end: string }) {
  const W = 180, rowh = 22;
  let prev: number | null = null;
  return (
    <svg width="100%" height="104" viewBox={`0 0 ${W} 104`} role="img" aria-label={`Phases de sommeil au fil de la nuit, de ${start} à ${end}`}>
      {[0, 1, 2, 3].map((i) => <line key={i} x1="0" y1={i * rowh + 11} x2={W} y2={i * rowh + 11} className="stroke-sep" strokeDasharray="1 3" />)}
      {levels.map(([a, b, st], i) => {
        const x = (a / total) * W, w = ((b - a) / total) * W, lv = STAGE_ROW[st], c = STAGE_COLOR[st];
        const link = prev != null && prev !== lv ? <rect x={x - 0.6} y={Math.min(prev, lv) * rowh + 11} width="1.2" height={Math.abs(prev - lv) * rowh} fill={c} opacity=".35" /> : null;
        prev = lv;
        return (
          <g key={i}>
            {link}
            <rect x={x + 0.3} y={lv * rowh + 3} width={Math.max(w - 0.6, 1.4)} height="16" rx="4" fill={c} />
          </g>
        );
      })}
      <text x="0" y="101" fontSize="10" className={T}>{start}</text>
      <text x={W} y="101" fontSize="10" textAnchor="end" className={T}>{end}</text>
    </svg>
  );
}

/* ---------- FC heure par heure (min-max) ---------- */
export function HourRanges({ hours, label }: { hours: ([number, number] | null)[]; label: string }) {
  const lo = 40, hi = Math.max(170, ...hours.map((h) => (h ? h[1] + 5 : 0))), H = 110, W = 322, step = W / 24;
  const y = (v: number) => 8 + H - ((v - lo) / (hi - lo)) * H;
  let peak = -1, peakV = 0;
  hours.forEach((h, i) => h && h[1] > peakV && ((peak = i), (peakV = h[1])));
  return (
    <svg width="100%" height="148" viewBox="0 0 322 148" role="img" aria-label={label}>
      {[60, 100, 140].map((v) => (
        <g key={v}>
          <line x1="0" y1={y(v)} x2={W} y2={y(v)} className="stroke-sep" />
          <text x={W} y={y(v) - 3} fontSize="10" textAnchor="end" className={T}>{v}</text>
        </g>
      ))}
      {hours.map((h, i) => h && <rect key={i} x={i * step + step / 2 - 3.5} y={y(h[1])} width="7" height={Math.max(y(h[0]) - y(h[1]), 7)} rx="3.5" fill="#FF2D55" opacity={h[1] > 120 ? 1 : 0.42} />)}
      {peak >= 0 && <circle cx={peak * step + step / 2} cy={y(peakV)} r="5" fill="#FF2D55" className="stroke-card" strokeWidth="2" />}
      {[["0 h", 0], ["6 h", 6], ["12 h", 12], ["18 h", 18], ["24 h", 24]].map(([t, h], i) => (
        <text key={i} x={(Number(h) / 24) * W} y="144" fontSize="11" textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} className={T}>{t}</text>
      ))}
    </svg>
  );
}

/* ---------- Effort cumulé de la semaine vs fourchette habituelle ---------- */
export function EffortChart({ current, previous, lo, hi }: { current: number[]; previous: number[]; lo: number[] | null; hi: number[] | null }) {
  const W = 322, H = 120;
  const mx = Math.max(100, ...current, ...previous, ...(hi ?? [])) * 1.05;
  const X = (i: number) => (i * W) / 6, Y = (v: number) => 6 + H - (v / mx) * H;
  const band = lo && hi ? `${pathOf(hi.map((v, i) => [X(i), Y(v)]))} L${pathOf(lo.map((v, i) => [X(i), Y(v)] as [number, number]).reverse()).slice(1)} Z` : null;
  const last = current.length - 1;
  return (
    <svg width="100%" height="150" viewBox="0 0 322 150" role="img" aria-label="Effort cumulé cette semaine comparé à la semaine dernière et à ta fourchette habituelle">
      {band && <path d={band} fill="#3E8EF7" fillOpacity=".12" />}
      <path d={pathOf(previous.map((v, i) => [X(i), Y(v)]))} fill="none" className="stroke-label2" strokeOpacity=".5" strokeWidth="2" strokeDasharray="4 4" />
      {current.length > 0 && <path d={pathOf(current.map((v, i) => [X(i), Y(v)]))} fill="none" stroke="#0A84FF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {last >= 0 && <circle cx={X(last)} cy={Y(current[last])} r="5.5" fill="#0A84FF" className="stroke-card" strokeWidth="2" />}
      {["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."].map((d, i) => (
        <text key={d} x={X(i)} y="146" fontSize="11" textAnchor={i === 0 ? "start" : i === 6 ? "end" : "middle"} className={T}>{d}</text>
      ))}
    </svg>
  );
}

/* ---------- Équilibre gauche / droite ---------- */
export function Balance({ left }: { left: number }) {
  const w = (left / 100) * 180;
  return (
    <svg width="100%" height="14" viewBox="0 0 180 14" aria-hidden className="flex-1">
      <rect x="0" y="3" width="180" height="8" rx="4" className="fill-fill2" />
      <rect x="0" y="3" width={Math.max(w - 2, 0)} height="8" rx="4" fill="#8FA8F5" />
      <line x1="90" y1="0" x2="90" y2="14" className="stroke-foreground" strokeWidth="1.5" />
    </svg>
  );
}
