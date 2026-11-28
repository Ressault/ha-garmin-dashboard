import { useState } from "react";
import { toast } from "sonner";

import { useDataVersion, useQuery } from "@/hooks/useQuery";
import { api, type FitnessDay, type HeartDay, type Thresholds } from "@/lib/api";
import { addDays, fmtPace, isoDate, nf, shortDay } from "@/lib/format";
import { HourRanges, LineBand } from "@/ui/charts";
import { useHealth } from "@/ui/data";
import { enduranceClass, personalBand } from "@/ui/derive";
import { BigHeart } from "@/ui/icons";
import { Badge, Card, Hero, Hr, Lbl, P, Page, Sm, Skel, Stagger, Val } from "@/ui/kit";
import { Guard, MeasuredAt } from "@/ui/status";
import { LonChips, lastN } from "./shared";

/* Forme et santé : cœur, VO₂ max, endurance, seuils. Page de référence de la FC au repos et du VO₂ max. */
/** Seuils : valeurs de la montre, résultat du dernier test de terrain, et choix de celui qui sert de repère. */
function ThresholdsCard({ t }: { t: Thresholds }) {
  const { bump } = useDataVersion();
  const [busy, setBusy] = useState(false);
  const test = t.test ?? null;
  const fromTest = t.source === "test";
  const choose = async (source: "garmin" | "test") => {
    setBusy(true);
    try {
      await api.setThresholdSource(source);
      bump();
      toast.success(source === "test" ? "Seuil du test adopté" : "Seuil de la montre repris", { description: "Les repères d'allure et de FC suivent ce choix." });
    } catch (e) {
      toast.error("Changement impossible", { description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  };
  const pace = (ms?: number | null) => (ms ? `${fmtPace(ms)} /km` : "—");
  return (
    <Card>
      <div className="flex items-center justify-between"><Lbl>Mes seuils</Lbl><Badge tone={fromTest ? "indigo" : "gray"}>{fromTest ? "Test de terrain" : "Montre"}</Badge></div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-3.5">
        <div><Sm>Allure seuil</Sm><Val>{pace(t.lt_speed_ms)}</Val></div>
        <div><Sm>FC seuil</Sm><Val>{t.lthr_bpm != null ? `${nf(t.lthr_bpm)} BPM` : "—"}</Val></div>
        <div><Sm>Puissance seuil course</Sm><Val>{t.run_ftp_w != null ? `${nf(t.run_ftp_w)} W` : "—"}</Val>{t.run_wkg != null && <Sm>{nf(t.run_wkg, 2)} W/kg</Sm>}</div>
        <div><Sm>FTP vélo</Sm><Val>{t.bike_ftp_w != null ? `${nf(t.bike_ftp_w)} W` : "—"}</Val>{t.bike_ftp_stale ? <Sm style={{ color: "var(--warn)" }}>À mettre à jour</Sm> : null}</div>
        <div><Sm>FC max.</Sm><Val>{t.max_hr_bpm != null ? `${nf(t.max_hr_bpm)} BPM` : "—"}</Val></div>
      </div>
      {t.lt_date && <Sm className="mt-3">{fromTest ? "Test du" : "Mesure de la montre du"} {shortDay(t.lt_date).replace(/\.$/, "")}</Sm>}
      {test && (
        <>
          <Hr />
          <a href={`#/activity/${test.activity_id}`} className="hk-press block">
            <Lbl more>Test de 30 min · {shortDay(test.date).replace(/\.$/, "")}</Lbl>
            <Val>{pace(test.speed_ms)}{test.lthr_bpm != null ? ` · ${test.lthr_bpm} BPM` : ""}</Val>
            <Sm>{nf(test.distance_m / 1000, 2)} km en 30 min · montre : {pace(t.garmin_lt_speed_ms)}{t.garmin_lthr_bpm != null ? ` · ${nf(t.garmin_lthr_bpm)} BPM` : ""}</Sm>
          </a>
          <button type="button" disabled={busy} onClick={() => choose(fromTest ? "garmin" : "test")} className="hk-press mt-3 h-11 w-full rounded-full bg-fill text-[15px] font-semibold disabled:opacity-50">
            {fromTest ? "Revenir au seuil de la montre" : "Adopter le seuil du test"}
          </button>
        </>
      )}
    </Card>
  );
}

export function Forme() {
  const { fit, det, fitQ } = useHealth();
  const th = useQuery("thresholds", () => api.thresholds());
  const [day, setDay] = useState(0);
  const series = fit?.series ?? [];
  const latest = fit?.latest ?? null;
  if (fitQ.failed) return <Page tint="pink"><LonChips current="forme" /><Guard queries={[fitQ]}>{null}</Guard></Page>;
  const rhrBand = personalBand(series, "resting_hr", 30);
  const bpm = latest?.resting_hr ?? null;
  const beat = `${60 / Math.max(bpm ?? 60, 30)}s`;
  // Juste après minuit, la journée en cours est encore vide : on n'affiche que les jours qui ont des mesures
  const hdays: HeartDay[] = (det?.heart ?? []).filter((h) => h.hours.some(Boolean));
  const heart: HeartDay | undefined = hdays[Math.min(day, hdays.length - 1)];
  const dayName = (d: string) => (d === isoDate(new Date()) ? "Aujourd'hui" : d === isoDate(addDays(new Date(), -1)) ? "Hier" : shortDay(d));
  const rhr42 = lastN(series, 42);
  const vo2 = series.map((d) => d.vo2max).filter((v): v is number => v != null);
  const vo2Delta = vo2.length > 1 ? vo2[vo2.length - 1] - vo2[0] : null;
  const ec = enduranceClass(latest?.endurance_score, latest?.endurance_limits_json);
  const t = th.data;
  const age = latest?.fitness_age, real = latest?.chrono_age;
  const outlier = rhr42.reduce<FitnessDay | null>((m, d) => (d.resting_hr != null && rhrBand && d.resting_hr > rhrBand[1] + 4 && (!m || d.resting_hr > (m.resting_hr ?? 0)) ? d : m), null);
  return (
    <Page tint="pink">
      <LonChips current="forme" />
      <div className="relative mt-3 flex h-[250px] items-center justify-center">
        <div className="hk-ghost absolute h-[200px] w-[220px]" style={{ ["--beat" as string]: beat }} aria-hidden>
          <BigHeart id="hg1" />
        </div>
        <div className="hk-beat relative h-[200px] w-[220px]" style={{ ["--beat" as string]: beat }} role="img" aria-label={`Fréquence cardiaque au repos ${bpm ?? "inconnue"} BPM`}>
          <BigHeart id="hg2" />
          <div className="absolute inset-0 flex flex-col items-center justify-center pb-6 text-black">
            <span className="text-[58px] leading-none font-bold tracking-[-0.03em]">{bpm != null ? nf(bpm) : "–"}</span>
            <span className="mt-0.5 text-[13px] font-semibold">BPM</span>
          </div>
        </div>
      </div>
      <Hero title={rhrBand && bpm != null && bpm <= rhrBand[1] ? "Un cœur d'athlète" : "Ton cœur se repose moins"}>
        {rhrBand && bpm != null ? (bpm <= rhrBand[1] ? `Ta FC au repos reste dans ta plage (${rhrBand[0]}–${rhrBand[1]}). ` : `Ta FC au repos dépasse ta plage (${rhrBand[0]}–${rhrBand[1]}). `) : ""}
        {age != null && real != null ? `Ton âge physique a ${nf(real - age, 1)} ans de moins que ton âge réel.` : ""}
      </Hero>
      {!fit ? (
        <Guard queries={[fitQ]}><Stagger><Skel h={300} /></Stagger></Guard>
      ) : (
        <div className="hk-stagger grid items-start gap-3.5 lg:grid-cols-2">
          {heart && (
            <Card tint="pink">
              <div className="flex items-center justify-between gap-2">
                <Lbl>{dayName(heart.date)}, heure par heure</Lbl>
                {hdays.length > 1 && (
                  <div role="group" aria-label="Jour" className="flex h-11 gap-0.5 rounded-full bg-fill p-1">
                    {hdays.map((h) => (dayName(h.date) === "Aujourd'hui" ? "Auj." : dayName(h.date))).map((l, i) => (
                      <button key={l} type="button" aria-pressed={day === i} onClick={() => setDay(i)} className="hk-seg whitespace-nowrap rounded-full px-3 text-[13px] font-semibold">
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Val>{heart.min != null && heart.max != null ? `${heart.min}–${heart.max} BPM` : "—"}</Val>
              {heart.date === isoDate(new Date()) && <MeasuredAt at={fit.measured_at} />}
              <div className="mt-2.5"><HourRanges hours={heart.hours} label={`Fréquence cardiaque heure par heure, de ${heart.min} à ${heart.max} BPM`} /></div>
              <Hr />
              <div className="grid grid-cols-2 gap-3">
                <div><Sm style={{ color: "var(--pink-text)", fontWeight: 600 }}>Repos · moy. 7 j</Sm><Val>{heart.resting_7d != null ? `${heart.resting_7d} BPM` : "—"}</Val></div>
                <div><Sm style={{ color: "var(--pink-text)", fontWeight: 600 }}>Pendant le sommeil</Sm><Val>{det?.sleep?.avg_hr != null ? `${det.sleep.avg_hr} BPM` : "—"}</Val></div>
              </div>
            </Card>
          )}
          {rhrBand && (
            <Card>
              <div className="flex items-baseline justify-between"><Lbl>FC au repos · 6 semaines</Lbl><Badge tone="red">{bpm != null && bpm <= rhrBand[1] ? "Stable" : "En hausse"}</Badge></div>
              <div className="mt-2.5">
                <LineBand values={rhr42.map((d) => d.resting_hr)} band={rhrBand} lo={rhrBand[0] - 8} hi={rhrBand[1] + 12} color="var(--sys-pink)" bandText={`Ta plage ${rhrBand[0]}–${rhrBand[1]}`} labels={[shortDay(rhr42[0].date), "auj."]} label={`FC au repos sur 6 semaines, plage habituelle ${rhrBand[0]} à ${rhrBand[1]}`} />
              </div>
              {outlier && <P className="mt-1.5">Le pic à {nf(outlier.resting_hr)} du {shortDay(outlier.date)}{outlier.sleep_score != null && outlier.sleep_score < 50 ? ` suit une mauvaise nuit (score ${nf(outlier.sleep_score)})` : ""}. Depuis, tu restes {bpm != null && bpm <= rhrBand[1] ? "dans" : "proche de"} ta plage.</P>}
            </Card>
          )}
          {age != null && real != null && (
            <Card>
              <div className="flex items-center justify-between"><Lbl>Âge physique</Lbl><Badge tone="green">{nf(age - real, 1)} ans</Badge></div>
              <p className="m-0 mt-1.5 flex items-baseline gap-2"><Val size={34}>{nf(age, 1)} ans</Val><Sm className="text-[15px]">âge réel {nf(real)} ans</Sm></p>
            </Card>
          )}
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl>VO₂ max</Lbl><Val size={30}>{nf(latest?.vo2max, 1)}</Val><Sm>{vo2Delta != null && Math.abs(vo2Delta) >= 0.1 ? `${vo2Delta > 0 ? "+" : "−"}${nf(Math.abs(vo2Delta), 1)} en ${series.length} j` : "ml/kg/min · course"}</Sm></div>
              <div><Lbl>Score de montée</Lbl><Val size={30}>{nf(latest?.hill_score)}</Val><Sm>Force {nf(latest?.hill_strength)} · endurance {nf(latest?.hill_endurance)}</Sm></div>
            </div>
          </Card>
          {ec && latest?.endurance_score != null && (
            <Card>
              <div className="flex items-center justify-between"><Lbl>Score d'endurance</Lbl>{ec.cur && <Badge tone="green">{ec.cur.name}</Badge>}</div>
              <Val size={30} className="mt-1.5">{nf(latest.endurance_score)}</Val>
              {(() => {
                const lo = ec.levels[0].min, hi = ec.levels[ec.levels.length - 1].min + 800;
                const X = (v: number) => ((v - lo) / (hi - lo)) * 322;
                return (
                  <svg width="100%" height="44" viewBox="0 0 322 44" role="img" aria-label={`Score ${latest.endurance_score}${ec.next ? `, niveau ${ec.next.name} à ${ec.next.min}` : ""}`} className="mt-2">
                    <rect x="0" y="10" width="322" height="10" rx="5" className="fill-fill2" />
                    <rect x="0" y="10" width={X(latest.endurance_score!)} height="10" rx="5" fill="var(--sys-green)" fillOpacity=".45" />
                    {ec.next && <line x1={X(ec.next.min)} y1="4" x2={X(ec.next.min)} y2="26" stroke="var(--ok)" strokeWidth="2" />}
                    <circle cx={X(latest.endurance_score!)} cy="15" r="7" fill="var(--sys-green)" className="stroke-card" strokeWidth="2.5" />
                    {ec.cur && <text x={X(latest.endurance_score!) - 10} y="40" fontSize="11" textAnchor="end" className="fill-label2">{ec.cur.name}</text>}
                    {ec.next && <text x={X(ec.next.min) + 6} y="40" fontSize="11" fontWeight="600" fill="var(--sys-green)">{ec.next.name} · {nf(ec.next.min)}</text>}
                  </svg>
                );
              })()}
            </Card>
          )}
          {t?.available && <ThresholdsCard t={t} />}
        </div>
      )}
    </Page>
  );
}
