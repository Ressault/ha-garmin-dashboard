import { useQuery } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import { parseDay } from "@/lib/format";
import { groupOf, pillars, PILLAR_COLOR, type RunDyn } from "./derive";

export const DAYS_FR = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
export const dow = (d: string) => DAYS_FR[parseDay(d).getDay()];

export function useHealth() {
  const fit = useQuery("fitness-60", () => api.fitness(60));
  const det = useQuery("health-details", () => api.healthDetails());
  return { fit: fit.data, det: det.data, loading: fit.loading, fitQ: fit };
}

export function useActivities() {
  // Tout l'historique en base (le début de l'historique est réglé côté serveur, à un seul endroit)
  return useQuery("acts-all", () => api.activities({ limit: 2000 }));
}

/** Dynamiques de course de la dernière sortie à pied qui en a (HRM-600). */
export function useLastRunDyn(): { dyn: RunDyn | null; id: number | null } {
  const acts = useActivities();
  const run = acts.data?.items.find((a) => groupOf(a.sport_type) === "foot" && a.ground_contact_ms != null);
  if (!run) return { dyn: null, id: null };
  return {
    id: run.activity_id,
    dyn: {
      cadence: run.avg_cadence_spm ?? null,
      balance: run.gct_balance_left_pct,
      gct: run.ground_contact_ms,
      vosc: run.vertical_oscillation_cm,
      vratio: run.vertical_ratio_pct ?? null,
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
  // « OK » = Optimal ou Bon (vert ou bleu) ; seul « À surveiller » (orange) ne compte pas
  const greens = p ? [p.endur, p.recov, p.load, p.dyn].filter((s) => s === "Optimal" || s === "Bon").length : 0;
  return { p, colors, greens, dyn, runId: id, series, latest };
}
