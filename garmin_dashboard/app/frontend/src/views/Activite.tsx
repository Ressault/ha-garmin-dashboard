import { useEffect, useMemo, useRef, useState } from "react";

import { MiniTrack } from "@/components/MiniTrack";
import { useQuery } from "@/hooks/useQuery";
import { api, type ActivityListItem, type RecordSport } from "@/lib/api";
import { addDays, fmtClock, fmtHM, fmtPaceSec, isoDate, nf, parseDay, shortDay, speedDisplay } from "@/lib/format";
import { PATH } from "@/lib/route";
import { AreaLine, Bars, EffortChart, RecordChart, StackedDays, type RecordPoint } from "@/ui/charts";
import { useActivities, useHealth } from "@/ui/data";
import { GROUP_META, GROUP_ORDER, groupOf, pct, totals, windows, type Group } from "@/ui/derive";
import { GROUP_ICON, IGrid, ISearch, MiniList, MiniMedal, MiniPlan, MiniTrend, MiniZones } from "@/ui/icons";
import { Badge, Card, Chip, ChipRow, TINT, Delta, Group as Rows, H2, Hero, Hr, Lbl, P, Page, Sm, Skel, Stagger, Val } from "@/ui/kit";

export type Cur = "activites" | "progres" | "entrainement" | "records" | "plan";
export function ActChips({ current }: { current: Cur }) {
  const acts = useActivities();
  const preds = useQuery("predictions-400", () => api.predictions(400));
  const effort = useQuery("effort", () => api.effort());
  const w = windows();
  const n = acts.data ? totals(acts.data.items, ...w.weekToDate).count : null;
  const half = preds.data?.latest?.time_half_s;
  const plans = useQuery("plans", () => api.plans());
  const goal = plans.data?.plans.find((p) => p.goal_date)?.goal_date;
  const left = goal ? Math.ceil((parseDay(goal).getTime() - parseDay(isoDate(new Date())).getTime()) / 86400000) : null;
  return (
    <ChipRow label="Sections d'Activité">
      <Chip href={PATH.activites} current={current === "activites"} icon={<MiniList />} label="Activités" value={n != null ? `${n} cette sem.` : "—"} />
      <Chip href={PATH.progres} current={current === "progres"} icon={<MiniTrend />} label="Progrès" value={half ? `Semi ${fmtClock(half).slice(0, -3)}` : "—"} />
      <Chip href={PATH.entrainement} current={current === "entrainement"} icon={<MiniZones />} label="Entraînement" value={effort.data ? `Charge ${nf(effort.data.current)}` : "—"} />
      <Chip href={PATH.records} current={current === "records"} icon={<MiniMedal />} label="Records" value="Meilleurs efforts" />
      <Chip href={PATH.plan} current={current === "plan"} icon={<MiniPlan />} label="Programme" value={left != null ? (left >= 0 ? `J-${left}` : "Terminé") : plans.data?.plans.length ? "En cours" : "Importer"} />
    </ChipRow>
  );
}

export function Frame({ current, tint, children }: { current: Cur; tint: keyof typeof TINT; children: React.ReactNode }) {
  return (
    <Page tint={tint}>
      <ActChips current={current} />
      {children}
    </Page>
  );
}

/* =========================== Activités =========================== */
const FILTERS: (Group | "all")[] = ["all", "foot", "road", "mtb", "walk", "gym"];
const KIND: Record<Group, string> = { foot: "Course", road: "Vélo", mtb: "VTT", walk: "Marche", gym: "Muscu", other: "Activité" };
const GARMIN_SUFFIX = ["Course à pied sur tapis", "Course à pied", "Trail", "Cyclisme sur route", "Cyclisme virtuel", "Cyclisme", "VTT", "Vélo de montagne", "Marche à pied", "Marche", "Randonnée", "Natation", "Musculation"];
const SHORT: Record<Group | "all", string> = { all: "Tous", foot: "Course et trail", road: "Vélo", mtb: "VTT", walk: "Marche", gym: "Muscu", other: "Autre" };

function ActRow({ a }: { a: ActivityListItem }) {
  const g = groupOf(a.sport_type);
  const Icon = GROUP_ICON[g];
  const sp = speedDisplay(a.sport_type, a.avg_speed_ms);
  const meta = [
    a.distance_m ? `${nf(a.distance_m / 1000, 1)} km` : fmtHM(a.duration_s),
    a.distance_m && sp.value !== "—" ? `${sp.value} ${sp.unit}` : null,
    a.avg_hr ? `${nf(a.avg_hr)} BPM` : null,
    a.distance_m ? null : a.start_time_local.slice(11, 16),
  ].filter(Boolean).join(" · ");
  // « Perrusson Course à pied » → « Course · Perrusson » : le sport d'abord, le lieu ensuite, sans doublon
  const raw = (a.name ?? "").trim();
  const sfx = GARMIN_SUFFIX.find((x) => raw.toLowerCase().endsWith(" " + x.toLowerCase()));
  const title = !raw ? GROUP_META[g].label : sfx ? `${KIND[g]} · ${raw.slice(0, raw.length - sfx.length).trim()}` : raw;
  return (
    <a href={`#/activity/${a.activity_id}`} className="hk-press flex min-h-[56px] items-center gap-3 px-4 py-2.5">
      {a.mini_track && a.mini_track.length > 1 ? (
        <MiniTrack points={a.mini_track} type={a.sport_type} className="h-11 w-16 shrink-0" />
      ) : (
        <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-[10px]" style={{ background: `${GROUP_META[g].color}22`, color: GROUP_META[g].color }}>
          <Icon size={20} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px]">{title}</span>
        <span className="block truncate text-[14px] text-label2">{meta}</span>
      </span>
      {a.training_load != null && <span className="flex shrink-0 flex-col items-end leading-tight"><span className="text-[15px] font-semibold tabular-nums">{nf(a.training_load)}</span><span className="text-[11px] text-label2">charge</span></span>}
    </a>
  );
}

export function Activites() {
  const acts = useActivities();
  const [f, setF] = useState<Group | "all">("all");
  const [q, setQ] = useState("");
  const [more, setMore] = useState(30);
  const items = acts.data?.items ?? [];
  const w = windows();
  const cur = totals(items, ...w.weekToDate, f);
  const prev = totals(items, ...w.prevWeekToDate, f);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = isoDate(addDays(w.weekStart, i));
    const parts = GROUP_ORDER.filter((g) => f === "all" || g === f)
      .map((g) => ({ color: GROUP_META[g].color, v: items.filter((a) => a.activity_date === d && groupOf(a.sport_type) === g).reduce((s, a) => s + (a.duration_s ?? 0) / 60, 0) }))
      .filter((p) => p.v > 0);
    return { label: ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."][i], strong: i === w.dayIdx, parts };
  });
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((a) => (f === "all" || groupOf(a.sport_type) === f) && (!s || (a.name ?? "").toLowerCase().includes(s)));
  }, [items, f, q]);
  const sections = useMemo(() => {
    const today = w.today, yest = isoDate(addDays(new Date(), -1));
    const ws = isoDate(w.weekStart), pws = isoDate(addDays(w.weekStart, -7));
    const out: { title: string; items: ActivityListItem[] }[] = [];
    const push = (t: string, a: ActivityListItem) => {
      const last = out[out.length - 1];
      if (last && last.title === t) last.items.push(a);
      else out.push({ title: t, items: [a] });
    };
    for (const a of list.slice(0, more)) {
      const d = a.activity_date;
      const t = d === today ? "Aujourd'hui" : d === yest ? "Hier" : d >= ws ? parseDay(d).toLocaleDateString("fr-FR", { weekday: "long" }).replace(/^./, (c) => c.toUpperCase()) : d >= pws ? "Semaine dernière" : parseDay(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase());
      push(t, a);
    }
    return out;
  }, [list, more, w.today, w.weekStart]);
  const dsec = cur.secs - prev.secs, dkm = cur.km - prev.km, dd = cur.dplus - prev.dplus;
  const prevLabel = `lun. → ${["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."][w.dayIdx]}`;
  return (
    <Frame current="activites" tint="red">
      <div className="mt-4 flex flex-col gap-3.5">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-fill px-3 text-label2">
          <ISearch />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une sortie" aria-label="Rechercher une sortie" className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-foreground outline-none" />
        </label>
        <Card>
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-[22px] font-bold tracking-[-0.015em]">Cette semaine</h2>
            <Sm>du {shortDay(w.week[0])} au {shortDay(w.week[1])}</Sm>
          </div>
          <div role="group" aria-label="Filtrer par sport" className="hk-scroll mt-3 pb-0.5">
            {FILTERS.map((g) => {
              const Icon = g === "all" ? IGrid : GROUP_ICON[g];
              return (
                <button key={g} type="button" className="hk-pill hk-press" aria-pressed={f === g} onClick={() => setF(g)}>
                  <span style={{ color: f === g ? "currentColor" : g === "all" ? "var(--foreground)" : GROUP_META[g].color }}>
                    <Icon size={16} />
                  </span>
                  {SHORT[g]}
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div><Sm>Temps</Sm><Val size={24} className="whitespace-nowrap">{fmtHM(cur.secs)}</Val><Delta value={dsec} text={`${dsec >= 0 ? "+" : "−"}${fmtHM(Math.abs(dsec))}`} /></div>
            <div><Sm>Distance</Sm><Val size={24} className="whitespace-nowrap">{nf(cur.km, 1)} km</Val><Delta value={dkm} text={`${dkm >= 0 ? "+" : "−"}${nf(Math.abs(dkm), 1)} km`} /></div>
            <div><Sm>Dénivelé +</Sm><Val size={24} className="whitespace-nowrap">{nf(cur.dplus)} m</Val><Delta value={dd} text={`${dd >= 0 ? "+" : "−"}${nf(Math.abs(dd))} m`} /></div>
          </div>
          <div className="mt-3.5">
            <StackedDays days={days} label="Temps d'activité par jour cette semaine, coloré par sport" />
          </div>
          <Sm className="mt-1">Comparé au même moment de la semaine dernière ({prevLabel}) · {cur.count} activité{cur.count > 1 ? "s" : ""}</Sm>
        </Card>
      </div>
      {!acts.data ? (
        <Stagger className="mt-6"><Skel h={300} /></Stagger>
      ) : (
        <div className="hk-stagger">
          {sections.map((s) => (
            <div key={s.title}>
              <H2>{s.title}</H2>
              <Rows>{s.items.map((a) => <ActRow key={a.activity_id} a={a} />)}</Rows>
            </div>
          ))}
          {list.length > more && (
            <button type="button" onClick={() => setMore((m) => m + 30)} className="hk-press mx-auto mt-5 block rounded-full bg-fill px-5 py-2.5 text-[15px] font-semibold">
              Afficher plus
            </button>
          )}
          {list.length === 0 && <P className="mt-6 text-center text-label2">Aucune sortie ne correspond.</P>}
          <Sm className="mx-1 mt-2.5">Le chiffre à droite d'une sortie est sa charge d'entraînement.</Sm>
        </div>
      )}
    </Frame>
  );
}

/* =========================== Progrès =========================== */
export function Progres() {
  const preds = useQuery("predictions-400", () => api.predictions(400));
  const weekly = useQuery("weekly-9-foot", () => api.weekly(9, "foot"));
  const monthly = useQuery("monthly-2-foot", () => api.monthly(2, "foot"));
  const p = preds.data;
  const half = p?.latest?.time_half_s ?? null;
  const dHalf = p?.delta_s_since_first?.half ?? null;
  const ws = weekly.data?.series ?? [];
  const done = ws.slice(0, -1);
  const last4 = done.slice(-4);
  const avg4 = last4.length ? last4.reduce((s, x) => s + x.km, 0) / last4.length : null;
  const m = monthly.data;
  const curCum = m?.cumulative.current ?? [];
  const today = new Date().getDate();
  const curKm = curCum.length ? curCum[curCum.length - 1].km : null;
  const prevSame = m?.cumulative.previous.find((x) => x.day === today)?.km ?? m?.cumulative.previous[m.cumulative.previous.length - 1]?.km ?? null;
  const prevTotal = m?.series.find((x) => x.month === m.previous_month)?.km ?? null;
  const monthName = (k?: string) => (k ? parseDay(`${k}-01`).toLocaleDateString("fr-FR", { month: "long" }) : "");
  const histHalf = (p?.history ?? []).filter((h) => h.time_half_s != null).map((h, i) => [i, h.time_half_s! / 60] as [number, number]);
  return (
    <Frame current="progres" tint="purple">
      <Hero title={dHalf != null && dHalf < -30 ? `Tu as gagné ${fmtHM(Math.abs(dHalf))} sur le semi` : "Tes progrès"}>
        {dHalf != null && dHalf < 0 ? "Depuis ta première estimation, ton chrono prévu a fondu. " : ""}
        {avg4 != null ? `Tu cours en moyenne ${nf(avg4)} km par semaine sur les 4 dernières semaines complètes.` : ""}
      </Hero>
      {!p ? (
        <Stagger><Skel h={260} /></Stagger>
      ) : (
        <div className="hk-stagger grid items-start gap-3.5 lg:grid-cols-2">
          <Card tint="purple">
            <div className="flex items-baseline justify-between"><Lbl>Prédictions de chrono</Lbl><Sm>Garmin</Sm></div>
            <Sm className="mt-2 text-[15px]">Semi-marathon</Sm>
            <p className="m-0 text-[40px] leading-tight font-bold tracking-[-0.03em] tabular-nums">{fmtClock(half)}</p>
            {dHalf != null && dHalf !== 0 && <p className="m-0 text-[15px] font-semibold" style={{ color: dHalf < 0 ? "var(--ok)" : "var(--warn)" }}>{dHalf < 0 ? "−" : "+"}{fmtHM(Math.abs(dHalf))} depuis ta première estimation</p>}
            {histHalf.length > 2 && (
              <div className="mt-2">
                <AreaLine points={histHalf.map(([i, v]) => [i, -v] as [number, number])} xMax={histHalf.length - 1} yMin={-Math.max(...histHalf.map((h) => h[1])) - 1} yMax={-Math.min(...histHalf.map((h) => h[1])) + 1} color="var(--sys-purple)" height={80} xLabels={[{ x: 0, t: shortDay(p.history.find((h) => h.time_half_s != null)!.date) }, { x: histHalf.length - 1, t: "auj." }]} label="Évolution du chrono prévu sur semi (plus haut = plus rapide)" />
              </div>
            )}
            <Hr />
            <div className="grid grid-cols-3 gap-2">
              <div><Sm>5 km</Sm><Val size={18}>{fmtClock(p.latest?.time_5k_s)}</Val></div>
              <div><Sm>10 km</Sm><Val size={18}>{fmtClock(p.latest?.time_10k_s)}</Val></div>
              <div><Sm>Marathon</Sm><Val size={18}>{fmtClock(p.latest?.time_marathon_s)}</Val></div>
            </div>
          </Card>
          {ws.length > 0 && (
            <Card>
              <div className="flex items-baseline justify-between"><Lbl>Course et trail · par semaine</Lbl><Sm>km</Sm></div>
              <div className="mt-3">
                <Bars height={150} items={ws.slice(-8).map((x, i, arr) => ({ label: i === 0 || parseDay(x.week).getDate() <= 7 ? shortDay(x.week) : String(parseDay(x.week).getDate()), value: x.km, strong: i < arr.length - 1 }))} color="var(--sys-pink)" light="color-mix(in srgb, var(--sys-pink) 38%, transparent)" label="Kilomètres de course et trail par semaine" />
              </div>
              {avg4 != null && <P className="mt-1.5">Moyenne de {nf(avg4)} km sur les 4 dernières semaines complètes. La semaine en cours est en clair.</P>}
            </Card>
          )}
          {m && curKm != null && (
            <Card>
              <Lbl>Le mois sportif · course et trail</Lbl>
              <div className="mt-2.5 grid grid-cols-2 gap-3">
                <div>
                  <Sm>{monthName(m.current_month).replace(/^./, (c) => c.toUpperCase())} (au {today})</Sm>
                  <Val>{nf(curKm)} km</Val>
                  {prevSame ? <Delta value={pct(curKm, prevSame)} text={`${(pct(curKm, prevSame) ?? 0) >= 0 ? "+" : "−"}${nf(Math.abs(pct(curKm, prevSame) ?? 0))} % à date`} /> : null}
                </div>
                <div><Sm>{monthName(m.previous_month).replace(/^./, (c) => c.toUpperCase())}</Sm><Val>{nf(prevTotal)} km</Val></div>
              </div>
            </Card>
          )}
        </div>
      )}
    </Frame>
  );
}

/* =========================== Entraînement =========================== */
const ZONES = [
  { z: "Z5", c: "#FF3B30" },
  { z: "Z4", c: "#FF6B2C" },
  { z: "Z3", c: "#FFB800" },
  { z: "Z2", c: "#34C759" },
  { z: "Z1", c: "#30B0C7" },
];
export function Entrainement() {
  const effort = useQuery("effort", () => api.effort());
  const zones = useQuery("zones-28-all", () => api.zones(28, "all"));
  const { fit } = useHealth();
  const e = effort.data, z = zones.data;
  const series = (fit?.series ?? []).slice(-42);
  const latest = fit?.latest;
  const ctlPts = series.map((d, i) => [i, d.ctl] as [number, number | null]).filter((x): x is [number, number] => x[1] != null);
  const gain = ctlPts.length > 1 ? ctlPts[ctlPts.length - 1][1] - ctlPts[0][1] : null;
  const wd = e?.weekday ?? 0;
  const lo = e?.typical.lo?.[wd], hi = e?.typical.hi?.[wd];
  const zc = z ? z.current.secs.map((s) => (z.current.total ? (s / z.current.total) * 100 : 0)) : [];
  const zp = z ? z.previous.secs.map((s) => (z.previous.total ? (s / z.previous.total) * 100 : 0)) : [];
  const zmax = Math.max(45, ...zc, ...zp);
  const hiShift = zc.length ? zc[3] + zc[4] - (zp[3] + zp[4]) : 0;
  const z1Shift = zc.length ? zc[0] - zp[0] : 0;
  const bounds = z?.bounds ?? [];
  const statusTxt = e?.status === "above" ? "Au-dessus" : e?.status === "below" ? "En dessous" : "Dans la norme";
  return (
    <Frame current="entrainement" tint="sky">
      <Hero title={e?.status === "above" ? "Une semaine déjà bien chargée" : e?.status === "below" ? "Une semaine encore légère" : "Une semaine dans ta norme"}>
        {e && lo != null && hi != null ? `Ton effort cumulé est de ${nf(e.current)}, pour une fourchette habituelle de ${nf(lo)} à ${nf(hi)} à ce stade de la semaine. ` : ""}
        {gain != null ? `Ta condition physique ${gain >= 0 ? "a gagné" : "a perdu"} ${nf(Math.abs(gain))} points en 6 semaines.` : ""}
      </Hero>
      <div className="hk-stagger grid items-start gap-3.5 lg:grid-cols-2">
        {e ? (
          <Card>
            <div className="flex items-center justify-between"><Lbl>Effort relatif · cette semaine</Lbl><Badge tone={e.status === "above" ? "orange" : e.status === "below" ? "gray" : "green"}>{statusTxt}</Badge></div>
            <p className="m-0 mt-1.5 flex items-baseline gap-2"><Val size={30}>{nf(e.current)}</Val>{lo != null && hi != null && <Sm className="text-[15px]">habituel : {nf(lo)}–{nf(hi)}</Sm>}</p>
            <div className="mt-2.5"><EffortChart current={e.cumulative.current} previous={e.cumulative.previous} lo={e.typical.lo} hi={e.typical.hi} /></div>
            <div className="flex flex-nowrap gap-x-3 whitespace-nowrap text-[12px] text-label2">
              <span><span aria-hidden className="mr-1.5 inline-block h-[3px] w-3.5 rounded bg-[var(--sys-blue)] align-middle" />cette semaine</span>
              <span><span aria-hidden className="mr-1.5 inline-block w-3.5 border-t-2 border-dashed border-label2 align-middle opacity-80" />sem. passée {nf(e.previous_total)}</span>
              <span><span aria-hidden className="mr-1.5 inline-block h-2.5 w-3 rounded-sm bg-[var(--sys-blue)]/15 align-middle" />habituel</span>
            </div>
          </Card>
        ) : <Skel h={300} />}
        {z ? (
          <Card>
            <div className="flex items-baseline justify-between"><Lbl>Zones de FC · 4 semaines</Lbl><Sm>{fmtHM(z.current.total)} au total</Sm></div>
            <div className="mt-2.5 flex flex-col">
              {ZONES.map((zz, k) => {
                const i = 4 - k;
                const b0 = bounds[i], b1 = bounds[i + 1];
                return (
                  <div key={zz.z} className="grid grid-cols-[30px_1fr_70px] items-center gap-2.5 py-1.5">
                    <span className="text-[15px] font-bold">{zz.z}</span>
                    <span className="relative h-[22px] rounded-[7px] bg-fill2">
                      <span className="bar-fill absolute inset-y-0 left-0 rounded-[7px]" style={{ width: `${(zc[i] / zmax) * 100}%`, background: zz.c }} />
                      <span className="absolute -top-[3px] -bottom-[3px] w-[2px] -translate-x-1/2 rounded bg-foreground/40 shadow-[0_0_0_1.5px_var(--card)]" style={{ left: `${(zp[i] / zmax) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="block text-[15px] font-semibold">{nf(zc[i])} %</span>
                      <span className="block text-[12px] text-label2">{b0 != null ? (b1 != null ? `${b0}–${b1 - 1}` : `${b0}+`) : ""}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <Sm className="mt-1.5"><span aria-hidden className="mr-1.5 inline-block h-2.5 w-[2px] rounded bg-foreground/40 align-[-1px]" />repère = les 4 semaines précédentes</Sm>
            <Hr />
            <P>
              {Math.abs(hiShift) >= 2 ? `Les zones 4 et 5 ont ${hiShift > 0 ? "gagné" : "perdu"} ${nf(Math.abs(hiShift))} points. ` : "Ta répartition est stable. "}
              {Math.abs(z1Shift) >= 2 ? `Le temps en zone 1 a ${z1Shift > 0 ? "augmenté" : "baissé"} de ${nf(Math.abs(z1Shift))} points.` : ""}
            </P>
          </Card>
        ) : <Skel h={300} />}
        {ctlPts.length > 1 && latest && (
          <Card>
            <div className="flex items-center justify-between"><Lbl>Condition physique</Lbl>{gain != null && <Badge tone={gain >= 0 ? "green" : "gray"}>{gain >= 0 ? "+" : "−"}{nf(Math.abs(gain))} en 6 sem.</Badge>}</div>
            <p className="m-0 mt-1.5 flex items-baseline gap-2"><Val size={30}>{nf(latest.ctl)}</Val><Sm className="text-[15px]">forme (CTL)</Sm></p>
            <div className="mt-2.5">
              <AreaLine points={ctlPts} xMax={ctlPts[ctlPts.length - 1][0]} yMin={Math.min(...ctlPts.map((p) => p[1])) - 8} yMax={Math.max(...ctlPts.map((p) => p[1])) + 6} color="var(--sys-indigo)" height={130} xLabels={[{ x: 0, t: shortDay(series[0].date) }, { x: ctlPts[ctlPts.length - 1][0], t: "auj." }]} label="Condition physique sur 6 semaines" />
            </div>
          </Card>
        )}
        {e && (
          <Card>
            <div className="flex items-baseline justify-between"><Lbl>Charge par semaine</Lbl><Sm>en cours en clair</Sm></div>
            <div className="mt-2.5">
              <Bars height={120} items={e.weeks.slice(-8).map((x, i, arr) => ({ label: i === 0 || parseDay(x.week).getDate() <= 7 ? shortDay(x.week) : String(parseDay(x.week).getDate()), value: x.load, strong: i < arr.length - 1 }))} color="var(--sys-blue)" light="color-mix(in srgb, var(--sys-blue) 38%, transparent)" label="Charge d'entraînement par semaine" />
            </div>
          </Card>
        )}
      </div>
    </Frame>
  );
}

/* =========================== Records (même principe que Strava) =========================== */
const MEDAL = [
  { bg: "#F5C33B", fg: "#7A5600", t: "PR", a: "Record personnel" },
  { bg: "#C9CDD6", fg: "#4A4F5A", t: "2", a: "2e meilleur temps" },
  { bg: "#E3A574", fg: "#6B3A12", t: "3", a: "3e meilleur temps" },
];
const cleanName = (n: string | null) => (n ?? "").replace(/ - .*/, "").replace(/ (Course à pied|Trail|Cyclisme.*|Marche.*)$/, "");
const SHORT_LABEL: Record<string, string> = { "Semi-marathon": "Semi", "1/2 mile": "½ mile" };
const SPORTS: { k: RecordSport; label: string }[] = [
  { k: "run", label: "Course" },
  { k: "trail", label: "Trail" },
  { k: "bike", label: "Vélo" },
];

function MedalDot({ i, size = 22 }: { i: number; size?: number }) {
  const m = MEDAL[i];
  return (
    <span aria-label={m.a} className="flex shrink-0 items-center justify-center rounded-full font-extrabold shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)]" style={{ width: size, height: size, background: m.bg, color: m.fg, fontSize: i ? size * 0.55 : size * 0.4 }}>
      {m.t}
    </span>
  );
}
function MedalTag({ i, text }: { i: number; text: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-fill pr-2.5 pl-1 text-[13px] font-semibold whitespace-nowrap">
      <MedalDot i={i} size={20} />
      {text}
    </span>
  );
}

export function Records() {
  const [sport, setSport] = useState<RecordSport>("run");
  const [tab, setTab] = useState<"analyse" | "top">("analyse");
  const [year, setYear] = useState<string>("all");
  const eff = useQuery(`efforts-${sport}`, () => api.efforts(sport));
  const dists = eff.data?.distances ?? [];
  const [sel, setSel] = useState<string>("5 km");
  const cur = dists.find((d) => d.label === sel) ?? dists.find((d) => d.label === (sport === "bike" ? "10 km" : "5 km")) ?? dists[0];
  const bike = sport === "bike";
  const pillsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pillsRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [cur?.label, sport, eff.data]);

  const rows = useMemo(() => {
    if (!cur) return [];
    const byTime = [...cur.efforts].sort((a, b) => a.time_s - b.time_s);
    const rankAll = new Map(byTime.map((e, i) => [e.activity_id, i]));
    const years = new Map<string, number>();
    const rankYear = new Map<number, number>();
    for (const e of byTime) {
      const y = e.date.slice(0, 4);
      const n = years.get(y) ?? 0;
      years.set(y, n + 1);
      rankYear.set(e.activity_id, n);
    }
    return cur.efforts.map((e) => ({ ...e, year: e.date.slice(0, 4), all: rankAll.get(e.activity_id) as number, yr: rankYear.get(e.activity_id) as number }));
  }, [cur]);
  const years = [...new Set(rows.map((r) => r.year))].sort().reverse();
  const yr = year !== "all" && years.includes(year) ? year : "all";
  const shown = rows.filter((r) => yr === "all" || r.year === yr);
  const ranked = [...shown].sort((a, b) => a.time_s - b.time_s);
  const top3 = ranked.slice(0, 3);
  const speedKmh = (t: number) => ((cur?.distance_m ?? 0) / t) * 3.6;
  const rate = (t: number) => (bike ? `${nf(speedKmh(t), 1)} km/h` : `${fmtPaceSec((t / (cur?.distance_m ?? 1)) * 1000)} /km`);
  const dayLong = (d: string) => parseDay(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const dayShort = (d: string) => parseDay(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const points: RecordPoint[] = shown.map((r) => {
    const rank = yr === "all" ? r.all : r.yr;
    return { t: parseDay(r.date).getTime(), v: (cur?.distance_m ?? 0) / r.time_s, medal: rank < 3 ? (rank as 0 | 1 | 2) : undefined };
  });
  const byYear = years.filter((y) => yr === "all" || y === yr).map((y) => ({ y, items: shown.filter((r) => r.year === y).sort((a, b) => b.date.localeCompare(a.date)) }));
  const best = top3[0];
  const noData = eff.data && dists.length === 0;
  return (
    <Frame current="records" tint="gold">
      <div className="mt-4 flex flex-col gap-3.5">
        <div role="group" aria-label="Sport" className="grid h-11 grid-cols-3 rounded-full bg-fill p-1">
          {SPORTS.map(({ k, label }) => (
            <button key={k} type="button" aria-pressed={sport === k} onClick={() => { setSport(k); setYear("all"); setSel(k === "bike" ? "10 km" : "5 km"); }} className="hk-seg rounded-full text-[15px] font-semibold">
              {label}
            </button>
          ))}
        </div>
        {!eff.data ? (
          <Skel h={320} />
        ) : noData ? (
          <Card><P className="text-label2">Aucun effort calculé pour ce sport : il faut au moins une sortie détaillée assez longue.</P></Card>
        ) : (
          <div className="hk-stagger grid items-start gap-3.5 lg:grid-cols-2">
            <Card>
              <div role="tablist" aria-label="Vue" className="mb-3.5 grid h-9 grid-cols-2 rounded-full bg-fill p-0.5">
                {([["analyse", "Analyse"], ["top", "Top 10"]] as const).map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)} className="hk-seg rounded-full text-[14px] font-semibold">
                    {l}
                  </button>
                ))}
              </div>
              <div ref={pillsRef} role="group" aria-label="Distance" className="hk-scroll pb-0.5">
                {dists.map((d) => (
                  <button key={d.label} type="button" className="hk-pill hk-press" aria-pressed={cur?.label === d.label} onClick={() => setSel(d.label)}>
                    {SHORT_LABEL[d.label] ?? d.label}
                  </button>
                ))}
              </div>

              {cur && best && tab === "analyse" && (
                <>
                  <p className="m-0 mt-4 text-[17px] font-bold">{yr === "all" ? "De tout temps" : yr}</p>
                  <div className="mt-1 flex items-center gap-3">
                    <a href={`#/activity/${best.activity_id}`} className="hk-press flex min-w-0 flex-1 items-center gap-3">
                      <MedalDot i={0} size={44} />
                      <span className="min-w-0">
                        <span className="flex items-baseline gap-2">
                          <span className="text-[34px] leading-none font-bold tracking-[-0.02em] tabular-nums">{fmtClock(best.time_s)}</span>
                          <span className="text-[15px] text-label2 tabular-nums">{rate(best.time_s)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[14px] text-label2">{dayLong(best.date)}</span>
                      </span>
                    </a>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      {top3.slice(1).map((t, i) => (
                        <a key={t.activity_id} href={`#/activity/${t.activity_id}`} className="hk-press flex items-center gap-1.5 text-[14px] font-semibold tabular-nums">
                          <MedalDot i={i + 1} size={20} />
                          {fmtClock(t.time_s)}
                        </a>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4">
                    <RecordChart points={points} fmtY={(v) => (bike ? `${nf(v * 3.6, 1)} km/h` : `${fmtPaceSec(1000 / v)} /km`)} label={`Évolution de tes temps sur ${cur.label}`} />
                  </div>
                  <label className="hk-press relative mt-3 flex h-12 items-center justify-center gap-2 rounded-full border border-sep bg-card text-[16px] font-semibold">
                    {yr === "all" ? "Filtrer par année" : `Année : ${yr}`}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
                    <select value={yr} onChange={(e) => setYear(e.target.value)} aria-label="Filtrer par année" className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
                      <option value="all">Toutes les années</option>
                      {years.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </label>
                  <div className="mt-4">
                    {byYear.map(({ y, items }) => (
                      <div key={y}>
                        <p className="m-0 -mx-[18px] bg-fill px-[18px] py-2 text-[15px] font-bold">{y}</p>
                        {items.map((r, i) => (
                          <a key={r.activity_id} href={`#/activity/${r.activity_id}`} className={`hk-press flex min-h-[60px] items-center gap-2 py-2.5 ${i ? "border-t border-sep" : ""}`}>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[17px]">{dayShort(r.date)}</span>
                              <span className="block truncate text-[14px] text-label2 tabular-nums">{fmtClock(r.time_s)} · {rate(r.time_s)}</span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-1">
                              {r.all < 3 ? <MedalTag i={r.all} text="De tout temps" /> : r.yr < 3 ? <MedalTag i={r.yr} text={r.year} /> : null}
                            </span>
                          </a>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {cur && tab === "top" && (
                <div className="mt-3">
                  {ranked.slice(0, 10).map((t, i) => (
                    <a key={t.activity_id} href={`#/activity/${t.activity_id}`} className={`hk-press flex items-center gap-3 py-3 ${i ? "border-t border-sep" : ""}`}>
                      {i < 3 ? <MedalDot i={i} size={34} /> : <span className="flex size-[34px] shrink-0 items-center justify-center text-[17px] font-semibold text-label2">{i + 1}</span>}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[20px] font-bold tracking-[-0.01em] tabular-nums">{fmtClock(t.time_s)} <span className="text-[14px] font-normal text-label2">{rate(t.time_s)}</span></span>
                        <span className="block truncate text-[14px] text-label2">{dayLong(t.date)}</span>
                      </span>
                      <span className="max-w-[34%] truncate text-right text-[13px] text-label2">{cleanName(t.name)}</span>
                    </a>
                  ))}
                  {yr !== "all" && <Sm className="mt-2">Classement de l'année {yr}.</Sm>}
                </div>
              )}
            </Card>
            <Card>
              <Lbl>Tous mes records · {SPORTS.find((s) => s.k === sport)?.label}</Lbl>
              <div className="mt-1">
                {dists.map((d, i) => {
                  const b = [...d.efforts].sort((a, c) => a.time_s - c.time_s)[0];
                  return (
                    <div key={d.label} className={`flex items-center gap-3 ${i ? "border-t border-sep" : ""}`}>
                      <a href={`#/activity/${b.activity_id}`} aria-label={`Ouvrir l'activité du record ${d.label}`} className="hk-press -m-2 shrink-0 p-2"><MedalDot i={0} size={28} /></a>
                      <button type="button" onClick={() => { setSel(d.label); setTab("analyse"); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="hk-press flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left">
                        <span className="flex-1 text-[17px]">{SHORT_LABEL[d.label] ?? d.label}</span>
                        <span className="text-[17px] font-semibold tabular-nums">{fmtClock(b.time_s)}</span>
                        <span className="w-[76px] text-right text-[13px] text-label2">{shortDay(b.date)}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}
      </div>
    </Frame>
  );
}
