import { useQuery } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import { fmtHM, nf, parseDay, shortDay } from "@/lib/format";
import { ZONE_COLORS } from "@/lib/palette";
import { Bars, EffortChart, LoadChart } from "@/ui/charts";
import { useHealth } from "@/ui/data";
import { Guard } from "@/ui/status";
import { Badge, Card, Hero, Hr, Lbl, P, Sm, Skel, Val } from "@/ui/kit";
import { Frame } from "./Frame";

/* Entraînement : effort de la semaine, zones de FC, charge. Page de référence de la charge. */
const ZONES = [5, 4, 3, 2, 1].map((n) => ({ z: `Z${n}`, c: ZONE_COLORS[n - 1] }));
export function Entrainement() {
  const effort = useQuery("effort", () => api.effort());
  const zones = useQuery("zones-28-all", () => api.zones(28, "all"));
  const { fit } = useHealth();
  const e = effort.data, z = zones.data;
  if (effort.failed || zones.failed) return <Frame current="entrainement" tint="sky"><Guard queries={[effort, zones]}>{null}</Guard></Frame>;
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
            <div className="flex items-baseline justify-between"><Lbl>Zones de FC · 4 semaines</Lbl><Sm>{fmtHM(z.current.total)} avec FC mesurée</Sm></div>
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
            <div className="flex items-center justify-between"><Lbl>Forme, fatigue, fraîcheur</Lbl>{gain != null && <Badge tone={gain >= 0 ? "green" : "gray"}>{gain >= 0 ? "+" : "−"}{nf(Math.abs(gain))} en 6 sem.</Badge>}</div>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              <div><Sm>Forme · CTL</Sm><Val size={26} style={{ color: "var(--sys-blue)" }}>{nf(latest.ctl)}</Val></div>
              <div><Sm>Fatigue · ATL</Sm><Val size={26} style={{ color: "var(--sys-pink)" }}>{nf(latest.atl)}</Val></div>
              <div><Sm>Fraîcheur · TSB</Sm><Val size={26} style={{ color: "var(--ok)" }}>{latest.tsb != null ? (latest.tsb > 0 ? "+" : latest.tsb < 0 ? "−" : "") + nf(Math.abs(Math.round(latest.tsb))) : "—"}</Val></div>
            </div>
            <div className="mt-3">
              <LoadChart ctl={series.map((d) => d.ctl)} atl={series.map((d) => d.atl)} tsb={series.map((d) => d.tsb)} labels={[shortDay(series[0].date), "auj."]} />
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
