import { AuthError } from "@/lib/api";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

interface DataVersion {
  version: number;
  bump: () => void;
}

const Ctx = createContext<DataVersion>({ version: 0, bump: () => {} });

/** `bump()` force le rechargement de toutes les requêtes (après une synchro, par exemple). */
export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ version, bump }), [version, bump]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useDataVersion = () => useContext(Ctx);

/* ---------- Cache partagé ----------
 * - Une même requête demandée par plusieurs cartes ne part qu'une fois (requête en cours partagée).
 * - Une réponse de moins de 60 s est réutilisée telle quelle en changeant de page.
 * - La dernière réponse est aussi gardée dans le téléphone (localStorage) : sans réseau, l'appli affiche
 *   la dernière donnée connue, avec son heure, au lieu de cartes vides. */
const FRESH_MS = 60_000;
const DISK_PREFIX = "gd1:";
const DISK_MAX = 450_000; // caractères par réponse gardée sur le téléphone
const NO_DISK = /^(activity:|history:)/; // détails de sortie : trop lourds, rechargés à la demande

interface Entry {
  data: unknown;
  at: number; // heure de réception (ms)
  version: number; // version des données au moment de la réception ; -1 = relu depuis le téléphone
}
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function readDisk(key: string): Entry | undefined {
  if (NO_DISK.test(key)) return undefined;
  try {
    const raw = localStorage.getItem(DISK_PREFIX + key);
    if (!raw) return undefined;
    const { at, data } = JSON.parse(raw) as { at: number; data: unknown };
    return { data, at, version: -1 };
  } catch {
    return undefined;
  }
}
function writeDisk(key: string, e: Entry) {
  if (NO_DISK.test(key)) return;
  const save = () => {
    try {
      const raw = JSON.stringify({ at: e.at, data: e.data });
      if (raw.length <= DISK_MAX) localStorage.setItem(DISK_PREFIX + key, raw);
    } catch {
      /* stockage plein ou indisponible : le cache mémoire suffit */
    }
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(save, { timeout: 4000 });
  else setTimeout(save, 800);
}
function lookup(key: string): Entry | undefined {
  let e = cache.get(key);
  if (!e) {
    e = readDisk(key);
    if (e) cache.set(key, e);
  }
  return e;
}

/* ---------- État du réseau, partagé par toute l'appli ---------- */
export interface NetState {
  /** message de la dernière erreur de chargement, null si la dernière requête a réussi */
  error: string | null;
  /** l'API demande le code d'accès */
  locked: boolean;
}
let net: NetState = { error: null, locked: false };
const netListeners = new Set<() => void>();
function setNet(patch: Partial<NetState>) {
  const next = { ...net, ...patch };
  if (next.error === net.error && next.locked === net.locked) return;
  net = next;
  netListeners.forEach((l) => l());
}
export const useNet = () => useSyncExternalStore((l) => { netListeners.add(l); return () => netListeners.delete(l); }, () => net);
export const unlockNet = () => setNet({ locked: false, error: null });

interface State<T> {
  data?: T;
  error?: Error;
  loading: boolean;
  /** heure de réception de `data` (ms) */
  at?: number;
}

export interface Query<T> extends State<T> {
  reload: () => void;
  /** la requête a échoué et aucune donnée, même ancienne, n'est disponible */
  failed: boolean;
  /** `data` vient d'un chargement précédent : la dernière tentative a échoué */
  stale: boolean;
}

/** Requête avec cache : on réaffiche l'ancienne donnée pendant le rechargement (pas de flash). */
export function useQuery<T>(key: string, fn: () => Promise<T>): Query<T> {
  const { version, bump } = useDataVersion();
  const [state, setState] = useState<State<T>>(() => {
    const e = lookup(key);
    return { data: e?.data as T | undefined, at: e?.at, loading: !e };
  });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    const e = lookup(key);
    setState({ data: e?.data as T | undefined, at: e?.at, loading: !e });
    if (e && e.version === version && Date.now() - e.at < FRESH_MS) return; // réponse récente : rien à redemander
    let p = inflight.get(key) as Promise<T> | undefined;
    if (!p) {
      p = fnRef.current().finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    p.then((data) => {
      const entry: Entry = { data, at: Date.now(), version };
      cache.set(key, entry);
      writeDisk(key, entry);
      setNet({ error: null });
      if (alive) setState({ data, at: entry.at, loading: false });
    }).catch((error: Error) => {
      if (error instanceof AuthError) setNet({ locked: true });
      else setNet({ error: error.message || "Erreur de chargement" });
      if (alive) setState((s) => ({ ...s, error, loading: false }));
    });
    return () => {
      alive = false;
    };
  }, [key, version]);

  return { ...state, reload: bump, failed: !!state.error && state.data === undefined, stale: !!state.error && state.data !== undefined };
}
