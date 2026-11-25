import { useMemo } from "react";

import { MiniTrack } from "@/components/MiniTrack";
import { useQuery } from "@/hooks/useQuery";
import { api, type ActivityListItem, type FitnessDay } from "@/lib/api";
import { addDays, fmtClock, fmtHM, isoDate, nf, parseDay, speedDisplay } from "@/lib/format";
import { PATH } from "@/lib/route";
import { AreaLine, Bars, Gauge, Petals } from "@/ui/charts";
import { byGroup, GROUP_META, GROUP_ORDER, groupOf, pct, readiness, totals, windows } from "@/ui/derive";
import { BigHeart, GROUP_ICON, MiniHeart, MiniPillars, MiniSleep, MiniTrend } from "@/ui/icons";
import { Badge, Card, Chip, ChipRow, Delta, Hr, Lbl, P, Page, Sm, Skel, Stagger, Val } from "@/ui/kit";
import { SyncButton, ThemeToggle } from "@/ui/shell";
import { dow, useActivities, useHealth, usePillars } from "@/ui/data";

/* ---------- Pastilles de raccourcis (partagées avec les autres écrans) ---------- */
function Profile() {
  return (
    <div className="flex items-center gap-3.5 px-1 pb-4">
      <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-full text-[28px] font-semibold text-white shadow-[0_0_0_3px_var(--card),0_6px_16px_-6px_rgb(40_60_140/0.4)]" style={{ background: "linear-gradient(135deg,#7AB8FF,#B48CF2)" }}>
        A
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[30px] leading-[1.1] font-bold tracking-[-0.02em]">Antonin</p>
        <Sm className="mt-0.5">Synchronisé avec Garmin toutes les 20 min</Sm>
      </div>
      <div className="flex gap-2 md:hidden">
        <SyncButton />
        <ThemeToggle />
      </div>
    </div>
  );
}

function ReadinessCard({ series, next }: { series: FitnessDay[]; next: string | null }) {
  const r = readiness(series);
  const today = series[series.length - 1];
  if (!r) return null;
  const steps = ["Récupérer", "Modéré", "Prêt", "Optimal"] as const;
  const advice =
    r.status === "Récupérer"
      ? "Ton corps récupère : une journée de repos ou une sortie très facile est le bon choix."
      : r.status === "Modéré"
        ? next ? `Reste sur des efforts faciles aujourd'hui. Prochaine séance : ${next}.` : "Reste sur des efforts faciles aujourd'hui."
        : next ? `Tu peux attaquer ta prochaine séance : ${next}.` : "Tu peux placer une séance intense aujourd'hui.";
  const Row = ({ ok, name, detail, label }: { ok: boolean; name: string; detail: string; label: string }) => (
    <div className="flex items-center gap-2.5 text-[15px]">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="shrink-0">
        <circle cx="10" cy="10" r="10" fill={ok ? "#3E8EF7" : "#FF9500"} />
        {ok ? <path d="M5.5 10.2l3 3 6-6.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M10 5v6.2M10 14.6v.4" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />}
      </svg>
      <span className="flex-1">
        {name} <span className="text-label2">· {detail}</span>
      </span>
      <span className="font-semibold" style={{ color: ok ? undefined : "var(--warn)" }}>
        {label}
      </span>
    </div>
  );
  return (
    <Card tint="sky">
      <div className="flex items-start justify-between">
        <div>
          <Lbl>Préparation du jour</Lbl>
          <Val size={24}>{r.status === "Modéré" ? "Modérée" : r.status === "Prêt" ? "Prêt" : r.status}</Val>
          {today?.readiness_score != null && (
            <>
              <Lbl className="mt-3">Garmin</Lbl>
              <Val size={17}>{nf(today.readiness_score)} / 100</Val>
            </>
          )}
        </div>
        <Gauge value={r.score} label={`Préparation ${r.score} sur 10`} />
      </div>
      <div className="mt-4 grid grid-cols-4 gap-1 text-center text-[12px] font-semibold">
        {steps.map((s) => (
          <span key={s} className="rounded-[10px] py-1.5" style={s === r.status ? { background: "#3E8EF7", color: "#fff" } : { background: "var(--fill2)", color: "var(--label2)" }}>
            {s}
          </span>
        ))}
      </div>
      <Hr />
      <div className="flex flex-col gap-3">
        <Row ok={r.hrv.ok} name="VFC" detail={r.hrv.value != null ? `${nf(r.hrv.value)} ms` : "—"} label={r.hrv.label} />
        <Row ok={r.sleep.ok} name="Sommeil" detail={r.sleep.value != null ? `${nf(r.sleep.value)} / 100` : "—"} label={r.sleep.label} />
        <Row ok={r.load.ok} name="Charge" detail={r.load.tsb != null ? `fraîcheur ${r.load.tsb > 0 ? "+" : ""}${nf(r.load.tsb)}` : "—"} label={r.load.label} />
      </div>
      <Hr />
      <P>{advice}</P>
    </Card>
  );
}

function GoalCard() {
  const plans = useQuery("plans", () => api.plans());
  const id = plans.data?.plans[0]?.id;
  const plan = useQuery(`plan-${id ?? 0}`, () => (id ? api.plan(id) : Promise.resolve(null)));
  const p = plan.data;
  if (!p || !p.goal_date) return null;
  const today = p.today;
  const daysLeft = Math.round((parseDay(p.goal_date).getTime() - parseDay(today).getTime()) / 86400000);
  const weekN = Math.floor((parseDay(today).getTime() - parseDay(p.start_date).getTime()) / (7 * 86400000)) + 1;
  const weeksTot = Math.ceil((parseDay(p.end_date).getTime() - parseDay(p.start_date).getTime() + 86400000) / (7 * 86400000));
  const next = p.sessions_detail.find((s) => s.date >= today && (s.status === "upcoming" || s.status === "today"));
  const when = next ? (next.date === today ? "aujourd'hui" : next.date === isoDate(addDays(parseDay(today), 1)) ? "demain" : parseDay(next.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })) : null;
  return (
    <Card tint="green" href={PATH.plan}>
      <div className="flex items-baseline justify-between">
        <Lbl more>Objectif du programme</Lbl>
        {daysLeft >= 0 && <Badge tone="green">J-{daysLeft}</Badge>}
      </div>
      <Val size={22}>{p.goal_name ?? p.name}</Val>
      <Lbl>{parseDay(p.goal_date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</Lbl>
      <div className="mt-3.5 h-2 rounded-full bg-fill2">
        <div className="h-2 rounded-full bg-[#34C759]" style={{ width: `${Math.min(100, Math.max(2, (weekN / weeksTot) * 100))}%` }} />
      </div>
      <Sm className="mt-1.5">
        Semaine {Math.max(1, Math.min(weekN, weeksTot))} sur {weeksTot}
      </Sm>
      {next && (
        <>
          <Hr />
          <Lbl>Prochaine séance · {when}</Lbl>
          <Val size={18}>
            {next.title}
            {next.km ? ` · ${nf(next.km)} km` : ""}
          </Val>
          {next.description && <P className="mt-1 text-label2">{next.description}</P>}
        </>
      )}
    </Card>
  );
}

function LastActivity({ a }: { a: ActivityListItem }) {
  const g = groupOf(a.sport_type);
  const yest = isoDate(addDays(new Date(), -1));
  const when = a.activity_date === isoDate(new Date()) ? "aujourd'hui" : a.activity_date === yest ? "hier" : dow(a.activity_date);
  const sp = speedDisplay(a.sport_type, a.avg_speed_ms);
  const rows = [
    a.distance_m ? [GROUP_META[g].color, `${nf(a.distance_m / 1000, 1)} km`] : null,
    sp.value !== "—" ? ["#34C759", `${sp.value} ${sp.unit}`] : ["#34C759", fmtHM(a.duration_s)],
    a.avg_hr ? ["#00AFCA", `${nf(a.avg_hr)} bpm`] : null,
  ].filter(Boolean) as [string, string][];
  return (
    <Card tint="red" href={`#/activity/${a.activity_id}`} label={`Dernière activité : ${a.name ?? ""}, ouvrir le détail`}>
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <Lbl more>Dernière activité</Lbl>
          <Val>
            {GROUP_META[g].label.split(" ")[0]} · {when} {a.start_time_local.slice(11, 16)}
          </Val>
          <div className="mt-2.5 flex flex-col gap-1 text-[18px] font-semibold tabular-nums">
            {rows.map(([c, t]) => (
              <span key={t} className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: c }} />
                {t}
              </span>
            ))}
          </div>
        </div>
        {a.mini_track && a.mini_track.length > 1 ? <MiniTrack points={a.mini_track} type={a.sport_type} className="h-[96px] w-[118px] shrink-0" /> : null}
      </div>
      {a.training_load != null && (
        <>
          <Hr />
          <P>
            Charge {nf(a.training_load)} · durée {fmtHM(a.duration_s)}
            {a.elevation_gain_m ? ` · ${nf(a.elevation_gain_m)} m D+` : ""}
          </P>
        </>
      )}
    </Card>
  );
}

function VolumeCard({ acts }: { acts: ActivityListItem[] }) {
  const w = windows();
  const now = byGroup(acts, ...w.last7);
  const prev = byGroup(acts, ...w.prev7);
  const tn = totals(acts, ...w.last7), tp = totals(acts, ...w.prev7);
  const items = GROUP_ORDER.map((g) => {
    const Icon = GROUP_ICON[g];
    return { now: now[g].secs, prev: prev[g].secs, color: GROUP_META[g].color, icon: <Icon size={24} />, label: GROUP_META[g].label };
  });
  const aria = `Temps par sport sur 7 jours : ${items.map((i) => `${i.label} ${fmtHM(i.now)}`).join(", ")} ; formes pâles = 7 jours avant`;
  const dt = tn.secs - tp.secs;
  return (
    <Card href={PATH.activites}>
      <div className="flex items-baseline justify-between">
        <Lbl more>Volume · 7 derniers jours</Lbl>
        <Sm>vs 7 jours avant</Sm>
      </div>
      <div className="mt-1.5 flex items-center gap-2.5">
        <div className="-ml-2 shrink-0">
          <Petals items={items} label={aria} />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <div>
            <Sm>Temps total</Sm>
            <Val>{fmtHM(tn.secs)}</Val>
            <Delta value={dt} text={`${dt > 0 ? "+" : "−"}${fmtHM(Math.abs(dt))}`} />
          </div>
          <div>
            <Sm>Distance</Sm>
            <Val>{nf(tn.km, 1)} km</Val>
            <Delta value={pct(tn.km, tp.km)} text={`${(pct(tn.km, tp.km) ?? 0) > 0 ? "+" : "−"}${nf(Math.abs(pct(tn.km, tp.km) ?? 0))} %`} />
          </div>
          <div>
            <Sm>Activités</Sm>
            <Val>{tn.count}</Val>
            <Delta value={tn.count - tp.count} text={`${tn.count - tp.count > 0 ? "+" : "−"}${Math.abs(tn.count - tp.count)}`} />
          </div>
        </div>
      </div>
    </Card>
  );
}

export function HeartWidget({ latest, today }: { latest: FitnessDay; today?: { date: string; min: number | null; max: number | null; resting_7d: number | null } | null }) {
  const bpm = latest.resting_hr;
  return (
    <Card tint="pink" href={PATH.forme}>
      <div className="flex justify-between gap-2.5">
        <div>
          <Lbl more>Cœur</Lbl>
          <p className="m-0 mt-0.5 flex items-baseline gap-1.5">
            <Val size={24}>{bpm != null ? `${nf(bpm)} BPM` : "—"}</Val>
            <Sm>au repos</Sm>
          </p>
          {today?.min != null && today.max != null && (
            <>
              <Sm className="mt-3">Amplitude {today.date === isoDate(new Date()) ? "aujourd'hui" : "hier"}</Sm>
              <Val>
                {today.min}–{today.max} BPM
              </Val>
            </>
          )}
        </div>
        <div className="hk-beat h-[96px] w-[104px] shrink-0" style={{ ["--beat" as string]: `${60 / Math.max(bpm ?? 60, 30)}s` }}>
          <BigHeart id="hw" />
        </div>
      </div>
      <Hr />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Sm>Repos · moy. 7 j</Sm>
          <Val size={18}>{today?.resting_7d != null ? `${today.resting_7d} BPM` : "—"}</Val>
        </div>
        <div>
          <Sm>VO₂ max</Sm>
          <Val size={18}>{latest.vo2max != null ? nf(latest.vo2max, 1) : "—"}</Val>
        </div>
      </div>
    </Card>
  );
}

function BodyBattery({ latest, points }: { latest: FitnessDay; points: [number, number][] }) {
  return (
    <Card tint="cyan">
      <div className="flex items-start justify-between">
        <div>
          <Lbl>Body Battery</Lbl>
          <Val size={34}>{latest.body_battery_now != null ? nf(latest.body_battery_now) : "—"}</Val>
        </div>
        <div className="text-right">
          <Sm>Recharge cette nuit</Sm>
          <Val size={17} style={{ color: "#0E7C93" }}>
            {latest.body_battery_charged != null ? `+${nf(latest.body_battery_charged)}` : "—"}
          </Val>
          <Sm className="mt-1">Dépensé aujourd'hui</Sm>
          <Val size={17}>{latest.body_battery_drained != null ? `−${nf(latest.body_battery_drained)}` : "—"}</Val>
        </div>
      </div>
      {points.length > 1 && (
        <div className="mt-1.5">
          <AreaLine points={points} xMax={1440} yMin={0} yMax={100} color="#30B0C7" xLabels={[{ x: 0, t: "0 h" }, { x: 720, t: "12 h" }, { x: 1440, t: "24 h" }]} label="Body Battery de la journée" />
        </div>
      )}
    </Card>
  );
}

export function SleepWeek({ series, href }: { series: FitnessDay[]; href?: string }) {
  const last = series.slice(-7);
  const vals = last.map((d) => d.sleep_score).filter((v): v is number => v != null);
  const avg = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
  const t = last[last.length - 1];
  return (
    <Card tint="indigo" href={href}>
      <div className="flex items-baseline justify-between">
        <Lbl more={!!href}>Sommeil · 7 nuits</Lbl>
        {avg != null && <Sm>moyenne {nf(avg)}</Sm>}
      </div>
      {t?.sleep_score != null && (
        <Val>
          {nf(t.sleep_score)} cette nuit{t.sleep_duration_s ? ` · ${fmtHM(t.sleep_duration_s)}` : ""}
        </Val>
      )}
      <div className="mt-2.5">
        <Bars items={last.map((d, i) => ({ label: dow(d.date), value: d.sleep_score, strong: i === last.length - 1 }))} max={100} color="#5E6BFF" light="#CDD1FF" label="Scores de sommeil des 7 dernières nuits" />
      </div>
    </Card>
  );
}

export function ShortcutChips({ current }: { current?: string }) {
  const { fit } = useHealth();
  const { colors, greens } = usePillars();
  const l = fit?.latest;
  const preds = useQuery("predictions-400", () => api.predictions(400));
  const half = preds.data?.latest?.time_half_s;
  const sleepLabel = l?.sleep_score == null ? "—" : l.sleep_score >= 80 ? "Bon" : l.sleep_score >= 60 ? "Correct" : "Faible";
  return (
    <ChipRow label="Raccourcis">
      <Chip href={PATH.sommeil} current={current === "sommeil"} icon={<MiniSleep score={l?.sleep_score != null ? Math.round(l.sleep_score) : null} />} label="Sommeil" value={sleepLabel} />
      <Chip href={PATH.forme} current={current === "forme"} icon={<MiniHeart />} label="Forme et santé" value={l?.resting_hr != null ? `${nf(l.resting_hr)} bpm` : "—"} />
      <Chip href={PATH.progres} icon={<MiniTrend />} label="Progrès" value={half ? `Semi ${fmtClock(half).slice(0, -3)}` : "—"} />
      <Chip href={PATH.piliers} current={current === "piliers"} icon={<MiniPillars colors={colors} />} label="Mes piliers" value={colors.length ? `${greens} sur 4 au vert` : "—"} />
    </ChipRow>
  );
}

export default function Synthese() {
  const { fit, det } = useHealth();
  const acts = useActivities();
  const plans = useQuery("plans", () => api.plans());
  const id = plans.data?.plans[0]?.id;
  const plan = useQuery(`plan-${id ?? 0}`, () => (id ? api.plan(id) : Promise.resolve(null)));
  const next = useMemo(() => {
    const p = plan.data;
    if (!p) return null;
    const s = p.sessions_detail.find((x) => x.date >= p.today && (x.status === "upcoming" || x.status === "today"));
    return s ? s.title.toLowerCase() : null;
  }, [plan.data]);
  const items = acts.data?.items ?? [];
  const last = items[0];
  const series = fit?.series ?? [];
  const latest = fit?.latest ?? series[series.length - 1] ?? null;
  const heartToday = det?.heart?.find((h) => h.hours.some(Boolean)) ?? null;
  const bbPoints = fit?.bb_timeline?.points ?? [];

  return (
    <Page tint="blue">
      <Profile />
      <ShortcutChips />
      <h2 className="mx-1 mt-6 mb-3 text-[22px] font-bold tracking-[-0.015em] md:text-[24px]">Aujourd'hui</h2>
      {!fit ? (
        <Stagger>
          <Skel h={380} />
          <Skel h={260} />
        </Stagger>
      ) : (
        <div className="hk-stagger grid items-start gap-3.5 lg:grid-cols-2 2xl:grid-cols-3">
          <ReadinessCard series={series} next={next} />
          <GoalCard />
          {last && <LastActivity a={last} />}
          {items.length > 0 && <VolumeCard acts={items} />}
          {latest && <HeartWidget latest={latest} today={heartToday} />}
          {latest && <BodyBattery latest={latest} points={bbPoints} />}
          <SleepWeek series={series} href={PATH.sommeil} />
        </div>
      )}
    </Page>
  );
}
