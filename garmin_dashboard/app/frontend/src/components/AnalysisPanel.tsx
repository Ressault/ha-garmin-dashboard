import { useEffect, useState } from "react";
import { ClipboardCheck, ClipboardCopy, ClipboardPaste, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDataVersion } from "@/hooks/useQuery";
import { api, type ActivityDetail } from "@/lib/api";
import { nf } from "@/lib/format";

function Editor({
  id,
  value,
  onChange,
  placeholder,
  rows,
  onPaste,
  onSave,
  saving,
  dirty,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows: number;
  onPaste?: () => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  return (
    <div className="grid gap-2.5">
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            if (dirty) onSave();
          }
        }}
        className="bg-foreground/[0.05] placeholder:text-muted-foreground/70 focus-visible:ring-ring/50 w-full resize-y rounded-2xl border border-foreground/10 px-4 py-3 text-[15px] leading-relaxed outline-none transition-[box-shadow,background-color] duration-200 focus-visible:bg-foreground/[0.07] focus-visible:ring-[3px]"
      />
      <div className="flex flex-wrap items-center gap-2">
        {onPaste && (
          <Button type="button" variant="secondary" size="sm" onClick={onPaste}>
            <ClipboardPaste />
            Coller
          </Button>
        )}
        <Button type="button" onClick={onSave} disabled={!dirty || saving} className="ml-auto h-11 px-5">
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Enregistrer
        </Button>
        <span className="text-muted-foreground/70 hidden text-xs sm:inline">Ctrl + Entrée</span>
      </div>
    </div>
  );
}

/** Copie dans le presse-papiers ; repli par sélection de texte quand la page n'est pas en HTTPS (adresse locale). */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("Copie refusée par le navigateur.");
}

export function AnalysisPanel({ a }: { a: ActivityDetail }) {
  const { bump } = useDataVersion();
  const [notes, setNotes] = useState(a.notes ?? "");
  const [ai, setAi] = useState(a.ai_analysis ?? "");
  const [saved, setSaved] = useState({ notes: a.notes ?? "", ai: a.ai_analysis ?? "" });
  const [saving, setSaving] = useState<"notes" | "ai" | null>(null);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setNotes(a.notes ?? "");
    setAi(a.ai_analysis ?? "");
    setSaved({ notes: a.notes ?? "", ai: a.ai_analysis ?? "" });
  }, [a.activity_id, a.notes, a.ai_analysis]);

  async function copy() {
    setCopying(true);
    try {
      const md = await api.exportPrompt(a.activity_id);
      await copyText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      toast.success("Bilan copié", { description: `≈ ${nf(Math.round(md.length / 3.6))} jetons · colle-le dans Claude.` });
    } catch (e) {
      toast.error("Copie impossible", { description: e instanceof Error ? e.message : "Autorise l'accès au presse-papiers." });
    } finally {
      setCopying(false);
    }
  }

  async function paste(set: (v: string) => void, current: string) {
    try {
      const t = await navigator.clipboard.readText();
      if (t) set(current ? `${current}\n\n${t}` : t);
    } catch {
      toast.error("Lecture du presse-papiers refusée", { description: "Colle avec Ctrl + V dans le champ." });
    }
  }

  async function save(field: "notes" | "ai") {
    setSaving(field);
    try {
      const r = await api.saveNotes(a.activity_id, field === "notes" ? { notes: notes.trim() || null } : { ai_analysis: ai.trim() || null });
      setSaved({ notes: r.notes ?? "", ai: r.ai_analysis ?? "" });
      bump();
      toast.success(field === "notes" ? "Ressenti enregistré" : "Analyse enregistrée");
    } catch (e) {
      toast.error("Enregistrement impossible", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="bg-foreground/[0.04] grid gap-3 rounded-2xl p-4 sm:flex sm:items-center">
        <div className="min-w-0 sm:flex-1">
          <p className="text-[15px] font-semibold tracking-tight">Faire analyser cette séance</p>
          <p className="text-muted-foreground mt-0.5 text-[13px] text-pretty">
            Copie un résumé compact (allures, FC, zones, dynamiques) puis colle-le dans Claude. Reviens coller sa réponse ci-dessous.
          </p>
        </div>
        <Button onClick={copy} disabled={copying} aria-live="polite" className="h-11 w-full sm:w-auto">
          {copying ? <Loader2 className="animate-spin" /> : copied ? <ClipboardCheck /> : <ClipboardCopy />}
          {copied ? "Copié" : "Copier le bilan pour Claude"}
        </Button>
      </div>

      <Tabs defaultValue="notes">
        <TabsList aria-label="Type de note">
          <TabsTrigger value="notes">Ressenti {saved.notes && <span className="size-1.5 rounded-full bg-[var(--sys-green)]" />}</TabsTrigger>
          <TabsTrigger value="ai">Analyse Claude {saved.ai && <span className="size-1.5 rounded-full bg-[var(--sys-green)]" />}</TabsTrigger>
        </TabsList>
        <TabsContent value="notes" className="mt-3">
          <Editor
            id="notes"
            value={notes}
            onChange={setNotes}
            rows={5}
            placeholder="Mes sensations, la météo, le terrain…"
            onSave={() => save("notes")}
            saving={saving === "notes"}
            dirty={notes !== saved.notes}
          />
        </TabsContent>
        <TabsContent value="ai" className="mt-3">
          <Editor
            id="ai"
            value={ai}
            onChange={setAi}
            rows={9}
            placeholder="Colle ici l'analyse de Claude pour la garder avec la sortie."
            onPaste={() => paste(setAi, ai)}
            onSave={() => save("ai")}
            saving={saving === "ai"}
            dirty={ai !== saved.ai}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
