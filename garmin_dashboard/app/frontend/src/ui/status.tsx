import { useState, type FormEvent, type ReactNode } from "react";

import { unlockNet, useDataVersion, useNet, useQuery, type Query } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import { isoDate } from "@/lib/format";
import { Card, P, Sm, Val } from "./kit";

/* États communs : panne de chargement, données anciennes, synchro, code d'accès. */

/** « 07:44 », ou « hier 07:44 », ou « 26 nov. 07:44 » selon l'ancienneté. Accepte une date ISO ou un temps en ms. */
export function whenLabel(v: string | number | null | undefined): string | null {
  if (v == null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const hm = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const day = isoDate(d), today = isoDate(new Date());
  if (day === today) return hm;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (day === isoDate(y)) return `hier ${hm}`;
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${hm}`;
}

/** Carte affichée à la place du contenu quand rien n'a pu être chargé : jamais de zéro pour une donnée absente. */
export function LoadError({ error, onRetry }: { error?: Error | string | null; onRetry: () => void }) {
  const msg = typeof error === "string" ? error : error?.message;
  return (
    <Card as="div" className="mt-4">
      <div role="alert">
        <Val size={20}>Données indisponibles</Val>
        <P className="mt-1.5 text-label2">{msg || "L'appli ne répond pas."}</P>
        <button type="button" onClick={onRetry} className="hk-press mt-4 h-11 rounded-full bg-[var(--sys-blue)] px-5 text-[16px] font-semibold text-white">
          Réessayer
        </button>
      </div>
    </Card>
  );
}

/** Affiche `children` seulement si les requêtes essentielles ont des données ; sinon l'état d'erreur commun. */
export function Guard({ queries, children }: { queries: Pick<Query<unknown>, "failed" | "error" | "reload">[]; children: ReactNode }) {
  const bad = queries.find((q) => q.failed);
  if (bad) return <LoadError error={bad.error} onRetry={bad.reload} />;
  return <>{children}</>;
}

export const useSyncStatus = () => useQuery("sync-status", () => api.syncStatus());

/** Ligne sous le prénom : heure réelle de la dernière synchro réussie et de la dernière donnée de la montre. */
export function SyncLine() {
  const q = useSyncStatus();
  const s = q.data;
  if (!s) return <Sm className="mt-0.5">{q.failed ? "État de la synchro inconnu" : " "}</Sm>;
  const ok = whenLabel(s.last_ok_at);
  const watch = whenLabel(s.watch_upload_at ?? s.last_measure_at);
  const late = s.auto === "on" && s.last_ok_age_min != null && s.last_ok_age_min > 120;
  if (s.failing || late) {
    return (
      <Sm className="mt-0.5 font-semibold" style={{ color: "var(--warn-text)" }}>
        Synchro Garmin en panne{ok ? ` depuis ${ok}` : ""}
      </Sm>
    );
  }
  return (
    <Sm className="mt-0.5">
      {s.running ? "Synchro en cours…" : ok ? `Synchro ${ok}` : "Jamais synchronisé"}
      {watch ? ` · montre ${watch}` : ""}
    </Sm>
  );
}

/** « Mesuré à 07:44 » : heure de la dernière donnée envoyée par la montre ; en orange si elle a plus de 3 h. */
export function MeasuredAt({ at, className }: { at: string | null | undefined; className?: string }) {
  const label = whenLabel(at);
  if (!label || !at) return null;
  const old = Date.now() - new Date(at).getTime() > 3 * 3600_000;
  return (
    <Sm className={className} style={old ? { color: "var(--warn-text)", fontWeight: 600 } : undefined}>
      Mesuré {label.includes(" ") ? label : `à ${label}`}
    </Sm>
  );
}

/** Écran de saisie du code d'accès (une fois par appareil). */
export function LoginGate() {
  const net = useNet();
  const { bump } = useDataVersion();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!net.locked) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      await api.login(code.trim());
      setCode("");
      unlockNet();
      bump();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Code refusé.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-6">
      <form onSubmit={submit} className="flex w-full max-w-[340px] flex-col gap-4">
        <h1 className="m-0 text-[28px] leading-tight font-bold tracking-[-0.02em]">Code d'accès</h1>
        <label className="flex flex-col gap-1.5">
          <span className="text-[15px] text-label2">Le code choisi dans la configuration de l'add-on</span>
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="go"
            autoFocus
            aria-invalid={!!err}
            className="h-12 rounded-xl border-0 bg-[var(--fill)] px-4 text-[17px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--sys-blue)]/60"
          />
        </label>
        {err ? <p role="alert" className="m-0 text-[15px] text-[var(--bad-text)]">{err}</p> : null}
        <button type="submit" disabled={busy || !code.trim()} className="hk-press h-12 rounded-full bg-[var(--sys-blue)] text-[17px] font-semibold text-white disabled:opacity-50">
          {busy ? "Vérification…" : "Ouvrir"}
        </button>
      </form>
    </div>
  );
}
