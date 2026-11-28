import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

import { applyPalette, type ThemeMode } from "./palette";

const KEY = "theme";

function initial(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* stockage indisponible */
  }
  // Sans choix enregistré, on suit le réglage du téléphone ou de l'ordinateur (comme les apps Apple)
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
  applyPalette(mode); // après la classe : les valeurs des jetons se lisent dans le thème en place
  const bg = getComputedStyle(root).getPropertyValue("--background").trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}

// Appliqué dès l'import, avant le premier rendu (les couleurs des graphiques en dépendent)
const start = initial();
apply(start);

const Ctx = createContext<{ theme: ThemeMode; toggle: () => void }>({ theme: start, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(start);
  useLayoutEffect(() => apply(theme), [theme]);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: ThemeMode = t === "dark" ? "light" : "dark";
      // La palette doit être à jour avant que les graphiques se reconstruisent
      apply(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* ignoré */
      }
      return next;
    });
  }, []);
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
