import { useEffect, useMemo, useState } from "react";
import { Mountain, RotateCcw } from "lucide-react";

import { Chart, Delta, EmptyState, QueryError } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/hooks/useQuery";
import { api, type PredictionDay } from "@/lib/api";
import { fmtClock, fmtDeltaClock, fmtPaceSec, nf, shortDay } from "@/lib/format";
import { axisPointerLine, axisText, tipRow, tipTitle, tooltipBase, type Opt } from "@/lib/echarts";
import { C } from "@/lib/palette";

type Key = "5k" | "10k" | "half" | "marathon";
const DISTS: { key: Key; label: string; km: number; field: keyof PredictionDay; color: string }[] = [
  { key: "5k", label: "5 km", km: 5, field: "time_5k_s", color: C.cyan },
  { key: "10k", label: "10 km", km: 10, field: "time_10k_s", color: C.blue },
  { key: "half", label: "Semi-marathon", km: 21.0975, field: "time_half_s", color: C.green },
  { key: "marathon", label: "Marathon", km: 42.195, field: "time_marathon_s", color: C.orange },
];

/** Temps sur plat pour une distance : interpolation log-log entre les prédictions Garmin. */
function flatTime(km: number, p: PredictionDay): number | null {
  const pts = DISTS.map((d) => ({ x: Math.log(d.km), y: p[d.field] as number | null }))
    .filter((q): q is { x: number; y: number } => q.y != null && q.y > 0)
    .map((q) => ({ x: q.x, y: Math.log(q.y) }));
  if (pts.length < 2) return null;
  const x = Math.log(km);
  let a = pts[0];
  let b = pts[1];
  for (let i = 0; i < pts.length - 1; i++) {
    a = pts[i];
    b = pts[i + 1];
    if (x <= b.x) break;
  }
  const y = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  return Math.exp(y);
}

/* ---------- Évolution ---------- */
function EvolutionChart({ history, dist }: { history: PredictionDay[]; dist: (typeof DISTS)[number] }) {
  const option = useMemo<Opt>(() => {
    const dates = history.map((h) => h.date);
    const vals = history.map((h) => (h[dist.field] as number | null) ?? null);
    return {
      animation: false,
      grid: { left: 56, right: 16, top: 16, bottom: 28 },
      xAxis: {
        type: "category",
        data: dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: C.grid } },
        axisTick: { show: false },
        axisLabel: { ...axisText, formatter: (v: string) => shortDay(v), hideOverlap: true },
        axisPointer: axisPointerLine,
      },
      yAxis: {
        type: "value",
        scale: true,
        inverse: true,
        splitNumber: 4,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...axisText, formatter: (v: number) => fmtClock(v) },
        splitLine: { lineStyle: { color: C.grid } },
      },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: C.pointer } },
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0]?.dataIndex ?? 0;
          const v = vals[i];
          const prev = vals.slice(0, i).reverse().find((x) => x != null) ?? null;
          let html = tipTitle(shortDay(dates[i]));
          if (v != null) html += tipRow(dist.color, dist.label, fmtClock(v));
          if (v != null && prev != null && v !== prev) html += tipRow(C.gray, "Depuis la précédente", fmtDeltaClock(v - prev));
          return html;
        },
      },
      dataZoom: [{ type: "inside", filterMode: "none" }],
      series: [
        {
          name: dist.label,
          type: "line",
          data: vals,
          step: "end",
          connectNulls: true,
          showSymbol: vals.length < 40,
          symbolSize: 5,
          lineStyle: { width: 2.4, color: dist.color },
          itemStyle: { color: dist.color },
          areaStyle: { color: `${dist.color}1f` },
        },
      ],
    } as Opt;
  }, [history, dist]);
  return <Chart option={option} height={300} label={`Évolution de la prédiction ${dist.label}`} />;
}

/* ---------- Simulateur trail ---------- */
interface SimState {
  km: number;
  dplus: number;
  coef: number;
}
const DEFAULT_SIM: SimState = { km: 21, dplus: 800, coef: 1 };
const PRESETS: { label: string; km: number; dplus: number }[] = [
  { label: "10 km · 300 m", km: 10, dplus: 300 },
  { label: "Semi trail · 800 m", km: 21, dplus: 800 },
  { label: "30 km · 1 500 m", km: 30, dplus: 1500 },
  { label: "42 km · 2 000 m", km: 42, dplus: 2000 },
];
const SCENARIOS: { label: string; hint: string; factor: number }[] = [
  { label: "Prudent", hint: "Dénivelé pénalisant, terrain technique", factor: 1.3 },
  { label: "Cible", hint: "Ton coefficient", factor: 1 },
  { label: "Ambitieux", hint: "Bonne forme, terrain roulant", factor: 0.75 },
];

function Slider({ id, label, value, min, max, step, unit, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px] font-medium">
          {label}
        </label>
        <span className="text-[15px] font-semibold tracking-tight">
          {nf(value, step < 1 ? 1 : 0)} <span className="text-muted-foreground text-[13px] font-medium">{unit}</span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range"
        style={{ ["--pct" as string]: `${pct}%` }}
      />
    </div>
  );
}

function Simulator({ latest }: { latest: PredictionDay }) {
  const [sim, setSim] = useState<SimState>(() => {
    try {
      const raw = localStorage.getItem("gd.sim");
      return raw ? { ...DEFAULT_SIM, ...JSON.parse(raw) } : DEFAULT_SIM;
    } catch {
      return DEFAULT_SIM;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("gd.sim", JSON.stringify(sim));
    } catch {
      /* stockage indisponible */
    }
  }, [sim]);
  const set = (p: Partial<SimState>) => setSim((s) => ({ ...s, ...p }));

  const calc = (coef: number) => {
    const effort = sim.km + (sim.dplus / 100) * coef;
    const t = flatTime(effort, latest);
    const flat = flatTime(sim.km, latest);
    return t == null || flat == null ? null : { effort, time: t, pace: t / sim.km, flat };
  };
  const main = calc(sim.coef);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mountain className="size-4 text-[#FF9F0A]" />
          Simulateur trail
        </CardTitle>
        <CardDescription>Estime ton temps à partir de tes prédictions Garmin sur plat. Chaque 100 m de D+ ajoute l'équivalent de {nf(sim.coef, 1)} km d'effort.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
        <div className="grid gap-5">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button key={p.label} variant={sim.km === p.km && sim.dplus === p.dplus ? "default" : "secondary"} size="sm" onClick={() => set({ km: p.km, dplus: p.dplus })}>
                {p.label}
              </Button>
            ))}
          </div>
          <Slider id="sim-km" label="Distance" value={sim.km} min={3} max={80} step={0.5} unit="km" onChange={(km) => set({ km })} />
          <Slider id="sim-dplus" label="Dénivelé positif" value={sim.dplus} min={0} max={4000} step={50} unit="m" onChange={(dplus) => set({ dplus })} />
          <Slider id="sim-coef" label="Coefficient de dénivelé" value={sim.coef} min={0.4} max={2.5} step={0.1} unit="km / 100 m" onChange={(coef) => set({ coef: Math.round(coef * 10) / 10 })} />
          <Button variant="ghost" size="sm" className="w-fit" onClick={() => setSim(DEFAULT_SIM)}>
            <RotateCcw /> Réinitialiser
          </Button>
        </div>

        <div className="grid content-start gap-4">
          {main ? (
            <>
              <div className="rounded-2xl bg-foreground/[0.04] p-5">
                <p className="text-muted-foreground text-[13px]">Temps cible estimé</p>
                <p className="mt-1 text-[48px] leading-[52px] font-semibold tracking-tight" aria-live="polite">
                  {fmtClock(main.time)}
                </p>
                <p className="text-muted-foreground mt-2 text-[13px]">
                  Allure moyenne {fmtPaceSec(main.pace)} /km · {nf(main.effort, 1)} km d'effort · {fmtClock(Math.max(0, main.time - main.flat))} de plus que sur plat ({fmtClock(main.flat)})
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {SCENARIOS.map((s) => {
                  const r = calc(sim.coef * s.factor);
                  return (
                    <div key={s.label} className="rounded-2xl bg-foreground/[0.04] px-3 py-3" title={s.hint}>
                      <p className="text-muted-foreground text-xs">{s.label}</p>
                      <p className="mt-0.5 text-lg font-semibold tracking-tight">{r ? fmtClock(r.time) : "—"}</p>
                      <p className="text-muted-foreground text-[11px]">{r ? `${fmtPaceSec(r.pace)} /km` : ""}</p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Il faut au moins deux prédictions Garmin pour estimer un temps.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Predictions() {
  const pred = useQuery("pred:365", () => api.predictions(365));
  const [sel, setSel] = useState<Key>("half");
  const latest = pred.data?.latest;
  const dist = DISTS.find((d) => d.key === sel)!;
  const history = pred.data?.history ?? [];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-[34px] leading-10 font-bold tracking-tight">Prédictions & trail</h1>
        <p className="text-muted-foreground mt-1 text-[15px]">Les chronos estimés par Garmin et un simulateur pour tes sorties vallonnées.</p>
      </div>

      {pred.error && !pred.data && <QueryError error={pred.error} onRetry={pred.reload} />}

      {pred.loading && !pred.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[112px] rounded-2xl" />
          ))}
        </div>
      ) : !latest ? (
        <Card>
          <EmptyState title="Pas encore de prédiction" description="Garmin calcule ses prédictions après quelques sorties de course. Lance une synchronisation pour les récupérer." />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Distance affichée dans le graphique">
            {DISTS.map((d) => {
              const on = d.key === sel;
              const delta = pred.data?.delta_s_since_first?.[d.key];
              const t = latest[d.field] as number | null;
              return (
                <button
                  key={d.key}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSel(d.key)}
                  className="rounded-2xl text-left outline-none transition-transform duration-150 ease-out focus-visible:ring-[3px] focus-visible:ring-ring/60 active:scale-[0.98]"
                >
                  <Card className="h-full gap-1 px-5 py-4 transition-[box-shadow,background-color] duration-200" style={on ? { boxShadow: `inset 0 0 0 2px ${d.color}`, background: "var(--accent)" } : undefined}>
                    <p className="text-[13px] font-semibold" style={{ color: d.color }}>
                      {d.label}
                    </p>
                    <p className="text-[32px] leading-9 font-semibold tracking-tight">{fmtClock(t)}</p>
                    <div className="text-muted-foreground flex items-center gap-2 text-[13px]">
                      {t ? `${fmtPaceSec(t / d.km)} /km` : "—"}
                      <Delta value={delta} goodWhen="down" text={fmtDeltaClock(delta)} />
                    </div>
                  </Card>
                </button>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Évolution · {dist.label}</CardTitle>
              <CardDescription>Plus la courbe monte, plus tu es rapide. Mise à jour Garmin du {shortDay(latest.date)}</CardDescription>
            </CardHeader>
            <CardContent>
              {history.filter((h) => h[dist.field] != null).length < 2 ? (
                <p className="text-muted-foreground py-10 text-center text-sm">L'historique se construit au fil des synchronisations.</p>
              ) : (
                <EvolutionChart history={history} dist={dist} />
              )}
            </CardContent>
          </Card>

          <Simulator latest={latest} />
        </>
      )}
    </div>
  );
}
