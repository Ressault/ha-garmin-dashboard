import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { sportGroup } from "./format";

export type Period = 7 | 30 | 90 | 365;
export type SportFilter = "all" | "run" | "trail" | "bike";

export const PERIODS: { value: Period; label: string }[] = [
  { value: 7, label: "7 j" },
  { value: 30, label: "30 j" },
  { value: 90, label: "90 j" },
  { value: 365, label: "1 an" },
];

export const SPORTS: { value: SportFilter; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "run", label: "Course" },
  { value: "trail", label: "Trail" },
  { value: "bike", label: "Vélo" },
];

export function matchSport(filter: SportFilter, type: string | null | undefined): boolean {
  if (filter === "all") return true;
  return sportGroup(type) === filter;
}

interface Filters {
  period: Period;
  sport: SportFilter;
  setPeriod: (p: Period) => void;
  setSport: (s: SportFilter) => void;
}

const Ctx = createContext<Filters | null>(null);

function load<T>(key: string, fallback: T, valid: T[]): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = (typeof fallback === "number" ? Number(raw) : raw) as T;
    return valid.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: string | number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* stockage indisponible : réglage non persisté */
  }
}

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [period, setPeriodState] = useState<Period>(() => load("gd.period", 90 as Period, PERIODS.map((p) => p.value)));
  const [sport, setSportState] = useState<SportFilter>(() => load("gd.sport", "all" as SportFilter, SPORTS.map((s) => s.value)));
  const value = useMemo<Filters>(
    () => ({
      period,
      sport,
      setPeriod: (p) => {
        save("gd.period", p);
        setPeriodState(p);
      },
      setSport: (s) => {
        save("gd.sport", s);
        setSportState(s);
      },
    }),
    [period, sport],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFilters(): Filters {
  const v = useContext(Ctx);
  if (!v) throw new Error("FiltersProvider manquant");
  return v;
}
