import { useMemo, useState } from "react";

import { MiniTrack } from "@/components/MiniTrack";
import { type ActivityListItem } from "@/lib/api";
import { addDays, fmtHM, isoDate, nf, parseDay, shortDay, speedDisplay } from "@/lib/format";
import { alpha } from "@/lib/palette";
import { StackedDays } from "@/ui/charts";
import { useActivities } from "@/ui/data";
import { Guard } from "@/ui/status";
import { activeSecs, GROUP_META, GROUP_ORDER, groupOf, totals, windows, type Group } from "@/ui/derive";
import { GROUP_ICON, IGrid, ISearch } from "@/ui/icons";
import { Card, Delta, Group as Rows, H2, P, Sm, Skel, Stagger, Val } from "@/ui/kit";
import { Frame } from "./Frame";

/* Liste des sorties et bilan de la semaine. */
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
    a.distance_m ? null : `à ${a.start_time_local.slice(11, 16)}`,
  ].filter(Boolean).join(" · ");
  // « Perrusson Course à pied » → « Course · Perrusson » : le sport d'abord, le lieu ensuite, sans doublon
  const raw = (a.name ?? "").trim();
  const sfx = GARMIN_SUFFIX.find((x) => raw.toLowerCase().endsWith(" " + x.toLowerCase()));
  const title = !raw ? GROUP_META[g].label : sfx ? `${KIND[g]} · ${raw.slice(0, raw.length - sfx.length).trim()}` : raw;
  return (
    <a href={`#/activity/${a.activity_id}`} className="hk-press flex min-h-[60px] items-center gap-3 px-4 py-2.5">
      {a.mini_track && a.mini_track.length > 1 ? (
        <MiniTrack points={a.mini_track} type={a.sport_type} className="h-11 w-16 shrink-0" />
      ) : (
        <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-[10px]" style={{ background: alpha(GROUP_META[g].color, 13), color: GROUP_META[g].color }}>
          <Icon size={20} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[17px] leading-[1.25]">{title}</span>
        <span className="block text-[14px] text-label2">{meta}</span>
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
      .map((g) => ({ g, color: GROUP_META[g].color, v: items.filter((a) => a.activity_date === d && groupOf(a.sport_type) === g).reduce((s, a) => s + activeSecs(a) / 60, 0) }))
      .filter((p) => p.v > 0);
    return { label: ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."][i], strong: i === w.dayIdx, parts };
  });
  const weekGroups = GROUP_ORDER.filter((g) => days.some((d) => d.parts.some((p) => p.g === g)));
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
  // Tous sports confondus, additionner les kilomètres de vélo et de course n'a pas de sens : on montre la distance à pied
  const curKm = f === "all" ? totals(items, ...w.weekToDate, "foot").km : cur.km;
  const prevKm = f === "all" ? totals(items, ...w.prevWeekToDate, "foot").km : prev.km;
  const dsec = cur.secs - prev.secs, dkm = curKm - prevKm, dd = cur.dplus - prev.dplus;
  const prevLabel = `lun. → ${["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."][w.dayIdx]}`;
  if (acts.failed) return <Frame current="activites" tint="red"><Guard queries={[acts]}>{null}</Guard></Frame>;
  return (
    <Frame current="activites" tint="red">
      <h1 className="sr-only">Activités</h1>
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
            <div><Sm>Temps actif</Sm><Val size={24} className="whitespace-nowrap">{fmtHM(cur.secs)}</Val><Delta value={dsec} text={`${dsec >= 0 ? "+" : "−"}${fmtHM(Math.abs(dsec))}`} /></div>
            <div><Sm>{f === "all" ? "À pied" : "Distance"}</Sm><Val size={24} className="whitespace-nowrap">{nf(curKm, 1)} km</Val><Delta value={dkm} text={`${dkm >= 0 ? "+" : "−"}${nf(Math.abs(dkm), 1)} km`} /></div>
            <div><Sm>Dénivelé +</Sm><Val size={24} className="whitespace-nowrap">{nf(cur.dplus)} m</Val><Delta value={dd} text={`${dd >= 0 ? "+" : "−"}${nf(Math.abs(dd))} m`} /></div>
          </div>
          <div className="mt-3.5">
            <StackedDays days={days} label="Temps d'activité par jour cette semaine, coloré par sport" />
          </div>
          {weekGroups.length > 1 && (
            <ul className="m-0 mb-1.5 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-[12px] text-label2" aria-label="Légende des sports">
              {weekGroups.map((g) => (
                <li key={g} className="whitespace-nowrap"><span aria-hidden className="mr-1.5 inline-block size-2.5 rounded-[3px] align-[-1px]" style={{ background: GROUP_META[g].color }} />{SHORT[g]}</li>
              ))}
            </ul>
          )}
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
            <button type="button" onClick={() => setMore((m) => m + 30)} className="hk-press mx-auto mt-5 block h-11 rounded-full bg-fill px-5 text-[15px] font-semibold">
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
