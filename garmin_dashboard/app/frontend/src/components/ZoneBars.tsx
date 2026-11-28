import { fmtHM, nf, ZONE_META } from "@/lib/format";
import { ZONE_COLORS } from "@/lib/palette";
import type { HrZone } from "@/lib/api";

/** Mêmes couleurs que la carte « Zones de FC » de l'onglet Entraînement */
const ZCOL = ZONE_COLORS;

/** Répartition du temps par zone de FC : une ligne par zone, de la plus intense à la plus douce (comme Apple Forme). */
export function ZoneBars({ zones }: { zones: HrZone[] }) {
  const sorted = [...zones].sort((a, b) => b.zone - a.zone);
  const total = sorted.reduce((s, z) => s + (z.secs ?? 0), 0);
  if (total <= 0) return <p className="text-muted-foreground text-sm">Aucune donnée de zones pour cette sortie.</p>;
  const mx = Math.max(...sorted.map((z) => z.secs ?? 0), 1);
  return (
    <ul className="m-0 grid list-none gap-3 p-0">
      {sorted.map((z) => {
        const i = Math.min(Math.max(z.zone, 1), 5) - 1;
        const s = z.secs ?? 0;
        return (
          <li key={z.zone} className="grid grid-cols-[30px_1fr_auto] items-center gap-x-3">
            <span className="text-[15px] font-semibold">Z{z.zone}</span>
            <span className="min-w-0">
              <span className="text-muted-foreground block truncate text-[13px] leading-tight">
                {ZONE_META[i].name}
                {z.low_bpm ? ` · dès ${z.low_bpm} BPM` : ""}
              </span>
              <span className="mt-1 block h-2.5 rounded-full bg-foreground/[0.07]">
                <span className="block h-full rounded-full" style={{ width: `${s > 0 ? Math.max(3, (s / mx) * 100) : 0}%`, background: ZCOL[i] }} />
              </span>
            </span>
            <span className="text-right tabular-nums">
              <span className="block text-[15px] font-semibold">{nf((s / total) * 100)} %</span>
              <span className="text-muted-foreground block text-[12px]">{fmtHM(s)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
