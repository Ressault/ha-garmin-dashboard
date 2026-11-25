import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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

const cache = new Map<string, unknown>();

interface State<T> {
  data?: T;
  error?: Error;
  loading: boolean;
}

/** Requête avec cache mémoire : on réaffiche l'ancienne donnée pendant le rechargement (pas de flash). */
export function useQuery<T>(key: string, fn: () => Promise<T>): State<T> & { reload: () => void } {
  const { version, bump } = useDataVersion();
  const [state, setState] = useState<State<T>>(() => ({
    data: cache.get(key) as T | undefined,
    loading: !cache.has(key),
  }));
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    const cached = cache.get(key) as T | undefined;
    setState({ data: cached, loading: cached === undefined });
    fnRef
      .current()
      .then((data) => {
        cache.set(key, data);
        if (alive) setState({ data, loading: false });
      })
      .catch((error: Error) => {
        if (alive) setState((s) => ({ ...s, error, loading: false }));
      });
    return () => {
      alive = false;
    };
  }, [key, version]);

  return { ...state, reload: bump };
}
