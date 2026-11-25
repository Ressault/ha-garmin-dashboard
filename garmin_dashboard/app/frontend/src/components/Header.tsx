import { useEffect, useRef, useState } from "react";
import {
  Activity,
  CalendarDays,
  HeartPulse,
  LayoutGrid,
  TrendingUp,
  Loader2,
  Moon,
  RefreshCw,
  Sun,
  Timer,
} from "lucide-react";
import { toast } from "sonner";

import { Segmented } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDataVersion, useQuery } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import { PERIODS, SPORTS, useFilters } from "@/lib/filters";
import { relativeTime } from "@/lib/format";
import { go, type Route } from "@/lib/route";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const NAV = [
  {
    name: "overview",
    label: "Synthèse",
    short: "Synthèse",
    path: "/",
    Icon: LayoutGrid,
  },
  {
    name: "progress",
    label: "Progrès",
    short: "Progrès",
    path: "/progress",
    Icon: TrendingUp,
  },
  {
    name: "fitness",
    label: "Forme & santé",
    short: "Forme",
    path: "/fitness",
    Icon: HeartPulse,
  },
  {
    name: "plan",
    label: "Programme",
    short: "Programme",
    path: "/plan",
    Icon: CalendarDays,
  },
  {
    name: "predictions",
    label: "Prédictions & trail",
    short: "Prédictions",
    path: "/predictions",
    Icon: Timer,
  },
] as const;

const navValue = (r: Route) => (r.name === "activity" ? "overview" : r.name);

function Brand() {
  return (
    <a
      href="#/"
      className="flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <rect width="64" height="64" rx="15" fill="#1C1C1E" />
        <circle
          cx="32"
          cy="32"
          r="19"
          fill="none"
          stroke="#2C2C2E"
          strokeWidth="7"
        />
        <path
          d="M32 13a19 19 0 1 1-17.6 11.8"
          fill="none"
          stroke="#FF375F"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M32 22a10 10 0 1 1-9.2 6.2"
          fill="none"
          stroke="#30D158"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">
        Garmin Dashboard
      </span>
    </a>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "Passer au thème clair" : "Passer au thème sombre"}
      title={dark ? "Thème clair" : "Thème sombre"}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

function SyncButton({
  iconOnly,
  stale,
}: {
  iconOnly?: boolean;
  stale?: boolean;
}) {
  const { bump } = useDataVersion();
  const [syncing, setSyncing] = useState(false);

  async function run() {
    if (syncing) return;
    setSyncing(true);
    const id = toast.loading("Synchronisation avec Garmin Connect…", {
      description:
        "Récupération des sorties et de la santé des 30 derniers jours.",
    });
    try {
      const r = await api.sync(30);
      bump();
      const parts = [
        `${r.activities_detailed} sortie${r.activities_detailed > 1 ? "s" : ""} détaillée${r.activities_detailed > 1 ? "s" : ""}`,
        `${r.health_days} jour${r.health_days > 1 ? "s" : ""} de santé`,
      ];
      if (r.error_count > 0) {
        toast.warning("Synchronisation terminée avec des avertissements", {
          id,
          description: `${parts.join(" · ")} · ${r.error_count} erreur${r.error_count > 1 ? "s" : ""} ignorée${r.error_count > 1 ? "s" : ""}`,
        });
      } else {
        toast.success("Synchronisation terminée", {
          id,
          description: `${parts.join(" · ")} · ${r.duration_s} s`,
        });
      }
    } catch (e) {
      toast.error("Échec de la synchronisation", {
        id,
        description: e instanceof Error ? e.message : "Erreur inconnue",
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Button
      onClick={run}
      disabled={syncing}
      aria-busy={syncing}
      variant={stale ? "default" : "secondary"}
      size={iconOnly ? "icon" : "default"}
      aria-label="Synchroniser Garmin"
    >
      {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {!iconOnly && (syncing ? "Synchronisation…" : "Synchroniser Garmin")}
    </Button>
  );
}

export function Filters({
  stacked,
  sportApplies,
  size,
  only,
}: {
  stacked?: boolean;
  sportApplies: boolean;
  size?: "sm" | "md";
  only?: "period" | "sport";
}) {
  const { period, setPeriod, sport, setSport } = useFilters();
  return (
    <div className={cn("flex gap-3", stacked ? "flex-col" : "items-center")}>
      {only !== "sport" && (
        <Segmented
          label="Période"
          value={period}
          onChange={setPeriod}
          options={PERIODS}
          size={size}
          className={stacked ? "w-full" : "w-[232px]"}
        />
      )}
      {only !== "period" && (
        <Segmented
          label="Sport"
          value={sport}
          onChange={setSport}
          options={SPORTS}
          size={size}
          disabled={!sportApplies}
          className={stacked ? "w-full" : "w-[272px]"}
        />
      )}
    </div>
  );
}

export function Header({ route }: { route: Route }) {
  // Le filtre de sport ne concerne que la synthèse (santé et prédictions sont indépendantes du sport)
  const sportApplies = route.name === "overview" || route.name === "activity";
  const status = useQuery("sync-status", api.syncStatus);
  const last = status.data?.last?.finished_at;
  // Mise en avant du bouton seulement si les données ont plus d'1 h
  const stale =
    !last ||
    Date.now() -
      new Date(last.includes("T") ? last : last.replace(" ", "T")).getTime() >
      3600 * 1000;
  const { bump } = useDataVersion();
  const seen = useRef<string | undefined>(undefined);

  // L'API synchronise Garmin toute seule (30 min) : on interroge son statut chaque minute
  // et on recharge les données affichées quand une nouvelle synchro est terminée.
  useEffect(() => {
    const id = window.setInterval(() => status.reload(), 60_000);
    return () => window.clearInterval(id);
  }, [status.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!last) return;
    if (seen.current && seen.current !== last) bump();
    seen.current = last;
  }, [last]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <header className="glass sticky top-0 z-40 border-b bg-background/70 pt-[env(safe-area-inset-top)] backdrop-blur-2xl">
      <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-2.5 sm:px-6">
        <Brand />

        <Tabs value={navValue(route)} className="ml-4 hidden md:block">
          <TabsList aria-label="Navigation principale">
            {NAV.map(({ name, label, path, Icon }) => (
              <TabsTrigger
                key={name}
                value={name}
                onClick={() => go(path)}
                className="px-4"
              >
                <Icon />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <span className="md:hidden">
            <SyncButton iconOnly stale={stale} />
          </span>
          <span className="hidden md:inline">
            <SyncButton stale={stale} />
          </span>
        </div>
      </div>

      <div className="hidden border-t border-foreground/5 md:block">
        <div className="mx-auto flex max-w-[1240px] items-center gap-4 px-6 py-2">
          <Filters sportApplies={sportApplies} />
          <p className="text-muted-foreground ml-auto flex items-center gap-1.5 text-xs">
            <Activity className="size-3.5" />
            {last
              ? `Dernière synchro ${relativeTime(last)}`
              : "Aucune synchronisation"}
          </p>
        </div>
      </div>
    </header>
  );
}

export function MobileNav({ route }: { route: Route }) {
  const active = navValue(route);
  return (
    <nav
      aria-label="Navigation principale"
      className="glass fixed inset-x-0 bottom-0 z-40 border-t bg-background/75 backdrop-blur-2xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md">
        {NAV.map(({ name, short, path, Icon }) => {
          const on = active === name;
          return (
            <li key={name} className="flex-1">
              <a
                href={`#${path}`}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium outline-none transition-colors duration-200 active:scale-95",
                  on ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" strokeWidth={on ? 2.4 : 2} />
                {short}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
