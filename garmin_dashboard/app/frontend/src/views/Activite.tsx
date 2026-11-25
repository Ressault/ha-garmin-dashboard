import { useMemo, useState } from "react";

import { MiniTrack } from "@/components/MiniTrack";
import { useQuery } from "@/hooks/useQuery";
import { api, type ActivityListItem } from "@/lib/api";
import { addDays, fmtClock, fmtHM, fmtPaceSec, isoDate, nf, parseDay, shortDay, speedDisplay } from "@/lib/format";
import { PATH } from "@/lib/route";
import { AreaLine, Bars, EffortChart, StackedDays } from "@/ui/charts";
import { useActivities, useHealth } from "@/ui/data";
import { GROUP_META, GROUP_ORDER, groupOf, pct, totals, windows, type Group } from "@/ui/derive";
import { GROUP_ICON, IGrid, ISearch, MiniList, MiniMedal, MiniTrend, MiniZones } from "@/ui/icons";
import { Badge, Card, Chip, ChipRow, Delta, Group as Rows, H2, Hero, Hr, Lbl, P, Page, Sm, Skel, Stagger, Title, Val } from "@/ui/kit";

type Cur = "activites" | "progres" | "entrainement" | "records";
function ActChips({ current }: { current: Cur }) {
  const acts = useActivities();
  const preds = useQuery("predictions-400", () => api.predictions(400));
  const effort = useQuery("effort", () => api.effort());
  const w = windows();
  const n = acts.data ? totals(acts.data.items, ...w.weekToDate).count : null;
  const half = preds.data?.latest?.time_half_s;
  return (
    <ChipRow label="Sections d'Activité">
      <Chip href={PATH.activites} current={current === "activites"} icon={<MiniList />} label="Activités" value={n != null ? `${n} cette sem.` : "—"} />
      <Chip href={PATH.progres} current={current === "progres"} icon={<MiniTrend />} label="Progrès" value={half ? `Semi ${fmtClock(half).slice(0, -3)}` : "—"} />
      <Chip href={PATH.entrainement} current={current === "entrainement"} icon={<MiniZones />} label="Entraînement" value={effort.data ? `Charge ${nf(effort.data.current)}` : "—"} />
      <Chip href={PATH.records} current={current === "records"} icon={<MiniMedal />} label="Records" value="Meilleurs efforts" />
    </ChipRow>
  );
}

function Frame({ current, tint, children }: { current: Cur; tint: "red" | "purple" | "sky" | "gold"; children: React.ReactNode }) {
  return (
    <Page tint={tint}>
      <Title>Activité</Title>
      <ActChips current={current} />
      {children}
    </Page>
  );
}

/* =========================== Activités =========================== */
const FILTERS: (Group | "all")[] = ["all", "foot", "road", "mtb", "walk", "gym"];
const SHORT: Record<Group | "all", string> = { all: "Tous", foot: "Course et trail", road: "Vélo", mtb: "VTT", walk: "Marche", gym: "Muscu", other: "Autre" };

function ActRow({ a }: { a: ActivityListItem }) {
  const g = groupOf(a.sport_type);
  const Icon = GROUP_ICON[g];
  const sp = speedDisplay(a.sport_type, a.avg_speed_ms);
  const meta = [
    a.distance_m ? `${nf(a.distance_m / 1000, 1)} km` : fmtHM(a.duration_s),
    a.distance_m && sp.value !== "—" ? `${sp.value} ${sp.unit}` : null,
    a.avg_hr ? `${nf(a.avg_hr)} bpm` : null,
    a.start_time_local.slice(11, 16),
  ].filter(Boolean).join(" · ");
  return (
    <a href={`#/activity/${a.activity_id}`} className="hk-press flex min-h-[56px] items-center gap-3 px-4 py-2.5">
      {a.mini_track && a.mini_track.length > 1 ? (
        <MiniTrack points={a.mini_track} type={a.sport_type} className="h-11 w-16 shrink-0" />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: `${GROUP_META[g].color}22`, color: GROUP_META[g].color }}>
          <Icon size={19} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px]">{a.name ?? GROUP_META[g].label}</span>
        <span className="block truncate text-[14px] text-label2">{meta}</span>
      </span>
      {a.training_load != null && <span className="text-[15px] font-semibold tabular-nums">{nf(a.training_load)}</span>}
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
        <label className="flex h-10 items-center gap-2 rounded-xl bg-fill px-3 text-label2">
          <ISearch />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une sortie" aria-label="Rechercher une sortie" className="min-w-0 flex-1 bg-transparent text-[17px] text-foreground outline-none" />
        </label>
        <Card>
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-[22px] font-bold tracking-[-0.015em]">Cette semaine</h2>
            <Sm>du {shortDay(w.week[0])} au {shortDay(w.week[1])}</Sm>
          </div>
          <div role="group" aria-label="Filtrer par sport" className="hk-scroll -mx-[18px] mt-3 px-[18px] pb-0.5">
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
      <Hero title={dHalf != null && dHalf < -30 ? `Tu as gagné ${fmtHM(Math.abs(dHalf))} sur semi` : "Tes progrès"}>
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
                <AreaLine points={histHalf.map(([i, v]) => [i, -v] as [number, number])} xMax={histHalf.length - 1} yMin={-Math.max(...histHalf.map((h) => h[1])) - 1} yMax={-Math.min(...histHalf.map((h) => h[1])) + 1} color="#AF52DE" height={80} xLabels={[{ x: 0, t: shortDay(p.history.find((h) => h.time_half_s != null)!.date) }, { x: histHalf.length - 1, t: "auj." }]} label="Évolution du chrono prévu sur semi (plus haut = plus rapide)" />
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
                <Bars height={150} items={ws.slice(-8).map((x, i, arr) => ({ label: i === 0 || parseDay(x.week).getDate() <= 7 ? shortDay(x.week) : String(parseDay(x.week).getDate()), value: x.km, strong: i < arr.length - 1 }))} color="#FF2D55" light="#FFB3C1" label="Kilomètres de course et trail par semaine" />
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
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-label2">
              <span><span aria-hidden className="mr-1.5 inline-block h-[3px] w-3.5 rounded bg-[#0A84FF] align-middle" />cette semaine</span>
              <span><span aria-hidden className="mr-1.5 inline-block w-3.5 border-t-2 border-dashed border-label2 align-middle opacity-60" />semaine dernière ({nf(e.previous_total)})</span>
              <span><span aria-hidden className="mr-1.5 inline-block h-2.5 w-3 rounded-sm bg-[#3E8EF7]/15 align-middle" />habituel</span>
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
                      <span className="absolute -top-[3px] -bottom-[3px] w-0.5 rounded bg-foreground/55" style={{ left: `${(zp[i] / zmax) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="block text-[15px] font-semibold">{nf(zc[i])} %</span>
                      <span className="block text-[12px] text-label2">{b0 != null ? (b1 != null ? `${b0}–${b1 - 1}` : `${b0}+`) : ""}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <Sm className="mt-1.5"><span aria-hidden className="mr-1.5 inline-block h-2.5 w-0.5 bg-foreground/55 align-[-1px]" />repère = les 4 semaines précédentes</Sm>
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
              <AreaLine points={ctlPts} xMax={ctlPts[ctlPts.length - 1][0]} yMin={Math.min(...ctlPts.map((p) => p[1])) - 8} yMax={Math.max(...ctlPts.map((p) => p[1])) + 6} color="#3E62FF" height={130} xLabels={[{ x: 0, t: shortDay(series[0].date) }, { x: ctlPts[ctlPts.length - 1][0], t: "auj." }]} label="Condition physique sur 6 semaines" />
            </div>
          </Card>
        )}
        {e && (
          <Card>
            <div className="flex items-baseline justify-between"><Lbl>Charge par semaine</Lbl><Sm>en cours en clair</Sm></div>
            <div className="mt-2.5">
              <Bars height={120} items={e.weeks.slice(-8).map((x, i, arr) => ({ label: i === 0 || parseDay(x.week).getDate() <= 7 ? shortDay(x.week) : String(parseDay(x.week).getDate()), value: x.load, strong: i < arr.length - 1 }))} color="#0A84FF" light="#9EC5FF" label="Charge d'entraînement par semaine" />
            </div>
          </Card>
        )}
      </div>
    </Frame>
  );
}

/* =========================== Records =========================== */
const MEDAL = [
  { bg: "#F5C33B", fg: "#7A5600", t: "PR", a: "Record personnel" },
  { bg: "#C9CDD6", fg: "#4A4F5A", t: "2", a: "2e meilleur temps" },
  { bg: "#E3A574", fg: "#6B3A12", t: "3", a: "3e meilleur temps" },
];
const cleanName = (n: string | null) => (n ?? "").replace(/ - .*/, "").replace(/ (Course à pied|Trail|Cyclisme.*|Marche.*)$/, "");
const SHORT_LABEL: Record<string, string> = { "Semi-marathon": "Semi", "1/2 mile": "½ mile" };
export function Records() {
  const [kind, setKind] = useState<"foot" | "bike">("foot");
  const eff = useQuery(`efforts-${kind}`, () => api.efforts(kind));
  const dists = eff.data?.distances ?? [];
  const [sel, setSel] = useState<string>("5 km");
  const cur = dists.find((d) => d.label === sel) ?? dists.find((d) => d.label === "5 km") ?? dists[0];
  const top = cur ? [...cur.efforts].sort((a, b) => a.time_s - b.time_s).slice(0, 3) : [];
  const prs = dists.map((d) => ({ label: d.label, best: [...d.efforts].sort((a, b) => a.time_s - b.time_s)[0], n: d.efforts.length, dist: d.distance_m }));
  const best = prs.find((p) => p.label === "5 km") ?? prs[0];
  return (
    <Frame current="records" tint="gold">
      <Hero title={best?.best ? `Ton record sur ${best.label} : ${fmtClock(best.best.time_s)}` : "Tes records"}>
        {best?.best ? `Établi le ${shortDay(best.best.date).replace(/\.$/, "")}${best.best.name ? ` à ${cleanName(best.best.name)}` : ""}.` : ""}
      </Hero>
      {!eff.data ? (
        <Stagger><Skel h={300} /></Stagger>
      ) : (
        <div className="hk-stagger grid items-start gap-3.5 lg:grid-cols-2">
          <Card>
            <div role="group" aria-label="Sport" className="mb-3 inline-flex gap-1 rounded-full bg-fill p-0.5">
              {(["foot", "bike"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className="rounded-full px-3 py-1 text-[13px] font-semibold" style={kind === k ? { background: "var(--card)", boxShadow: "0 1px 3px rgb(0 0 0 / .12)" } : { color: "var(--label2)" }}>
                  {k === "foot" ? "Course et trail" : "Vélo"}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Distance" className="hk-scroll -mx-[18px] px-[18px] pb-0.5">
              {dists.map((d) => (
                <button key={d.label} type="button" className="hk-pill hk-press" aria-pressed={cur?.label === d.label} onClick={() => setSel(d.label)}>
                  {SHORT_LABEL[d.label] ?? d.label}
                </button>
              ))}
            </div>
            {cur && (
              <>
                <Lbl className="mt-4">Meilleurs efforts sur {cur.label}</Lbl>
                <div className="mt-1">
                  {top.map((t, i) => (
                    <a key={t.activity_id} href={`#/activity/${t.activity_id}`} className={`hk-press flex items-center gap-3 py-3 ${i ? "border-t border-sep" : ""}`}>
                      <span aria-label={MEDAL[i].a} className="flex size-10 shrink-0 items-center justify-center rounded-full font-extrabold shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)]" style={{ background: MEDAL[i].bg, color: MEDAL[i].fg, fontSize: i ? 16 : 13 }}>
                        {MEDAL[i].t}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[22px] font-bold tracking-[-0.01em] tabular-nums">{fmtClock(t.time_s)}</span>
                        <span className="block truncate text-[14px] text-label2">
                          {parseDay(t.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                          {kind === "foot" ? ` · ${fmtPaceSec((t.time_s / cur.distance_m) * 1000)} /km` : ` · ${nf((cur.distance_m / t.time_s) * 3.6, 1)} km/h`}
                        </span>
                      </span>
                      <span className="max-w-[40%] truncate text-right text-[14px] text-label2">{cleanName(t.name)}</span>
                    </a>
                  ))}
                </div>
                <Hr />
                <P className="text-label2">Calculés sur {cur.efforts.length} sortie{cur.efforts.length > 1 ? "s" : ""}. Les efforts impossibles (erreurs GPS) sont écartés.</P>
              </>
            )}
          </Card>
          <Card>
            <Lbl>Tous mes records</Lbl>
            <div className="mt-1">
              {prs.map((p, i) => p.best && (
                <button key={p.label} type="button" onClick={() => setSel(p.label)} className={`hk-press flex w-full items-center gap-3 py-2.5 text-left ${i ? "border-t border-sep" : ""}`}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#F5C33B] text-[10px] font-extrabold text-[#7A5600]">PR</span>
                  <span className="flex-1 text-[17px]">{p.label}</span>
                  <span className="text-[17px] font-semibold tabular-nums">{fmtClock(p.best.time_s)}</span>
                  <span className="w-[76px] text-right text-[13px] text-label2">{shortDay(p.best.date)}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}
    </Frame>
  );
}
