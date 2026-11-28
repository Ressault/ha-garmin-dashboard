import { nf } from "@/lib/format";
import { PATH } from "@/lib/route";
import { Balance } from "@/ui/charts";
import { useHealth, usePillars } from "@/ui/data";
import { Card, Hero, Lbl, P, Page, Sm, Skel, Stagger, Val } from "@/ui/kit";
import { Guard } from "@/ui/status";
import { LonChips, Status, sign } from "./shared";

/* Mes piliers : un chiffre par pilier, le détail sur la page de référence. */
export function Piliers() {
  const { p, dyn, runId, latest } = usePillars();
  const { fitQ } = useHealth();
  if (!p || !latest) return <Page tint="purple"><LonChips current="piliers" /><Guard queries={[fitQ]}><Stagger className="mt-6"><Skel h={260} /><Skel h={260} /></Stagger></Guard></Page>;
  const ec = p.ec;
  const toNext = ec?.next && latest.endurance_score != null ? Math.round(ec.next.min - latest.endurance_score) : null;
  const weakest = p.recov === "À surveiller" ? "le sommeil, pour que ta VFC reste dans ta plage" : p.dyn === "À surveiller" ? "ta foulée" : p.load === "À surveiller" ? "la récupération après tes grosses semaines" : null;
  return (
    <Page tint="purple">
      <LonChips current="piliers" />
      <Hero title="Tes piliers de forme">
        {p.endur === "Optimal" ? "Ton moteur cardio est excellent." : "Ton moteur cardio progresse."} {weakest ? `La priorité de la semaine : ${weakest}.` : "Aucun pilier n'est à surveiller."}
      </Hero>
      <div className="hk-stagger grid items-start gap-3.5 lg:grid-cols-2">
        <Card href={PATH.forme}>
          <div className="flex items-center justify-between"><Lbl more>Endurance cardio</Lbl><Status s={p.endur} /></div>
          <p className="m-0 mt-2.5 flex items-baseline gap-2">
            <Val size={26}>{nf(latest.endurance_score)}</Val>
            <span className="text-[15px] font-semibold">{ec?.cur ? ec.cur.name : "score d'endurance"}</span>
          </p>
          <P className="mt-2.5">
            {toNext != null && ec?.next ? `Plus que ${nf(toNext)} points avant le niveau ${ec.next.name}. ` : ""}Une sortie longue en zone 2 par semaine suffit à progresser.
          </P>
        </Card>

        <Card href={PATH.sommeil}>
          <div className="flex items-center justify-between"><Lbl more>Récupération · VFC</Lbl><Status s={p.recov} /></div>
          <p className="m-0 mt-2.5 flex items-baseline gap-2">
            <Val size={26}>{nf(latest.hrv_weekly_avg_ms)}</Val>
            <span className="text-[15px] font-semibold">ms moy. 7 j</span>
            {p.band && <Sm className="text-[15px]">· ta plage {p.band[0]}–{p.band[1]}</Sm>}
          </p>
          <P className="mt-2.5">
            {p.band && p.week != null && p.week >= p.band[0] ? "Ta moyenne reste dans ta plage." : "Ta moyenne passe sous ta plage."} {p.low > 0 ? `${p.low} nuit${p.low > 1 ? "s" : ""} avec un score de sommeil sous 70 cette semaine : protège ton heure de coucher.` : "Ton sommeil soutient bien ta récupération."}
          </P>
        </Card>

        <Card href={PATH.entrainement}>
          <div className="flex items-center justify-between"><Lbl more>Charge d'entraînement</Lbl><Status s={p.load} /></div>
          <p className="m-0 mt-2.5 flex items-baseline gap-2">
            <Val size={26}>{latest.tsb != null ? sign(Math.round(latest.tsb)) : "—"}</Val>
            <span className="text-[15px] font-semibold">de fraîcheur</span>
          </p>
          <P className="mt-2.5">
            {latest.tsb != null && latest.tsb < -30 ? "La fatigue est élevée : allège quelques jours." : latest.tsb != null && latest.tsb > -10 ? "La fatigue est retombée : tu peux relancer le volume, sans dépasser +10 % par semaine." : "Tu es en phase de progression : garde ce rythme."}
          </P>
        </Card>

        {dyn && p.dyn && (
          <Card href={runId ? `#/activity/${runId}` : undefined}>
            <div className="flex items-center justify-between gap-2"><Lbl more>Dynamiques de course</Lbl><Status s={p.dyn} /></div>
            {dyn.balance != null && (
              <>
                <Sm className="mt-3">Équilibre du temps de contact G / D</Sm>
                <div className="mt-1.5 flex items-center gap-2.5 text-[17px] font-semibold tabular-nums">
                  <span>{nf(dyn.balance, 1)} %</span>
                  <Balance left={dyn.balance} />
                  <span>{nf(100 - dyn.balance, 1)} %</span>
                </div>
              </>
            )}
            <div className="mt-3.5 grid grid-cols-3 gap-2">
              <div><Val style={{ color: dyn.cadence != null && dyn.cadence < 160 ? "var(--warn)" : undefined }}>{nf(dyn.cadence)}</Val><Sm>Cadence</Sm></div>
              <div><Val>{nf(dyn.gct)} ms</Val><Sm>Contact au sol</Sm></div>
              <div><Val>{nf(dyn.vosc, 1)} cm</Val><Sm>Oscillation</Sm></div>
            </div>
            <P className="mt-3">
              {p.devBal != null && p.devBal > 2 ? `Écart gauche-droite de ${nf(p.devBal * 2, 1)} points : surveille ton genou ${dyn.balance! < 50 ? "droit" : "gauche"}. ` : "Équilibre correct. "}
              {dyn.cadence != null && dyn.cadence < 160 ? "Monter vers 160 pas/min en footing réduit l'impact à chaque appui." : ""}
            </P>
          </Card>
        )}
      </div>
    </Page>
  );
}
