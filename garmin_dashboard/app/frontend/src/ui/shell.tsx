import { useState } from "react";
import { Loader2, Moon, RefreshCw, Sun } from "lucide-react";
import { toast } from "sonner";

import { useDataVersion } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import { PATH, sectionOf, type Route } from "@/lib/route";
import { useTheme } from "@/lib/theme";
import { IFlower, IGrid, IHeart, ISearch } from "./icons";

const TABS = [
  { key: "synthese", label: "Synthèse", href: PATH.synthese, Icon: IHeart },
  { key: "longevite", label: "Longévité", href: PATH.piliers, Icon: IFlower },
  { key: "activite", label: "Activité", href: PATH.activites, Icon: IGrid },
] as const;

/** Barre d'onglets flottante et translucide (mobile) */
export function TabBar({ route }: { route: Route }) {
  const sec = sectionOf(route);
  return (
    <nav aria-label="Navigation principale" className="hk-tabbar md:hidden">
      {TABS.map(({ key, label, href, Icon }) => (
        <a key={key} href={href} className="hk-tab hk-press" aria-current={sec === key ? "page" : undefined}>
          <span style={{ color: sec === key ? "#0A84FF" : "currentColor" }}>
            <Icon size={24} />
          </span>
          {label}
        </a>
      ))}
    </nav>
  );
}

const dot = (c: string) => <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: c }} />;

/** Barre latérale (ordinateur), comme l'app Santé sur iPad */
export function Sidebar({ route }: { route: Route }) {
  const sec = sectionOf(route);
  const cur = (n: Route["name"]) => (route.name === n ? "page" : undefined);
  return (
    <aside className="hk-side sticky top-4 hidden max-h-[calc(100vh-32px)] w-[260px] shrink-0 flex-col overflow-y-auto p-2.5 md:flex">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          window.location.hash = PATH.activites;
        }}
        className="mb-2 flex h-10 items-center gap-2 rounded-xl bg-fill px-2.5 text-label2"
      >
        <ISearch />
        <input type="search" placeholder="Rechercher" aria-label="Rechercher une sortie" className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none" />
      </form>
      <nav aria-label="Navigation principale" className="flex flex-col gap-0.5">
        {TABS.map(({ key, label, href, Icon }) => (
          <a key={key} href={href} aria-current={sec === key && (key === "synthese" ? route.name === "synthese" : false) ? "page" : undefined}>
            <span style={{ color: sec === key ? "#0A84FF" : "currentColor" }}>
              <Icon size={18} />
            </span>
            {label}
          </a>
        ))}
      </nav>
      <p className="mx-2.5 mt-4 mb-1.5 text-[13px] font-semibold text-label2">Longévité</p>
      <nav aria-label="Longévité" className="flex flex-col gap-0.5">
        <a href={PATH.piliers} aria-current={cur("piliers")}>{dot("#34C759")}Mes piliers</a>
        <a href={PATH.sommeil} aria-current={cur("sommeil")}>{dot("#5E6BFF")}Sommeil</a>
        <a href={PATH.forme} aria-current={cur("forme")}>{dot("#FF375F")}Forme et santé</a>
      </nav>
      <p className="mx-2.5 mt-4 mb-1.5 text-[13px] font-semibold text-label2">Activité</p>
      <nav aria-label="Activité" className="flex flex-col gap-0.5">
        <a href={PATH.activites} aria-current={cur("activites") ?? (route.name === "activity" ? "page" : undefined)}>{dot("#FF375F")}Activités</a>
        <a href={PATH.progres} aria-current={cur("progres")}>{dot("#AF52DE")}Progrès</a>
        <a href={PATH.entrainement} aria-current={cur("entrainement")}>{dot("#FFB800")}Entraînement</a>
        <a href={PATH.records} aria-current={cur("records")}>{dot("#F5C33B")}Records</a>
        <a href={PATH.plan} aria-current={cur("plan")}>{dot("#30B0C7")}Programme</a>
      </nav>
      <div className="mt-auto flex gap-2 pt-4">
        <SyncButton wide />
        <ThemeToggle />
      </div>
    </aside>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button type="button" onClick={toggle} className="hk-press flex size-10 shrink-0 items-center justify-center rounded-full bg-fill" aria-label={dark ? "Passer au thème clair" : "Passer au thème sombre"}>
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

export function SyncButton({ wide }: { wide?: boolean }) {
  const { bump } = useDataVersion();
  const [syncing, setSyncing] = useState(false);
  async function run() {
    if (syncing) return;
    setSyncing(true);
    const id = toast.loading("Synchronisation avec Garmin Connect…", { description: "Sorties et santé des 30 derniers jours." });
    try {
      const r = await api.sync(30);
      bump();
      const msg = `${r.activities_detailed} sortie${r.activities_detailed > 1 ? "s" : ""} détaillée${r.activities_detailed > 1 ? "s" : ""} · ${r.health_days} jour${r.health_days > 1 ? "s" : ""} de santé`;
      if (r.error_count > 0) toast.warning("Synchronisation terminée avec des avertissements", { id, description: `${msg} · ${r.error_count} erreur${r.error_count > 1 ? "s" : ""} ignorée${r.error_count > 1 ? "s" : ""}` });
      else toast.success("Synchronisation terminée", { id, description: `${msg} · ${r.duration_s} s` });
    } catch (e) {
      toast.error("Échec de la synchronisation", { id, description: e instanceof Error ? e.message : "Erreur inconnue" });
    } finally {
      setSyncing(false);
    }
  }
  return (
    <button
      type="button"
      onClick={run}
      disabled={syncing}
      aria-busy={syncing}
      aria-label="Synchroniser avec Garmin"
      className={`hk-press flex h-10 items-center justify-center gap-2 rounded-full bg-fill text-[14px] font-semibold disabled:opacity-60 ${wide ? "flex-1 px-3" : "size-10 shrink-0"}`}
    >
      {syncing ? <Loader2 className="size-[18px] animate-spin" /> : <RefreshCw className="size-[18px]" />}
      {wide && (syncing ? "Synchro…" : "Synchroniser")}
    </button>
  );
}
