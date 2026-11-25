import { useMemo, useState } from "react";
import { Activity, Bike, Footprints, Medal, Mountain, Timer, Trophy } from "lucide-react";
import { SparkAreaChart } from "@tremor/react";

import { Chart, Delta, EmptyState, QueryError, Segmented, StatusPill } from "@/components/common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/hooks/useQuery";
import { api, type EffortsResponse, type PeriodKey, type PeriodResponse, type RecordsResponse, type StatSport } from "@/lib/api";
import { axisPointerLine, axisText, FONT, tipRow, tipTitle, tooltipBase, type Opt } from "@/lib/echarts";
import { dayLabel, fmtClock, fmtHM, fmtPaceSec, nf, shortDay, signed, tsbInfo, ZONE_META } from "@/lib/format";
import { C } from "@/lib/palette";
import { cn } from "@/lib/utils";

type Metric = "secs" | "km" | "dplus";
const METRICS: { value: Metric; label: string }[] = [
  { value: "secs", label: "Temps" },
  { value: "km", label: "Distance" },
  { value: "dplus", label: "Dénivelé" },
];
/** Musculation : ni distance ni dénivelé, seul le temps a un sens. */
const metricsFor = (sport: StatSport) => (sport === "strength" ? METRICS.filter((m) => m.value === "secs") : METRICS);

const SPORT_CHIPS: { value: StatSport; label: string }[] = [
  { value: "all", label: "Tous les sports" },
  { value: "foot", label: "Course à pied (tout)" },
  { value: "run", label: "Course" },
  { value: "trail", label: "Trail" },
  { value: "bikes", label: "Vélo (tout)" },
  { value: "road", label: "Vélo de route" },
  { value: "mtb", label: "VTT" },
  { value: "walk", label: "Marche" },
  { value: "hike", label: "Randonnée" },
  { value: "swim", label: "Natation" },
  { value: "strength", label: "Musculation" },
];
const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const monthLabel = (m: string) => `${MONTHS_FR[Number(m.slice(5)) - 1]}`;
const monthLong = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString("fr-FR", { month: "long" });

const metricValue = (t: { secs: number; km: number; dplus: number }, m: Metric) => (m === "secs" ? t.secs / 3600 : m === "km" ? t.km : t.dplus);
function metricText(t: { secs: number; km: number; dplus: number }, m: Metric): string {
  return m === "secs" ? fmtHM(t.secs) : m === "km" ? `${nf(t.km, 1)} km` : `${nf(t.dplus)} m`;
}
const axisFmt = (m: Metric) => (v: number) => (m === "secs" ? `${nf(v, v < 10 ? 1 : 0)} h` : m === "km" ? `${nf(v)} km` : `${nf(v)} m`);

function baseGrid(cats: string[], m: Metric, labelFmt: (v: string) => string = (v) => v): Opt {
  return {
    animation: false,
    grid: { left: 46, right: 14, top: 14, bottom: 26 },
    xAxis: {
      type: "category",
      data: cats,
      boundaryGap: false,
      axisLine: { lineStyle: { color: C.grid } },
      axisTick: { show: false },
      axisLabel: { ...axisText, formatter: labelFmt, hideOverlap: true },
      axisPointer: axisPointerLine,
    },
    yAxis: {
      type: "value",
      min: 0,
      splitNumber: 3,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisText, formatter: axisFmt(m) },
      splitLine: { lineStyle: { color: C.grid } },
    },
  };
}

function SportChips({ value, onChange }: { value: StatSport; onChange: (v: StatSport) => void }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Sport">
      {SPORT_CHIPS.map((c) => {
        const on = c.value === value;
        return (
          <button
            key={c.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(c.value)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-4 text-[14px] font-medium outline-none transition-[background-color,color,border-color,transform] duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97]",
              on ? "border-transparent bg-foreground text-background" : "text-muted-foreground border-foreground/10 bg-foreground/[0.04] hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Tuile volume façon Strava : métrique, total, évolution, graphique, périodes ---------- */
const PERIOD_BUTTONS: { value: PeriodKey; label: string; vs: string }[] = [
  { value: "7d", label: "7 j", vs: "aux 7 jours précédents" },
  { value: "1m", label: "1 mois", vs: "aux 30 jours précédents" },
  { value: "3m", label: "3 mois", vs: "aux 90 jours précédents" },
  { value: "6m", label: "6 mois", vs: "aux 180 jours précédents" },
  { value: "ytd", label: "À ce jour", vs: "à la même période l'an dernier" },
  { value: "1y", label: "1 an", vs: "aux 365 jours précédents" },
];
const dateFr = (iso: string, year = true) =>
  new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });

/* ---------- Résumé en texte, façon « Vos progrès en un coup d'œil » ---------- */
const SPORT_PHRASE: Record<StatSport, string> = {
  all: "", foot: " en course à pied", run: " en course", trail: " en trail", bikes: " à vélo", road: " à vélo de route",
  mtb: " en VTT", walk: " en marche", hike: " en randonnée", swim: " en natation", strength: " en musculation",
};
const PERIOD_TXT: Record<PeriodKey, { lead: string; before: string; weeks?: number }> = {
  "7d": { lead: "Sur les 7 derniers jours", before: "sur les 7 jours précédents" },
  "1m": { lead: "Sur les 30 derniers jours", before: "sur les 30 jours précédents" },
  "3m": { lead: "Sur les 12 dernières semaines", before: "sur les 12 semaines précédentes", weeks: 12 },
  "6m": { lead: "Sur les 24 dernières semaines", before: "sur les 24 semaines précédentes", weeks: 24 },
  ytd: { lead: "Depuis le 1er janvier", before: "sur la même période l'an dernier" },
  "1y": { lead: "Sur les 52 dernières semaines", before: "sur les 52 semaines précédentes", weeks: 52 },
};
const METRIC_NOUN: Record<Metric, string> = { secs: "ton temps d'activité", km: "ta distance parcourue", dplus: "ton dénivelé positif" };

function buildSummary(d: PeriodResponse, metric: Metric, sport: StatSport): string {
  const sp = SPORT_PHRASE[sport];
  const P = PERIOD_TXT[d.period];
  const noun = METRIC_NOUN[metric];
  const short = d.period === "7d" || d.period === "1m";
  const cur = metricText(d.current, metric);
  const prev = metricText(d.previous, metric);
  const pct = d.delta_pct[metric];

  if (d.current.count === 0) return `${P.lead}, aucune sortie${sp} n'est enregistrée. Dès que tu en ajoutes une, ton résumé apparaît ici.`;

  // 1. Le bilan
  let main: string;
  if (pct == null) {
    main = d.prev_complete
      ? `${P.lead}, ${noun}${sp} atteint ${cur}, alors qu'il n'y avait rien ${P.before}.`
      : `${P.lead}, ${noun}${sp} atteint ${cur}. Ton historique commence le ${dateFr(d.first_date ?? d.from)} : je ne peux pas encore le comparer ${P.before}.`;
  } else {
    const a = Math.round(Math.abs(pct));
    if (a < 3) main = `Stable : ${P.lead.toLowerCase()}, ${noun}${sp} reste autour de ${cur}, contre ${prev} ${P.before}.`;
    else if (pct > 0) main = `${a >= 30 ? "Belle progression" : "Beau travail"} ! ${P.lead}, ${noun}${sp} augmente de ${a} % : ${cur}, contre ${prev} ${P.before}.`;
    else main = `${P.lead}, ${noun}${sp} baisse de ${a} % : ${cur}, contre ${prev} ${P.before}.`;
  }

  // 2. Le détail : sorties, moyenne, point haut
  const n = d.current.count;
  let sessions = `${n} sortie${n > 1 ? "s" : ""}`;
  if (d.prev_complete && d.previous.count > 0) sessions += ` (contre ${d.previous.count})`;
  if (P.weeks) {
    const avg = { secs: d.current.secs / P.weeks, km: d.current.km / P.weeks, dplus: d.current.dplus / P.weeks, count: 0 };
    sessions += `, en moyenne ${metricText(avg, metric)} par semaine`;
  }
  const daily = d.granularity === "day";
  const top = d.series.reduce((b, w) => (metricValue(w, metric) > metricValue(b, metric) ? w : b), d.series[0]);
  let peak = "";
  if (metricValue(top, metric) > 0 && d.series.length > 1) {
    peak = daily
      ? ` Ta plus grosse journée : le ${dateFr(top.date, false)} (${metricText(top, metric)}).`
      : ` Ta plus grosse semaine : celle du ${dateFr(top.date, false)} (${metricText(top, metric)}).`;
  }
  const detail = `${sessions}.${peak}`;

  // 3. Le conseil
  let tip = "";
  if (pct == null) tip = "";
  else if (Math.abs(pct) < 3) tip = "Un volume stable est idéal pour consolider avant d'augmenter la charge.";
  else if (pct > 0 && short && pct >= 15) tip = "Une hausse aussi rapide augmente le risque de blessure : vise environ 10 % de plus par semaine au maximum, et glisse une semaine plus légère toutes les 3 à 4 semaines.";
  else if (pct > 0 && short) tip = "Cette progression reste raisonnable : c'est le bon rythme pour construire de l'endurance sans trop forcer.";
  else if (pct > 0) tip = "Sur la durée, c'est la régularité qui fait progresser : continue d'alterner semaines chargées et semaines plus légères.";
  else if (short) tip = "Une baisse est normale après un bloc chargé ou pendant un affûtage. Si elle n'est pas voulue, reprends avec une sortie facile plutôt qu'une grosse séance.";
  else tip = "Sur une longue période, une baisse vient souvent d'une coupure ou d'un changement de sport : regarde les semaines du graphique pour voir quand elle a commencé.";

  return [main, detail, tip].filter(Boolean).join(" ");
}

function WeeksCard({ sport }: { sport: StatSport }) {
  const [metricSel, setMetric] = useState<Metric>("secs");
  const metrics = metricsFor(sport);
  const metric = metrics.some((m) => m.value === metricSel) ? metricSel : "secs";
  const [period, setPeriod] = useState<PeriodKey>("1m");
  const q = useQuery(`period:${period}:${sport}`, () => api.period(period, sport));
  const d = q.data;
  const pinfo = PERIOD_BUTTONS.find((p) => p.value === period)!;
  const mlabel = METRICS.find((m) => m.value === metric)!.label;

  const option = useMemo<Opt | null>(() => {
    if (!d) return null;
    const s = d.series;
    const daily = d.granularity === "day";
    const base = baseGrid(s.map((w) => w.date), metric, (v) => (daily ? String(Number(v.slice(8))) : shortDay(v))) as Record<string, unknown>;
    return {
      ...base,
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: C.pointer } },
        formatter: (ps: { dataIndex: number }[]) => {
          const w = s[ps[0]?.dataIndex ?? 0];
          return tipTitle(daily ? dateFr(w.date) : `Semaine du ${dateFr(w.date)}`) + tipRow(C.pink, mlabel, metricText(w, metric)) + tipRow(C.gray, "Sorties", String(w.count));
        },
      },
      series: [
        {
          type: "line",
          data: s.map((w) => metricValue(w, metric)),
          smooth: 0.15,
          symbol: s.length > 60 ? "none" : "circle",
          symbolSize: 7,
          lineStyle: { width: 2.4, color: C.pink },
          itemStyle: { color: C.pink, borderColor: C.card, borderWidth: 2 },
          areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(255,55,95,0.35)" }, { offset: 1, color: "rgba(255,55,95,0)" }] } },
        },
      ],
    } as Opt;
  }, [d, metric, mlabel]);

  const pct = d ? d.delta_pct[metric] : null;
  const up = pct != null && pct >= 0;

  return (
    <Card>
      <CardContent className="grid gap-4">
        {metrics.length > 1 && <Segmented label="Mesure" value={metric} onChange={setMetric} options={metrics} size="sm" className="w-full max-w-[300px]" />}
        {q.error && !d ? (
          <QueryError error={q.error} onRetry={q.reload} />
        ) : !d ? (
          <Skeleton className="h-[330px] rounded-xl" />
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">Total – {mlabel}</p>
                <p className="mt-1 text-[38px] leading-[44px] font-bold tracking-tight">{metricText(d.current, metric)}</p>
                <p className="text-muted-foreground mt-0.5 text-[13px]">
                  {dateFr(d.from)} – {d.to === new Date().toLocaleDateString("sv-SE") ? "aujourd'hui" : dateFr(d.to)}
                </p>
              </div>
              <div className="shrink-0 text-right" aria-live="polite">
                {pct == null ? (
                  <p className="text-muted-foreground text-[13px]">{d.prev_complete ? "Rien sur la période précédente" : "Historique insuffisant"}</p>
                ) : (
                  <p className="text-[22px] leading-7 font-bold tracking-tight" style={up ? { color: C.green } : undefined}>
                    <span className="mr-1 inline-block text-[13px] align-middle" aria-hidden>{up ? "▲" : "▼"}</span>
                    {nf(Math.abs(pct), 0)} %
                    <span className="sr-only">{up ? " de hausse" : " de baisse"}</span>
                  </p>
                )}
                <p className="text-muted-foreground mt-0.5 max-w-[190px] text-[12px] leading-4">
                  {d.prev_complete ? `par rapport ${pinfo.vs}` : `ton historique commence le ${dateFr(d.first_date ?? d.from)}`}
                </p>
              </div>
            </div>
            <Chart option={option} height={230} label={`${mlabel} sur la période sélectionnée`} />
            <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Période">
              {PERIOD_BUTTONS.map((p) => {
                const on = p.value === period;
                return (
                  <button
                    key={p.value}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPeriod(p.value)}
                    className={cn(
                      "h-10 rounded-full px-1 text-[13px] font-semibold whitespace-nowrap outline-none transition-[background-color,color,transform] duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97]",
                      on ? "bg-[#FF375F] text-white" : "text-[#FF375F] hover:bg-foreground/[0.06]",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="rounded-2xl bg-foreground/[0.04] p-4" aria-live="polite">
              <p className="text-muted-foreground flex items-center gap-2 text-[13px] font-medium">
                <Activity className="size-4" aria-hidden /> Ton résumé
              </p>
              <p className="mt-2 text-[15px] leading-6">{buildSummary(d, metric, sport)}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Zones d'entraînement ---------- */
const ZONE_PERIODS = [
  { value: 7, label: "7 j" },
  { value: 28, label: "1 mois" },
  { value: 90, label: "3 mois" },
  { value: 180, label: "6 mois" },
  { value: 365, label: "1 an" },
];
const ZONE_REDS = ["#F4A0A5", "#EE7576", "#E84A4C", "#DC2626", "#B91C1C"];

// Bornes basses Z2 à Z5 de tes zones Strava (Z1 < 125 bpm). Modifie-les ici si tu changes tes zones.
const STRAVA_BOUNDS = [125, 156, 171, 186];

function ZonesCard({ sport }: { sport: StatSport }) {
  const [days, setDays] = useState(28);
  const [scheme, setScheme] = useState<"strava" | "garmin">("garmin");
  const q = useQuery(`zones:${days}:${sport}:${scheme}`, () => api.zones(days, sport, scheme === "strava" ? STRAVA_BOUNDS : undefined));
  const d = q.data;
  const share = (p: { secs: number[]; total: number } | undefined, i: number) => (p && p.total > 0 ? (p.secs[i] / p.total) * 100 : null);
  const top = d && d.current.total > 0 ? d.current.secs.indexOf(Math.max(...d.current.secs)) : -1;
  const topShare = d ? share(d.current, top) : null;
  const prevShare = d ? share(d.previous, top) : null;
  const change = topShare != null && prevShare != null ? topShare - prevShare : null;
  const max = d ? Math.max(...d.current.secs, 1) : 1;
  const bound = (i: number) => {
    const lo = d?.bounds[i];
    const hi = d?.bounds[i + 1];
    if (lo == null) return "";
    if (i === 0) return `< ${nf(d?.bounds[1] ?? 0)} bpm`;
    if (hi == null) return `> ${nf(lo)} bpm`;
    return `${nf(lo)} – ${nf(hi - 1)} bpm`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Zones d'entraînement</CardTitle>
        <CardDescription>
          {scheme === "strava"
            ? "Temps passé dans chaque zone, recalculé sur ta courbe de FC avec tes bornes Strava."
            : "Temps passé dans chaque zone selon Garmin (le temps sous la zone 1, environ 98 bpm, n'est pas compté)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap gap-3">
          <Segmented label="Période" value={days} onChange={setDays} options={ZONE_PERIODS} size="sm" className="w-full max-w-[380px]" />
          <Segmented
            label="Définition des zones"
            value={scheme}
            onChange={setScheme}
            options={[{ value: "garmin", label: "Zones Garmin" }, { value: "strava", label: "Zones Strava" }]}
            size="sm"
            className="w-[240px]"
          />
        </div>
        {q.error && !d ? (
          <QueryError error={q.error} onRetry={q.reload} />
        ) : !d ? (
          <Skeleton className="h-[260px] rounded-xl" />
        ) : d.current.total <= 0 ? (
          <EmptyState title="Pas de zones sur cette période" description="Synchronise tes sorties pour récupérer le temps passé par zone." />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[34px] leading-10 font-bold tracking-tight">
                  {nf(topShare)} % en Z{top + 1}
                </p>
                <p className="text-muted-foreground text-[13px]">
                  {dayLabel(d.current.from)} → {dayLabel(d.current.to)}
                </p>
              </div>
              {change != null && <Delta value={change} goodWhen="up" text={`${signed(change, 0)} pts vs période précédente`} />}
            </div>
            <ul className="grid gap-3">
              {[4, 3, 2, 1, 0].map((i) => (
                <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="text-[14px] font-bold">Z{i + 1}</span>
                  <div className="flex items-center gap-3">
                    <div className="h-8 rounded-lg transition-[width] duration-500 ease-[var(--ease-out-strong)]" style={{ width: `${Math.max((d.current.secs[i] / max) * 78, 1.5)}%`, background: ZONE_REDS[i] }} />
                    <span className="text-[14px] font-semibold whitespace-nowrap">{fmtHM(d.current.secs[i])}</span>
                  </div>
                  <span className="text-muted-foreground hidden text-[13px] sm:block">{bound(i)}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-[13px]">
              {ZONE_META[top].name} : tu y passes {nf(topShare)} % du temps
              {change != null && Math.abs(change) >= 1 ? `, ${change > 0 ? "en hausse" : "en baisse"} de ${nf(Math.abs(change))} points par rapport à la période d'avant` : ""}.
              {d.previous.with_zones === 0 && " La comparaison apparaîtra après la synchronisation de davantage d'historique (sync.bat 1500)."}
              {d.current.with_zones < d.current.activities && ` Zones disponibles pour ${d.current.with_zones} sortie${d.current.with_zones > 1 ? "s" : ""} sur ${d.current.activities}.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Le mois sportif + activités mensuelles ---------- */
function MonthsCard({ sport }: { sport: StatSport }) {
  const [metricSel, setMetric] = useState<Metric>("secs");
  const metrics = metricsFor(sport);
  const metric = metrics.some((m) => m.value === metricSel) ? metricSel : "secs";
  const q = useQuery(`monthly:${sport}`, () => api.monthly(12, sport));
  const d = q.data;

  const bars = useMemo<Opt | null>(() => {
    if (!d) return null;
    const base = baseGrid(d.series.map((m) => m.month), metric, monthLabel) as Record<string, unknown>;
    return {
      ...base,
      xAxis: { ...(base.xAxis as object), boundaryGap: true },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: C.faint } },
        formatter: (ps: { dataIndex: number }[]) => {
          const m = d.series[ps[0]?.dataIndex ?? 0];
          return tipTitle(`${monthLong(m.month)} ${m.month.slice(0, 4)}`) + tipRow(C.orange, METRICS.find((x) => x.value === metric)!.label, metricText(m, metric)) + tipRow(C.gray, "Sorties", String(m.count));
        },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 22,
          data: d.series.map((m, i) => ({ value: metricValue(m, metric), itemStyle: { color: i === d.series.length - 1 ? "#FC5200" : "rgba(252,82,0,0.35)", borderRadius: [5, 5, 0, 0] } })),
        },
      ],
    } as Opt;
  }, [d, metric]);

  const cumul = useMemo<Opt | null>(() => {
    if (!d) return null;
    const prev = d.cumulative.previous;
    const key = metric === "secs" ? "secs" : metric;
    const val = (p: { secs: number; km: number; dplus: number }) => (metric === "secs" ? p.secs / 3600 : p[key as "km" | "dplus"]);
    const base = baseGrid(prev.map((p) => String(p.day)), metric, (v) => v) as Record<string, unknown>;
    return {
      ...base,
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: C.pointer } },
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0]?.dataIndex ?? 0;
          const cu = d.cumulative.current[i];
          let h = tipTitle(`Jour ${i + 1}`);
          if (cu) h += tipRow("#FC5200", monthLong(d.current_month), metricText(cu, metric));
          return h + tipRow(C.gray, monthLong(d.previous_month), metricText(prev[i], metric));
        },
      },
      series: [
        { name: "prev", type: "line", showSymbol: false, data: prev.map(val), lineStyle: { width: 2, color: C.ghost } },
        {
          name: "cur",
          type: "line",
          showSymbol: false,
          data: d.cumulative.current.map(val),
          lineStyle: { width: 2.6, color: "#FC5200" },
          areaStyle: { color: "rgba(252,82,0,0.12)" },
          markPoint: { symbol: "circle", symbolSize: 12, itemStyle: { color: "#FC5200", borderColor: "#fff", borderWidth: 2 }, label: { show: false }, data: [{ coord: [d.cumulative.current.length - 1, val(d.cumulative.current[d.cumulative.current.length - 1])] }] },
        },
      ],
    } as Opt;
  }, [d, metric]);

  const cur = d?.series[d.series.length - 1];
  const prev = d?.series[d.series.length - 2];
  const prevToDate = d ? d.cumulative.previous[Math.min(d.cumulative.current.length, d.cumulative.previous.length) - 1] : undefined;
  const curToDate = d ? d.cumulative.current[d.cumulative.current.length - 1] : undefined;
  const diff = curToDate && prevToDate ? metricValue(curToDate, metric) - metricValue(prevToDate, metric) : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Le mois sportif</CardTitle>
            <CardDescription>12 derniers mois et comparaison avec le mois précédent.</CardDescription>
          </div>
          {metrics.length > 1 && <Segmented label="Mesure" value={metric} onChange={setMetric} options={metrics} size="sm" className="w-[240px]" />}
        </div>
      </CardHeader>
      <CardContent className="grid gap-6">
        {q.error && !d ? (
          <QueryError error={q.error} onRetry={q.reload} />
        ) : !d || !cur || !prev ? (
          <Skeleton className="h-[300px] rounded-xl" />
        ) : (
          <>
            <Chart option={bars} height={190} label="Volume par mois sur 12 mois" />
            <div className="border-t pt-5">
              <p className="text-muted-foreground text-[13px]">{METRICS.find((m) => m.value === metric)!.label} en {monthLong(d.current_month)}</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <p className="text-[34px] leading-10 font-bold tracking-tight">{metricText(cur, metric)}</p>
                {diff != null && <Delta value={diff} text={`${signed(metric === "secs" ? Math.round(diff * 60) : diff, 0)} ${metric === "secs" ? "min" : metric === "km" ? "km" : "m"} vs ${monthLong(d.previous_month)} à date`} />}
              </div>
              <p className="text-muted-foreground mt-0.5 text-[13px]">
                {capital(monthLong(d.previous_month))} en entier : {metricText(prev, metric)}
              </p>
              <Chart option={cumul} height={200} className="mt-2" label="Cumul du mois comparé au mois précédent" />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- Effort relatif ---------- */
const STATUS_TXT = { below: { label: "En dessous de la plage", color: C.cyan }, ok: { label: "Dans la plage", color: C.green }, above: { label: "Au-dessus de la plage", color: C.orange } } as const;
const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function EffortCard() {
  const q = useQuery("effort", api.effort);
  const d = q.data;
  const option = useMemo<Opt | null>(() => {
    if (!d) return null;
    const { lo, hi } = d.typical;
    const base = baseGrid(DAYS_FR, "km", (v) => v) as Record<string, unknown>;
    const band = lo && hi
      ? [
          { name: "lo", type: "line", stack: "band", symbol: "none", data: lo, lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
          { name: "hi", type: "line", stack: "band", symbol: "none", data: hi.map((h, i) => h - lo[i]), lineStyle: { opacity: 0 }, areaStyle: { color: "rgba(191,90,242,0.16)" }, silent: true },
        ]
      : [];
    return {
      ...base,
      yAxis: { ...(base.yAxis as object), axisLabel: { ...axisText, formatter: (v: number) => nf(v) } },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: C.pointer } },
        formatter: (ps: { dataIndex: number }[]) => {
          const i = ps[0]?.dataIndex ?? 0;
          let h = tipTitle(DAYS_FR[i]);
          if (d.cumulative.current[i] != null) h += tipRow(C.violet, "Cette semaine", nf(d.cumulative.current[i]));
          h += tipRow(C.gray, "Semaine dernière", nf(d.cumulative.previous[i]));
          if (lo && hi) h += tipRow("rgba(191,90,242,0.5)", "Plage habituelle", `${nf(lo[i])} – ${nf(hi[i])}`);
          return h;
        },
      },
      series: [
        ...band,
        { name: "prev", type: "line", symbol: "none", data: d.cumulative.previous, lineStyle: { width: 2, color: C.ghost } },
        { name: "cur", type: "line", symbolSize: 8, data: d.cumulative.current, lineStyle: { width: 2.8, color: C.violet }, itemStyle: { color: C.violet, borderColor: "#fff", borderWidth: 2 } },
      ],
    } as Opt;
  }, [d]);
  const st = d?.status ? STATUS_TXT[d.status] : null;
  const lo = d?.typical.lo?.[d.weekday];
  const hi = d?.typical.hi?.[d.weekday];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Effort relatif</CardTitle>
        <CardDescription>Charge d'entraînement Garmin cumulée depuis lundi, comparée à ce que tu fais d'habitude au même jour de la semaine (zone violette).</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {q.error && !d ? (
          <QueryError error={q.error} onRetry={q.reload} />
        ) : !d ? (
          <Skeleton className="h-[240px] rounded-xl" />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-[34px] leading-10 font-bold tracking-tight">{nf(d.current)}</p>
              {st && <StatusPill color={st.color}>{st.label}</StatusPill>}
            </div>
            <p className="text-muted-foreground -mt-2 text-[13px]">
              {lo != null && hi != null && `Plage habituelle à ce jour : ${nf(lo)} – ${nf(hi)}. `}
              Même jour la semaine dernière : {nf(d.previous_to_date)} · semaine dernière en entier : {nf(d.previous_total)}
              {d.typical.lo && d.typical.hi ? ` · plage habituelle de la semaine entière : ${nf(d.typical.lo[6])} – ${nf(d.typical.hi[6])}` : ""}.
            </p>
            <Chart option={option} height={210} label="Effort cumulé par jour de la semaine" />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Condition physique ---------- */
function FitnessCard() {
  const q = useQuery("fitness:90", () => api.fitness(90));
  const s = (q.data?.series ?? []).filter((x) => x.ctl != null);
  const last = s[s.length - 1];
  const ago = s[Math.max(0, s.length - 31)];
  const delta = last && ago ? (last.ctl as number) - (ago.ctl as number) : null;
  const info = tsbInfo(last?.tsb);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Condition physique</CardTitle>
        <CardDescription>Ta forme de fond (charge cumulée sur 42 jours), calculée avec les données Garmin.</CardDescription>
      </CardHeader>
      <CardContent>
        {q.error && !q.data ? (
          <QueryError error={q.error} onRetry={q.reload} />
        ) : !last ? (
          <Skeleton className="h-[120px] rounded-xl" />
        ) : (
          <div className="grid items-end gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-baseline gap-3">
                <p className="text-[44px] leading-[48px] font-bold tracking-tight">{nf(last.ctl)}</p>
                <Delta value={delta} text={`${signed(delta, 0)} en 30 j`} />
              </div>
              {info && <p className="text-muted-foreground mt-1 text-[13px]">Fraîcheur du jour : {signed(last.tsb)} · {info.label}</p>}
            </div>
            <SparkAreaChart data={s.slice(-60).map((d) => ({ date: shortDay(d.date), Forme: d.ctl }))} index="date" categories={["Forme"]} colors={["orange"]} curveType="monotone" className="h-24 w-full" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Meilleurs efforts ---------- */
const medal = (kind: string) => (kind === "bike" ? Bike : kind === "elev" ? Mountain : kind === "time" ? Timer : Footprints);

/* ---------- Meilleurs efforts : médailles, courbe et liste par année (façon Strava) ---------- */
const MEDAL_COLOR = { 1: "#FFD60A", 2: "#AEAEB2", 3: "#D0803F" } as const;
type Rank = 1 | 2 | 3;

function MedalIcon({ rank, size = 22, pr = false }: { rank: Rank; size?: number; pr?: boolean }) {
  const col = MEDAL_COLOR[rank];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      <path d="M6.2 1h4.1l2.2 6.4-3.4 1.2z" fill={col} opacity=".7" />
      <path d="M17.8 1h-4.1l-2.2 6.4 3.4 1.2z" fill={col} opacity=".7" />
      <circle cx="12" cy="15.2" r="7.6" fill={col} />
      <circle cx="12" cy="15.2" r="5.7" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
      <text x="12" y={pr ? 17.7 : 18.4} textAnchor="middle" fontSize={pr ? 6.6 : 9} fontWeight="800" fill="#1C1C1E" fontFamily="inherit">
        {pr ? "PR" : rank}
      </text>
    </svg>
  );
}

const fmtEffort = (s: number) => (s < 60 ? `${nf(s, s < 10 ? 1 : 0)} s` : fmtClock(s));
const fmtRate = (kind: "foot" | "bike", dist: number, s: number) =>
  kind === "foot" ? `${fmtPaceSec(s / (dist / 1000))} /km` : `${nf((dist / 1000 / s) * 3600, 1)} km/h`;
const dayMonth = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

function Pill({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "h-9 shrink-0 rounded-full border px-4 text-[14px] font-medium whitespace-nowrap outline-none transition-[background-color,color,border-color,transform] duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97]",
        on ? "border-[#FF375F] text-[#FF375F]" : "text-muted-foreground border-foreground/15 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function BestEffortsPanel() {
  const [kind, setKind] = useState<"foot" | "bike">("foot");
  const [label, setLabel] = useState<string | null>(null);
  const [year, setYear] = useState<string>("all");
  const [showAll, setShowAll] = useState(false);
  const q = useQuery(`efforts:${kind}`, () => api.efforts(kind));
  const d: EffortsResponse | undefined = q.data;
  const dist = d ? (d.distances.find((x) => x.label === label) ?? d.distances.find((x) => x.label === "5 km") ?? d.distances[0]) : undefined;

  const view = useMemo(() => {
    if (!dist) return null;
    const byTime = [...dist.efforts].sort((a, b) => a.time_s - b.time_s);
    const allRank = new Map<number, Rank>();
    byTime.slice(0, 3).forEach((e, i) => allRank.set(e.activity_id, (i + 1) as Rank));
    const yearRank = new Map<number, Rank>();
    const years = [...new Set(dist.efforts.map((e) => e.date.slice(0, 4)))].sort().reverse();
    for (const y of years) byTime.filter((e) => e.date.startsWith(y)).slice(0, 3).forEach((e, i) => yearRank.set(e.activity_id, (i + 1) as Rank));
    const shown = (year === "all" ? dist.efforts : dist.efforts.filter((e) => e.date.startsWith(year))).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    return { byTime, allRank, yearRank, years, shown };
  }, [dist, year]);

  const option = useMemo<Opt | null>(() => {
    if (!dist || !view || view.shown.length === 0) return null;
    const foot = kind === "foot";
    const val = (s: number) => (foot ? s / (dist.distance_m / 1000) : (dist.distance_m / 1000 / s) * 3600);
    const pts = view.shown.map((e) => ({ e, x: new Date(e.date + "T12:00:00").getTime(), y: val(e.time_s) }));
    const trend = pts.map((p, i) => {
      const w = pts.slice(Math.max(0, i - 2), i + 3);
      return [p.x, w.reduce((a, b) => a + b.y, 0) / w.length];
    });
    const ys = pts.map((p) => p.y);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const pad = (hi - lo || lo * 0.1) * 0.15;
    const medalPts = (r: Rank) =>
      pts.filter((p) => view.allRank.get(p.e.activity_id) === r).map((p) => ({ value: [p.x, p.y], name: r === 1 ? "PR" : String(r) }));
    const medalSeries = ([3, 2, 1] as Rank[]).map((r) => ({
      type: "line",
      silent: false,
      lineStyle: { width: 0, opacity: 0 },
      symbol: "circle",
      symbolSize: r === 1 ? 26 : 20,
      itemStyle: { color: MEDAL_COLOR[r], borderColor: C.card, borderWidth: 2 },
      label: { show: true, position: "inside", formatter: (p: { name: string }) => p.name, color: "#1C1C1E", fontSize: r === 1 ? 9 : 11, fontWeight: 800, fontFamily: FONT },
      z: 5,
      data: medalPts(r),
    }));
    return {
      animation: false,
      grid: { left: 54, right: 14, top: 14, bottom: 26 },
      xAxis: {
        type: "time",
        axisLine: { lineStyle: { color: C.grid } },
        axisTick: { show: false },
        axisLabel: { ...axisText, hideOverlap: true, formatter: (v: number) => new Date(v).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }) },
        splitLine: { show: true, lineStyle: { color: C.grid } },
      },
      yAxis: {
        type: "value",
        inverse: foot,
        min: Math.max(0, lo - pad),
        max: hi + pad,
        splitNumber: 3,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...axisText, formatter: (v: number) => (foot ? fmtPaceSec(v) : nf(v, 0)) },
        splitLine: { lineStyle: { color: C.grid } },
      },
      tooltip: {
        ...tooltipBase,
        trigger: "item",
        formatter: (p: { value: number[] }) => {
          const hit = pts.find((q2) => q2.x === p.value?.[0]);
          if (!hit) return "";
          const r = view.allRank.get(hit.e.activity_id);
          return (
            tipTitle(dayLabel(hit.e.date)) +
            tipRow(r ? MEDAL_COLOR[r] : C.gray, dist.label, fmtEffort(hit.e.time_s)) +
            tipRow(C.gray, foot ? "Allure" : "Vitesse", fmtRate(kind, dist.distance_m, hit.e.time_s)) +
            (hit.e.name ? tipRow(C.gray, "Sortie", hit.e.name) : "")
          );
        },
      },
      series: [
        { type: "line", data: trend, smooth: 0.4, symbol: "none", silent: true, lineStyle: { width: 2.4, color: C.blue }, z: 1 },
        {
          type: "line",
          lineStyle: { width: 0, opacity: 0 },
          symbol: "circle",
          symbolSize: 8,
          itemStyle: { color: C.card, borderColor: C.label2, borderWidth: 1.6 },
          data: pts.filter((p) => !view.allRank.has(p.e.activity_id)).map((p) => [p.x, p.y]),
          z: 3,
        },
        ...medalSeries,
      ],
    } as Opt;
  }, [dist, view, kind]);

  const best = view?.byTime[0];
  const second = view?.byTime[1];
  const third = view?.byTime[2];
  const rows = view ? [...view.shown].sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
  const limit = showAll ? rows.length : 8;
  const range = view && view.shown.length > 0 ? `${new Date(view.shown[0].date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} – ${new Date(view.shown[view.shown.length - 1].date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : "";

  return (
    <div className="grid gap-4">
      <Segmented
        label="Sport"
        value={kind}
        onChange={(v) => {
          setKind(v);
          setLabel(null);
          setYear("all");
          setShowAll(false);
        }}
        options={[{ value: "foot", label: "Course à pied" }, { value: "bike", label: "Vélo" }]}
        size="sm"
        className="w-[260px]"
      />
      {q.error && !d ? (
        <QueryError error={q.error} onRetry={q.reload} />
      ) : !d ? (
        <Skeleton className="h-[320px] rounded-xl" />
      ) : d.distances.length === 0 || !dist || !view ? (
        <EmptyState title="Pas encore d'effort calculé" description="Il faut des sorties synchronisées avec leur détail (sync.bat 1500)." />
      ) : (
        <>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Distance">
            {d.distances.map((x) => (
              <Pill
                key={x.label}
                on={x.label === dist.label}
                onClick={() => {
                  setLabel(x.label);
                  setYear("all");
                  setShowAll(false);
                }}
              >
                {x.label}
              </Pill>
            ))}
          </div>

          <div>
            <p className="text-[15px] font-semibold">De tout temps</p>
            {best && (
              <div className="mt-2 flex items-start justify-between gap-4">
                <a href={`#/activity/${best.activity_id}`} className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  <MedalIcon rank={1} size={44} pr />
                  <span>
                    <span className="flex items-baseline gap-3">
                      <span className="text-[34px] leading-10 font-bold tracking-tight">{fmtEffort(best.time_s)}</span>
                      <span className="text-muted-foreground text-[16px]">{fmtRate(kind, dist.distance_m, best.time_s)}</span>
                    </span>
                    <span className="text-muted-foreground block text-[13px]">{new Date(best.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
                  </span>
                </a>
                <div className="flex shrink-0 flex-col gap-1 pt-1 text-[15px]">
                  {second && (
                    <span className="flex items-center gap-1.5">
                      <MedalIcon rank={2} size={22} />
                      {fmtEffort(second.time_s)}
                    </span>
                  )}
                  {third && (
                    <span className="flex items-center gap-1.5">
                      <MedalIcon rank={3} size={22} />
                      {fmtEffort(third.time_s)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {option ? (
            <div>
              <Chart option={option} height={230} label={`Évolution de tes temps sur ${dist.label}`} />
              <p className="text-muted-foreground mt-1 text-[13px]">{range}</p>
            </div>
          ) : (
            <p className="text-muted-foreground text-[14px]">Aucune sortie sur cette année.</p>
          )}

          {view.years.length > 1 && (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Filtrer par année">
              <Pill on={year === "all"} onClick={() => { setYear("all"); setShowAll(false); }}>Toutes les années</Pill>
              {view.years.map((y) => (
                <Pill key={y} on={year === y} onClick={() => { setYear(y); setShowAll(false); }}>{y}</Pill>
              ))}
            </div>
          )}

          <ul className="divide-y divide-white/[0.06]">
            {rows.slice(0, limit).map((e, i) => {
              const showYear = i === 0 || e.date.slice(0, 4) !== rows[i - 1].date.slice(0, 4);
              const ar = view.allRank.get(e.activity_id);
              const yr = view.yearRank.get(e.activity_id);
              return (
                <li key={e.activity_id}>
                  {showYear && <p className="bg-background/50 -mx-2 mt-2 rounded-lg px-2 py-1.5 text-[15px] font-semibold">{e.date.slice(0, 4)}</p>}
                  <a href={`#/activity/${e.activity_id}`} className="hover:bg-foreground/[0.04] -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50">
                    <span className="min-w-0 truncate text-[15px]">{dayMonth(e.date)}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {ar && (
                        <span className="flex items-center gap-1.5 rounded-md bg-foreground/[0.08] px-2 py-1 text-[13px] font-semibold">
                          <MedalIcon rank={ar} size={18} pr={ar === 1} />
                          De tout temps
                        </span>
                      )}
                      {yr && (
                        <span className="flex items-center gap-1.5 rounded-md bg-foreground/[0.08] px-2 py-1 text-[13px] font-semibold">
                          <MedalIcon rank={yr} size={18} pr={yr === 1} />
                          {e.date.slice(0, 4)}
                        </span>
                      )}
                      {!ar && !yr && (
                        <>
                          <span className="text-[15px]">{fmtEffort(e.time_s)}</span>
                          <span className="text-muted-foreground w-[84px] text-right text-[15px]">{fmtRate(kind, dist.distance_m, e.time_s)}</span>
                        </>
                      )}
                      {(ar || yr) && <span className="text-[15px]">{fmtEffort(e.time_s)}</span>}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          {rows.length > 8 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-muted-foreground hover:text-foreground h-10 rounded-full border border-foreground/15 text-[14px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {showAll ? "Réduire la liste" : `Afficher les ${rows.length} sorties`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function RecordsCard() {
  const q = useQuery("records", api.records);
  const d: RecordsResponse | undefined = q.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4 text-[#FFD60A]" />
          Meilleurs efforts
        </CardTitle>
        <CardDescription>
          {d ? `Calculés sur les courbes des ${d.analysed.with_detail} sorties dont le détail est synchronisé (sur ${d.analysed.activities}). Médailles : or = meilleur temps, argent et bronze = 2e et 3e.` : "Tes records de tout temps."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {q.error && !d ? (
          <QueryError error={q.error} onRetry={q.reload} />
        ) : !d ? (
          <Skeleton className="h-[160px] rounded-xl" />
        ) : (
          <div className="grid gap-6">
            <BestEffortsPanel />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {d.totals.map((r) => (
                <RecordTile key={r.label} kind={r.kind} label={r.label} value={r.unit === "m" ? (r.kind === "elev" ? `${nf(r.value)} m` : `${nf(r.value / 1000, 2)} km`) : fmtHM(r.value)} r={r} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecordTile({ kind, label, value, sub, r }: { kind: string; label: string; value: string; sub?: string; r: { activity_id: number; date: string; name: string | null } }) {
  const Icon = medal(kind);
  return (
    <a href={`#/activity/${r.activity_id}`} className="group flex flex-col gap-1 rounded-2xl bg-foreground/[0.04] px-4 py-3.5 outline-none transition-[background-color,transform] duration-200 hover:bg-foreground/[0.07] focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98]">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-[#FFD60A]">
        <Medal className="size-3.5" />
        <span className="text-muted-foreground truncate font-medium">{label}</span>
      </span>
      <span className="flex items-center gap-2 text-[22px] leading-7 font-semibold tracking-tight">
        <Icon className="text-muted-foreground size-4 shrink-0" />
        {value}
      </span>
      <span className="text-muted-foreground truncate text-[12px]">{sub ? `${sub} · ` : ""}{dayLabel(r.date)}</span>
    </a>
  );
}

/* ---------- Vue ---------- */
export default function Progress() {
  const [sport, setSport] = useState<StatSport>("all");
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-[34px] leading-10 font-bold tracking-tight">Progrès</h1>
        <p className="text-muted-foreground mt-1 text-[15px]">Volume, zones, effort et records, comme dans Strava.</p>
      </div>
      <SportChips value={sport} onChange={setSport} />
      <div className="grid gap-5 lg:grid-cols-2">
        <WeeksCard sport={sport} />
        <ZonesCard sport={sport} />
      </div>
      <MonthsCard sport={sport} />
      <div className="grid gap-5 lg:grid-cols-2">
        <EffortCard />
        <FitnessCard />
      </div>
      <RecordsCard />
    </div>
  );
}
