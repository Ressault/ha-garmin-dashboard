import { type SleepDetails } from "@/lib/api";
import { fmtHM, nf, shortDay } from "@/lib/format";
import { BandBars, Hypnogram, Ring, STAGE_COLOR } from "@/ui/charts";
import { useHealth } from "@/ui/data";
import { lastWith, personalBand } from "@/ui/derive";
import { IMoon, ISun } from "@/ui/icons";
import { Badge, Card, Hero, Hr, Lbl, P, Page, Sm, Skel, Stagger, Val } from "@/ui/kit";
import { Guard } from "@/ui/status";
import { SleepWeek } from "@/views/Synthese";
import { LonChips, lastN } from "./shared";

/* Sommeil : dernière nuit, besoin de ce soir, VFC nocturne. Page de référence de la VFC. */
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16); // horodatage « local » Garmin → affiché tel quel
const minToClock = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;
const QUAL: Record<string, [string, string]> = { EXCELLENT: ["Excellent", "var(--ok)"], GOOD: ["Bon", "var(--ok)"], FAIR: ["Correct", "var(--label2)"], POOR: ["Faible", "var(--warn)"] };
// Pour les réveils, Garmin note leur nombre : « POOR » veut dire beaucoup de réveils, pas « peu d'éveil »
const QUAL_AWAKE: Record<string, [string, string]> = { EXCELLENT: ["Très peu", "var(--ok)"], GOOD: ["Peu", "var(--ok)"], FAIR: ["Quelques-uns", "var(--label2)"], POOR: ["Trop nombreux", "var(--warn)"] };
// Couleurs de texte des phases (assez sombres en clair, assez claires en sombre : contraste ≥ 4,5:1)
const STAGE_TEXT = { awake: "var(--stage-awake-text)", rem: "var(--stage-rem-text)", light: "var(--stage-light-text)", deep: "var(--stage-deep-text)" } as const;

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
              <span className="flex-1 text-[16px] font-semibold" style={{ color: STAGE_TEXT[p.k] }}>{p.n}</span>
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
          const q = p.q ? (p.k === "awake" ? QUAL_AWAKE : QUAL)[p.q] : null;
          return q ? <Sm key={p.k}>{p.k === "awake" ? "Réveils" : p.n} : <span style={{ color: q[1], fontWeight: 600 }}>{q[0]}</span></Sm> : null;
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
        <rect x={X(bed)} y="30" width={Math.max(X(wake) - X(bed), 10)} height="22" rx="11" fill="var(--c-iris)" fillOpacity=".22" />
        {b0 != null && <rect x={X(b0)} y="30" width={Math.max(X(b1 ?? b0 + 50) - X(b0), 22)} height="22" rx="11" fill="var(--c-iris)" />}
        {b0 != null && <text x={X(b0)} y="20" fontSize="12" fontWeight="600" fill="var(--c-iris)">Coucher {minToClock(b0)} – {minToClock(b1 ?? b0 + 50)}</text>}
        <text x={Math.min(X(wake), 322)} y="20" fontSize="12" fontWeight="600" fill="var(--warn-text)" textAnchor="end">Réveil ≈ {minToClock(wake)}</text>
        <circle cx={Math.min(X(wake), 315)} cy="41" r="7" fill="var(--sys-orange)" className="stroke-card" strokeWidth="2.5" />
        {[["22:00", 22 * 60], ["00:00", 0], ["02:00", 120], ["04:00", 240], ["06:00", 360], ["08:00", 480]].map(([t, m], i) => (
          <text key={i} x={i === 5 ? 322 : X(Number(m))} y="72" fontSize="11" textAnchor={i === 0 ? "start" : i === 5 ? "end" : "middle"} className="fill-label2">{t}</text>
        ))}
      </svg>
      <div className="mt-1 grid grid-cols-3 gap-2">
        <div className="flex items-center gap-2"><span style={{ color: "var(--c-iris)" }}><IMoon /></span><div><Sm>Coucher</Sm><Val size={16}>{minToClock(bed)}</Val></div></div>
        <div className="flex items-center gap-2"><span style={{ color: "var(--sys-orange)" }}><ISun /></span><div><Sm>Réveil</Sm><Val size={16}>{minToClock(wake)}</Val></div></div>
        <div><Sm>Sieste</Sm><Val size={16}>{s.nap_s ? fmtHM(s.nap_s) : "—"}</Val></div>
      </div>
      <Hr />
      <Sm>Nuit dernière : {fmtHM(lastNight)} sur {fmtHM(lastNeed * 60)} nécessaires</Sm>
      <div className="mt-1.5 h-2.5 rounded-full" style={{ background: "color-mix(in srgb, var(--c-iris) 18%, transparent)" }}>
        <div className="h-2.5 rounded-full bg-[var(--c-iris)]" style={{ width: `${Math.min(100, (lastNight / 60 / lastNeed) * 100)}%` }} />
      </div>
      {delta > 0 && <P className="mt-3">Garmin ajoute {delta} min à ton besoin habituel de {fmtHM((base ?? need) * 60)}, à cause de ta charge et de tes dernières nuits.</P>}
    </Card>
  );
}

export function Sommeil() {
  const { fit, det, fitQ } = useHealth();
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
  if (fitQ.failed) return <Page tint="indigo"><LonChips current="sommeil" /><Guard queries={[fitQ]}>{null}</Guard></Page>;
  return (
    <Page tint="indigo">
      <LonChips current="sommeil" />
      <Hero title={deepOk && latest?.sleep_score != null && latest.sleep_score < 60 ? `${title}, sommeil profond solide` : title}>
        {dur != null ? `Tu as dormi ${fmtHM(dur)}${isLowest ? ", ta plus faible note de la semaine" : ""}. ` : ""}
        {b0 != null ? `Un coucher entre ${minToClock(b0)} et ${minToClock(s?.bedtime_end_min ?? b0 + 50)} ce soir aidera ta VFC à rester dans ta plage.` : ""}
      </Hero>
      {!fit ? (
        <Guard queries={[fitQ]}><Stagger><Skel h={420} /></Stagger></Guard>
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
                <BandBars values={hrv14.map((d) => d.hrv_last_night_ms)} band={band} lo={Math.min(20, band[0] - 15)} hi={Math.max(band[1] + 30, ...hrv14.map((d) => (d.hrv_last_night_ms ?? 0) + 12))} labels={[shortDay(hrv14[0].date), shortDay(hrv14[Math.floor(hrv14.length / 2)].date), "auj."]} color="var(--c-mint-deep)" light="var(--c-mint-soft)" bandColor="color-mix(in srgb, var(--c-mint) 14%, transparent)" bandText={`Ta plage ${band[0]}–${band[1]} ms`} label={`VFC des 14 dernières nuits et plage habituelle ${band[0]} à ${band[1]} ms`} />
              </div>
            )}
            <Hr />
            <div><Sm>Moyenne 7 jours</Sm><Val size={18}>{nf(latest?.hrv_weekly_avg_ms)} ms</Val></div>
          </Card>
          <SleepWeek series={series} nights={14} />
        </div>
      )}
    </Page>
  );
}
