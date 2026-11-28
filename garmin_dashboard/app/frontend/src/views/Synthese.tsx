import { Fragment, useMemo, useState } from "react";

import { MiniTrack } from "@/components/MiniTrack";
import { useQuery } from "@/hooks/useQuery";
import { api, type ActivityListItem, type FitnessDay } from "@/lib/api";
import { addDays, fmtClockMin, fmtHM, isoDate, nf, parseDay, READINESS_ZONES, readinessInfo, speedDisplay } from "@/lib/format";
import { PATH } from "@/lib/route";
import { Bars, Gauge, LevelBars } from "@/ui/charts";
import { byGroup, GROUP_META, groupOf, lastWith, readiness, totals, windows, type Group } from "@/ui/derive";
import { BigHeart, GROUP_ICON, MiniHeart, MiniPillars, MiniSleep, MiniTrend } from "@/ui/icons";
import { Badge, Card, Chip, ChipRow, Delta, Hr, Lbl, P, Page, Sm, Skel, Stagger, Val } from "@/ui/kit";
import { Avatar, ProfileDialog, useProfile } from "@/ui/profile";
import { SyncButton, ThemeToggle } from "@/ui/shell";
import { dow, useActivities, useHealth, usePillars } from "@/ui/data";
import { Guard, MeasuredAt, SyncLine } from "@/ui/status";

/* ---------- Pastilles de raccourcis (partagées avec les autres écrans) ---------- */
function Profile() {
  const { name } = useProfile();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-3.5 px-1 pb-4">
      <button type="button" onClick={() => setOpen(true)} aria-label="Modifier mon profil" className="hk-press flex min-w-0 flex-1 items-center gap-3.5 rounded-2xl text-left">
        <Avatar size={64} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[30px] leading-[1.1] font-bold tracking-[-0.02em]">{name}</span>
          <SyncLine />
        </span>
      </button>
      <div className="flex gap-2 md:hidden">
        <SyncButton />
        <ThemeToggle />
      </div>
      <ProfileDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** Préparation du jour : le score de la montre (Garmin) d'abord, avec le temps de récupération restant.
 *  Sans score Garmin, l'estimation maison (VFC, sommeil, charge) prend le relais, annoncée comme telle. */
function ReadinessCard({ series, next }: { series: FitnessDay[]; next: string | null }) {
  const r = readiness(series);
  const g = lastWith(series, "readiness_score", 1);
  if (!r) return null;
  const score = g?.readiness_score ?? null;
  const info = readinessInfo(score);
  const rec = g?.recovery_time_h ?? null;
  const own = ["Récupérer", "Modéré", "Prêt", "Optimal"] as const;
  const steps: readonly string[] = info ? READINESS_ZONES.map((z) => z.label) : own;
  const status = info ? info.label : r.status;
  // Feu vert seulement si la montre le donne aussi : score élevé et récupération presque terminée
  const go = info ? score! >= 75 && (rec == null || rec <= 6) : r.status === "Prêt" || r.status === "Optimal";
  const easy = info ? score! < 50 || (rec != null && rec > 24) : r.status === "Récupérer";
  const advice = easy
    ? "Ton corps récupère : repos ou sortie très facile aujourd'hui."
    : go
      ? next ? `Tu peux attaquer ta prochaine séance : ${next}.` : "Tu peux placer une séance intense aujourd'hui."
      : next ? `Reste sur des efforts faciles ou modérés. Prochaine séance : ${next}.` : "Reste sur des efforts faciles ou modérés aujourd'hui.";
  const Row = ({ ok, name, detail, label }: { ok: boolean; name: string; detail: string; label: string }) => (
    <div className="flex items-center gap-2.5 text-[15px]">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="shrink-0">
        <circle cx="10" cy="10" r="10" fill={ok ? "var(--c-sky)" : "var(--sys-orange)"} />
        {ok ? <path d="M5.5 10.2l3 3 6-6.2" fill="none" stroke="var(--on-color)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M10 5v6.2M10 14.6v.4" stroke="var(--on-color)" strokeWidth="2.4" strokeLinecap="round" />}
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
          <Val size={24}>{status === "Modéré" ? "Modérée" : status}</Val>
          <Sm className="mt-1">{info ? "Score Garmin sur 100" : "Estimation sur 10, sans score Garmin"}</Sm>
          {rec != null && rec > 0.5 && (
            <>
              <Lbl className="mt-3">Récupération</Lbl>
              <Val size={17}>encore {rec >= 10 ? nf(rec) : nf(rec, 1)} h</Val>
            </>
          )}
        </div>
        {info ? <Gauge value={score} max={100} label={`Préparation Garmin ${nf(score)} sur 100`} /> : <Gauge value={r.score} label={`Préparation estimée ${r.score} sur 10`} />}
      </div>
      {/* échelle d'état (non cliquable) : la zone du jour en couleur */}
      <div className="mt-4 grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} role="img" aria-label={`Échelle : ${steps.join(", ")} ; aujourd'hui ${status}`}>
        {steps.map((st) => (
          <span key={st} className="flex flex-col items-center gap-1.5">
            <span className="block h-1.5 w-full rounded-full" style={{ background: st === status ? "var(--sys-blue)" : "var(--fill2)" }} />
            <span className={`text-center text-[11px] leading-tight ${st === status ? "font-semibold text-foreground" : "text-label2"}`}>{st}</span>
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
        <div className="h-2 rounded-full bg-[var(--sys-green)]" style={{ width: `${Math.min(100, Math.max(2, (weekN / weeksTot) * 100))}%` }} />
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
          {next.description && <P className="mt-1 text-label2">{next.description.replace(/\bbpm\b/g, "BPM")}</P>}
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
    a.distance_m ? ["Distance", `${nf(a.distance_m / 1000, 1)} km`] : null,
    sp.value !== "—" ? [sp.unit.includes("/km") ? "Allure" : "Vitesse", `${sp.value} ${sp.unit}`] : ["Durée", fmtHM(a.duration_s)],
    a.avg_hr ? ["FC moy.", `${nf(a.avg_hr)} BPM`] : null,
  ].filter(Boolean) as [string, string][];
  return (
    <Card tint="red" href={`#/activity/${a.activity_id}`} label={`Dernière activité : ${a.name ?? ""}, ouvrir le détail`}>
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <Lbl more>Dernière activité</Lbl>
          <Val>
            {GROUP_META[g].label.split(" ")[0]} · {when} {a.start_time_local.slice(11, 16)}
          </Val>
          <div className="mt-2.5 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 tabular-nums">
            {rows.map(([l, t]) => (
              <Fragment key={l}>
                <span className="text-[14px] text-label2">{l}</span>
                <span className="text-[18px] font-semibold">{t}</span>
              </Fragment>
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

const VOLUME_GROUPS: Group[] = ["foot", "road", "mtb", "walk", "gym", "other"];

function VolumeCard({ acts }: { acts: ActivityListItem[] }) {
  const w = windows();
  const now = byGroup(acts, ...w.last7);
  const prev = byGroup(acts, ...w.prev7);
  const tn = totals(acts, ...w.last7), tp = totals(acts, ...w.prev7);
  const rows = VOLUME_GROUPS.map((g) => ({ g, now: now[g].secs, prev: prev[g].secs })).filter((r) => r.now > 0 || r.prev > 0).sort((x, y) => y.now - x.now || y.prev - x.prev);
  const mx = Math.max(1, ...rows.map((r) => Math.max(r.now, r.prev)));
  const dt = tn.secs - tp.secs;
  // La distance n'a de sens que par sport : on affiche celle à pied (course et trail), pas un total vélo + course + marche
  const dk = now.foot.km - prev.foot.km;
  return (
    <Card href={PATH.activites}>
      <div className="flex items-baseline justify-between">
        <Lbl more>Volume · 7 derniers jours</Lbl>
        <Sm>vs 7 jours avant</Sm>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div>
          <Sm>Temps actif</Sm>
          <Val>{fmtHM(tn.secs)}</Val>
          <Delta value={dt} text={`${dt > 0 ? "+" : "−"}${fmtHM(Math.abs(dt))}`} />
        </div>
        <div>
          <Sm>À pied</Sm>
          <Val>{nf(now.foot.km, 1)} km</Val>
          <Delta value={dk} text={`${dk > 0 ? "+" : "−"}${nf(Math.abs(dk), 1)} km`} />
        </div>
        <div>
          <Sm>Activités</Sm>
          <Val>{tn.count}</Val>
          <Delta value={tn.count - tp.count} text={`${tn.count - tp.count > 0 ? "+" : "−"}${Math.abs(tn.count - tp.count)}`} />
        </div>
      </div>
      {rows.length > 0 && (
        <>
          <Hr />
          <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Temps par sport sur 7 jours ; le trait = les 7 jours d'avant">
            {rows.map(({ g, now: n, prev: p }) => {
              const Icon = GROUP_ICON[g], c = GROUP_META[g].color;
              return (
                <li key={g} className="grid grid-cols-[28px_1fr_auto] items-center gap-x-3">
                  <span className="flex size-7 items-center justify-center rounded-[8px]" style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}><Icon size={17} /></span>
                  <span className="min-w-0">
                    <span className="block text-[14px] leading-tight text-label2">{GROUP_META[g].label}</span>
                    <span className="relative mt-1 block h-2 rounded-full bg-fill2">
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(n ? 3 : 0, (n / mx) * 100)}%`, background: c }} />
                      {p > 0 && <span className="absolute -top-[3px] -bottom-[3px] w-[2px] -translate-x-1/2 rounded bg-foreground/40 shadow-[0_0_0_1.5px_var(--card)]" style={{ left: `${(p / mx) * 100}%` }} />}
                    </span>
                  </span>
                  <span className="text-right text-[16px] font-semibold tabular-nums">{n ? fmtHM(n) : "—"}</span>
                </li>
              );
            })}
          </ul>
          <Sm className="mt-3"><span aria-hidden className="mr-1.5 inline-block h-2.5 w-[2px] rounded bg-foreground/40 align-[-1px]" />repère = les 7 jours d'avant · temps hors pauses</Sm>
        </>
      )}
    </Card>
  );
}

export function HeartWidget({ latest, today, measuredAt }: { latest: FitnessDay; today?: { date: string; min: number | null; max: number | null; resting_7d: number | null } | null; measuredAt?: string | null }) {
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
              {today.date === isoDate(new Date()) && <MeasuredAt at={measuredAt} />}
            </>
          )}
        </div>
        <div className="hk-beat h-[96px] w-[104px] shrink-0" style={{ ["--beat" as string]: `${60 / Math.max(bpm ?? 60, 30)}s` }}>
          <BigHeart id="hw" />
        </div>
      </div>
    </Card>
  );
}

function BodyBattery({ latest, points, measuredAt }: { latest: FitnessDay; points: [number, number][]; measuredAt?: string | null }) {
  return (
    <Card tint="cyan">
      <div className="flex items-start justify-between">
        <div>
          <Lbl>Body Battery</Lbl>
          <Val size={34}>{latest.body_battery_now != null ? nf(latest.body_battery_now) : "—"}</Val>
          <MeasuredAt at={measuredAt} className="mt-0.5" />
        </div>
        <div className="text-right">
          <Sm><span aria-hidden className="mr-1 inline-block size-2 rounded-full bg-[var(--sys-teal)] align-[1px]" />Recharge cette nuit</Sm>
          <Val size={17} style={{ color: "var(--teal-text)" }}>
            {latest.body_battery_charged != null ? `+${nf(latest.body_battery_charged)}` : "—"}
          </Val>
          <Sm className="mt-1"><span aria-hidden className="mr-1 inline-block size-2 rounded-full bg-[var(--sys-teal)] align-[1px] opacity-35" />Dépensé depuis le réveil</Sm>
          <Val size={17}>{latest.body_battery_drained != null ? `−${nf(latest.body_battery_drained)}` : "—"}</Val>
        </div>
      </div>
      {points.length > 1 && (
        <div className="mt-1.5">
          <LevelBars points={points} color="var(--sys-teal)" label="Body Battery heure par heure : barre pleine quand il se recharge, pâle quand il se dépense" />
        </div>
      )}
    </Card>
  );
}

export function SleepWeek({ series, href, nights = 7 }: { series: FitnessDay[]; href?: string; nights?: number }) {
  const last = series.slice(-nights);
  const vals = last.map((d) => d.sleep_score).filter((v): v is number => v != null);
  const avg = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
  const t = lastWith(last, "sleep_score") ?? last[last.length - 1];
  return (
    <Card tint="indigo" href={href}>
      <div className="flex items-baseline justify-between">
        <Lbl more={!!href}>Sommeil · {nights} nuits</Lbl>
        {avg != null && <Sm>moyenne {nf(avg)}</Sm>}
      </div>
      {t?.sleep_score != null && (
        <Val>
          {nf(t.sleep_score)} dernière nuit{t.sleep_duration_s ? ` · ${fmtHM(t.sleep_duration_s)}` : ""}
        </Val>
      )}
      <div className="mt-2.5">
        <Bars items={last.map((d, i) => ({ label: nights > 7 && (last.length - 1 - i) % 2 ? "" : dow(d.date), value: d.sleep_score, strong: i === last.length - 1 }))} max={100} color="var(--sys-indigo)" light="color-mix(in srgb, var(--sys-indigo) 32%, transparent)" label={`Scores de sommeil des ${nights} dernières nuits`} />
      </div>
    </Card>
  );
}

export function ShortcutChips({ current }: { current?: string }) {
  const { fit } = useHealth();
  const { colors, greens } = usePillars();
  const l = fit?.latest;
  const est = useQuery("estimate", () => api.estimate());
  const h = est.data?.half;
  const sleepLabel = l?.sleep_score == null ? "—" : l.sleep_score >= 80 ? "Bon" : l.sleep_score >= 60 ? "Correct" : "Faible";
  return (
    <ChipRow label="Raccourcis">
      <Chip href={PATH.piliers} current={current === "piliers"} icon={<MiniPillars colors={colors} />} label="Mes piliers" value={colors.length ? `${greens} sur 4 OK` : "—"} />
      <Chip href={PATH.sommeil} current={current === "sommeil"} icon={<MiniSleep score={l?.sleep_score != null ? Math.round(l.sleep_score) : null} />} label="Sommeil" value={sleepLabel} />
      <Chip href={PATH.forme} current={current === "forme"} icon={<MiniHeart />} label="Forme et santé" value={l?.resting_hr != null ? `${nf(l.resting_hr)} BPM` : "—"} />
      <Chip href={PATH.progres} icon={<MiniTrend />} label="Progrès" value={h ? `Semi ≈ ${fmtClockMin((h.low_s + h.high_s) / 2)}` : "—"} />
    </ChipRow>
  );
}

export default function Synthese() {
  const { fit, det, fitQ } = useHealth();
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
      <h1 className="mx-1 mt-6 mb-3 text-[22px] font-bold tracking-[-0.015em] md:text-[24px]">Aujourd'hui</h1>
      <Guard queries={[fitQ, acts]}>
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
            {latest && <HeartWidget latest={latest} today={heartToday} measuredAt={fit.measured_at} />}
            {latest && <BodyBattery latest={latest} points={bbPoints} measuredAt={fit.measured_at} />}
            <SleepWeek series={series} href={PATH.sommeil} />
          </div>
        )}
      </Guard>
    </Page>
  );
}
