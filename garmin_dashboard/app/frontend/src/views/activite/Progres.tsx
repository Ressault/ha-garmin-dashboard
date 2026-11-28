import { useQuery } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import { fmtClock, fmtClockMin, fmtHM, fmtPaceSec, nf, parseDay, shortDay } from "@/lib/format";
import { AreaLine, Bars } from "@/ui/charts";
import { Guard } from "@/ui/status";
import { pct } from "@/ui/derive";
import { Card, Delta, Hero, Hr, Lbl, P, Sm, Skel, Stagger, Val } from "@/ui/kit";
import { Frame } from "./Frame";

/* Progrès : estimations de chrono, kilomètres par semaine, mois sportif. */
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
  const est = useQuery("estimate", () => api.estimate());
  const eh = est.data?.half ?? null;
  const hMin = histHalf.length ? Math.min(...histHalf.map((h) => h[1])) : 0, hMax = histHalf.length ? Math.max(...histHalf.map((h) => h[1])) : 0;
  return (
    <Frame current="progres" tint="purple">
      <Hero title="Tes progrès">
        {eh ? `Tes records récents placent ton semi entre ${fmtClockMin(eh.low_s)} et ${fmtClockMin(eh.high_s)}. ` : ""}
        {avg4 != null ? `Tu cours en moyenne ${nf(avg4)} km par semaine sur les 4 dernières semaines complètes.` : ""}
      </Hero>
      {!p ? (
        <Guard queries={[preds]}><Stagger><Skel h={260} /></Stagger></Guard>
      ) : (
        <div className="hk-stagger grid items-start gap-3.5 lg:grid-cols-2">
          {eh && (
            <Card tint="purple">
              <div className="flex items-baseline justify-between"><Lbl>Semi-marathon · d'après tes chronos</Lbl></div>
              <p className="m-0 mt-1 text-[36px] leading-tight font-bold tracking-[-0.03em] tabular-nums">{fmtClockMin(eh.low_s)} – {fmtClockMin(eh.high_s)}</p>
              <Sm className="text-[15px]">soit {fmtPaceSec(eh.pace_low_s_km)} à {fmtPaceSec(eh.pace_high_s_km)} /km</Sm>
              <Hr />
              <div className="flex flex-col gap-2">
                {eh.bases.map((b) => (
                  <a key={b.label} href={`#/activity/${b.activity_id}`} className="hk-press flex min-h-11 items-center justify-between gap-3 text-[15px]">
                    <span>Record {b.label} <span className="text-label2">· {shortDay(b.date)}</span></span>
                    <span className="font-semibold tabular-nums">{fmtClock(b.time_s)} → {fmtClockMin(b.half_s)}</span>
                  </a>
                ))}
              </div>
              <Sm className="mt-2">Extrapolation de Riegel sur tes records des {eh.days} derniers jours, à forme égale et sur plat.</Sm>
            </Card>
          )}
          <Card>
            <div className="flex items-baseline justify-between"><Lbl>Estimation de la montre</Lbl><Sm>Garmin</Sm></div>
            <Sm className="mt-2 text-[15px]">Semi-marathon</Sm>
            <p className="m-0 text-[32px] leading-tight font-bold tracking-[-0.03em] tabular-nums">{fmtClock(half)}</p>
            {dHalf != null && dHalf !== 0 && <p className="m-0 text-[15px] font-semibold" style={{ color: dHalf < 0 ? "var(--ok)" : "var(--warn)" }}>{dHalf < 0 ? "−" : "+"}{fmtHM(Math.abs(dHalf))} depuis sa première estimation</p>}
            {eh && half != null && half < eh.low_s - 300 && <Sm className="mt-1.5" style={{ color: "var(--warn-text)" }}>Plus rapide de {fmtHM(eh.low_s - half)} que ce que montrent tes chronos : à ne pas prendre comme allure de course.</Sm>}
            {histHalf.length > 2 && (
              <div className="mt-2">
                <AreaLine points={histHalf.map(([i, v]) => [i, -v] as [number, number])} xMax={histHalf.length - 1} yMin={-hMax - 1} yMax={-hMin + 1} yLabels={[{ v: -hMin, t: fmtClock(hMin * 60).slice(0, -3) }, { v: -hMax, t: fmtClock(hMax * 60).slice(0, -3) }]} color="var(--sys-purple)" height={96} xLabels={[{ x: 0, t: shortDay(p.history.find((h) => h.time_half_s != null)!.date) }, { x: histHalf.length - 1, t: "auj." }]} label="Évolution du chrono prévu sur semi (plus haut = plus rapide)" />
                <Sm>Plus haut = plus rapide</Sm>
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
