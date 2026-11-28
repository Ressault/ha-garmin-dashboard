import { useEffect, useMemo, useRef, useState } from "react";

import { useQuery } from "@/hooks/useQuery";
import { api, type RecordSport } from "@/lib/api";
import { fmtClock, fmtPaceSec, nf, parseDay, shortDay } from "@/lib/format";
import { MEDALS } from "@/lib/palette";
import { RecordChart, type RecordPoint } from "@/ui/charts";
import { Guard } from "@/ui/status";
import { Card, Lbl, P, Sm, Skel } from "@/ui/kit";
import { Frame } from "./Frame";

/* Records : meilleurs efforts par distance (même principe que Strava). */
const cleanName = (n: string | null) => (n ?? "").replace(/ - .*/, "").replace(/ (Course à pied|Trail|Cyclisme.*|Marche.*)$/, "");
const SHORT_LABEL: Record<string, string> = { "Semi-marathon": "Semi", "1/2 mile": "½ mile" };
const SPORTS: { k: RecordSport; label: string }[] = [
  { k: "run", label: "Course" },
  { k: "trail", label: "Trail" },
  { k: "bike", label: "Vélo" },
];

function MedalDot({ i, size = 22 }: { i: number; size?: number }) {
  const m = MEDALS[i];
  return (
    <span aria-label={m.a} className="flex shrink-0 items-center justify-center rounded-full font-extrabold shadow-[inset_0_-2px_0_var(--sh-inset)]" style={{ width: size, height: size, background: m.bg, color: m.fg, fontSize: i ? size * 0.55 : size * 0.4 }}>
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
      <h1 className="sr-only">Records</h1>
      <div className="mt-4 flex flex-col gap-3.5">
        <div role="group" aria-label="Sport" className="grid h-11 grid-cols-3 rounded-full bg-fill p-1">
          {SPORTS.map(({ k, label }) => (
            <button key={k} type="button" aria-pressed={sport === k} onClick={() => { setSport(k); setYear("all"); setSel(k === "bike" ? "10 km" : "5 km"); }} className="hk-seg rounded-full text-[15px] font-semibold">
              {label}
            </button>
          ))}
        </div>
        {!eff.data ? (
          <Guard queries={[eff]}><Skel h={320} /></Guard>
        ) : noData ? (
          <Card><P className="text-label2">Aucun effort calculé pour ce sport : il faut au moins une sortie détaillée assez longue.</P></Card>
        ) : (
          <div className="hk-stagger grid items-start gap-3.5 lg:grid-cols-2">
            <Card>
              <div role="tablist" aria-label="Vue" className="mb-3.5 grid h-11 grid-cols-2 rounded-full bg-fill p-1">
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
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-label2">
                    <span><span aria-hidden className="mr-1.5 inline-block size-2 rounded-full bg-label2/55 align-middle" />une sortie</span>
                    <span><span aria-hidden className="mr-1.5 inline-block h-[3px] w-3.5 rounded bg-[var(--sys-blue)] align-middle" />tendance des 4 dernières</span>
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
