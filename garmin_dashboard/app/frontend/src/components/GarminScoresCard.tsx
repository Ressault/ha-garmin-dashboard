import { useMemo, useState } from "react";

import { Chart, Delta, Segmented } from "@/components/common";
import { Card } from "@/components/ui/card";
import type { FitnessDay, FitnessResponse } from "@/lib/api";
import { axisPointerLine, axisText, tipRow, tipTitle, tooltipBase, type Opt } from "@/lib/echarts";
import { fmtHM, hrvStatus, nf, readinessInfo, READINESS_ZONES, shortDay, signed } from "@/lib/format";
import { C } from "@/lib/palette";

const lastOf = (s: FitnessDay[], k: keyof FitnessDay) => {
  for (let i = s.length - 1; i >= 0; i--) if (typeof s[i][k] === "number") return s[i][k] as number;
  return null;
};
/** Variation depuis la plus ancienne valeur connue des 28 derniers jours. */
const trend = (s: FitnessDay[], k: keyof FitnessDay) => {
  const cur = lastOf(s, k);
  if (cur == null) return null;
  const recent = s.slice(-28).map((d) => d[k]).filter((v): v is number => typeof v === "number");
  return recent.length > 1 ? cur - recent[0] : null;
};

/* ---------- Jauge en arc (270°, ouverture en bas) comme dans Garmin Connect ---------- */
type Zone = { from: number; to: number; color: string };

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function ArcGauge({
  value,
  max = 100,
  zones,
  color,
  size = 200,
  label,
  children,
}: {
  value: number | null;
  max?: number;
  zones?: readonly Zone[];
  /** sans zones : arc de progression de cette couleur */
  color?: string;
  size?: number;
  label: string;
  children?: React.ReactNode;
}) {
  const START = 135;
  const SWEEP = 270;
  const cx = 100;
  const cy = 100;
  const r = 82;
  const ang = (v: number) => START + (Math.max(0, Math.min(max, v)) / max) * SWEEP;
  const gap = 3.2;
  const v = value == null ? null : Math.max(0, Math.min(max, value));
  const [mx, my] = v == null ? [0, 0] : polar(cx, cy, r, ang(v));
  const active = zones && v != null ? zones.find((z) => v >= z.from && v < z.to) ?? zones[zones.length - 1] : null;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size * 0.92 }} role="img" aria-label={label}>
      <svg viewBox="0 8 200 184" width={size} height={size * 0.92} className="block overflow-visible">
        {zones ? (
          zones.map((z) => (
            <path
              key={z.from}
              d={arcPath(cx, cy, r, ang(z.from) + (z.from === 0 ? 0 : gap / 2), ang(Math.min(z.to, max)) - (z.to >= max ? 0 : gap / 2))}
              stroke={z.color}
              strokeWidth={13}
              strokeLinecap="round"
              fill="none"
              opacity={active === z ? 1 : 0.85}
            />
          ))
        ) : (
          <>
            <path d={arcPath(cx, cy, r, START, START + SWEEP)} stroke={C.grid} strokeWidth={13} strokeLinecap="round" fill="none" />
            {v != null && v > 0 && <path d={arcPath(cx, cy, r, START, ang(v))} stroke={color ?? C.blue} strokeWidth={13} strokeLinecap="round" fill="none" />}
          </>
        )}
        {zones && v != null && <circle cx={mx} cy={my} r={9} fill={active?.color ?? C.blue} stroke={C.card ?? "#000"} strokeWidth={3} />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: size * 0.04 }}>
        {children}
      </div>
    </div>
  );
}

const bigNumber = (v: number | null, color?: string) => (
  <span className="text-[52px] leading-[52px] font-semibold tracking-tight tabular-nums" style={color ? { color } : undefined}>
    {v != null ? nf(v) : "—"}
  </span>
);

function Factor({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-foreground/[0.05] px-4 py-3">
      <div className="min-w-0">
        <p className="text-[15px] font-medium">{label}</p>
        {sub && <p className="text-muted-foreground text-[13px] tabular-nums">{sub}</p>}
      </div>
      <p className="flex shrink-0 items-center gap-2 text-[15px] font-medium">
        {value}
        {color && <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />}
      </p>
    </div>
  );
}

export const sleepInfo = (v: number | null) =>
  v == null ? null : v >= 90 ? { label: "Excellent", color: C.blue } : v >= 80 ? { label: "Bon", color: C.green } : v >= 60 ? { label: "Passable", color: C.orange } : { label: "Mauvais", color: C.red };

/* ---------- Préparation à l'entraînement ---------- */
export function ReadinessCard({ series, latest }: { series: FitnessDay[]; latest: FitnessDay | null | undefined }) {
  const rd = [...series].reverse().find((d) => d.readiness_score != null);
  const score = rd?.readiness_score ?? null;
  const info = readinessInfo(score);
  const sleep = lastOf(series, "sleep_score");
  const sl = sleepInfo(sleep);
  const hrvRow = [...series].reverse().find((d) => d.hrv_status);
  const hrv = hrvStatus(hrvRow?.hrv_status);
  const recov = latest?.recovery_time_h;
  return (
    <Card className="gap-5 px-5 py-5">
      <p className="text-[15px] font-medium">Préparation à l'entraînement</p>
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,260px)_1fr]">
        <ArcGauge value={score} zones={READINESS_ZONES} size={230} label={`Préparation à l'entraînement : ${score ?? "inconnue"} sur 100`}>
          {bigNumber(score)}
          <span className="text-muted-foreground text-lg">100</span>
          {info && <span className="mt-1 text-xl font-semibold" style={{ color: info.color }}>{info.label}</span>}
        </ArcGauge>
        <div className="grid gap-2.5">
          <p className="text-muted-foreground text-xs font-medium">Facteurs</p>
          <Factor label="Score de sommeil" value={sl?.label ?? "—"} sub={sleep != null ? nf(sleep) : undefined} color={sl?.color} />
          <Factor label="Temps de récupération" value={recov != null ? fmtHM(recov * 3600) : "—"} />
          <Factor label="Statut de la VFC" value={hrv?.label ?? "—"} sub={hrvRow?.hrv_last_night_ms != null ? `${nf(hrvRow.hrv_last_night_ms)} ms` : undefined} color={hrv?.color} />
        </div>
      </div>
    </Card>
  );
}

/* ---------- Body Battery : valeur actuelle + courbe du jour ---------- */
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

function BodyBatteryCard({ series, tl }: { series: FitnessDay[]; tl: FitnessResponse["bb_timeline"] }) {
  const today = series[series.length - 1];
  const now = today?.body_battery_now ?? (tl && tl.date === today?.date ? tl.points[tl.points.length - 1]?.[1] : null) ?? null;
  const charged = today?.body_battery_charged;
  const drained = today?.body_battery_drained;
  const color = now == null ? C.blue : now >= 75 ? C.green : now >= 50 ? C.blue : now >= 25 ? C.orange : C.red;
  const option = useMemo<Opt | null>(() => {
    if (!tl || tl.points.length < 2) return null;
    return {
      animation: false,
      grid: { left: 34, right: 12, top: 12, bottom: 24 },
      xAxis: {
        type: "value",
        min: 0,
        max: 1440,
        interval: 360,
        axisLine: { lineStyle: { color: C.grid } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { ...axisText, formatter: (v: number) => hhmm(v) },
        axisPointer: axisPointerLine,
      },
      yAxis: { type: "value", min: 0, max: 100, interval: 25, axisLine: { show: false }, axisTick: { show: false }, axisLabel: axisText, splitLine: { lineStyle: { color: C.grid } } },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: C.pointer } },
        formatter: (ps: { value: [number, number] }[]) => (ps[0] ? tipTitle(hhmm(ps[0].value[0])) + tipRow(color, "Body Battery", String(ps[0].value[1])) : ""),
      },
      series: [
        {
          type: "line",
          name: "Body Battery",
          data: tl.points,
          showSymbol: false,
          smooth: 0.2,
          lineStyle: { width: 2.4, color: C.label },
          itemStyle: { color: C.label },
          areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(100,210,255,0.35)" }, { offset: 1, color: "rgba(100,210,255,0.02)" }] } },
        },
      ],
    } as Opt;
  }, [tl, color]);
  return (
    <Card className="gap-4 px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-medium">Body Battery</p>
        {tl && <p className="text-muted-foreground text-[13px]">{tl.date === today?.date ? "Aujourd'hui" : shortDay(tl.date)}</p>}
      </div>
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,260px)_1fr]">
        <div>
          <ArcGauge value={now} color={color} size={210} label={`Body Battery : ${now ?? "inconnu"} sur 100`}>
            {bigNumber(now, color)}
            <span className="text-muted-foreground text-lg">100</span>
          </ArcGauge>
          <div className="mt-1 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-[22px] font-semibold tabular-nums">{charged != null ? `+${nf(charged)}` : "—"}</p>
              <p className="text-muted-foreground text-[13px]">Chargée</p>
            </div>
            <div>
              <p className="text-[22px] font-semibold tabular-nums">{drained != null ? `−${nf(drained)}` : "—"}</p>
              <p className="text-muted-foreground text-[13px]">Énergie dépensée</p>
            </div>
          </div>
        </div>
        <div>
          {option ? (
            <Chart option={option} height={220} label="Courbe du Body Battery sur la journée" />
          ) : (
            <p className="text-muted-foreground text-sm">La courbe de la journée apparaîtra après la prochaine synchronisation.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ---------- Score d'endurance : 7 niveaux avec les limites fournies par Garmin ---------- */
const ENDURANCE_LEVELS = [
  { key: "Lower", label: "Récréatif", color: "#E5322D" },
  { key: "Intermediate", label: "Intermédiaire", color: "#E8700A" },
  { key: "Trained", label: "Entraîné", color: "#F2A63B" },
  { key: "WellTrained", label: "Bien entraîné", color: "#16A34A" },
  { key: "Expert", label: "Expert", color: "#1B7FDB" },
  { key: "Superior", label: "Supérieur", color: "#8B5CF6" },
  { key: "Elite", label: "Élite", color: "#D63AC8" },
] as const;

function EnduranceCard({ series }: { series: FitnessDay[] }) {
  const score = lastOf(series, "endurance_score");
  const raw = [...series].reverse().find((d) => d.endurance_limits_json)?.endurance_limits_json;
  const lim = useMemo(() => {
    try {
      return raw ? (JSON.parse(raw) as Record<string, number>) : null;
    } catch {
      return null;
    }
  }, [raw]);
  const trendV = trend(series, "endurance_score");
  if (score == null || !lim) {
    return (
      <Card className="gap-1 px-5 py-4">
        <p className="text-[15px] font-medium">Score d'endurance</p>
        <p className="text-muted-foreground text-sm">{score != null ? `${nf(score)} — les niveaux apparaîtront après la prochaine synchronisation.` : "Pas encore de mesure."}</p>
      </Card>
    );
  }
  const edges = [lim.gaugeLowerLimit, lim.classificationLowerLimitIntermediate, lim.classificationLowerLimitTrained, lim.classificationLowerLimitWellTrained, lim.classificationLowerLimitExpert, lim.classificationLowerLimitSuperior, lim.classificationLowerLimitElite, lim.gaugeUpperLimit];
  const base = edges[0];
  const zones = ENDURANCE_LEVELS.map((l, i) => ({ from: edges[i] - base, to: edges[i + 1] - base, color: l.color }));
  const idx = Math.max(0, edges.findIndex((e, i) => i < 7 && score >= e && score < edges[i + 1]));
  const level = ENDURANCE_LEVELS[score >= edges[7] ? 6 : idx];
  const next = score < edges[6] ? edges[(score >= edges[7] ? 6 : idx) + 1] : null;
  return (
    <Card className="gap-4 px-5 py-5">
      <p className="text-[15px] font-medium">Score d'endurance</p>
      <ArcGauge value={score - base} max={edges[7] - base} zones={zones} size={220} label={`Score d'endurance : ${nf(score)}, ${level.label}`}>
        <span className="text-[44px] leading-[44px] font-semibold tracking-tight tabular-nums">{nf(score)}</span>
        <span className="mt-1 text-lg font-medium" style={{ color: level.color }}>{level.label}</span>
      </ArcGauge>
      <div className="text-muted-foreground grid gap-1 text-[13px]">
        {next != null && <p>Niveau suivant à {nf(next)} (encore {nf(next - score)}).</p>}
        {trendV != null && <p>{signed(trendV, 0)} sur 4 semaines.</p>}
      </div>
    </Card>
  );
}

/* ---------- Score de montée ---------- */
function HillCard({ series }: { series: FitnessDay[] }) {
  const score = lastOf(series, "hill_score");
  const row = [...series].reverse().find((d) => d.hill_strength != null || d.hill_endurance != null);
  const cls = lastOf(series, "hill_class");
  const t = trend(series, "hill_score");
  return (
    <Card className="gap-4 px-5 py-5">
      <p className="text-[15px] font-medium">Score de montée</p>
      <div className="flex items-baseline gap-3">
        <span className="text-[52px] leading-[52px] font-semibold tracking-tight tabular-nums" style={{ color: C.orange }}>{score != null ? nf(score) : "—"}</span>
        <span className="text-muted-foreground text-lg">100</span>
        {cls === 3 && <span className="ml-auto text-lg font-medium">Entraîné</span>}
      </div>
      <div className="grid gap-2.5">
        <p className="text-muted-foreground text-xs font-medium">Facteurs</p>
        <Factor label="Endurance en montée" value={row?.hill_endurance != null ? nf(row.hill_endurance) : "—"} />
        <Factor label="Puissance en montée" value={row?.hill_strength != null ? nf(row.hill_strength) : "—"} />
        <Factor label="VO₂ max" value={lastOf(series, "vo2max") != null ? nf(lastOf(series, "vo2max")!, 1) : "—"} />
      </div>
      {t != null && <p className="text-muted-foreground text-[13px]">{signed(t, 0)} sur 4 semaines.</p>}
    </Card>
  );
}

/* ---------- VO₂ max : barème Garmin (hommes). L'API ne fournit pas ces tranches. ---------- */
const VO2_PROFILE = { sex: "homme" } as const;
// Limites basses des niveaux Passable / Bon / Excellent / Supérieur, par tranche d'âge (hommes).
const VO2_TABLE_MEN: { maxAge: number; limits: [number, number, number, number] }[] = [
  { maxAge: 29, limits: [41.7, 45.4, 51.1, 55.4] },
  { maxAge: 39, limits: [41.0, 44.4, 48.9, 54.0] },
  { maxAge: 49, limits: [38.5, 42.4, 46.8, 52.5] },
  { maxAge: 59, limits: [35.6, 39.2, 43.3, 48.9] },
];
const VO2_LEVELS = [
  { label: "Faible", color: "#E5322D" },
  { label: "Passable", color: "#E8700A" },
  { label: "Bon", color: "#16A34A" },
  { label: "Excellent", color: "#1B7FDB" },
  { label: "Supérieur", color: "#8B5CF6" },
] as const;

function Vo2Card({ series }: { series: FitnessDay[] }) {
  const v = lastOf(series, "vo2max");
  const age = lastOf(series, "chrono_age") ?? 29;
  const row = VO2_TABLE_MEN.find((r) => age <= r.maxAge) ?? VO2_TABLE_MEN[VO2_TABLE_MEN.length - 1];
  const lo = 30;
  const hi = 65;
  const edges = [lo, ...row.limits, hi];
  const zones = VO2_LEVELS.map((l, i) => ({ from: edges[i] - lo, to: edges[i + 1] - lo, color: l.color }));
  const lvl = v == null ? null : VO2_LEVELS[Math.max(0, edges.slice(1, 5).filter((e) => v >= e).length)];
  const t = trend(series, "vo2max");
  return (
    <Card className="gap-4 px-5 py-5">
      <p className="text-[15px] font-medium">VO₂ max</p>
      <ArcGauge value={v == null ? null : Math.max(0, v - lo)} max={hi - lo} zones={zones} size={220} label={`VO2 max : ${v ?? "inconnu"}, ${lvl?.label ?? ""}`}>
        <span className="text-[44px] leading-[44px] font-semibold tracking-tight tabular-nums">{v != null ? nf(v, 1) : "—"}</span>
        {lvl && <span className="mt-1 text-lg font-medium" style={{ color: lvl.color }}>{lvl.label}</span>}
      </ArcGauge>
      <div className="text-muted-foreground grid gap-1 text-[13px]">
        <p>Barème Garmin : {VO2_PROFILE.sex}, {row.maxAge === 29 ? "20 à 29" : `jusqu'à ${row.maxAge}`} ans.</p>
        {t != null && <p>{signed(t, 1)} sur 4 semaines.</p>}
      </div>
    </Card>
  );
}

function Tile({ label, value, unit, sub, color }: { label: string; value: string; unit?: string; sub?: React.ReactNode; color?: string }) {
  return (
    <Card className="gap-1 px-4 py-3.5">
      <p className="text-muted-foreground text-[13px]">{label}</p>
      <p className="flex items-baseline gap-1 tracking-tight">
        <span className="text-[28px] leading-8 font-semibold tabular-nums" style={color ? { color } : undefined}>
          {value}
        </span>
        {unit && <span className="text-muted-foreground text-sm font-medium">{unit}</span>}
      </p>
      <div className="text-muted-foreground min-h-5 text-xs">{sub}</div>
    </Card>
  );
}

/* ---------- Évolution des scores de condition ---------- */
const METRICS = [
  { value: "vo2max", label: "VO₂ max", unit: "ml/kg/min", color: C.blue, digits: 1 },
  { value: "endurance_score", label: "Endurance", unit: "", color: C.violet, digits: 0 },
  { value: "hill_score", label: "Montée", unit: "", color: C.orange, digits: 0 },
  { value: "fitness_age", label: "Âge physique", unit: "ans", color: C.green, digits: 1 },
] as const;

function EvolutionCard({ series }: { series: FitnessDay[] }) {
  const [key, setKey] = useState<(typeof METRICS)[number]["value"]>("vo2max");
  const m = METRICS.find((x) => x.value === key)!;
  const pts = series.filter((d) => typeof d[key] === "number");
  const option = useMemo<Opt | null>(() => {
    if (pts.length < 2) return null;
    const vals = pts.map((d) => d[key] as number);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.25, key === "fitness_age" || key === "vo2max" ? 0.5 : 5);
    return {
      animation: false,
      grid: { left: 46, right: 14, top: 14, bottom: 26 },
      xAxis: { type: "category", data: pts.map((d) => d.date), boundaryGap: false, axisLine: { lineStyle: { color: C.grid } }, axisTick: { show: false }, axisLabel: { ...axisText, formatter: (v: string) => shortDay(v), hideOverlap: true }, axisPointer: axisPointerLine },
      yAxis: { type: "value", min: Math.floor((lo - pad) * 10) / 10, max: Math.ceil((hi + pad) * 10) / 10, splitNumber: 3, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...axisText, formatter: (v: number) => nf(v, m.digits) }, splitLine: { lineStyle: { color: C.grid } } },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: C.pointer } },
        formatter: (ps: { dataIndex: number; value: number }[]) => (ps[0] ? tipTitle(shortDay(pts[ps[0].dataIndex].date)) + tipRow(m.color, m.label, `${nf(ps[0].value, m.digits)}${m.unit ? ` ${m.unit}` : ""}`) : ""),
      },
      series: [{ type: "line", data: vals, showSymbol: pts.length < 30, symbolSize: 5, smooth: 0.2, lineStyle: { width: 2.4, color: m.color }, itemStyle: { color: m.color }, areaStyle: { color: m.color, opacity: 0.08 } }],
    } as Opt;
  }, [pts, key, m]);
  return (
    <Card className="gap-4 px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] font-medium">Évolution de ta condition</p>
        <Segmented label="Indicateur" size="sm" value={key} onChange={setKey} options={METRICS.map((x) => ({ value: x.value, label: x.label }))} />
      </div>
      {option ? (
        <Chart option={option} height={200} label={`Évolution : ${m.label}`} />
      ) : (
        <p className="text-muted-foreground text-sm">Pas encore assez de mesures : l'historique s'enrichit à chaque synchronisation.</p>
      )}
    </Card>
  );
}

/** Indicateurs Garmin essentiels pour la course : préparation, Body Battery, condition physique, sommeil. */
export function GarminScores({ series, latest, bbTimeline }: { series: FitnessDay[]; latest: FitnessDay | null | undefined; bbTimeline?: FitnessResponse["bb_timeline"] }) {
  const age = lastOf(series, "fitness_age");
  const target = lastOf(series, "fitness_age_target");
  const sleep = lastOf(series, "sleep_score");
  const rhr = lastOf(series, "resting_hr");
  const chrono = lastOf(series, "chrono_age");
  const tr = (k: keyof FitnessDay, dec = 0, down = false) => {
    const t = trend(series, k);
    return t == null ? null : <Delta value={t} goodWhen={down ? "down" : "up"} text={`${signed(t, dec)} en 4 sem.`} />;
  };
  const sl = sleepInfo(sleep);

  return (
    <div className="grid gap-4">
      <ReadinessCard series={series} latest={latest} />
      <BodyBatteryCard series={series} tl={bbTimeline} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Vo2Card series={series} />
        <EnduranceCard series={series} />
        <HillCard series={series} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Tile
          label="Âge physique"
          value={age != null ? nf(age, 0) : "—"}
          unit="ans"
          sub={age != null && chrono != null ? <span>{nf(chrono, 0)} ans réels · {signed(age - chrono, 0)}{target != null ? ` · objectif ${nf(target, 0)} ans` : ""}</span> : tr("fitness_age", 1, true)}
          color={C.green}
        />
        <Tile label="FC de repos" value={rhr != null ? nf(rhr) : "—"} unit="bpm" sub={tr("resting_hr", 0, true)} color={C.pink} />
      </div>
      <EvolutionCard series={series} />
      {sl && sleep != null && (
        <p className="text-muted-foreground px-1 text-xs">Sommeil de la dernière nuit : {nf(sleep)} sur 100 ({sl.label.toLowerCase()}).</p>
      )}
    </div>
  );
}
