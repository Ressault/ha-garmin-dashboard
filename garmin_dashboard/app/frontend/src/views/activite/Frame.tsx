import type React from "react";

import { useQuery } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import { fmtClockMin, isoDate, nf, parseDay } from "@/lib/format";
import { PATH } from "@/lib/route";
import { useActivities } from "@/ui/data";
import { totals, windows } from "@/ui/derive";
import { MiniList, MiniMedal, MiniPlan, MiniTrend, MiniZones } from "@/ui/icons";
import { Chip, ChipRow, TINT, Page } from "@/ui/kit";

/* Bandeau de pilules de la rubrique Activité et cadre commun à ses pages. */
export type Cur = "activites" | "progres" | "entrainement" | "records" | "plan";
export function ActChips({ current }: { current: Cur }) {
  const acts = useActivities();
  const est = useQuery("estimate", () => api.estimate());
  const effort = useQuery("effort", () => api.effort());
  const w = windows();
  const n = acts.data ? totals(acts.data.items, ...w.weekToDate).count : null;
  const h = est.data?.half;
  const half = h ? (h.low_s + h.high_s) / 2 : null;
  const plans = useQuery("plans", () => api.plans());
  const goal = plans.data?.plans.find((p) => p.goal_date)?.goal_date;
  const left = goal ? Math.ceil((parseDay(goal).getTime() - parseDay(isoDate(new Date())).getTime()) / 86400000) : null;
  return (
    <ChipRow label="Sections d'Activité">
      <Chip href={PATH.activites} current={current === "activites"} icon={<MiniList />} label="Activités" value={n != null ? `${n} cette sem.` : "—"} />
      <Chip href={PATH.progres} current={current === "progres"} icon={<MiniTrend />} label="Progrès" value={half ? `Semi ≈ ${fmtClockMin(half)}` : "—"} />
      <Chip href={PATH.entrainement} current={current === "entrainement"} icon={<MiniZones />} label="Entraînement" value={effort.data ? `Charge ${nf(effort.data.current)}` : "—"} />
      <Chip href={PATH.records} current={current === "records"} icon={<MiniMedal />} label="Records" value="Meilleurs efforts" />
      <Chip href={PATH.plan} current={current === "plan"} icon={<MiniPlan />} label="Programme" value={!plans.data ? "—" : left != null ? (left >= 0 ? `J-${left}` : "Terminé") : plans.data.plans.length ? "En cours" : "Importer"} />
    </ChipRow>
  );
}

export function Frame({ current, tint, children }: { current: Cur; tint: keyof typeof TINT; children: React.ReactNode }) {
  return (
    <Page tint={tint}>
      <ActChips current={current} />
      {children}
    </Page>
  );
}
