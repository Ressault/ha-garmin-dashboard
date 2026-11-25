import { useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, CircleDashed, Download, FileUp, Minus, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";

import { Chart, EmptyState, QueryError } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataVersion, useQuery } from "@/hooks/useQuery";
import { api, type PlanDetail, type PlanInput, type PlanSession, type PlanStatus } from "@/lib/api";
import { axisPointerLine, axisText, tipRow, tipTitle, tooltipBase, type EChartsInstance, type Opt } from "@/lib/echarts";
import { dayLabel, nf, parseDay, shortDay } from "@/lib/format";
import { C } from "@/lib/palette";
import { downloadText, PLAN_TYPES, parsePlanFile, templateCsv, templateJson } from "@/lib/plan-import";
import { cn } from "@/lib/utils";

const TYPE_COLOR: Record<string, string> = {
  endurance: C.green,
  seuil: C.pink,
  relance: C.orange,
  longue: C.blue,
  test: C.violet,
  repos: C.gray,
  course: C.red,
};
const typeColor = (t: string) => TYPE_COLOR[t] ?? C.gray;
const typeLabel = (t: string) => PLAN_TYPES[t] ?? t.charAt(0).toUpperCase() + t.slice(1);

const STATUS: Record<PlanStatus, { label: string; color: string; Icon: typeof Check } | null> = {
  done: { label: "Faite", color: C.green, Icon: Check },
  partial: { label: "Partielle", color: C.orange, Icon: Minus },
  missed: { label: "Manquée", color: C.red, Icon: X },
  today: { label: "Aujourd'hui", color: C.blue, Icon: CircleDashed },
  upcoming: null,
  info: null,
};

const addDays = (iso: string, n: number) => {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE");
};

/* ---------- Import ---------- */
function ImportPanel({ onCreated, onCancel }: { onCreated: (id: number) => void; onCancel?: () => void }) {
  const [plan, setPlan] = useState<PlanInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function load(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPlan(null);
    try {
      setPlan(parsePlanFile(file.name, await file.text()));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save() {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await api.createPlan({ ...plan, name: plan.name.trim() || "Mon programme", goal_name: plan.goal_name?.trim() || null, goal_date: plan.goal_date || null });
      toast.success(r.replaced ? "Programme mis à jour" : "Programme ajouté", {
        description: r.replaced ? `« ${plan.name} » existait déjà : ses ${plan.sessions.length} séances ont été remplacées.` : `${plan.sessions.length} séances importées.`,
      });
      onCreated(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const km = plan ? plan.sessions.reduce((a, s) => a + (s.km ?? 0), 0) : 0;
  const dates = plan ? plan.sessions.map((s) => s.date).sort() : [];
  const fieldCls = "bg-foreground/[0.05] border-foreground/10 focus-visible:ring-ring/50 h-10 w-full rounded-xl border px-3 text-[15px] outline-none focus-visible:ring-[3px]";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Ajouter un programme</CardTitle>
            <CardDescription>Un fichier JSON ou un tableau Excel (CSV) avec une séance par ligne : date, titre, type, km, description. Un programme du même nom est remplacé.</CardDescription>
          </div>
          {onCancel && (
            <Button variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Fermer">
              <X />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!plan && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              load(e.dataTransfer.files[0]);
            }}
            className={cn(
              "flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-9 text-center transition-colors duration-200",
              drag ? "border-primary bg-primary/10" : "border-foreground/20",
            )}
          >
            <FileUp className="text-muted-foreground size-7" aria-hidden />
            <p className="text-[15px] font-medium">Glisse ton fichier ici</p>
            <Button onClick={() => input.current?.click()}>Choisir un fichier</Button>
            <input ref={input} type="file" accept=".json,.csv,.txt,application/json,text/csv" className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
            <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px]">
              <span>Pas de fichier ? Pars d'un modèle :</span>
              <button className="text-primary inline-flex items-center gap-1 font-medium hover:underline" onClick={() => downloadText("modele-programme.csv", templateCsv(), "text/csv")}>
                <Download className="size-3.5" /> Excel (CSV)
              </button>
              <button className="text-primary inline-flex items-center gap-1 font-medium hover:underline" onClick={() => downloadText("modele-programme.json", templateJson(), "application/json")}>
                <Download className="size-3.5" /> JSON
              </button>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[#FF453A]/30 bg-[#FF453A]/10 p-4 text-[14px]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#FF453A]" />
            <p>{error}</p>
          </div>
        )}

        {plan && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-[13px] font-medium sm:col-span-3">
                Nom du programme
                <input className={fieldCls} value={plan.name} maxLength={120} onChange={(e) => setPlan({ ...plan, name: e.target.value })} />
              </label>
              <label className="grid gap-1 text-[13px] font-medium sm:col-span-2">
                Objectif (facultatif)
                <input className={fieldCls} value={plan.goal_name ?? ""} placeholder="Trail Sud Touraine · 23 km" onChange={(e) => setPlan({ ...plan, goal_name: e.target.value })} />
              </label>
              <label className="grid gap-1 text-[13px] font-medium">
                Date de l'objectif
                <input type="date" className={fieldCls} value={plan.goal_date ?? ""} onChange={(e) => setPlan({ ...plan, goal_date: e.target.value || null })} />
              </label>
            </div>
            <p className="text-muted-foreground text-[14px]">
              <b className="text-foreground">{plan.sessions.length} séances</b> · {nf(km, 0)} km · du {shortDay(dates[0])} au {shortDay(dates[dates.length - 1])}
            </p>
            <ul className="divide-foreground/[0.06] divide-y text-[14px]">
              {plan.sessions.slice(0, 4).map((s, i) => (
                <li key={i} className="flex items-center gap-3 py-2">
                  <span className="text-muted-foreground w-24 shrink-0">{dayLabel(s.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <span className="text-muted-foreground">{s.km ? `${nf(s.km, 1)} km` : "—"}</span>
                </li>
              ))}
              {plan.sessions.length > 4 && <li className="text-muted-foreground py-2">… et {plan.sessions.length - 4} autres</li>}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={busy}>
                <Plus /> Ajouter le programme
              </Button>
              <Button variant="secondary" onClick={() => setPlan(null)} disabled={busy}>
                Choisir un autre fichier
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Séance ---------- */
function SessionCard({ s, today }: { s: PlanSession; today: string }) {
  const st = STATUS[s.status];
  const color = typeColor(s.type);
  const rest = s.km == null;
  return (
    <li
      className={cn("bg-card relative overflow-hidden rounded-2xl border p-4 pl-5", s.date === today && "ring-2 ring-[color:var(--c)]", rest && "opacity-80")}
      style={{ ["--c" as string]: color }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-muted-foreground text-[13px] font-medium">{dayLabel(s.date)}</span>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color, background: `${color}22` }}>
          {typeLabel(s.type)}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {st && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color: st.color, background: `${st.color}22` }}>
              <st.Icon className="size-3" strokeWidth={2.5} />
              {st.label}
            </span>
          )}
          {s.km != null && <span className="text-[15px] font-semibold">{nf(s.km, 1)} km</span>}
        </span>
      </div>
      <h3 className="mt-1 text-[17px] leading-6 font-semibold tracking-tight">{s.title}</h3>
      {s.description && <p className="text-muted-foreground mt-1 text-[14px] leading-5">{s.description}</p>}
      {s.steps.length > 0 && (
        <ul className="text-muted-foreground mt-2 grid gap-1 text-[13.5px] leading-5">
          {s.steps.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full" style={{ background: color }} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
      {s.done_km != null && (
        <a href={`#/activity/${s.activity_id}`} className="text-primary mt-3 inline-flex items-center gap-1 text-[13px] font-medium hover:underline">
          Réalisé : {nf(s.done_km, 1)} km — voir la sortie <ChevronRight className="size-3.5" />
        </a>
      )}
    </li>
  );
}

/* ---------- Suivi d'un programme ---------- */
function PlanBody({ d, onDeleted }: { d: PlanDetail; onDeleted: () => void }) {
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
  const plannedToDate = past.reduce((a, s) => a + (s.km ?? 0), 0);
  const doneToDate = past.reduce((a, s) => a + (s.done_km ?? 0), 0);
  const runPast = past.filter((s) => s.km != null);
  const doneCount = runPast.filter((s) => s.status === "done").length;
  const daysLeft = d.goal_date ? Math.ceil((parseDay(d.goal_date).getTime() - parseDay(d.today).getTime()) / 86400000) : null;

  const onInit = useRef((c: EChartsInstance) => c.on("click", (p) => typeof p.dataIndex === "number" && setPicked(p.dataIndex))).current;

  const option = useMemo<Opt>(
    () => ({
      animation: false,
      grid: { left: 40, right: 8, top: 10, bottom: 24 },
      xAxis: {
        type: "category",
        data: d.weeks.map((w) => shortDay(w.week)),
        axisLine: { lineStyle: { color: C.grid } },
        axisTick: { show: false },
        axisLabel: { ...axisText, hideOverlap: true },
      },
      yAxis: { type: "value", splitNumber: 3, axisLine: { show: false }, axisTick: { show: false }, axisLabel: axisText, splitLine: { lineStyle: { color: C.grid } } },
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { ...axisPointerLine, type: "shadow", shadowStyle: { color: C.faint } },
        formatter: (ps: { dataIndex: number }[]) => {
          const w = d.weeks[ps[0].dataIndex];
          return (
            tipTitle(`Semaine ${ps[0].dataIndex + 1} · ${shortDay(w.week)}`) +
            tipRow(C.blue, "Prévu", `${nf(w.planned_km, 1)} km`) +
            tipRow(C.green, "Réalisé", `${nf(w.done_km, 1)} km`)
          );
        },
      },
      series: [
        {
          type: "bar",
          barCategoryGap: "28%",
          data: d.weeks.map((w, i) => ({ value: w.planned_km, itemStyle: { color: `${C.blue}40`, borderRadius: [4, 4, 0, 0], borderColor: i === idx ? C.label : "transparent", borderWidth: i === idx ? 1.5 : 0 } })),
        },
        {
          type: "bar",
          barGap: "-100%",
          barCategoryGap: "28%",
          z: 3,
          data: d.weeks.map((w) => ({ value: w.week > d.today ? null : w.done_km, itemStyle: { color: C.blue, borderRadius: [4, 4, 0, 0] } })),
        },
      ],
    }),
    [d, idx],
  );

  async function remove() {
    setBusy(true);
    try {
      await api.deletePlan(d.id);
      toast.success("Programme supprimé", { description: "Tes sorties Garmin ne sont pas touchées." });
      onDeleted();
    } catch (e) {
      toast.error("Suppression impossible", { description: (e as Error).message });
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-lg">{d.name}</CardTitle>
              <CardDescription>
                {d.goal_name ? `${d.goal_name}${d.goal_date ? ` · ${parseDay(d.goal_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : ""}` : `${d.sessions} séances · ${nf(d.total_km, 0)} km`}
              </CardDescription>
            </div>
            {confirm ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-[13px]">Supprimer ce programme ?</span>
                <Button variant="destructive" size="sm" onClick={remove} disabled={busy}>
                  Supprimer
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirm(false)} disabled={busy}>
                  Annuler
                </Button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setConfirm(true)}>
                <Trash2 /> Supprimer
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { k: daysLeft != null ? (daysLeft >= 0 ? `J-${daysLeft}` : "Terminé") : `${d.weeks.length} sem.`, l: daysLeft != null ? "avant l'objectif" : "de programme" },
              { k: `${cur + 1} / ${d.weeks.length}`, l: "semaine en cours" },
              { k: `${nf(doneToDate, 0)} / ${nf(plannedToDate, 0)} km`, l: "réalisés à ce jour" },
              { k: `${doneCount} / ${runPast.length}`, l: "séances faites" },
            ].map((x) => (
              <div key={x.l} className="bg-foreground/[0.04] rounded-2xl px-4 py-3">
                <dt className="text-muted-foreground order-2 text-[12.5px]">{x.l}</dt>
                <dd className="text-[22px] leading-7 font-semibold tracking-tight">{x.k}</dd>
              </div>
            ))}
          </dl>
          <div>
            <Chart option={option} onInit={onInit} height={190} label="Kilomètres prévus et réalisés par semaine" />
            <p className="text-muted-foreground mt-1 text-[12.5px]">
              Barre claire : prévu · barre pleine : réalisé (toutes tes sorties à pied). Touche une semaine pour l'afficher.
            </p>
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="week-title" className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="week-title" className="text-[20px] leading-7 font-semibold tracking-tight">
              Semaine {idx + 1} sur {d.weeks.length}
              {idx === cur && <span className="bg-primary/15 text-primary ml-2 rounded-full px-2 py-0.5 align-middle text-xs font-semibold">en cours</span>}
            </h2>
            <p className="text-muted-foreground text-[14px]">
              {shortDay(week.week)} – {shortDay(addDays(week.week, 6))} · {nf(week.done_km, 1)} / {nf(week.planned_km, 1)} km
            </p>
          </div>
          <div className="flex gap-2">
            {idx !== cur && (
              <Button variant="secondary" size="sm" onClick={() => setPicked(null)}>
                <CalendarDays /> Cette semaine
              </Button>
            )}
            <Button variant="secondary" size="icon" disabled={idx <= 0} onClick={() => setPicked(idx - 1)} aria-label="Semaine précédente">
              <ChevronLeft />
            </Button>
            <Button variant="secondary" size="icon" disabled={idx >= d.weeks.length - 1} onClick={() => setPicked(idx + 1)} aria-label="Semaine suivante">
              <ChevronRight />
            </Button>
          </div>
        </div>
        {sessions.length === 0 ? (
          <p className="text-muted-foreground bg-foreground/[0.04] rounded-2xl p-4 text-[14px]">Aucune séance prévue cette semaine.</p>
        ) : (
          <ul className="grid gap-3">
            {sessions.map((s, i) => (
              <SessionCard key={`${s.date}-${i}`} s={s} today={d.today} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------- Page ---------- */
export default function Plan() {
  const { bump } = useDataVersion();
  const list = useQuery("plans", api.plans);
  const [sel, setSel] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const plans = list.data?.plans ?? [];
  const today = new Date().toLocaleDateString("sv-SE");
  const auto = plans.find((p) => p.start_date <= today && today <= p.end_date) ?? plans[0];
  const id = plans.some((p) => p.id === sel) ? sel : (auto?.id ?? null);
  const detail = useQuery(`plan:${id}`, () => (id ? api.plan(id) : Promise.resolve(null)));

  const created = (newId: number) => {
    setSel(newId);
    setAdding(false);
    bump();
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[34px] leading-10 font-bold tracking-tight">Programme</h1>
          <p className="text-muted-foreground mt-1 text-[15px]">Ton plan d'entraînement, comparé à tes sorties Garmin.</p>
        </div>
        {plans.length > 0 && !adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus /> Ajouter un programme
          </Button>
        )}
      </div>

      {list.error && !list.data ? (
        <QueryError error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Skeleton className="h-[320px] rounded-2xl" />
      ) : plans.length === 0 ? (
        <>
          <Card>
            <EmptyState title="Aucun programme pour l'instant" description="Importe ton plan pour suivre chaque séance, voir ce qui est fait et ce qui reste à courir." />
          </Card>
          <ImportPanel onCreated={created} />
        </>
      ) : (
        <>
          {adding && <ImportPanel onCreated={created} onCancel={() => setAdding(false)} />}
          {plans.length > 1 && (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Programme affiché">
              {plans.map((p) => (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={p.id === id}
                  onClick={() => setSel(p.id)}
                  className={cn(
                    "h-9 rounded-full border px-4 text-[14px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    p.id === id ? "bg-foreground text-background border-transparent" : "text-muted-foreground border-foreground/15 hover:text-foreground",
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {detail.error && !detail.data ? (
            <QueryError error={detail.error} onRetry={detail.reload} />
          ) : !detail.data ? (
            <Skeleton className="h-[420px] rounded-2xl" />
          ) : (
            <PlanBody
              key={detail.data.id}
              d={detail.data}
              onDeleted={() => {
                setSel(null);
                bump();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
