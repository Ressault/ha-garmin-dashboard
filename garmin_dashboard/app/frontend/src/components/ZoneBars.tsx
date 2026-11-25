import { BarList, CategoryBar } from "@tremor/react";

import { fmtHM, nf, ZONE_META } from "@/lib/format";
import type { HrZone } from "@/lib/api";

const TREMOR = ["gray", "blue", "green", "orange", "red"] as const;

/** Répartition du temps par zone de FC : barres Tremor + barre de répartition globale. */
export function ZoneBars({ zones }: { zones: HrZone[] }) {
  const sorted = [...zones].sort((a, b) => a.zone - b.zone);
  const total = sorted.reduce((s, z) => s + (z.secs ?? 0), 0);
  if (total <= 0) return <p className="text-muted-foreground text-sm">Aucune donnée de zones pour cette sortie.</p>;
  const pct = (s: number) => (s / total) * 100;

  const items = sorted.map((z) => {
    const meta = ZONE_META[Math.min(Math.max(z.zone, 1), 5) - 1];
    return {
      name: `Z${z.zone} · ${meta.name}${z.low_bpm ? ` · ≥ ${z.low_bpm}` : ""}`,
      value: Math.round(z.secs ?? 0),
      color: TREMOR[Math.min(Math.max(z.zone, 1), 5) - 1],
    };
  });

  return (
    <div className="grid gap-4">
      <CategoryBar
        values={sorted.map((z) => +pct(z.secs ?? 0).toFixed(1))}
        colors={sorted.map((z) => TREMOR[Math.min(Math.max(z.zone, 1), 5) - 1])}
        showLabels={false}
        showAnimation
        className="mt-1"
      />
      <BarList
        sortOrder="none"
        data={items}
        valueFormatter={(v: number) => `${fmtHM(v)} · ${nf(pct(v))} %`}
        showAnimation
        className="[&_p]:tabular-nums"
      />
    </div>
  );
}
