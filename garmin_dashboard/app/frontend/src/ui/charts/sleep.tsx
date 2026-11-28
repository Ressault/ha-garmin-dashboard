
import { T, useW } from "./base";

/* Sommeil : hypnogramme et couleurs des phases. */

/* ---------- Hypnogramme ---------- */
const STAGE_ROW = { awake: 0, rem: 1, light: 2, deep: 3 } as const;
export const STAGE_COLOR = { awake: "var(--stage-awake)", rem: "var(--stage-rem)", light: "var(--c-royal)", deep: "var(--stage-deep)" } as const;
export function Hypnogram({ levels, total, start, end }: { levels: [number, number, keyof typeof STAGE_ROW][]; total: number; start: string; end: string }) {
  const [ref, W] = useW(180), rowh = 22;
  let prev: number | null = null;
  return (
    <svg ref={ref} width="100%" height="104" viewBox={`0 0 ${W} 104`} role="img" aria-label={`Phases de sommeil au fil de la nuit, de ${start} à ${end}`}>
      {[0, 1, 2, 3].map((i) => <line key={i} x1="0" y1={i * rowh + 11} x2={W} y2={i * rowh + 11} className="stroke-sep" strokeDasharray="1 3" />)}
      {levels.map(([a, b, st], i) => {
        const x = (a / total) * W, w = ((b - a) / total) * W, lv = STAGE_ROW[st], c = STAGE_COLOR[st];
        const link = prev != null && prev !== lv ? <rect x={x - 0.5} y={Math.min(prev, lv) * rowh + 11} width="1" height={Math.abs(prev - lv) * rowh} className="fill-label2" opacity=".18" /> : null;
        prev = lv;
        return (
          <g key={i}>
            {link}
            <rect x={x + 0.3} y={lv * rowh + 2} width={Math.max(w - 0.6, st === "awake" ? 3 : 2)} height="18" rx="4" fill={c} />
          </g>
        );
      })}
      <text x="0" y="101" fontSize="10" className={T}>{start}</text>
      <text x={W} y="101" fontSize="10" textAnchor="end" className={T}>{end}</text>
    </svg>
  );
}
