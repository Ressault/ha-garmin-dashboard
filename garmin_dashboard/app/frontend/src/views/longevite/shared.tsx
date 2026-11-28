import { type FitnessDay } from "@/lib/api";
import { nf } from "@/lib/format";
import { PATH } from "@/lib/route";
import { useHealth, usePillars } from "@/ui/data";
import { PILLAR_TONE, type PillarStatus } from "@/ui/derive";
import { MiniHeart, MiniPillars, MiniSleep } from "@/ui/icons";
import { Badge, Chip, ChipRow } from "@/ui/kit";

/* Aides communes aux pages de Longévité : pilules de section, petits formats. */
export function LonChips({ current }: { current: "piliers" | "sommeil" | "forme" }) {
  const { fit } = useHealth();
  const { colors, greens } = usePillars();
  const l = fit?.latest;
  const sleepLabel = l?.sleep_score == null ? "—" : l.sleep_score >= 80 ? "Bon" : l.sleep_score >= 60 ? "Correct" : "Faible";
  return (
    <ChipRow label="Sections de Longévité">
      <Chip href={PATH.piliers} current={current === "piliers"} icon={<MiniPillars colors={colors} />} label="Mes piliers" value={colors.length ? `${greens} sur 4 OK` : "—"} />
      <Chip href={PATH.sommeil} current={current === "sommeil"} icon={<MiniSleep score={l?.sleep_score != null ? Math.round(l.sleep_score) : null} />} label="Sommeil" value={sleepLabel} />
      <Chip href={PATH.forme} current={current === "forme"} icon={<MiniHeart />} label="Forme et santé" value={l?.resting_hr != null ? `${nf(l.resting_hr)} BPM` : "—"} />
    </ChipRow>
  );
}

export const sign = (v: number) => (v > 0 ? `+${nf(v)}` : v < 0 ? `−${nf(Math.abs(v))}` : "0");
export const Status = ({ s }: { s: PillarStatus }) => <Badge tone={PILLAR_TONE[s]}>{s}</Badge>;
export const lastN = (s: FitnessDay[], n: number) => s.slice(-n);
