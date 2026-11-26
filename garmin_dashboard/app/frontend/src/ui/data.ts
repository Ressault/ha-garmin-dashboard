import { useQuery } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import { parseDay } from "@/lib/format";
import { groupOf, pillars, PILLAR_COLOR, type RunDyn } from "./derive";

export const DAYS_FR = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
export const dow = (d: string) => DAYS_FR[parseDay(d).getDay()];

export function useHealth() {
  const fit = useQuery("fitness-60", () => api.fitness(60));
  const det = useQuery("health-details", () => api.healthDetails());
  return { fit: fit.data, det: det.data, loading: fit.loading };
}

export function useActivities() {
  // Tout l'historique depuis l'achat de la montre (2025)
  const start = "2025-01-01";
  return useQuery(`acts-${start}`, () => api.activities({ start, limit: 2000 }));
}

/** Dynamiques de course de la dernière sortie à pied qui en a (HRM-600). */
export function useLastRunDyn(): { dyn: RunDyn | null; id: number | null } {
  const acts = useActivities();
  const run = acts.data?.items.find((a) => groupOf(a.sport_type) === "foot" && a.ground_contact_ms != null);
  const det = useQuery(`activity-${run?.activity_id ?? 0}`, () => (run ? api.activity(run.activity_id) : Promise.resolve(null)));
  const d = det.data;
  if (!run) return { dyn: null, id: null };
  return {
    id: run.activity_id,
    dyn: {
      cadence: d?.avg_cadence_spm ?? null,
      balance: run.gct_balance_left_pct,
      gct: run.ground_contact_ms,
      vosc: run.vertical_oscillation_cm,
      vratio: d?.vertical_ratio_pct ?? null,
    },
  };
}

export function usePillars() {
  const { fit } = useHealth();
  const { dyn, id } = useLastRunDyn();
  const series = fit?.series ?? [];
  const latest = fit?.latest ?? null;
  const p = fit ? pillars(series, latest, dyn) : null;
  const colors = p ? [p.endur, p.recov, p.load, p.dyn ?? "Bon"].map((s) => PILLAR_COLOR[s]) : [];
  const greens = p ? [p.endur, p.recov, p.load, p.dyn].filter((s) => s === "Optimal" || s === "Bon").length : 0;
  return { p, colors, greens, dyn, runId: id, series, latest };
}
