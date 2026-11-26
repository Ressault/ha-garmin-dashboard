import { useState } from "react";

import { useQuery } from "@/hooks/useQuery";
import { api, type FitnessDay, type HeartDay, type SleepDetails } from "@/lib/api";
import { addDays, fmtHM, isoDate, nf, shortDay } from "@/lib/format";
import { PATH } from "@/lib/route";
import { Balance, BandBars, DashBand, HourRanges, Hypnogram, LineBand, LoadChart, Ring, STAGE_COLOR } from "@/ui/charts";
import { useHealth, usePillars } from "@/ui/data";
import { enduranceClass, lastWith, personalBand, PILLAR_TONE, type PillarStatus } from "@/ui/derive";
import { BigHeart, IMoon, ISun, MiniHeart, MiniPillars, MiniSleep } from "@/ui/icons";
import { Badge, Card, Chip, ChipRow, Hero, Hr, Lbl, P, Page, Sm, Skel, Stagger, Val } from "@/ui/kit";
import { SleepWeek } from "./Synthese";

function LonChips({ current }: { current: "piliers" | "sommeil" | "forme" }) {
  const { fit } = useHealth();
  const { colors, greens } = usePillars();
  const l = fit?.latest;
  const sleepLabel = l?.sleep_score == null ? "—" : l.sleep_score >= 80 ? "Bon" : l.sleep_score >= 60 ? "Correct" : "Faible";
  return (
    <ChipRow label="Sections de Longévité">
      <Chip href={PATH.piliers} current={current === "piliers"} icon={<MiniPillars colors={colors} />} label="Mes piliers" value={colors.length ? `${greens} sur 4 au vert` : "—"} />
      <Chip href={PATH.sommeil} current={current === "sommeil"} icon={<MiniSleep score={l?.sleep_score != null ? Math.round(l.sleep_score) : null} />} label="Sommeil" value={sleepLabel} />
      <Chip href={PATH.forme} current={current === "forme"} icon={<MiniHeart />} label="Forme et santé" value={l?.resting_hr != null ? `${nf(l.resting_hr)} BPM` : "—"} />
    </ChipRow>
  );
}

const sign = (v: number) => (v > 0 ? `+${nf(v)}` : v < 0 ? `−${nf(Math.abs(v))}` : "0");
const Status = ({ s }: { s: PillarStatus }) => <Badge tone={PILLAR_TONE[s]}>{s}</Badge>;
const lastN = (s: FitnessDay[], n: number) => s.slice(-n);

/* =========================== Mes piliers =========================== */
export function Piliers() {
  const { p, dyn, runId, series, latest } = usePillars();
  const th = useQuery("thresholds", () => api.thresholds());
  if (!p || !latest) return <Page tint="purple"><LonChips current="piliers" /><Stagger className="mt-6"><Skel h={260} /><Skel h={260} /></Stagger></Page>;
  const ec = p.ec;
  const toNext = ec?.next && latest.endurance_score != null ? Math.round(ec.next.min - latest.endurance_score) : null;
  const hrv14 = lastN(series, 14).map((d) => d.hrv_last_night_ms);
  const ctl6 = lastN(series, 42);
  const gain = ctl6.length > 1 && ctl6[0].ctl != null && latest.ctl != null ? latest.ctl - ctl6[0].ctl : null;
  const weakest = p.recov === "À surveiller" ? "le sommeil, pour que ta VFC reste dans ta plage" : p.dyn === "À surveiller" ? "ta foulée" : p.load === "À surveiller" ? "la récupération après tes grosses semaines" : null;
  return (
    <Page tint="purple">
      <LonChips current="piliers" />
      <Hero title="Tes piliers de forme">
        {p.endur === "Optimal" ? "Ton moteur cardio est excellent." : "Ton moteur cardio progresse."} {weakest ? `La priorité de la semaine : ${weakest}.` : "Tous tes piliers sont au vert."}
      </Hero>
      <div className="hk-stagger grid items-start gap-3.5 lg:grid-cols-2">
        <Card href={PATH.forme}>
          <div className="flex items-center justify-between"><Lbl more>Endurance cardio</Lbl><Status s={p.endur} /></div>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <div><Val size={26}>{nf(latest.vo2max, 1)}</Val><Sm>VO₂ max</Sm></div>
            <div><Val size={26}>{nf(latest.endurance_score)}</Val><Sm>Endurance</Sm></div>
            <div><Val size={26}>{th.data?.lthr_bpm != null ? nf(th.data.lthr_bpm) : "—"}</Val><Sm>FC seuil</Sm></div>
          </div>
          <P className="mt-3">
            {toNext != null && ec?.next ? `Plus que ${nf(toNext)} points avant le niveau ${ec.next.name}. ` : ""}Une sortie longue en zone 2 par semaine suffit à progresser.
          </P>
        </Card>

        <Card href={PATH.sommeil}>
          <div className="flex items-center justify-between"><Lbl more>Récupération · VFC</Lbl><Status s={p.recov} /></div>
          <p className="m-0 mt-2.5 flex items-baseline gap-2">
            <Val size={26}>{nf(latest.hrv_weekly_avg_ms)}</Val>
            <span className="text-[15px] font-semibold">ms moy. 7 j</span>
            <Sm className="text-[15px]">· dernière nuit {nf(latest.hrv_last_night_ms)}</Sm>
          </p>
          {p.band && <div className="mt-3"><DashBand values={hrv14} band={p.band} caption={`14 dernières nuits · bande = ta plage ${p.band[0]}–${p.band[1]} ms`} label="VFC des 14 dernières nuits dans ta plage personnelle" /></div>}
          <P className="mt-2.5">
            {p.band && p.week != null && p.week >= p.band[0] ? "Ta moyenne reste dans ta plage." : "Ta moyenne passe sous ta plage."} {p.low > 0 ? `${p.low} nuit${p.low > 1 ? "s" : ""} sous 70 cette semaine : protège ton heure de coucher.` : "Ton sommeil soutient bien ta récupération."}
          </P>
        </Card>

        <Card>
          <div className="flex items-center justify-between"><Lbl>Charge d'entraînement</Lbl><Status s={p.load} /></div>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <div><Sm>Forme · CTL</Sm><Val size={26} style={{ color: "var(--sys-blue)" }}>{nf(latest.ctl)}</Val></div>
            <div><Sm>Fatigue · ATL</Sm><Val size={26} style={{ color: "var(--sys-pink)" }}>{nf(latest.atl)}</Val></div>
            <div><Sm>Fraîcheur · TSB</Sm><Val size={26} style={{ color: "#1F7A35" }}>{latest.tsb != null ? sign(Math.round(latest.tsb)) : "—"}</Val></div>
          </div>
          <div className="mt-3">
            <LoadChart ctl={ctl6.map((d) => d.ctl)} atl={ctl6.map((d) => d.atl)} tsb={ctl6.map((d) => d.tsb)} labels={[shortDay(ctl6[0].date), "auj."]} />
          </div>
          <P className="mt-2">
            {gain != null ? `Ta forme a ${gain >= 0 ? "gagné" : "perdu"} ${nf(Math.abs(gain))} points en 6 semaines. ` : ""}
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
              {dyn.cadence != null && dyn.cadence < 160 ? "Monter vers 160 pas/min en footing réduit l'impact sur le genou, utile pour ton valgus. " : ""}L'HRM-600 ne mesure pas le valgus lui-même.
            </P>
          </Card>
        )}
      </div>
    </Page>
  );
}

/* =========================== Sommeil =========================== */
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16); // horodatage « local » Garmin → affiché tel quel
const minToClock = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;
const QUAL: Record<string, [string, string]> = { EXCELLENT: ["Excellent", "var(--ok)"], GOOD: ["Bon", "var(--ok)"], FAIR: ["Correct", "var(--label2)"], POOR: ["Faible", "var(--warn)"] };

function SleepCard({ s, score, official }: { s: SleepDetails; score: number | null; official: number | null }) {
  const phases = [
    { k: "awake", n: "Éveil", v: s.awake_s ?? 0, q: s.qualifiers.awakeCount },
    { k: "rem", n: "Paradoxal", v: s.rem_s ?? 0, q: s.qualifiers.remPercentage },
    { k: "light", n: "Léger", v: s.light_s ?? 0, q: s.qualifiers.lightPercentage },
    { k: "deep", n: "Profond", v: s.deep_s ?? 0, q: s.qualifiers.deepPercentage },
  ] as const;
  const staged = (s.deep_s ?? 0) + (s.light_s ?? 0) + (s.rem_s ?? 0);
  const dur = official ?? staged; // temps de sommeil officiel Garmin, le même que sur Synthèse et dans Garmin Connect
  const unstaged = official != null && official - staged > 600 ? official - staged : 0; // part que la montre n'a pas classée par phase
  const total = s.start_local_ms && s.end_local_ms ? (s.end_local_ms - s.start_local_ms) / 60000 : null;
  const start = s.start_local_ms ? hhmm(s.start_local_ms) : "", end = s.end_local_ms ? hhmm(s.end_local_ms) : "";
  const label = score == null ? "—" : score >= 80 ? "Bon score" : score >= 60 ? "Score correct" : "Score faible";
  return (
    <Card tint="indigo">
      <div className="flex items-start justify-between">
        <div>
          <Lbl>Sommeil</Lbl>
          <Val size={24}>{label}</Val>
          <Lbl className="mt-3">Durée</Lbl>
          <Val size={17}>{fmtHM(dur)}</Val>
          {start && <Sm className="mt-0.5">{start} → {end}{s.awake_count ? ` · ${s.awake_count} réveil${s.awake_count > 1 ? "s" : ""}` : ""}</Sm>}
        </div>
        <Ring segments={[phases[0], phases[2], phases[3], phases[1]].map((p) => ({ v: p.v, color: STAGE_COLOR[p.k] }))} label={`Score ${score ?? "—"} ; ${phases.map((p) => `${p.n} ${fmtHM(p.v)}`).join(", ")}`}>
          <circle cx="66" cy="66" r="34" className="fill-card" />
          <text x="66" y="77" fontSize="32" fontWeight="700" textAnchor="middle" className="fill-foreground">{score ?? "–"}</text>
        </Ring>
      </div>
      <Hr />
      <div className="grid grid-cols-[140px_1fr] items-start gap-3 sm:grid-cols-[170px_1fr]">
        <div>
          {phases.map((p) => (
            <div key={p.k} className="flex items-baseline gap-1.5 border-b border-dotted border-sep py-1.5">
              <span className="flex-1 text-[16px] font-semibold" style={{ color: STAGE_COLOR[p.k] }}>{p.n}</span>
              <span className="whitespace-nowrap text-[16px] font-semibold tabular-nums">{fmtHM(p.v)}</span>
            </div>
          ))}
          {unstaged > 0 && (
            <div className="flex items-baseline gap-1.5 border-b border-dotted border-sep py-1.5">
              <span className="flex-1 text-[14px] text-label2">Non classé</span>
              <span className="whitespace-nowrap text-[14px] tabular-nums text-label2">{fmtHM(unstaged)}</span>
            </div>
          )}
        </div>
        <div>
          {s.levels.length > 0 && total ? <Hypnogram levels={s.levels} total={total} start={start} end={end} /> : <Sm>Le détail des phases arrivera avec la prochaine synchro.</Sm>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {phases.map((p) => {
          const q = p.q ? QUAL[p.q] : null;
          return q ? <Sm key={p.k}>{p.n} : <span style={{ color: q[1], fontWeight: 600 }}>{q[0]}</span></Sm> : null;
        })}
      </div>
    </Card>
  );
}

function TonightCard({ s, official }: { s: SleepDetails; official: number | null }) {
  const need = s.next_need_min ?? s.need_min;
  const base = s.next_need_baseline_min ?? s.need_baseline_min;
  if (!need) return null;
  const b0 = s.bedtime_start_min, b1 = s.bedtime_end_min;
  const bed = b0 != null ? b0 + 10 : 23 * 60 + 30;
  const wake = bed + need;
  const X = (m: number) => ((((m - 22 * 60) % 1440) + 1440) % 1440) / 600 * 322;
  const lastNight = official ?? (s.deep_s ?? 0) + (s.light_s ?? 0) + (s.rem_s ?? 0);
  const lastNeed = s.need_min ?? need;
  const delta = base ? need - base : 0;
  return (
    <Card tint="indigo">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Lbl>Ce soir</Lbl>
          <p className="m-0 mt-0.5 text-[40px] leading-[1.1] font-bold tracking-[-0.03em] whitespace-nowrap">{fmtHM(need * 60)}</p>
          <Sm className="text-[15px]">de sommeil nécessaire</Sm>
        </div>
        {delta !== 0 && <Badge tone="indigo">{delta > 0 ? "+" : "−"}{Math.abs(delta)} min</Badge>}
      </div>
      <svg width="100%" height="92" viewBox="0 0 322 92" role="img" aria-label={`Coucher conseillé ${b0 != null ? `entre ${minToClock(b0)} et ${minToClock(b1 ?? b0 + 50)}` : ""}, réveil vers ${minToClock(wake)}`} className="mt-3.5">
        <rect x="0" y="30" width="322" height="22" rx="11" className="fill-fill2" />
        <rect x={X(bed)} y="30" width={Math.max(X(wake) - X(bed), 10)} height="22" rx="11" fill="#5E6BFF" fillOpacity=".22" />
        {b0 != null && <rect x={X(b0)} y="30" width={Math.max(X(b1 ?? b0 + 50) - X(b0), 22)} height="22" rx="11" fill="#5E6BFF" />}
        {b0 != null && <text x={X(b0)} y="20" fontSize="12" fontWeight="600" fill="#5E6BFF">Coucher {minToClock(b0)} – {minToClock(b1 ?? b0 + 50)}</text>}
        <text x={Math.min(X(wake), 322)} y="20" fontSize="12" fontWeight="600" fill="#E07A00" textAnchor="end">Réveil ≈ {minToClock(wake)}</text>
        <circle cx={Math.min(X(wake), 315)} cy="41" r="7" fill="var(--sys-orange)" className="stroke-card" strokeWidth="2.5" />
        {[["22:00", 22 * 60], ["00:00", 0], ["02:00", 120], ["04:00", 240], ["06:00", 360], ["08:00", 480]].map(([t, m], i) => (
          <text key={i} x={i === 5 ? 322 : X(Number(m))} y="72" fontSize="11" textAnchor={i === 0 ? "start" : i === 5 ? "end" : "middle"} className="fill-label2">{t}</text>
        ))}
      </svg>
      <div className="mt-1 grid grid-cols-3 gap-2">
        <div className="flex items-center gap-2"><span style={{ color: "#5E6BFF" }}><IMoon /></span><div><Sm>Coucher</Sm><Val size={16}>{minToClock(bed)}</Val></div></div>
        <div className="flex items-center gap-2"><span style={{ color: "#FF9F0A" }}><ISun /></span><div><Sm>Réveil</Sm><Val size={16}>{minToClock(wake)}</Val></div></div>
        <div><Sm>Sieste</Sm><Val size={16}>{s.nap_s ? fmtHM(s.nap_s) : "—"}</Val></div>
      </div>
      <Hr />
      <Sm>Nuit dernière : {fmtHM(lastNight)} sur {fmtHM(lastNeed * 60)} nécessaires</Sm>
      <div className="mt-1.5 h-2.5 rounded-full" style={{ background: "rgb(94 107 255 / 0.18)" }}>
        <div className="h-2.5 rounded-full bg-[#5E6BFF]" style={{ width: `${Math.min(100, (lastNight / 60 / lastNeed) * 100)}%` }} />
      </div>
      {delta > 0 && <P className="mt-3">Garmin ajoute {delta} min à ton besoin habituel de {fmtHM((base ?? need) * 60)}, à cause de ta charge et de tes dernières nuits.</P>}
    </Card>
  );
}

export function Sommeil() {
  const { fit, det } = useHealth();
  const series = fit?.series ?? [];
  const latest = lastWith(series, "sleep_score") ?? series[series.length - 1];
  const s = det?.sleep ?? null;
  const band = personalBand(series, "hrv_last_night_ms", 30);
  const hrv14 = lastN(series, 14);
  const week = lastN(series, 7).map((d) => d.sleep_score).filter((v): v is number => v != null);
  const isLowest = latest?.sleep_score != null && week.length > 1 && latest.sleep_score <= Math.min(...week);
  const dur = latest?.sleep_duration_s ?? null;
  const title = latest?.sleep_score == null ? "Ton sommeil" : latest.sleep_score >= 80 ? "Une bonne nuit" : dur != null && dur < 6 * 3600 ? "Nuit courte" : latest.sleep_score >= 60 ? "Une nuit correcte" : "Une nuit agitée";
  const deepOk = s?.qualifiers.deepPercentage === "EXCELLENT" || s?.qualifiers.deepPercentage === "GOOD";
  const b0 = s?.bedtime_start_min;
  return (
    <Page tint="indigo">
      <LonChips current="sommeil" />
      <Hero title={deepOk && latest?.sleep_score != null && latest.sleep_score < 60 ? `${title}, sommeil profond solide` : title}>
        {dur != null ? `Tu as dormi ${fmtHM(dur)}${isLowest ? ", ta plus faible note de la semaine" : ""}. ` : ""}
        {b0 != null ? `Un coucher entre ${minToClock(b0)} et ${minToClock(s?.bedtime_end_min ?? b0 + 50)} ce soir aidera ta VFC à rester dans ta plage.` : ""}
      </Hero>
      {!fit ? (
        <Stagger><Skel h={420} /></Stagger>
      ) : (
        <div className="hk-stagger grid items-start gap-3.5 lg:grid-cols-2">
          {s && <SleepCard s={s} score={latest?.sleep_score ?? null} official={latest?.date === s.date ? dur : null} />}
          {s && <TonightCard s={s} official={latest?.date === s.date ? dur : null} />}
          <Card tint="teal">
            <div className="flex items-start justify-between">
              <div><Lbl>VFC nocturne</Lbl><Val>{nf(latest?.hrv_last_night_ms)} ms <span className="text-[14px] font-normal text-label2">dernière nuit</span></Val></div>
              <Badge tone="teal">{latest?.hrv_status === "BALANCED" ? "Équilibrée" : latest?.hrv_status === "UNBALANCED" ? "Déséquilibrée" : latest?.hrv_status === "LOW" ? "Basse" : "—"}</Badge>
            </div>
            {band && (
              <div className="mt-3">
                <BandBars values={hrv14.map((d) => d.hrv_last_night_ms)} band={band} lo={Math.min(20, band[0] - 15)} hi={Math.max(band[1] + 30, ...hrv14.map((d) => (d.hrv_last_night_ms ?? 0) + 12))} labels={[shortDay(hrv14[0].date), shortDay(hrv14[Math.floor(hrv14.length / 2)].date), "auj."]} color="#00A99A" light="#B5E8E2" bandColor="rgb(0 184 169 / 0.14)" bandText={`Ta plage ${band[0]}–${band[1]} ms`} label={`VFC des 14 dernières nuits et plage habituelle ${band[0]} à ${band[1]} ms`} />
              </div>
            )}
            <Hr />
            <div className="grid grid-cols-2 gap-3">
              <div><Sm>Moyenne 7 jours</Sm><Val size={18}>{nf(latest?.hrv_weekly_avg_ms)} ms</Val></div>
              <div><Sm>FC pendant le sommeil</Sm><Val size={18}>{s?.avg_hr != null ? `${nf(s.avg_hr)} BPM` : "—"}</Val></div>
            </div>
          </Card>
          <SleepWeek series={series} nights={14} />
        </div>
      )}
    </Page>
  );
}

/* =========================== Forme et santé =========================== */
export function Forme() {
  const { fit, det } = useHealth();
  const th = useQuery("thresholds", () => api.thresholds());
  const [day, setDay] = useState(0);
  const series = fit?.series ?? [];
  const latest = fit?.latest ?? null;
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
        {latest?.vo2max != null ? `Ton VO₂ max atteint ${nf(latest.vo2max, 1)}. ` : ""}
        {age != null && real != null ? `Ton âge physique a ${nf(real - age, 1)} ans de moins que ton âge réel.` : ""}
      </Hero>
      {!fit ? (
        <Stagger><Skel h={300} /></Stagger>
      ) : (
        <div className="hk-stagger grid items-start gap-3.5 lg:grid-cols-2">
          {heart && (
            <Card tint="pink">
              <div className="flex items-center justify-between gap-2">
                <Lbl>{dayName(heart.date)}, heure par heure</Lbl>
                {hdays.length > 1 && (
                  <div role="group" aria-label="Jour" className="flex h-9 gap-0.5 rounded-full bg-fill p-0.5">
                    {hdays.map((h) => (dayName(h.date) === "Aujourd'hui" ? "Auj." : dayName(h.date))).map((l, i) => (
                      <button key={l} type="button" aria-pressed={day === i} onClick={() => setDay(i)} className="hk-seg whitespace-nowrap rounded-full px-3 text-[13px] font-semibold">
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Val>{heart.min != null && heart.max != null ? `${heart.min}–${heart.max} BPM` : "—"}</Val>
              <div className="mt-2.5"><HourRanges hours={heart.hours} label={`Fréquence cardiaque heure par heure, de ${heart.min} à ${heart.max} BPM`} /></div>
              <Hr />
              <div className="grid grid-cols-2 gap-3">
                <div><Sm style={{ color: "#C4002B", fontWeight: 600 }}>FC au repos</Sm><Val>{heart.resting != null ? `${heart.resting} BPM` : "—"}</Val><Sm>Moy. 7 j : {heart.resting_7d ?? "—"}</Sm></div>
                <div><Sm style={{ color: "#C4002B", fontWeight: 600 }}>Pendant le sommeil</Sm><Val>{det?.sleep?.avg_hr != null ? `${det.sleep.avg_hr} BPM` : "—"}</Val><Sm>Dernière nuit</Sm></div>
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
                    {ec.next && <line x1={X(ec.next.min)} y1="4" x2={X(ec.next.min)} y2="26" stroke="#1F7A35" strokeWidth="2" />}
                    <circle cx={X(latest.endurance_score!)} cy="15" r="7" fill="var(--sys-green)" className="stroke-card" strokeWidth="2.5" />
                    {ec.cur && <text x={X(latest.endurance_score!) - 10} y="40" fontSize="11" textAnchor="end" className="fill-label2">{ec.cur.name}</text>}
                    {ec.next && <text x={X(ec.next.min) + 6} y="40" fontSize="11" fontWeight="600" fill="var(--sys-green)">{ec.next.name} · {nf(ec.next.min)}</text>}
                  </svg>
                );
              })()}
            </Card>
          )}
          {t?.available && (
            <Card>
              <Lbl>Mes seuils</Lbl>
              <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-3.5">
                <div><Sm>Allure seuil</Sm><Val>{t.lt_pace ?? "—"}</Val></div>
                <div><Sm>FC seuil</Sm><Val>{t.lthr_bpm != null ? `${nf(t.lthr_bpm)} BPM` : "—"}</Val></div>
                <div><Sm>Puissance seuil course</Sm><Val>{t.run_ftp_w != null ? `${nf(t.run_ftp_w)} W` : "—"}</Val>{t.run_wkg != null && <Sm>{nf(t.run_wkg, 2)} W/kg</Sm>}</div>
                <div><Sm>FTP vélo</Sm><Val>{t.bike_ftp_w != null ? `${nf(t.bike_ftp_w)} W` : "—"}</Val>{t.bike_ftp_stale ? <Sm style={{ color: "var(--warn)" }}>À mettre à jour</Sm> : null}</div>
                <div><Sm>FC max.</Sm><Val>{t.max_hr_bpm != null ? `${nf(t.max_hr_bpm)} BPM` : "—"}</Val></div>
              </div>
              {t.lt_date && <><Hr /><P>Mesuré le {shortDay(t.lt_date).replace(/\.$/, "")}, un test de seuil le met à jour.</P></>}
            </Card>
          )}
        </div>
      )}
    </Page>
  );
}

