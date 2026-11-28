import { type ReactNode } from "react";

/* Jauges et anneaux : préparation, phases de sommeil, équilibre gauche / droite. */

/* ---------- Jauge semi-circulaire (préparation 0-10) ---------- */
export function Gauge({ value, max = 10, color = "var(--c-sky)", size = 150, label }: { value: number | null; max?: number; color?: string; size?: number; label: string }) {
  const r = 60, cx = 75, cy = 82;
  const t = value == null ? 0 : Math.max(0, Math.min(1, value / max));
  const ang = Math.PI * (1 - t);
  const px = cx + r * Math.cos(ang), py = cy - r * Math.sin(ang);
  // petit arc clair autour de la valeur, comme Apple
  const a0 = Math.PI * (1 - Math.max(0, t - 0.14)), a1 = Math.PI * (1 - Math.min(1, t + 0.06));
  const arc = (a: number) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy - r * Math.sin(a)).toFixed(1)}`;
  return (
    <svg width={size} height={(size * 100) / 150} viewBox="0 0 150 100" role="img" aria-label={label}>
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

/* ---------- Équilibre gauche / droite ---------- */
export function Balance({ left }: { left: number }) {
  const w = (left / 100) * 180;
  return (
    <svg width="100%" height="14" viewBox="0 0 180 14" aria-hidden className="flex-1">
      <rect x="0" y="3" width="180" height="8" rx="4" className="fill-fill2" />
      <rect x="0" y="3" width={Math.max(w - 2, 0)} height="8" rx="4" fill="var(--c-royal-soft)" />
      <line x1="90" y1="0" x2="90" y2="14" className="stroke-foreground" strokeWidth="1.5" />
    </svg>
  );
}
