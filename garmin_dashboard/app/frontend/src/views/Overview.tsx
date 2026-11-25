import { useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  HeartPulse,
  MoveRight,
  NotebookPen,
  RefreshCw,
  Route as RouteIcon,
  Timer,
  Waves,
} from "lucide-react";

import { ArcGauge, sleepInfo } from "@/components/GarminScoresCard";
import {
  Delta,
  EmptyState,
  QueryError,
  SportTile,
  StatusPill,
  Value,
} from "@/components/common";
import { KpiCard } from "@/components/KpiCard";
import { MiniTrack } from "@/components/MiniTrack";
import { SparkBars, SparkLine } from "@/components/Spark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/hooks/useQuery";
import { api, type ActivityListItem } from "@/lib/api";
import { matchSport, useFilters } from "@/lib/filters";
import {
  addDays,
  dayLabel,
  fmtClock,
  fmtDeltaClock,
  fmtHM,
  hrvStatus,
  isoDate,
  nf,
  parseDay,
  READINESS_ZONES,
  readinessInfo,
  shortDay,
  signed,
  sportGroup,
  SPORT_LABEL,
  speedDisplay,
  teInfo,
  timeOf,
  trainingStatus,
  tsbInfo,
  weekStart,
} from "@/lib/format";
import { C } from "@/lib/palette";

/** Chiffre principal d'une carte : un seul par carte, tout le reste est secondaire. */
const HERO =
  "text-[44px] leading-[48px] font-bold tracking-[-0.03em] tabular-nums";
const UNIT = "text-muted-foreground text-[15px] font-medium";

/* ---------- Aujourd'hui ---------- */
function todayVerdict(
  tsb: number | null | undefined,
  hrv: string | null | undefined,
  readiness: number | null | undefined,
) {
  const h = (hrv ?? "").toUpperCase();
  if (
    (tsb != null && tsb < -30) ||
    h === "LOW" ||
    h === "POOR" ||
    (readiness != null && readiness < 25)
  )
    return {
      title: "Récupération",
      detail: "Fatigue élevée : repos ou très facile aujourd'hui.",
      color: C.red,
    };
  if (
    (tsb != null && tsb < -20) ||
    h === "UNBALANCED" ||
    (readiness != null && readiness < 45)
  )
    return {
      title: "Séance légère",
      detail: "Le corps encaisse la charge : reste en endurance facile.",
      color: C.orange,
    };
  if (tsb != null && tsb > 5 && (readiness == null || readiness >= 60))
    return {
      title: "Prêt pour une séance clé",
      detail:
        "Bien reposé : bon moment pour de l'intensité ou une sortie longue.",
      color: C.green,
    };
  return {
    title: "Séance normale",
    detail: "Charge et récupération équilibrées : suis ton programme.",
    color: C.blue,
  };
}

function GaugeNumber({ v }: { v: number | null }) {
  return (
    <span className="text-[26px] leading-7 font-semibold tracking-[-0.02em] tabular-nums">
      {v != null ? Math.round(v) : "—"}
    </span>
  );
}

function Gauge({
  title,
  sub,
  color,
  children,
}: {
  title: string;
  sub?: string;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <p className="text-muted-foreground text-[12px] font-medium">{title}</p>
      <div className="mt-1">{children}</div>
      {sub && (
        <p className="mt-0.5 text-[13px] font-semibold" style={{ color }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function TodayCard() {
  const fit = useQuery("fitness:90", () => api.fitness(90));
  const plans = useQuery("plans", () => api.plans());
  const pred = useQuery("pred:60", () => api.predictions(60));
  const [chosen, setChosen] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem("objective-plan");
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });
  const list = plans.data?.plans ?? [];
  const planId = useMemo(() => {
    if (chosen != null && list.some((p) => p.id === chosen)) return chosen;
    const today = isoDate(new Date());
    const upcoming = list.filter((p) => !p.goal_date || p.goal_date >= today);
    return (upcoming.length ? upcoming : list)[0]?.id ?? null;
  }, [list, chosen]);
  function choose(id: number) {
    setChosen(id);
    try {
      localStorage.setItem("objective-plan", String(id));
    } catch {
      /* stockage indisponible : le choix vaut pour cette visite */
    }
  }
  const plan = useQuery(`plan:${planId}`, () =>
    planId == null ? Promise.resolve(null) : api.plan(planId),
  );

  const series = fit.data?.series ?? [];
  const latest = fit.data?.latest;
  const lastWith = (k: "readiness_score" | "hrv_status") =>
    [...series].reverse().find((d) => d[k] != null);
  const readiness = lastWith("readiness_score")?.readiness_score ?? null;
  const hrvRaw = lastWith("hrv_status")?.hrv_status ?? null;
  const v = todayVerdict(latest?.tsb, hrvRaw, readiness);
  const hrv = hrvStatus(hrvRaw);
  const rd = readinessInfo(readiness);
  const status = trainingStatus(latest?.training_status);

  const p = plan.data;
  const goal = useMemo(() => {
    if (!p) return null;
    const today = p.today;
    const daysLeft = p.goal_date
      ? Math.ceil(
          (parseDay(p.goal_date).getTime() - parseDay(today).getTime()) /
            86400000,
        )
      : null;
    let idx = 0;
    p.weeks.forEach((w, i) => {
      if (w.week <= today) idx = i;
    });
    const upTo = p.weeks.slice(0, idx + 1);
    const planned = upTo.reduce((a, w) => a + w.planned_km, 0);
    const done = upTo.reduce((a, w) => a + w.done_km, 0);
    const session = p.sessions_detail.find(
      (s) => s.date === today && s.type !== "info",
    );
    return {
      daysLeft,
      week: idx + 1,
      weeks: p.weeks.length,
      planned,
      done,
      pct: planned > 0 ? Math.min(done / planned, 1) : 0,
      session,
    };
  }, [p]);

  const loading = fit.loading && !fit.data;
  const today = series[series.length - 1];
  const tl = fit.data?.bb_timeline;
  const bb =
    today?.body_battery_now ??
    (tl && tl.date === today?.date
      ? tl.points[tl.points.length - 1]?.[1]
      : null) ??
    null;
  const bbColor =
    bb == null
      ? C.blue
      : bb >= 75
        ? C.green
        : bb >= 50
          ? C.blue
          : bb >= 25
            ? C.orange
            : C.red;
  const sleep =
    [...series].reverse().find((d) => d.sleep_score != null)?.sleep_score ??
    null;
  const sl = sleepInfo(sleep);

  return (
    <Card className="hero-in grid gap-6 px-6 py-6 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-10">
      <section aria-label="État du jour" className="flex flex-col gap-4">
        <h2 className="text-muted-foreground text-[13px] font-semibold">
          Aujourd'hui
        </h2>
        {loading ? (
          <div className="grid gap-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
        ) : (
          <div>
            <p
              className="text-[32px] leading-9 font-bold tracking-[-0.03em]"
              style={{ color: v.color }}
            >
              {v.title}
            </p>
            <p className="text-muted-foreground mt-1.5 max-w-[46ch] text-[15px] leading-[22px]">
              {v.detail}
            </p>
          </div>
        )}
        <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-4 border-t pt-4 sm:grid-cols-4">
          <Gauge title="Sommeil" sub={sl?.label} color={sl?.color}>
            <ArcGauge
              value={sleep}
              color={sl?.color}
              size={96}
              label={`Score de sommeil : ${sleep ?? "inconnu"} sur 100`}
            >
              <GaugeNumber v={sleep} />
            </ArcGauge>
          </Gauge>
          <Gauge
            title="Body Battery"
            sub={
              bb != null
                ? bb >= 75
                  ? "Élevée"
                  : bb >= 50
                    ? "Correcte"
                    : bb >= 25
                      ? "Basse"
                      : "Très basse"
                : undefined
            }
            color={bbColor}
          >
            <ArcGauge
              value={bb}
              color={bbColor}
              size={96}
              label={`Body Battery : ${bb ?? "inconnue"} sur 100`}
            >
              <GaugeNumber v={bb} />
            </ArcGauge>
          </Gauge>
          <Gauge title="Disponibilité" sub={rd?.label} color={rd?.color}>
            <ArcGauge
              value={readiness}
              zones={READINESS_ZONES}
              size={96}
              label={`Préparation à l'entraînement : ${readiness ?? "inconnue"} sur 100`}
            >
              <GaugeNumber v={readiness} />
            </ArcGauge>
          </Gauge>
          <Gauge title="VFC" sub={hrv?.label} color={hrv?.color}>
            <div
              className="flex items-center justify-center"
              style={{ height: 88 }}
              role="img"
              aria-label={`Statut de la VFC : ${hrv?.label ?? "inconnu"}`}
            >
              <span
                className="flex size-12 items-center justify-center rounded-full"
                style={{ background: hrv?.color ?? C.gray }}
              >
                <Check
                  className="size-6 text-white"
                  strokeWidth={3}
                  aria-hidden
                />
              </span>
            </div>
          </Gauge>
        </div>
        {status && (
          <p className="text-muted-foreground -mt-1 text-[12px]">
            Statut d'entraînement Garmin :{" "}
            <span className="text-foreground font-medium">{status.label}</span>
          </p>
        )}
      </section>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-muted-foreground text-[13px] font-semibold">
            Objectif
          </h2>
          {list.length > 1 && (
            <select
              aria-label="Programme affiché"
              value={planId ?? ""}
              onChange={(e) => choose(Number(e.target.value))}
              className="bg-secondary text-secondary-foreground focus-visible:ring-ring/60 max-w-[60%] truncate rounded-full border-0 px-3 py-1 text-[13px] font-medium outline-none focus-visible:ring-[3px]"
            >
              {list.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.goal_name ?? x.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <a
          href="#/plan"
          aria-label="Ouvrir le programme"
          className="group hover:bg-foreground/[0.04] focus-visible:ring-ring/60 -m-3 flex flex-1 flex-col gap-4 rounded-2xl p-3 transition-colors duration-150 outline-none focus-visible:ring-[3px] active:bg-foreground/[0.07]"
        >
          {plan.loading && !p ? (
            <div className="grid gap-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-2 w-full" />
            </div>
          ) : !p || !goal ? (
            <p className="text-muted-foreground text-[15px]">
              Aucun programme en cours. Importe-en un depuis l'onglet Programme.
            </p>
          ) : (
            <>
              <div>
                <p className="flex items-center justify-between gap-2 text-[20px] leading-6 font-semibold tracking-tight">
                  {p.goal_name ?? p.name}
                  <ChevronRight
                    className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </p>
                <p className="text-muted-foreground mt-1 text-[15px] tabular-nums">
                  {goal.daysLeft != null
                    ? goal.daysLeft >= 0
                      ? `J-${goal.daysLeft}`
                      : "Terminé"
                    : `${goal.weeks} semaines`}
                  {` · semaine ${goal.week} sur ${goal.weeks}`}
                </p>
              </div>
              <div>
                <div
                  className="bg-secondary h-2 overflow-hidden rounded-full"
                  role="progressbar"
                  aria-valuenow={Math.round(goal.pct * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Kilomètres réalisés par rapport au programme"
                >
                  <div
                    className="bar-fill h-full rounded-full"
                    style={{ width: `${goal.pct * 100}%`, background: C.green }}
                  />
                </div>
                <p className="text-muted-foreground mt-2 text-[13px] tabular-nums">
                  {nf(goal.done)} km réalisés sur {nf(goal.planned)} prévus à ce
                  jour
                </p>
              </div>
              <p className="text-[15px] leading-5">
                <span className="text-muted-foreground">Aujourd'hui : </span>
                <span className="font-medium">
                  {goal.session
                    ? `${goal.session.title}${goal.session.km ? ` · ${nf(goal.session.km, 1)} km` : ""}`
                    : "pas de séance prévue"}
                </span>
              </p>
            </>
          )}
          {pred.data?.latest?.time_half_s != null && (
            <p className="text-muted-foreground mt-auto border-t pt-3 text-[13px]">
              Semi-marathon prédit par Garmin :{" "}
              <span className="text-foreground font-semibold tabular-nums">
                {fmtClock(pred.data.latest.time_half_s)}
              </span>
            </p>
          )}
        </a>
      </div>
    </Card>
  );
}

/* ---------- Volume hebdomadaire ---------- */
function weeklyBuckets(items: ActivityListItem[], now: Date, weeks = 8) {
  const ws = weekStart(now);
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const s = addDays(ws, -7 * (weeks - 1 - i));
    return {
      key: isoDate(s),
      week: shortDay(isoDate(s)),
      km: 0,
      sec: 0,
      dplus: 0,
      count: 0,
    };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const a of items) {
    const b = byKey.get(isoDate(weekStart(parseDay(a.activity_date))));
    if (!b) continue;
    b.km += (a.distance_m ?? 0) / 1000;
    b.sec += a.duration_s ?? 0;
    b.dplus += a.elevation_gain_m ?? 0;
    b.count += 1;
  }
  return buckets.map((b) => ({ ...b, km: Math.round(b.km * 10) / 10 }));
}

function VolumeCard({
  items,
  label,
}: {
  items: ActivityListItem[] | undefined;
  label: string;
}) {
  const buckets = useMemo(
    () => (items ? weeklyBuckets(items, new Date()) : null),
    [items],
  );
  return (
    <KpiCard title="Volume hebdo" icon={<RouteIcon />} color={C.blue}>
      {!buckets ? (
        <KpiSkeleton />
      ) : (
        (() => {
          const cur = buckets[buckets.length - 1];
          // Strava compare au même jour de la semaine précédente (lundi → aujourd'hui inclus)
          const now = new Date();
          const ws = weekStart(now);
          const offset = Math.round(
            (parseDay(isoDate(now)).getTime() - ws.getTime()) / 86400000,
          );
          const pStart = isoDate(addDays(ws, -7));
          const pEnd = isoDate(addDays(ws, -7 + offset));
          let prevKm = 0;
          for (const a of items ?? [])
            if (a.activity_date >= pStart && a.activity_date <= pEnd)
              prevKm += (a.distance_m ?? 0) / 1000;
          const hm = (sec: number) => {
            const m = Math.round(sec / 60);
            return m < 60
              ? `${m} min`
              : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
          };
          const before = buckets.slice(-5, -1).map((b) => b.km);
          const avg = before.length
            ? before.reduce((a, b) => a + b, 0) / before.length
            : null;
          const diff = cur.km - prevKm;
          return (
            <>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className={HERO}>{nf(cur.km, 1)}</span>
                  <span className={UNIT}>km</span>
                  <span className="ml-auto self-center">
                    <Delta
                      neutral
                      value={diff}
                      text={`${nf(Math.abs(diff), 1)} km`}
                    />
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-[13px] tabular-nums">
                  {hm(cur.sec)} · {cur.count} sortie{cur.count > 1 ? "s" : ""} ·
                  D+ {nf(cur.dplus)} m
                </p>
                <p className="text-muted-foreground text-[12px]">
                  vs même jour de la semaine dernière · {label}
                </p>
              </div>
              <div className="mt-auto">
                <SparkBars
                  labels={buckets.map((b) => b.week)}
                  values={buckets.map((b) => b.km)}
                  color={C.blue}
                  avg={avg}
                  label="Kilomètres par semaine sur les 8 dernières semaines"
                />
                <p className="text-muted-foreground text-[12px]">
                  8 semaines · pointillé : moyenne des 4 précédentes
                </p>
              </div>
            </>
          );
        })()
      )}
    </KpiCard>
  );
}

/* ---------- Forme / fraîcheur ---------- */
function FormCard() {
  const fit = useQuery("fitness:90", () => api.fitness(90));
  const latest = fit.data?.latest;
  const info = tsbInfo(latest?.tsb);
  const points = useMemo(
    () =>
      (fit.data?.series ?? [])
        .filter((d) => d.tsb != null)
        .slice(-30)
        .map((d) => ({ label: shortDay(d.date), value: d.tsb })),
    [fit.data],
  );
  return (
    <KpiCard
      title="Forme & fraîcheur"
      icon={<HeartPulse />}
      color={C.pink}
      href="#/fitness"
    >
      {fit.loading ? (
        <KpiSkeleton />
      ) : !latest || latest.tsb == null ? (
        <p className="text-muted-foreground py-6 text-sm">
          Pas encore de donnée de forme.
        </p>
      ) : (
        <>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className={HERO}>{signed(latest.tsb)}</span>
              <span className={UNIT}>TSB</span>
              {info && (
                <span className="ml-auto self-center">
                  <StatusPill color={info.color}>{info.label}</StatusPill>
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-[13px] tabular-nums">
              Forme {nf(latest.ctl)} · Fatigue {nf(latest.atl)}
            </p>
            <p className="text-muted-foreground text-[12px] text-pretty">
              {info?.hint}
            </p>
          </div>
          <div className="mt-auto">
            <SparkLine
              points={points}
              color={info?.color ?? C.gray}
              unit=""
              name="TSB"
              zero
              band={{ from: -30, to: -10, color: `${C.green}1f` }}
              label="Fraîcheur (TSB) sur 30 jours"
            />
            <p className="text-muted-foreground text-[12px]">
              30 jours · zone verte : progression productive
            </p>
          </div>
        </>
      )}
    </KpiCard>
  );
}

/* ---------- VFC nocturne ---------- */
function HrvCard() {
  const fit = useQuery("fitness:90", () => api.fitness(90));
  const series = fit.data?.series ?? [];
  const last = [...series].reverse().find((d) => d.hrv_last_night_ms != null);
  const diff =
    last && last.hrv_weekly_avg_ms != null
      ? (last.hrv_last_night_ms as number) - last.hrv_weekly_avg_ms
      : null;
  const st = hrvStatus(last?.hrv_status);
  const points = series
    .filter((d) => d.hrv_last_night_ms != null)
    .slice(-14)
    .map((d) => ({ label: shortDay(d.date), value: d.hrv_last_night_ms }));
  const avg = last?.hrv_weekly_avg_ms ?? null;
  return (
    <KpiCard
      title="VFC nocturne"
      icon={<Waves />}
      color={C.violet}
      href="#/fitness"
    >
      {fit.loading ? (
        <KpiSkeleton />
      ) : !last ? (
        <p className="text-muted-foreground py-6 text-sm">
          Pas encore de mesure de VFC.
        </p>
      ) : (
        <>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className={HERO}>{nf(last.hrv_last_night_ms)}</span>
              <span className={UNIT}>ms</span>
              <span className="ml-auto self-center">
                <Delta value={diff} text={`${signed(diff)} ms`} />
              </span>
            </div>
            <p className="text-muted-foreground mt-1 flex items-center gap-2 text-[13px] tabular-nums">
              Moyenne 7 j : {nf(avg)} ms
              {st && <StatusPill color={st.color}>{st.label}</StatusPill>}
            </p>
          </div>
          <div className="mt-auto">
            <SparkLine
              points={points}
              color={C.violet}
              unit="ms"
              name="VFC"
              band={
                avg != null
                  ? { from: avg * 0.9, to: avg * 1.1, color: `${C.violet}24` }
                  : undefined
              }
              label="VFC nocturne sur les 14 dernières nuits"
            />
            <p className="text-muted-foreground text-[12px]">
              14 nuits · bande : ±10 % de la moyenne 7 j
            </p>
          </div>
        </>
      )}
    </KpiCard>
  );
}

/* ---------- Prédictions ---------- */
function PredictionsCard() {
  const pred = useQuery("pred:60", () => api.predictions(60));
  const l = pred.data?.latest;
  const d = pred.data?.delta_s_since_first;
  const small = [
    { label: "5 km", v: l?.time_5k_s, d: d?.["5k"] },
    { label: "10 km", v: l?.time_10k_s, d: d?.["10k"] },
  ];
  return (
    <KpiCard
      title="Prédictions de chrono"
      icon={<Timer />}
      color={C.orange}
      href="#/predictions"
    >
      {pred.loading ? (
        <KpiSkeleton />
      ) : !l ? (
        <p className="text-muted-foreground py-6 text-sm">
          Pas encore de prédiction Garmin.
        </p>
      ) : (
        <>
          <div>
            <p className="text-muted-foreground text-[13px]">Semi-marathon</p>
            <div className="flex items-baseline gap-1.5">
              <span className={HERO}>{fmtClock(l.time_half_s)}</span>
              <span className="ml-auto self-center">
                <Delta
                  value={d?.half}
                  goodWhen="down"
                  text={fmtDeltaClock(d?.half)}
                />
              </span>
            </div>
          </div>
          <ul className="mt-auto grid gap-2.5 border-t pt-3.5">
            {small.map((r) => (
              <li key={r.label} className="flex items-center gap-2">
                <span className="text-muted-foreground w-16 text-[13px]">
                  {r.label}
                </span>
                <span className="text-[17px] font-semibold tracking-tight tabular-nums">
                  {fmtClock(r.v)}
                </span>
                <span className="ml-auto">
                  <Delta
                    value={r.d}
                    goodWhen="down"
                    text={fmtDeltaClock(r.d)}
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-[12px]">
            Variation sur 60 jours · mise à jour {shortDay(l.date)}
          </p>
        </>
      )}
    </KpiCard>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid gap-3 pt-1">
      <Skeleton className="h-11 w-32" />
      <Skeleton className="h-4 w-44" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

/* ---------- Liste des sorties ---------- */
function weekLabel(key: string): string {
  const now = isoDate(weekStart(new Date()));
  if (key === now) return "Cette semaine";
  if (key === isoDate(addDays(weekStart(new Date()), -7)))
    return "Semaine dernière";
  return `Semaine du ${shortDay(key)}`;
}

function TeCell({ a }: { a: ActivityListItem }) {
  const info = teInfo(a.aerobic_te);
  if (!info) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5" title={info.label}>
      <span
        className="size-2 rounded-full"
        style={{ background: info.color }}
      />
      <span className="font-semibold">{nf(a.aerobic_te, 1)}</span>
      {(a.anaerobic_te ?? 0) >= 0.5 && (
        <span className="text-muted-foreground text-xs">
          / {nf(a.anaerobic_te, 1)}
        </span>
      )}
    </span>
  );
}

function ActivityRow({ a }: { a: ActivityListItem }) {
  const g = sportGroup(a.sport_type);
  const speed = speedDisplay(a.sport_type, a.avg_speed_ms);
  const hasDist = (a.distance_m ?? 0) > 100;
  const cell = "hidden md:block text-right";
  return (
    <a
      href={`#/activity/${a.activity_id}`}
      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1 px-4 py-3 outline-none transition-colors duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.07] active:bg-foreground/[0.07] md:grid-cols-[auto_88px_minmax(0,1.5fr)_repeat(5,minmax(0,0.75fr))] md:gap-x-4"
    >
      <SportTile type={a.sport_type} />
      {a.mini_track && a.mini_track.length > 1 ? (
        <MiniTrack
          points={a.mini_track}
          type={a.sport_type}
          className="hidden h-12 w-[88px] md:block"
        />
      ) : (
        <span aria-hidden className="hidden w-[88px] md:block" />
      )}
      <div className="min-w-0">
        <p className="flex items-start gap-1.5 text-[15px] leading-5 font-semibold tracking-tight">
          <span className="line-clamp-2 md:truncate">
            {a.name || SPORT_LABEL[g]}
          </span>
          {a.has_notes ? (
            <NotebookPen
              className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
              aria-label="Notes enregistrées"
            />
          ) : null}
        </p>
        <p className="text-muted-foreground truncate text-[13px]">
          {dayLabel(a.activity_date)} · {timeOf(a.start_time_local)} ·{" "}
          {fmtHM(a.duration_s)}
        </p>
        <p className="text-muted-foreground mt-0.5 text-[13px] md:hidden">
          {hasDist ? `${nf((a.distance_m ?? 0) / 1000, 1)} km` : "—"}
          {speed.value !== "—" && hasDist
            ? ` · ${speed.value} ${speed.unit}`
            : ""}
          {(a.elevation_gain_m ?? 0) > 0
            ? ` · D+ ${nf(a.elevation_gain_m)} m`
            : ""}
          {a.avg_hr ? ` · ${nf(a.avg_hr)} bpm` : ""}
        </p>
        {a.aerobic_te != null && (
          <p className="mt-0.5 text-[13px] md:hidden">
            <TeCell a={a} />
          </p>
        )}
      </div>
      <div className={cell}>
        {hasDist ? (
          <Value
            value={nf((a.distance_m ?? 0) / 1000, 2)}
            unit="km"
            size="sm"
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div className={cell}>
        {(a.elevation_gain_m ?? 0) > 0 ? (
          <Value value={nf(a.elevation_gain_m)} unit="m" size="sm" />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div className={cell}>
        {hasDist && speed.value !== "—" ? (
          <Value value={speed.value} unit={speed.unit} size="sm" />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div className={cell}>
        {a.avg_hr ? (
          <Value value={nf(a.avg_hr)} unit="bpm" size="sm" />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div className={`${cell} text-[15px]`}>
        <TeCell a={a} />
      </div>
    </a>
  );
}

function ActivityList({
  items,
  period,
}: {
  items: ActivityListItem[];
  period: number;
}) {
  const [shown, setShown] = useState(40);
  const groups = useMemo(() => {
    const map = new Map<string, ActivityListItem[]>();
    for (const a of items.slice(0, shown)) {
      const k = isoDate(weekStart(parseDay(a.activity_date)));
      (map.get(k) ?? map.set(k, []).get(k)!).push(a);
    }
    return [...map.entries()];
  }, [items, shown]);

  // Totaux par semaine calculés sur toutes les sorties (pas seulement les lignes affichées)
  const totals = useMemo(() => {
    const t = new Map<string, { km: number; sec: number }>();
    for (const a of items) {
      const k = isoDate(weekStart(parseDay(a.activity_date)));
      const cur = t.get(k) ?? { km: 0, sec: 0 };
      cur.km += (a.distance_m ?? 0) / 1000;
      cur.sec += a.duration_s ?? 0;
      t.set(k, cur);
    }
    return t;
  }, [items]);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="text-muted-foreground hidden grid-cols-[auto_88px_minmax(0,1.5fr)_repeat(5,minmax(0,0.75fr))] gap-x-4 border-b px-4 py-2.5 text-xs font-medium md:grid">
        <span className="w-10" />
        <span>Tracé</span>
        <span>Sortie</span>
        <span className="text-right">Distance</span>
        <span className="text-right">D+</span>
        <span className="text-right">Allure</span>
        <span className="text-right">FC moy.</span>
        <span
          className="text-right"
          title="Effet d'entraînement aérobie (0 à 5), puis anaérobie"
        >
          Effet aéro.
        </span>
      </div>
      {groups.map(([key, rows]) => {
        const tot = totals.get(key)!;
        return (
          <section key={key} aria-label={weekLabel(key)}>
            <div className="bg-foreground/[0.03] flex items-center justify-between border-b px-4 py-2 first:border-t-0">
              <h3 className="text-[13px] font-semibold tracking-tight">
                {weekLabel(key)}
              </h3>
              <p className="text-muted-foreground text-xs">
                {nf(tot.km, 1)} km · {fmtHM(tot.sec)}
              </p>
            </div>
            <div className="divide-y divide-border">
              {rows.map((a) => (
                <ActivityRow key={a.activity_id} a={a} />
              ))}
            </div>
          </section>
        );
      })}
      {items.length > shown && (
        <div className="flex justify-center border-t p-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShown((n) => n + 40)}
          >
            Afficher plus ({items.length - shown} restantes)
          </Button>
        </div>
      )}
      <p className="text-muted-foreground border-t px-4 py-2.5 text-xs">
        {items.length} sortie{items.length > 1 ? "s" : ""} sur{" "}
        {period === 365 ? "1 an" : `${period} jours`}
      </p>
    </Card>
  );
}

/* ---------- Vue ---------- */
export default function Overview() {
  const { period, sport } = useFilters();
  const today = new Date();
  const fetchDays = Math.max(period, 63);
  const start = isoDate(addDays(today, -(fetchDays - 1)));
  const acts = useQuery(`acts:${start}`, () =>
    api.activities({ start, limit: 500 }),
  );

  const { filtered, inPeriod } = useMemo(() => {
    const all = (acts.data?.items ?? []).filter((a) =>
      matchSport(sport, a.sport_type),
    );
    const from = isoDate(addDays(new Date(), -(period - 1)));
    return {
      filtered: all,
      inPeriod: all.filter((a) => a.activity_date >= from),
    };
  }, [acts.data, sport, period]);

  const sportLabel =
    sport === "all"
      ? "toutes activités"
      : sport === "run"
        ? "course"
        : sport === "trail"
          ? "trail"
          : "vélo";

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-[34px] leading-10 font-bold tracking-tight">
          Synthèse
        </h1>
        <p className="text-muted-foreground mt-1 text-[15px]">
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>

      {acts.error && !acts.data && (
        <QueryError error={acts.error} onRetry={acts.reload} />
      )}

      <TodayCard />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <VolumeCard items={filtered} label={sportLabel} />
        <FormCard />
        <HrvCard />
        <PredictionsCard />
      </div>

      <div>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Sorties</h2>
          {acts.data && (
            <p className="text-muted-foreground flex items-center gap-1 text-[13px]">
              Du {shortDay(isoDate(addDays(new Date(), -(period - 1))))}{" "}
              <MoveRight className="size-3.5" /> aujourd'hui
            </p>
          )}
        </div>
        {acts.loading && !acts.data ? (
          <Card className="gap-0 py-0">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b px-4 py-3 last:border-0"
              >
                <Skeleton className="size-10 rounded-xl" />
                <Skeleton className="hidden h-12 w-[88px] md:block" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3.5 w-36" />
                </div>
              </div>
            ))}
          </Card>
        ) : inPeriod.length === 0 ? (
          <Card>
            <EmptyState
              title="Aucune sortie sur cette période"
              description={
                (acts.data?.items.length ?? 0) === 0
                  ? "La base locale est vide. Lance une synchronisation pour importer tes sorties Garmin."
                  : "Élargis la période ou change de sport avec les filtres en haut de page."
              }
              action={
                <Button
                  variant="secondary"
                  onClick={() =>
                    document
                      .querySelector<HTMLButtonElement>(
                        'button[aria-label="Synchroniser Garmin"]',
                      )
                      ?.click()
                  }
                >
                  <RefreshCw />
                  Synchroniser Garmin
                </Button>
              }
            />
          </Card>
        ) : (
          <ActivityList items={inPeriod} period={period} />
        )}
      </div>
    </div>
  );
}
