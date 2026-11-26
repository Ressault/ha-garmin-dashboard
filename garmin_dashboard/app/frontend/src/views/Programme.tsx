import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useDataVersion, useQuery } from "@/hooks/useQuery";
import { api, type PlanDetail, type PlanInput, type PlanSession } from "@/lib/api";
import { dayLabel, nf, parseDay, shortDay } from "@/lib/format";
import { downloadText, PLAN_TYPES, parsePlanFile, templateCsv, templateJson } from "@/lib/plan-import";
import { Card, H2, Hr, Lbl, Sm, Skel, Val } from "@/ui/kit";
import { Frame } from "@/views/Activite";

const TYPE_COLOR: Record<string, string> = { endurance: "#34C759", seuil: "#FF375F", relance: "#FF9F0A", longue: "#3E8EF7", test: "#AF52DE", repos: "#8E8E93", course: "#FF453A" };
const typeColor = (t: string) => TYPE_COLOR[t] ?? "#8E8E93";
const typeLabel = (t: string) => PLAN_TYPES[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
const STATUS: Record<string, { l: string; c: string } | undefined> = {
  done: { l: "Faite", c: "#34C759" }, partial: { l: "Partielle", c: "#FF9F0A" }, missed: { l: "Manquée", c: "#FF453A" }, today: { l: "Aujourd'hui", c: "#3E8EF7" },
};
const addDays = (iso: string, n: number) => { const d = parseDay(iso); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };

const btn = "rounded-full bg-[color:var(--tint)] px-4 py-2 text-[15px] font-semibold text-white active:opacity-70 disabled:opacity-40";
const btn2 = "rounded-full bg-fill px-4 py-2 text-[15px] font-semibold text-label active:opacity-70 disabled:opacity-40";
const field = "w-full rounded-xl bg-fill px-3 py-2.5 text-[16px] text-label outline-none";

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
        {onCancel && <button className="text-[15px] text-label2" onClick={onCancel}>Fermer</button>}
      </div>
      {!plan ? (
        <>
          <Sm className="mt-2 block">Un fichier JSON ou un tableau Excel (CSV) : une séance par ligne avec date, titre, type, km, description. Un programme du même nom est remplacé.</Sm>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={btn} onClick={() => input.current?.click()}>Choisir un fichier</button>
            <input ref={input} type="file" accept=".json,.csv,.txt,application/json,text/csv" className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 text-[14px]">
            <span className="text-label2">Modèle :</span>
            <button className="font-medium text-[color:var(--tint)]" onClick={() => downloadText("modele-programme.csv", templateCsv(), "text/csv")}>Excel (CSV)</button>
            <button className="font-medium text-[color:var(--tint)]" onClick={() => downloadText("modele-programme.json", templateJson(), "application/json")}>JSON</button>
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
      {err && <p role="alert" className="mt-3 text-[14px] text-[#FF453A]">{err}</p>}
    </Card>
  );
}

/* ---------- Séance ---------- */
function Session({ s, today }: { s: PlanSession; today: string }) {
  const st = STATUS[s.status];
  const c = typeColor(s.type);
  const inner = (
    <div className="flex gap-3 py-3">
      <span aria-hidden className="mt-1 h-10 w-1 shrink-0 rounded-full" style={{ background: c }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px] text-label2">
          <span>{dayLabel(s.date)}</span>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: c, background: `${c}22` }}>{typeLabel(s.type)}</span>
          {s.date === today && !st && <span className="text-[#3E8EF7]">Aujourd'hui</span>}
          {st && <span className="ml-auto font-semibold" style={{ color: st.c }}>{st.l}</span>}
        </div>
        <div className="mt-0.5 text-[17px] font-semibold leading-6">{s.title}{s.km != null && <span className="font-normal text-label2"> · {nf(s.km, 1)} km</span>}</div>
        {s.description && <p className="mt-0.5 text-[14px] leading-5 text-label2">{s.description}</p>}
        {s.steps.length > 0 && <ul className="mt-1 grid gap-0.5 text-[13.5px] text-label2">{s.steps.map((t, i) => <li key={i}>• {t}</li>)}</ul>}
        {s.done_km != null && <div className="mt-1 text-[13px] font-medium text-[color:var(--tint)]">Réalisé : {nf(s.done_km, 1)} km — voir la sortie</div>}
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
        <div className="mt-4 flex h-20 items-end gap-[3px]" role="group" aria-label="Kilomètres par semaine">
          {d.weeks.map((w, i) => (
            <button key={w.week} aria-label={`Semaine ${i + 1}`} onClick={() => setPicked(i)} className="relative flex h-full min-w-0 flex-1 items-end">
              <span className="absolute inset-x-0 bottom-0 rounded-t-[3px] bg-[color:var(--tint)] opacity-25" style={{ height: `${(w.planned_km / mx) * 100}%` }} />
              <span className="absolute inset-x-0 bottom-0 rounded-t-[3px] bg-[color:var(--tint)]" style={{ height: `${(w.week > d.today ? 0 : w.done_km / mx) * 100}%` }} />
              {i === idx && <span className="absolute -bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-label" />}
            </button>
          ))}
        </div>
      </Card>

      <H2 right={idx !== cur ? <button className="text-[15px] font-medium text-[color:var(--tint)]" onClick={() => setPicked(null)}>Cette semaine</button> : undefined}>Semaine {idx + 1} sur {d.weeks.length}</H2>
      <Card>
        <div className="flex items-center justify-between">
          <button className="px-2 py-1 text-[20px] text-label2 disabled:opacity-30" disabled={idx <= 0} onClick={() => setPicked(idx - 1)} aria-label="Semaine précédente">‹</button>
          <Sm>{shortDay(week.week)} – {shortDay(addDays(week.week, 6))} · {nf(week.done_km, 1)} / {nf(week.planned_km, 1)} km</Sm>
          <button className="px-2 py-1 text-[20px] text-label2 disabled:opacity-30" disabled={idx >= d.weeks.length - 1} onClick={() => setPicked(idx + 1)} aria-label="Semaine suivante">›</button>
        </div>
        <Hr />
        {sessions.length === 0 ? <Sm>Aucune séance prévue cette semaine.</Sm> : <div className="divide-y divide-[var(--sep)]">{sessions.map((s, i) => <Session key={`${s.date}-${i}`} s={s} today={d.today} />)}</div>}
      </Card>

      <Card>
        {confirm ? (
          <div className="flex flex-wrap items-center gap-2">
            <Sm className="flex-1">Supprimer « {d.name} » ? Tes sorties Garmin ne sont pas touchées.</Sm>
            <button className="rounded-full bg-[#FF453A] px-4 py-2 text-[15px] font-semibold text-white disabled:opacity-40" disabled={busy} onClick={remove}>Supprimer</button>
            <button className={btn2} disabled={busy} onClick={() => setConfirm(false)}>Annuler</button>
          </div>
        ) : (
          <button className="text-[16px] font-medium text-[#FF453A]" onClick={() => setConfirm(true)}>Supprimer ce programme</button>
        )}
      </Card>
    </>
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
  const detail = useQuery(`plan:${id}`, () => (id ? api.plan(id) : Promise.resolve(null)));
  const created = (n: number) => { setSel(n); setAdding(false); bump(); };

  return (
    <Frame current="plan" tint="green">
      <div className="mt-4 grid gap-4">
        {!list.data ? <Skel h={220} /> : plans.length === 0 ? (
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
              {!adding && <button className="ml-auto h-9 shrink-0 text-[15px] font-medium text-[color:var(--tint)]" onClick={() => setAdding(true)}>Importer</button>}
            </div>
            {adding && <Import onCreated={created} onCancel={() => setAdding(false)} />}
            {!detail.data ? <Skel h={320} /> : <Body key={detail.data.id} d={detail.data} onDeleted={() => { setSel(null); bump(); }} />}
          </>
        )}
      </div>
    </Frame>
  );
}
