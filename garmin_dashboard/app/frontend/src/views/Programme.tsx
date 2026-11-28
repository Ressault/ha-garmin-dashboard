import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useDataVersion, useQuery } from "@/hooks/useQuery";
import { api, type PlanDetail, type PlanInput, type PlanSession, type Race } from "@/lib/api";
import { dayLabel, nf, parseDay, shortDay } from "@/lib/format";
import { alpha } from "@/lib/palette";
import { downloadText, PLAN_TYPES, parsePlanFile, templateCsv, templateJson } from "@/lib/plan-import";
import { Badge, Card, H2, Hr, Lbl, Sm, Skel, Val } from "@/ui/kit";
import { Guard } from "@/ui/status";
import { Frame } from "@/views/activite";

const TYPE_COLOR: Record<string, string> = { endurance: "var(--sys-green)", seuil: "var(--sys-pink)", relance: "var(--sys-orange)", longue: "var(--c-sky)", test: "var(--sys-purple)", repos: "var(--c-gray)", course: "var(--sys-red)" };
const typeColor = (t: string) => TYPE_COLOR[t] ?? TYPE_COLOR[({ run: "endurance", easy: "endurance", long: "longue", tempo: "seuil", threshold: "seuil", interval: "seuil", intervals: "seuil", rest: "repos", race: "course" } as Record<string, string>)[t.toLowerCase()] ?? ""] ?? "var(--c-gray)";
const EN_TYPES: Record<string, string> = { run: "Course", easy: "Footing", long: "Sortie longue", tempo: "Seuil", threshold: "Seuil", interval: "Fractionné", intervals: "Fractionné", hill: "Côtes", hills: "Côtes", rest: "Repos", race: "Course", recovery: "Récupération", strength: "Renforcement" };
const typeLabel = (t: string) => PLAN_TYPES[t] ?? EN_TYPES[t.toLowerCase()] ?? t.charAt(0).toUpperCase() + t.slice(1);
// Couleurs de texte : les teintes vives sont réservées aux formes, le texte prend leur version lisible (≥ 4,5:1)
const STATUS: Record<string, { l: string; c: string } | undefined> = {
  done: { l: "Faite", c: "var(--ok)" }, partial: { l: "Partielle", c: "var(--warn-text)" }, missed: { l: "Manquée", c: "var(--bad-text)" }, today: { l: "Aujourd'hui", c: "var(--blue-text)" },
};
const BPM = (t: string) => t.replace(/\bbpm\b/g, "BPM");
const addDays = (iso: string, n: number) => { const d = parseDay(iso); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };

const btn = "hk-press h-11 rounded-full bg-[var(--ok-fill)] px-5 text-[15px] font-semibold text-white disabled:opacity-40";
const btn2 = "hk-press h-11 rounded-full bg-fill px-5 text-[15px] font-semibold text-foreground disabled:opacity-40";
const link = "hk-press min-h-11 font-semibold text-[var(--ok)]";
const field = "h-12 w-full rounded-xl bg-fill px-3 text-[16px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--sys-blue)]/60";

/* ---------- Import ---------- */
function Import({ onCreated, onCancel }: { onCreated: (id: number) => void; onCancel?: () => void }) {
  const [plan, setPlan] = useState<PlanInput | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function load(f?: File) {
    if (!f) return;
    setErr(null); setPlan(null);
    try { setPlan(parsePlanFile(f.name, await f.text())); } catch (e) { setErr((e as Error).message); }
  }
  async function save() {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await api.createPlan({ ...plan, name: plan.name.trim() || "Mon programme", goal_name: plan.goal_name?.trim() || null, goal_date: plan.goal_date || null });
      toast.success(r.replaced ? "Programme mis à jour" : "Programme ajouté", { description: `${plan.sessions.length} séances importées.` });
      onCreated(r.id);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const km = plan ? plan.sessions.reduce((a, s) => a + (s.km ?? 0), 0) : 0;
  const dates = plan ? plan.sessions.map((s) => s.date).sort() : [];

  return (
    <Card tint="green">
      <div className="flex items-baseline justify-between">
        <Lbl>Importer un programme</Lbl>
        {onCancel && <button className="hk-press -my-2 h-11 px-2 text-[15px] text-label2" onClick={onCancel}>Fermer</button>}
      </div>
      {!plan ? (
        <>
          <Sm className="mt-2 block">Un fichier JSON ou un tableau Excel (CSV) : une séance par ligne avec date, titre, type, km, description. Un programme du même nom est remplacé.</Sm>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={btn} onClick={() => input.current?.click()}>Choisir un fichier</button>
            <input ref={input} type="file" accept=".json,.csv,.txt,application/json,text/csv" className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 text-[15px]">
            <span className="text-label2">Modèle :</span>
            <button className={link} onClick={() => downloadText("modele-programme.csv", templateCsv(), "text/csv")}>Excel (CSV)</button>
            <button className={link} onClick={() => downloadText("modele-programme.json", templateJson(), "application/json")}>JSON</button>
          </div>
        </>
      ) : (
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1 text-[13px] text-label2">Nom<input className={field} value={plan.name} maxLength={120} onChange={(e) => setPlan({ ...plan, name: e.target.value })} /></label>
          <label className="grid gap-1 text-[13px] text-label2">Objectif (facultatif)<input className={field} value={plan.goal_name ?? ""} placeholder="Trail Sud Touraine · 23 km" onChange={(e) => setPlan({ ...plan, goal_name: e.target.value })} /></label>
          <label className="grid gap-1 text-[13px] text-label2">Date de l'objectif<input type="date" className={field} value={plan.goal_date ?? ""} onChange={(e) => setPlan({ ...plan, goal_date: e.target.value || null })} /></label>
          <Sm>{plan.sessions.length} séances · {nf(km, 0)} km · du {shortDay(dates[0])} au {shortDay(dates[dates.length - 1])}</Sm>
          <div className="flex flex-wrap gap-2">
            <button className={btn} disabled={busy} onClick={save}>Ajouter</button>
            <button className={btn2} disabled={busy} onClick={() => setPlan(null)}>Autre fichier</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="mt-3 text-[14px] text-[var(--bad-text)]">{err}</p>}
    </Card>
  );
}

/* ---------- Séance ---------- */
function Session({ s, today, race }: { s: PlanSession; today: string; race?: Race }) {
  const base = STATUS[s.status];
  const st = base && s.status === "done" && s.shift_days ? { ...base, l: s.shift_days > 0 ? "Faite le lendemain" : "Faite la veille" } : base;
  const c = typeColor(s.type);
  const inner = (
    <div className="flex gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px] text-label2">
          <span>{dayLabel(s.date)}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold text-foreground" style={{ background: alpha(c, 13) }}><span aria-hidden className="size-2 rounded-full" style={{ background: c }} />{typeLabel(s.type)}</span>
          {s.date === today && !st && <span className="font-semibold text-[var(--blue-text)]">Aujourd'hui</span>}
          {st && <span className="ml-auto font-semibold" style={{ color: st.c }}>{st.l}</span>}
        </div>
        <div className="mt-0.5 text-[17px] font-semibold leading-6">{s.title}{s.km != null && <span className="font-normal text-label2"> · {nf(s.km, 1)} km</span>}</div>
        {race && <p className="m-0 mt-1 text-[14px] font-semibold text-[var(--warn-text)]">{race.name} ce jour-là{race.km ? ` (${nf(race.km, 1)} km)` : ""} : la séance prévue est à adapter.</p>}
        {s.description && <p className="mt-0.5 text-[14px] leading-5 text-label2">{BPM(s.description)}</p>}
        {s.steps.length > 0 && <ul className="mt-1 grid gap-0.5 text-[13.5px] text-label2">{s.steps.map((t, i) => <li key={i}>• {BPM(t)}</li>)}</ul>}
        {s.done_km != null && <div className="mt-1 text-[14px] font-semibold text-[var(--ok)]">Réalisé : {nf(s.done_km, 1)} km · voir la sortie</div>}
      </div>
    </div>
  );
  return s.activity_id ? <a href={`#/activity/${s.activity_id}`} className="block">{inner}</a> : <div>{inner}</div>;
}

/* ---------- Suivi ---------- */
function Body({ d, onDeleted }: { d: PlanDetail; onDeleted: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const cur = useMemo(() => {
    const i = d.weeks.findIndex((w) => w.week <= d.today && d.today <= addDays(w.week, 6));
    return i >= 0 ? i : d.today < d.weeks[0].week ? 0 : d.weeks.length - 1;
  }, [d]);
  const idx = Math.min(Math.max(picked ?? cur, 0), d.weeks.length - 1);
  const week = d.weeks[idx];
  const sessions = d.sessions_detail.filter((s) => s.date >= week.week && s.date <= addDays(week.week, 6));
  const past = d.sessions_detail.filter((s) => s.date <= d.today);
  const planned = past.reduce((a, s) => a + (s.km ?? 0), 0);
  const done = past.reduce((a, s) => a + (s.done_km ?? 0), 0);
  const runs = past.filter((s) => s.km != null);
  const nDone = runs.filter((s) => s.status === "done").length;
  const left = d.goal_date ? Math.ceil((parseDay(d.goal_date).getTime() - parseDay(d.today).getTime()) / 86400000) : null;
  const mx = Math.max(1, ...d.weeks.map((w) => Math.max(w.planned_km, w.done_km)));

  const pickAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPicked(Math.min(d.weeks.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * d.weeks.length))));
  };
  const raceOn = (day: string) => (d.races ?? []).find((r) => r.date === day && !r.in_plan);
  const off = (d.races ?? []).filter((r) => !r.in_plan && r.date >= d.today);

  async function remove() {
    setBusy(true);
    try { await api.deletePlan(d.id); toast.success("Programme supprimé", { description: "Tes sorties Garmin ne sont pas touchées." }); onDeleted(); }
    catch (e) { toast.error("Suppression impossible", { description: (e as Error).message }); setBusy(false); }
  }

  return (
    <>
      <Card tint="green">
        <Lbl className="block truncate">{d.name}</Lbl>
        <Val size={28}>{left != null ? (left >= 0 ? `J-${left}` : "Terminé") : `${d.weeks.length} semaines`}</Val>
        <Sm>{d.goal_name ? `${d.goal_name}${d.goal_date ? ` · ${parseDay(d.goal_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : ""}` : `${d.sessions} séances · ${nf(d.total_km, 0)} km`}</Sm>
        <Hr />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-[20px] font-semibold">{cur + 1}/{d.weeks.length}</div><Sm>semaine</Sm></div>
          <div><div className="text-[20px] font-semibold">{nf(done, 0)}/{nf(planned, 0)}</div><Sm>km réalisés</Sm></div>
          <div><div className="text-[20px] font-semibold">{nDone}/{runs.length}</div><Sm>séances</Sm></div>
        </div>
        {/* Les barres sont étroites : on choisit la semaine en posant ou en glissant le doigt n'importe où sur le graphique */}
        <div
          className="mt-4 flex h-20 touch-pan-y items-end gap-[3px] select-none"
          role="group"
          aria-label="Kilomètres par semaine : prévu en clair, réalisé en plein"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pickAt(e); }}
          onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") pickAt(e); }}
        >
          {d.weeks.map((w, i) => (
            <button key={w.week} aria-label={`Semaine ${i + 1} : ${nf(w.done_km, 0)} sur ${nf(w.planned_km, 0)} km`} aria-pressed={i === idx} onClick={() => setPicked(i)} className="relative flex h-full min-w-0 flex-1 items-end">
              <span className="absolute inset-x-0 bottom-0 rounded-t-[3px] bg-[color:var(--tint)] opacity-25" style={{ height: `${(w.planned_km / mx) * 100}%` }} />
              <span className="absolute inset-x-0 bottom-0 rounded-t-[3px] bg-[color:var(--tint)]" style={{ height: `${(w.week > d.today ? 0 : w.done_km / mx) * 100}%` }} />
              {i === idx && <span className="absolute -bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-foreground" />}
            </button>
          ))}
        </div>
      </Card>

      {off.map((r) => {
        const left = Math.ceil((parseDay(r.date).getTime() - parseDay(d.today).getTime()) / 86400000);
        return (
          <Card key={r.date + r.name}>
            <div className="flex items-center justify-between gap-2"><Lbl>{r.name}</Lbl><Badge tone="orange">J-{left}</Badge></div>
            <Val size={18}>{parseDay(r.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}{r.km ? ` · ${nf(r.km, 1)} km` : ""}</Val>
            <Sm className="mt-1" style={{ color: "var(--warn-text)" }}>{r.planned_title ? `Le programme prévoit « ${r.planned_title} » ce jour-là.` : "Le programme ne prévoit rien ce jour-là."} La course et son affûtage restent à intégrer.</Sm>
          </Card>
        );
      })}

      <H2 right={idx !== cur ? <button className={`${link} text-[15px]`} onClick={() => setPicked(null)}>Cette semaine</button> : undefined}>Semaine {idx + 1} sur {d.weeks.length}</H2>
      <Card>
        <div className="flex items-center justify-between">
          <button className="hk-press -my-2 -ml-2 size-11 text-[24px] text-label2 disabled:opacity-30" disabled={idx <= 0} onClick={() => setPicked(idx - 1)} aria-label="Semaine précédente">‹</button>
          <Sm>{shortDay(week.week)} – {shortDay(addDays(week.week, 6))} · {nf(week.done_km, 1)} / {nf(week.planned_km, 1)} km</Sm>
          <button className="hk-press -my-2 -mr-2 size-11 text-[24px] text-label2 disabled:opacity-30" disabled={idx >= d.weeks.length - 1} onClick={() => setPicked(idx + 1)} aria-label="Semaine suivante">›</button>
        </div>
        <Hr />
        {sessions.length === 0 ? <Sm>Aucune séance prévue cette semaine.</Sm> : <div className="divide-y divide-[var(--sep)]">{sessions.map((s, i) => <Session key={`${s.date}-${i}`} s={s} today={d.today} race={raceOn(s.date)} />)}</div>}
      </Card>

      <Card>
        {confirm ? (
          <div className="flex flex-wrap items-center gap-2">
            <Sm className="flex-1">Supprimer « {d.name} » ? Tes sorties Garmin ne sont pas touchées.</Sm>
            <button className="hk-press h-11 rounded-full bg-[var(--bad-fill)] px-5 text-[15px] font-semibold text-white disabled:opacity-40" disabled={busy} onClick={remove}>Supprimer</button>
            <button className={btn2} disabled={busy} onClick={() => setConfirm(false)}>Annuler</button>
          </div>
        ) : (
          <button className="hk-press -my-2 h-11 text-[16px] font-semibold text-[var(--bad-text)]" onClick={() => setConfirm(true)}>Supprimer ce programme</button>
        )}
      </Card>
    </>
  );
}

/* ---------- Courses objectif ---------- */
function Races({ onChanged }: { onChanged: () => void }) {
  const q = useQuery("races", () => api.races());
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [km, setKm] = useState("");
  const [busy, setBusy] = useState(false);
  const races = q.data?.races ?? [];
  const today = q.data?.today ?? "";
  const save = async (next: Race[]) => {
    setBusy(true);
    try { await api.saveRaces(next); setOpen(false); setName(""); setDate(""); setKm(""); onChanged(); }
    catch (e) { toast.error("Enregistrement impossible", { description: (e as Error).message }); }
    finally { setBusy(false); }
  };
  if (!q.data) return null;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <Lbl>Mes courses</Lbl>
        {!open && <button className={`${link} -my-2 h-11 px-1 text-[16px]`} onClick={() => setOpen(true)}>Ajouter</button>}
      </div>
      {races.length === 0 && !open && <Sm className="mt-1">Aucune course enregistrée.</Sm>}
      <div className="divide-y divide-[var(--sep)]">
        {races.map((r) => {
          const left = today ? Math.ceil((parseDay(r.date).getTime() - parseDay(today).getTime()) / 86400000) : null;
          return (
            <div key={r.date + r.name} className="flex min-h-[52px] items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-semibold">{r.name}</span>
                <span className="block text-[14px] text-label2">{parseDay(r.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}{r.km ? ` · ${nf(r.km, 1)} km` : ""}</span>
              </span>
              {left != null && left >= 0 && <Badge tone="green">J-{left}</Badge>}
              <button className="hk-press size-11 shrink-0 text-[20px] text-label2" disabled={busy} aria-label={`Retirer ${r.name}`} onClick={() => save(races.filter((x) => x !== r))}>×</button>
            </div>
          );
        })}
      </div>
      {open && (
        <form className="mt-3 grid gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim() && date) void save([...races, { name: name.trim(), date, km: km ? Number(km.replace(",", ".")) || null : null }]); }}>
          <label className="grid gap-1 text-[13px] text-label2">Nom<input className={field} value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-[13px] text-label2">Date<input type="date" className={field} value={date} required onChange={(e) => setDate(e.target.value)} /></label>
            <label className="grid gap-1 text-[13px] text-label2">Distance (km)<input inputMode="decimal" className={field} value={km} onChange={(e) => setKm(e.target.value)} /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={btn} disabled={busy || !name.trim() || !date}>Enregistrer</button>
            <button type="button" className={btn2} disabled={busy} onClick={() => setOpen(false)}>Annuler</button>
          </div>
        </form>
      )}
    </Card>
  );
}

/* ---------- Page ---------- */
export default function Programme() {
  const { bump } = useDataVersion();
  const list = useQuery("plans", api.plans);
  const [sel, setSel] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const plans = list.data?.plans ?? [];
  const today = new Date().toLocaleDateString("sv-SE");
  const auto = plans.find((p) => p.start_date <= today && today <= p.end_date) ?? plans[0];
  const id = plans.some((p) => p.id === sel) ? sel : (auto?.id ?? null);
  const detail = useQuery(`plan-${id ?? 0}`, () => (id ? api.plan(id) : Promise.resolve(null)));
  const created = (n: number) => { setSel(n); setAdding(false); bump(); };

  return (
    <Frame current="plan" tint="green">
      <h1 className="sr-only">Programme</h1>
      <div className="mt-4 grid gap-4">
        {!list.data ? <Guard queries={[list]}><Skel h={220} /></Guard> : plans.length === 0 ? (
          <>
            <Card><Val>Aucun programme</Val><Sm>Importe ton plan pour suivre chaque séance, voir ce qui est fait et ce qui reste à courir.</Sm></Card>
            <Import onCreated={created} />
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {plans.map((p) => (
                <button key={p.id} aria-pressed={p.id === id} onClick={() => setSel(p.id)} className="hk-pill max-w-[62%]" title={p.name}><span>{p.name}</span></button>
              ))}
              {!adding && <button className={`${link} ml-auto h-11 shrink-0 px-1 text-[16px]`} onClick={() => setAdding(true)}>Importer</button>}
            </div>
            {adding && <Import onCreated={created} onCancel={() => setAdding(false)} />}
            {!detail.data ? <Guard queries={[detail]}><Skel h={320} /></Guard> : <Body key={detail.data.id} d={detail.data} onDeleted={() => { setSel(null); bump(); }} />}
          </>
        )}
        {list.data && <Races onChanged={bump} />}
      </div>
    </Frame>
  );
}
