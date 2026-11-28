import { useMemo } from "react";
import { Sparkles } from "lucide-react";

import { Chart } from "@/components/common";
import { FoldCard } from "@/components/FoldCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@/hooks/useQuery";
import { api, type ActivityDetail, type Segment } from "@/lib/api";
import { axisPointerLine, axisText, tipRow, tipTitle, tooltipBase, type Opt } from "@/lib/echarts";
import { fmtPaceSec, nf } from "@/lib/format";
import { altInsight, avgOf, cadInsight, context, hrInsight, kmRows, maxOf, minOf, normalizedPower, paceInsight, pwrInsight, secToIndex, segmentsInsight, type KmRow } from "@/lib/insights";
import { C } from "@/lib/palette";
import { clipToAxis, niceAxis, paceRange, range90, smooth, type Prepared } from "@/lib/series";

const MAX_POINTS = 500;
const GHOST = "rgba(142,142,147,0.22)";

/* ---------- Encart de résumé (façon « Athlete Intelligence ») ---------- */
export function Insight({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <div className="border-foreground/12 mt-4 rounded-2xl border p-4">
      <p className="text-muted-foreground flex items-center gap-1.5 text-[13px] font-semibold [&_svg]:size-4 [&_svg]:text-primary">
        <Sparkles /> Bilan automatique
      </p>
      <p className="mt-2 text-[17px] leading-snug">{text}</p>
    </div>
  );
}

function StatRow({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-foreground/[0.08] py-3 first:border-t-0">
      <span className="text-muted-foreground text-[15px]">{label}</span>
      <span className="text-lg font-semibold tabular-nums">
        {value}
        {unit && <span className="text-muted-foreground ml-1 text-sm font-normal">{unit}</span>}
      </span>
    </div>
  );
}

/* ---------- Graphique d'une mesure, profil d'altitude en fond ---------- */
function MetricChart({
  prep,
  title,
  name,
  color,
  values,
  unit,
  group,
  inverse,
  fmt,
  avgLine,
  height = 220,
  ghost = true,
  segments,
  refLine,
}: {
  prep: Prepared;
  title: string;
  name: string;
  color: string;
  values: (number | null)[];
  unit: string;
  group: string;
  inverse?: boolean;
  fmt: (v: number) => string;
  avgLine?: number | null;
  height?: number;
  ghost?: boolean;
  /** phases marche / arrêt détectées par la montre */
  segments?: Segment[] | null;
  /** valeur seuil à tracer (FC seuil, FTP…) */
  refLine?: { value: number; label: string } | null;
}) {
  const option = useMemo<Opt>(() => {
    const step = Math.max(1, Math.ceil(prep.n / MAX_POINTS));
    const idx: number[] = [];
    for (let i = 0; i < prep.n; i += step) idx.push(i);
    const km = prep.xKind === "km";
    const x = idx.map((i) => +prep.x[i].toFixed(3));
    const alt = smooth(prep.alt, 2);
    let r0 = inverse ? paceRange(values) : range90(values);
    if (r0 && refLine) r0 = [Math.min(r0[0], refLine.value), Math.max(r0[1], refLine.value)];
    const ax = r0 ? niceAxis(r0, { pad: 0.15, pace: !!inverse }) : null;
    // pendant un arrêt détecté par la montre, l'allure n'a pas de sens : la courbe s'interrompt (la bande grise le montre)
    const stopped = new Uint8Array(prep.n);
    if (inverse) for (const sg of segments ?? []) {
      if (sg.type === "run" || sg.type === "walk" || sg.dur_s == null) continue;
      const i0 = secToIndex(prep.time, sg.start_s), i1 = secToIndex(prep.time, sg.start_s + sg.dur_s);
      for (let i = Math.max(0, i0 - 2); i <= Math.min(prep.n - 1, i1 + 2); i++) stopped[i] = 1;
    }
    const y = idx.map((i) => (stopped[i] ? null : ax ? clipToAxis([values[i]], ax)[0] : values[i]));
    const a = idx.map((i) => alt[i]);
    const hasAlt = ghost && a.some((v) => v != null);

    const yr = ax ? { min: ax.min, max: ax.max, interval: ax.interval } : {};

    // Bandes marche / arrêt (largeur minimale pour rester visibles sur une longue sortie)
    const xmax = x[x.length - 1] ?? 1;
    const minW = xmax * 0.008;
    const areas: Opt[][] = [];
    for (const sg of segments ?? []) {
      if (sg.type === "run" || sg.dur_s == null) continue;
      const i0 = secToIndex(prep.time, sg.start_s);
      const i1 = secToIndex(prep.time, sg.start_s + sg.dur_s);
      let x0 = prep.x[i0];
      let x1 = prep.x[i1];
      if (x1 - x0 < minW) {
        const mid = (x0 + x1) / 2;
        x0 = mid - minW / 2;
        x1 = mid + minW / 2;
      }
      const color = sg.type === "walk" ? "rgba(255,159,10,0.45)" : "rgba(142,142,147,0.55)";
      areas.push([{ xAxis: x0, itemStyle: { color } }, { xAxis: x1 }]);
    }

    const series: Opt[] = [];
    if (hasAlt) {
      series.push({
        type: "line",
        name: "Altitude",
        xAxisIndex: 0,
        yAxisIndex: 1,
        showSymbol: false,
        silent: true,
        animation: false,
        z: 1,
        data: x.map((xv, k) => [xv, a[k]]),
        lineStyle: { width: 0 },
        areaStyle: { color: GHOST },
      });
    }
    series.push({
      type: "line",
      name,
      xAxisIndex: 0,
      yAxisIndex: 0,
      showSymbol: false,
      animation: false,
      sampling: "lttb",
      smooth: 0.3,
      smoothMonotone: "x",
      connectNulls: false,
      z: 3,
      data: x.map((xv, k) => [xv, y[k]]),
      lineStyle: { width: 2, color },
      areaStyle: {
        origin: inverse ? "end" : "start",
        color: { type: "linear", x: 0, y: inverse ? 1 : 0, x2: 0, y2: inverse ? 0 : 1, colorStops: [{ offset: 0, color }, { offset: 1, color: "transparent" }] },
        opacity: 0.32,
      },
      ...(avgLine || refLine
        ? {
            markLine: {
              silent: true,
              symbol: "none",
              label: { show: false },
              lineStyle: { type: "dashed", color: C.label, width: 1.2, opacity: 0.85 },
              data: [
                ...(avgLine ? [{ yAxis: avgLine }] : []),
                ...(refLine
                  ? [{ yAxis: refLine.value, lineStyle: { type: "dashed", color: C.orange, width: 1.4, opacity: 1 }, label: { show: true, formatter: refLine.label, position: "insideEndTop", color: C.orange, fontSize: 11 } }]
                  : []),
              ],
            },
          }
        : {}),
      ...(areas.length ? { markArea: { silent: true, data: areas } } : {}),
    });

    return {
      animation: false,
      grid: { left: 46, right: 12, top: 10, bottom: 26 },
      xAxis: {
        type: "value",
        min: 0,
        max: +(x[x.length - 1] ?? 1).toFixed(2),
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: C.grid } },
        axisLabel: { ...axisText, formatter: (v: number) => `${nf(v)}${km ? " km" : " min"}` },
        axisPointer: { show: true, ...axisPointerLine },
      },
      yAxis: [
        {
          type: "value",
          inverse: !!inverse,
          scale: true,
          ...yr,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { ...axisText, formatter: (v: number) => fmt(v) },
          splitLine: { lineStyle: { color: C.grid } },
        },
        { type: "value", scale: true, show: false, splitLine: { show: false }, min: (v: { min: number; max: number }) => v.min - (v.max - v.min) * 1.6, max: (v: { max: number }) => v.max },
      ],
      series,
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: C.pointer } },
        formatter: (params: { dataIndex: number }[]) => {
          const k = params[0]?.dataIndex ?? 0;
          let html = tipTitle(km ? `${nf(x[k], 2)} km` : `${nf(x[k], 1)} min`);
          if (y[k] != null) html += tipRow(color, name, `${fmt(y[k] as number)} ${unit}`);
          if (hasAlt && a[k] != null) html += tipRow(C.gray, "Altitude", `${nf(a[k])} m`);
          return html;
        },
      },
    } as Opt;
  }, [prep, values, name, color, unit, inverse, fmt, avgLine, ghost, segments, refLine]);

  const hasGhost = ghost && prep.alt.some((v) => v != null);
  return (
    <>
      <Chart option={option} height={height} group={group} label={`${title} au fil de la sortie${avgLine ? `, moyenne ${fmt(avgLine)} ${unit}` : ""}${refLine ? `, repère ${refLine.label}` : ""}`} />
      {(avgLine || hasGhost) && (
        <p className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          {avgLine ? <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-current" /> moyenne</span> : null}
          {hasGhost ? <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-4 rounded-sm" style={{ background: GHOST }} /> relief du parcours (sans échelle)</span> : null}
        </p>
      )}
    </>
  );
}

function Section({ title, children, fold }: { title: string; children: React.ReactNode; fold?: boolean }) {
  if (fold) return <FoldCard title={title}>{children}</FoldCard>;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/* ---------- Tableau des kilomètres ---------- */
function KmTable({ rows, foot }: { rows: KmRow[]; foot: boolean }) {
  const sp = rows.map((r) => r.spd);
  const lo = Math.min(...sp);
  const hi = Math.max(...sp);
  const best = Math.max(...sp);
  const width = (s: number) => (hi > lo ? 0.3 + 0.7 * ((s - lo) / (hi - lo)) : 0.7);
  return (
    <div>
      <div className="text-muted-foreground grid grid-cols-[2rem_3.2rem_1fr_3rem_3rem] items-center gap-x-3 border-b border-foreground/[0.08] pb-2 text-[13px] sm:grid-cols-[2.5rem_4rem_1fr_4rem_4rem]">
        <span>Km</span>
        <span>{foot ? "Allure" : "Vitesse"}</span>
        <span />
        <span className="text-right">Élév.</span>
        <span className="text-right">FC</span>
      </div>
      {rows.map((r) => {
        const partial = r.dist_m < 950;
        return (
          <div key={r.km} className="grid grid-cols-[2rem_3.2rem_1fr_3rem_3rem] items-center gap-x-3 py-1.5 text-[15px] tabular-nums sm:grid-cols-[2.5rem_4rem_1fr_4rem_4rem]">
            <span>{partial ? nf(r.dist_m / 1000, 1) : r.km}</span>
            <span>{foot ? fmtPaceSec(r.pace) : nf(r.spd * 3.6, 1)}</span>
            <span className="h-[22px]">
              <span className={`block h-full rounded-md ${r.spd === best ? "bg-[var(--sys-blue)]" : "bg-[var(--sys-blue)]/70"}`} style={{ width: `${width(r.spd) * 100}%` }} />
            </span>
            <span className="text-muted-foreground text-right">{r.elev != null ? (Math.abs(r.elev) < 0.5 ? "0" : nf(r.elev)) : "—"}</span>
            <span className="text-right">{r.hr ? nf(r.hr) : "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Effort relatif ---------- */
function RelativeEffort({ value, ratio, text }: { value: number; ratio: number | null; text: string }) {
  // 0 = bien plus léger … 1 = bien plus intense ; 1× ta moyenne de 3 semaines = au centre
  const pos = ratio == null ? null : Math.max(0.03, Math.min(0.97, 0.5 + (ratio - 1) * 0.5));
  const zone = pos == null ? -1 : pos < 2 / 5.5 ? 0 : pos <= 3.5 / 5.5 ? 1 : 2;
  const zones = [
    { label: "Plus léger", c: "color-mix(in srgb, var(--sys-purple) 35%, transparent)" },
    { label: "Ta moyenne", c: "color-mix(in srgb, var(--sys-purple) 70%, transparent)" },
    { label: "Plus intense", c: "var(--sys-pink)" },
  ];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between gap-4">
          <CardTitle className="text-base">Effort relatif</CardTitle>
          <span className="text-[28px] leading-none font-bold tabular-nums">{nf(value)}</span>
        </div>
        {text && <p className="text-muted-foreground text-[15px]">{text}</p>}
      </CardHeader>
      <CardContent>
        {pos != null ? (
          <div role="img" aria-label={`Effort ${zones[zone].label.toLowerCase()} que tes 3 dernières semaines`}>
            <div className="relative h-2">
              <div className="grid h-full grid-cols-[2fr_1.5fr_2fr] gap-1">
                {zones.map((z) => <span key={z.label} className="rounded-full" style={{ background: z.c }} />)}
              </div>
              <span className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card shadow-[0_1px_4px_rgb(0_0_0/0.25),0_0_0_2px_var(--foreground)]" style={{ left: `${pos * 100}%` }} />
            </div>
            <div className="mt-2 grid grid-cols-[2fr_1.5fr_2fr] gap-1 whitespace-nowrap text-[12px]">
              {zones.map((z, i) => (
                <span key={z.label} className={`${i === 0 ? "text-left" : i === 1 ? "text-center" : "text-right"} ${i === zone ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{z.label}</span>
              ))}
            </div>
            <p className="text-muted-foreground mt-1 text-[12px]">Comparé à tes 3 dernières semaines.</p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Pas assez de sorties récentes pour comparer.</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Panneau complet ---------- */
export function StravaPanels({ a, prep }: { a: ActivityDetail; prep: Prepared | null }) {
  const start = useMemo(() => {
    const d = new Date(a.start_time_local.slice(0, 10));
    d.setDate(d.getDate() - 120);
    return d.toISOString().slice(0, 10);
  }, [a.start_time_local]);
  const hist = useQuery(`history:${start}`, () => api.activities({ start, limit: 500 }));
  const ctx = useMemo(() => context(a, hist.data?.items ?? []), [a, hist.data]);
  const th = useQuery("thresholds", () => api.thresholds()).data;
  const t = th?.available ? th : null;
  const g = `act-${a.activity_id}`;
  const segs = a.segments ?? null;

  if (!prep) return null;
  const foot = prep.foot;
  const rows = kmRows(prep);

  const paceVals = smooth(prep.pace, 4);
  const spdVals = smooth(prep.spd, 4);
  const hrVals = smooth(prep.hr, 2);
  const cadVals = smooth(prep.cad, 3);
  const pwrVals = smooth(prep.pwr, 4);
  const avgPace = a.avg_speed_ms ? 1000 / a.avg_speed_ms : avgOf(prep.pace);

  const hasHr = hrVals.some((v) => v != null);
  const hasCad = foot && prep.cad.filter((v) => v != null).length > 30;
  const hasPwr = prep.pwr.filter((v) => v != null).length > 60;
  const hasAlt = prep.alt.some((v) => v != null);

  const avgCad = avgOf(prep.cad);
  const avgPwr = a.avg_power_w ?? avgOf(prep.pwr);
  const np = hasPwr ? normalizedPower(prep) : null;
  const kj = avgPwr && a.duration_s ? (avgPwr * a.duration_s) / 1000 : null;

  return (
    <>
      {ctx.headline && (
        <Card>
          <CardContent className="pt-0">
            <p className="text-muted-foreground flex items-center gap-1.5 text-[13px] font-semibold [&_svg]:size-4 [&_svg]:text-primary">
              <Sparkles /> Bilan automatique
            </p>
            <p className="mt-2 text-[19px] leading-snug font-medium">{ctx.headline}</p>
          </CardContent>
        </Card>
      )}

      {ctx.effort && <RelativeEffort value={ctx.effort.value} ratio={ctx.effort.ratio} text={ctx.effort.text} />}

      {rows.length > 0 && (
        <Section title={foot ? "Allure par kilomètre" : "Vitesse par kilomètre"}>
          <KmTable rows={rows} foot={foot} />
        </Section>
      )}

      <Section title={foot ? "Allure" : "Vitesse"}>
        <MetricChart
          prep={prep}
          title={foot ? "Allure" : "Vitesse"}
          name={foot ? "Allure" : "Vitesse"}
          color={C.blue}
          values={foot ? paceVals : spdVals.map((v) => (v == null ? null : v * 3.6))}
          unit={foot ? "/km" : "km/h"}
          group={g}
          inverse={foot}
          fmt={foot ? (v) => fmtPaceSec(v) : (v) => nf(v)}
          avgLine={foot ? avgPace : a.avg_speed_ms ? a.avg_speed_ms * 3.6 : null}
          segments={segs}
          refLine={foot && t?.lt_speed_ms ? { value: 1000 / t.lt_speed_ms, label: `Seuil ${fmtPaceSec(1000 / t.lt_speed_ms)}` } : null}
        />
        {segs && segs.some((x) => x.type !== "run") && (
          <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: "rgba(255,159,10,0.6)" }} /> Marche</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: "rgba(142,142,147,0.7)" }} /> Arrêt</span>
            <span>détectés par ta montre</span>
          </p>
        )}
        <Insight text={[paceInsight(rows, foot, t), segmentsInsight(segs)].filter(Boolean).join(" ") || null} />
      </Section>

      {hasHr && (
        <Section title="Fréquence cardiaque">
          <MetricChart prep={prep} title="Fréquence cardiaque" name="FC" color="var(--sys-red)" values={hrVals} unit="BPM" group={g} fmt={(v) => nf(v)} avgLine={a.avg_hr} segments={segs} refLine={t?.lthr_bpm ? { value: t.lthr_bpm, label: `Seuil ${nf(t.lthr_bpm)}` } : null} />
          <div className="mt-2">
            <StatRow label="Fréquence cardiaque moyenne" value={nf(a.avg_hr ?? avgOf(prep.hr))} unit="BPM" />
            <StatRow label="Fréquence cardiaque maximum" value={nf(a.max_hr ?? maxOf(prep.hr))} unit="BPM" />
          </div>
          <Insight text={hrInsight(a, prep, t)} />
        </Section>
      )}

      {hasCad && (
        <Section title="Cadence">
          <MetricChart prep={prep} title="Cadence" name="Cadence" color={C.pink} values={cadVals} unit="ppm" group={g} fmt={(v) => nf(v)} avgLine={avgCad} segments={segs} />
          <div className="mt-2">
            <StatRow label="Cadence moy." value={nf(avgCad)} unit="ppm" />
            <StatRow label="Cadence max." value={nf(maxOf(prep.cad))} unit="ppm" />
          </div>
          <Insight text={cadInsight(prep)} />
        </Section>
      )}

      {hasPwr && (
        <Section title="Puissance" fold>
          <MetricChart prep={prep} title="Puissance" name="Puissance" color={C.violet} values={pwrVals} unit="W" group={g} fmt={(v) => nf(v)} avgLine={avgPwr} segments={segs} refLine={t?.run_ftp_w && foot ? { value: t.run_ftp_w, label: `Seuil ${nf(t.run_ftp_w)} W` } : null} />
          <div className="mt-2">
            <StatRow label="Puissance moy." value={nf(avgPwr)} unit="W" />
            {kj != null && <StatRow label="Effort total" value={nf(kj)} unit="kJ" />}
            <StatRow label="Puissance max." value={nf(a.max_power_w ?? maxOf(prep.pwr))} unit="W" />
            {np != null && <StatRow label="Puissance moy. pondérée" value={nf(np)} unit="W" />}
            {np != null && t?.run_ftp_w && foot ? <StatRow label="Intensité (puissance pondérée ÷ seuil)" value={`${nf((np / t.run_ftp_w) * 100)}`} unit="%" /> : null}
            {a.training_load ? <StatRow label="Charge d'entraînement" value={nf(a.training_load)} /> : null}
          </div>
          <Insight text={pwrInsight(prep, avgPwr, foot ? t : null)} />
        </Section>
      )}

      {hasAlt && (
        <Section title="Altitude">
          <MetricChart prep={prep} title="Altitude" name="Altitude" color="#8E8E93" values={smooth(prep.alt, 2)} unit="m" group={g} fmt={(v) => nf(v)} ghost={false} />
          <div className="mt-2">
            <StatRow label="Dénivelé positif" value={nf(a.elevation_gain_m)} unit="m" />
            {a.elevation_loss_m != null && <StatRow label="Dénivelé négatif" value={nf(a.elevation_loss_m)} unit="m" />}
            <StatRow label="Point haut" value={nf(maxOf(prep.alt))} unit="m" />
            <StatRow label="Point bas" value={nf(minOf(prep.alt))} unit="m" />
          </div>
          <Insight text={altInsight(a, prep)} />
        </Section>
      )}
    </>
  );
}
