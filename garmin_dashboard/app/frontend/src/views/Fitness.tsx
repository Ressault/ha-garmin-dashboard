import { useMemo } from "react";

import { GarminScores } from "@/components/GarminScoresCard";
import { ThresholdsCard } from "@/components/ThresholdsCard";
import { Chart, Delta, EmptyState, QueryError, StatusPill } from "@/components/common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/hooks/useQuery";
import { api, type FitnessDay } from "@/lib/api";
import { useFilters } from "@/lib/filters";
import { acwrInfo, fmtHM, hrvStatus, nf, readinessInfo, shortDay, signed, trainingStatus, tsbInfo } from "@/lib/format";
import { axisPointerLine, axisText, tipRow, tipTitle, tooltipBase, type Opt } from "@/lib/echarts";
import { C } from "@/lib/palette";

const valuesOf = (s: FitnessDay[], k: keyof FitnessDay) => s.map((d) => (typeof d[k] === "number" ? (d[k] as number) : null));

function baseAxes(dates: string[], showX: boolean) {
  return {
    xAxis: {
      type: "category",
      data: dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: C.grid } },
      axisTick: { show: false },
      axisLabel: { ...axisText, show: showX, formatter: (v: string) => shortDay(v), hideOverlap: true },
      axisPointer: axisPointerLine,
    },
    yAxis: {
      type: "value",
      scale: true,
      splitNumber: 3,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: axisText,
      splitLine: { lineStyle: { color: C.grid } },
    },
  };
}

const tooltipFor = (dates: string[], rows: { name: string; color: string; unit?: string; digits?: number }[]) => ({
  ...tooltipBase,
  trigger: "axis",
  axisPointer: { type: "line", lineStyle: { color: C.pointer } },
  formatter: (ps: { dataIndex: number; seriesName: string; value: unknown; color?: string }[]) => {
    let html = tipTitle(shortDay(dates[ps[0]?.dataIndex ?? 0]));
    for (const p of ps) {
      const r = rows.find((x) => x.name === p.seriesName);
      if (!r || p.value == null) continue;
      const v = Array.isArray(p.value) ? p.value[1] : p.value;
      if (v == null) continue;
      html += tipRow(r.color, r.name, `${nf(v as number, r.digits ?? 0)}${r.unit ? ` ${r.unit}` : ""}`);
    }
    return html;
  },
});

const line = (name: string, color: string, data: (number | null)[], extra: Opt = {}) => ({
  name,
  type: "line",
  data,
  showSymbol: false,
  smooth: 0.25,
  connectNulls: true,
  lineStyle: { width: 2.2, color },
  itemStyle: { color },
  ...extra,
});

/* ---------- Charge : CTL / ATL + TSB ---------- */
function LoadChart({ series }: { series: FitnessDay[] }) {
  const option = useMemo<Opt>(() => {
    const dates = series.map((d) => d.date);
    const b = baseAxes(dates, false);
    const b2 = baseAxes(dates, true);
    return {
      animation: false,
      legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, icon: "circle", textStyle: { color: C.label2, fontSize: 12 }, selectedMode: true },
      grid: [
        { left: 44, right: 16, top: 30, height: "46%" },
        { left: 44, right: 16, top: "64%", height: "18%" },
      ],
      xAxis: [{ ...b.xAxis, gridIndex: 0 }, { ...b2.xAxis, gridIndex: 1 }],
      yAxis: [{ ...b.yAxis, gridIndex: 0 }, { ...b2.yAxis, gridIndex: 1 }],
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      tooltip: tooltipFor(dates, [
        { name: "Forme (CTL)", color: C.blue },
        { name: "Fatigue (ATL)", color: C.pink },
        { name: "Fraîcheur (TSB)", color: C.green, digits: 0 },
      ]),
      dataZoom: [
        { type: "inside", xAxisIndex: [0, 1], filterMode: "none" },
        { type: "slider", xAxisIndex: [0, 1], height: 22, bottom: 6, borderColor: "transparent", backgroundColor: C.faint, fillerColor: "rgba(10,132,255,0.22)", handleSize: 18, textStyle: { color: C.label2 }, dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } }, labelFormatter: (_: number, s: string) => shortDay(s) },
      ],
      series: [
        line("Forme (CTL)", C.blue, valuesOf(series, "ctl"), { xAxisIndex: 0, yAxisIndex: 0, areaStyle: { color: "rgba(10,132,255,0.10)" } }),
        line("Fatigue (ATL)", C.pink, valuesOf(series, "atl"), { xAxisIndex: 0, yAxisIndex: 0 }),
        line("Fraîcheur (TSB)", C.green, valuesOf(series, "tsb"), {
          xAxisIndex: 1,
          yAxisIndex: 1,
          lineStyle: { width: 2, color: C.green },
          areaStyle: { color: "rgba(48,209,88,0.12)" },
          markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: C.ghost, type: "dashed" }, data: [{ yAxis: 0 }] },
          markArea: {
            silent: true,
            itemStyle: { opacity: 1 },
            data: [
              [{ yAxis: -30, itemStyle: { color: "rgba(255,69,58,0.10)" } }, { yAxis: -300 }],
              [{ yAxis: 5, itemStyle: { color: "rgba(100,210,255,0.08)" } }, { yAxis: 25 }],
            ],
          },
        }),
      ],
    } as Opt;
  }, [series]);
  return <Chart option={option} height={400} group="load" label="Forme, fatigue et fraîcheur au fil du temps" />;
}

/* ---------- Récupération ---------- */
function MiniChart({ title, sub, series, build, height = 190 }: { title: string; sub: string; series: FitnessDay[]; build: (dates: string[]) => Opt; height?: number }) {
  const option = useMemo(() => build(series.map((d) => d.date)), [series, build]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{sub}</CardDescription>
      </CardHeader>
      <CardContent>
        <Chart option={option} height={height} group="recovery" label={title} />
      </CardContent>
    </Card>
  );
}

function RecoveryCharts({ series }: { series: FitnessDay[] }) {
  const common = (dates: string[]) => {
    const b = baseAxes(dates, true);
    return {
      animation: false,
      grid: { left: 40, right: 12, top: 14, bottom: 24 },
      xAxis: b.xAxis,
      yAxis: b.yAxis,
      dataZoom: [{ type: "inside", filterMode: "none" }],
    };
  };
  const hrv = useMemo(() => (dates: string[]): Opt => ({
    ...common(dates),
    legend: { show: false },
    tooltip: tooltipFor(dates, [{ name: "VFC", color: C.violet, unit: "ms" }, { name: "Moyenne 7 j", color: C.gray, unit: "ms" }]),
    series: [
      line("Moyenne 7 j", C.gray, valuesOf(series, "hrv_weekly_avg_ms"), { lineStyle: { width: 1.6, color: C.gray, type: "dashed" } }),
      line("VFC", C.violet, valuesOf(series, "hrv_last_night_ms"), { showSymbol: true, symbolSize: 4, areaStyle: { color: "rgba(191,90,242,0.10)" } }),
    ],
  } as Opt), [series]); // eslint-disable-line react-hooks/exhaustive-deps
  const sleep = useMemo(() => (dates: string[]): Opt => ({
    ...common(dates),
    yAxis: { ...baseAxes(dates, true).yAxis, min: 40, max: 100 },
    tooltip: tooltipFor(dates, [{ name: "Score de sommeil", color: C.cyan }]),
    series: [
      {
        name: "Score de sommeil",
        type: "bar",
        barMaxWidth: 10,
        data: valuesOf(series, "sleep_score").map((v) => ({ value: v, itemStyle: { color: v == null ? C.gray : v >= 80 ? C.cyan : v >= 60 ? C.blue : C.orange, borderRadius: [4, 4, 0, 0] } })),
      },
    ],
  } as Opt), [series]); // eslint-disable-line react-hooks/exhaustive-deps
  const bb = useMemo(() => (dates: string[]): Opt => ({
    ...common(dates),
    yAxis: { ...baseAxes(dates, true).yAxis, min: 0, max: 100 },
    tooltip: tooltipFor(dates, [{ name: "Maximum", color: C.green }, { name: "Minimum", color: C.orange }]),
    series: [
      line("Maximum", C.green, valuesOf(series, "body_battery_max"), { areaStyle: { color: "rgba(48,209,88,0.10)" } }),
      line("Minimum", C.orange, valuesOf(series, "body_battery_min")),
    ],
  } as Opt), [series]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = useMemo(() => (dates: string[]): Opt => ({
    ...common(dates),
    yAxis: { ...baseAxes(dates, true).yAxis, min: 0, max: 100 },
    tooltip: tooltipFor(dates, [{ name: "Préparation", color: C.blue }]),
    series: [line("Préparation", C.blue, valuesOf(series, "readiness_score"), { showSymbol: true, symbolSize: 4, areaStyle: { color: "rgba(10,132,255,0.10)" } })],
  } as Opt), [series]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <MiniChart title="VFC nocturne" sub="Variabilité de la fréquence cardiaque, comparée à la moyenne sur 7 jours" series={series} build={hrv} />
      <MiniChart title="Score de sommeil" sub="Qualité de la nuit, sur 100" series={series} build={sleep} />
      <MiniChart title="Body Battery" sub="Niveau maximal et minimal de la journée" series={series} build={bb} />
      <MiniChart title="Préparation à l'entraînement" sub="Score Garmin, sur 100" series={series} build={ready} />
    </div>
  );
}

function Kpi({ label, value, unit, sub, color }: { label: string; value: string; unit?: string; sub?: React.ReactNode; color?: string }) {
  return (
    <Card className="gap-1 px-5 py-4">
      <p className="text-muted-foreground text-[13px]">{label}</p>
      <p className="flex items-baseline gap-1.5 tracking-tight">
        <span className="text-[34px] leading-9 font-semibold" style={color ? { color } : undefined}>
          {value}
        </span>
        {unit && <span className="text-muted-foreground text-sm font-medium">{unit}</span>}
      </p>
      <div className="text-muted-foreground min-h-5 text-[13px]">{sub}</div>
    </Card>
  );
}

export default function Fitness() {
  const { period } = useFilters();
  const days = period === 365 ? 365 : 90;
  const fit = useQuery(`fitness:${days}`, () => api.fitness(days));
  const series = fit.data?.series ?? [];
  const latest = fit.data?.latest;
  const tsb = tsbInfo(latest?.tsb);
  const acwr = acwrInfo(latest?.acwr_status);
  const status = trainingStatus(latest?.training_status);
  const hrv = hrvStatus(latest?.hrv_status);
  const ready = readinessInfo(latest?.readiness_score);
  const delta7 = (key: "ctl" | "atl") => {
    const cur = latest?.[key];
    const prev = series[series.length - 8]?.[key];
    return cur != null && prev != null ? cur - prev : null;
  };
  const hasRecovery = series.some((d) => d.hrv_last_night_ms != null || d.sleep_score != null || d.body_battery_max != null || d.readiness_score != null);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-[34px] leading-10 font-bold tracking-tight">Forme, fatigue & santé</h1>
        <p className="text-muted-foreground mt-1 text-[15px]">Charge d'entraînement et récupération sur {days === 365 ? "1 an" : "90 jours"}.</p>
      </div>

      {fit.error && !fit.data && <QueryError error={fit.error} onRetry={fit.reload} />}

      {fit.loading && !fit.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-2xl" />
          ))}
        </div>
      ) : series.length === 0 ? (
        <Card>
          <EmptyState title="Pas encore de données de forme" description="Lance une synchronisation pour calculer ta charge d'entraînement." />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Forme (CTL)" value={nf(latest?.ctl)} sub={<Delta value={delta7("ctl")} text={`${signed(delta7("ctl"), 1)} en 7 j`} />} color={C.blue} />
            <Kpi label="Fatigue (ATL)" value={nf(latest?.atl)} sub={<Delta value={delta7("atl")} goodWhen="down" text={`${signed(delta7("atl"), 1)} en 7 j`} />} color={C.pink} />
            <Kpi label="Fraîcheur (TSB)" value={signed(latest?.tsb)} sub={tsb && <StatusPill color={tsb.color}>{tsb.label}</StatusPill>} color={tsb?.color} />
            <Kpi
              label="Statut Garmin"
              value={status?.label ?? "—"}
              sub={
                <span className="flex flex-wrap items-center gap-1.5">
                  {acwr && <StatusPill color={acwr.color}>{acwr.label}</StatusPill>}
                  {latest?.recovery_time_h != null && <span>Récup. {fmtHM(latest.recovery_time_h * 3600)}</span>}
                </span>
              }
              color={status?.color}
            />
          </div>

          <GarminScores series={series} latest={latest} bbTimeline={fit.data?.bb_timeline} />

          <ThresholdsCard />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Forme, fatigue et fraîcheur</CardTitle>
              <CardDescription>{tsb?.hint ?? "Fraîcheur = forme − fatigue. Fais glisser la barre du bas pour zoomer."}</CardDescription>
            </CardHeader>
            <CardContent>
              <LoadChart series={series} />
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Récupération</h2>
            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[13px]">
              {hrv && <StatusPill color={hrv.color}>VFC {hrv.label.toLowerCase()}</StatusPill>}
              {ready && <StatusPill color={ready.color}>Préparation {ready.label.toLowerCase()}</StatusPill>}
            </div>
          </div>
          {hasRecovery ? (
            <RecoveryCharts series={series} />
          ) : (
            <Card>
              <EmptyState title="Pas de données de récupération" description="La VFC, le sommeil et le Body Battery apparaîtront après une synchronisation avec ta montre." />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
