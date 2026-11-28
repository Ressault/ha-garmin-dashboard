import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataProvider } from "@/hooks/useQuery";
import { FiltersProvider } from "@/lib/filters";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { routeKey, sectionOf, subviewDir, useRoute, type Route } from "@/lib/route";
import { useEdgeFades, usePageSwipe } from "@/ui/scrub";
import { Sidebar, TabBar } from "@/ui/shell";
import { LoginGate } from "@/ui/status";
import { Activites, Entrainement, Progres, Records } from "@/views/Activite";
import { Forme, Piliers, Sommeil } from "@/views/Longevite";
import Programme from "@/views/Programme";
import Synthese from "@/views/Synthese";

// Les écrans autres que la synthèse ne sont chargés qu'à la demande : démarrage plus léger.
const ActivityDetailView = lazy(() => import("@/views/ActivityDetail"));
// Écrans de navigation intégrés au démarrage (≈ 60 ko) : la page qui entre existe dès la première image du glissement.
const L = { Piliers, Sommeil, Forme, Activites, Progres, Entrainement, Records, Programme };

function View({ route }: { route: Route }) {
  switch (route.name) {
    case "activity":
      return (
        <div className="pt-4 md:pt-8">
          <ActivityDetailView id={route.id} />
        </div>
      );
    case "plan":
      return <L.Programme />;
    case "piliers":
      return <L.Piliers />;
    case "sommeil":
      return <L.Sommeil />;
    case "forme":
      return <L.Forme />;
    case "activites":
      return <L.Activites />;
    case "progres":
      return <L.Progres />;
    case "entrainement":
      return <L.Entrainement />;
    case "records":
      return <L.Records />;
    default:
      return <Synthese />;
  }
}

function Shell() {
  const route = useRoute();
  const { theme } = useTheme();
  const listScroll = useRef(0);
  const prev = useRef<Route["name"]>(route.name);
  // Deux couches pendant une transition : la page qui sort (figée, gardée telle quelle) et celle qui entre.
  // Le sens est calculé une seule fois par changement de page ; une re-render ne relance rien.
  const nav = useRef<{ k: string; route: Route; dir: -1 | 0 | 1; kind: "fade" | "slide" | undefined; leave: { route: Route; key: string; top: number } | null; id: number }>({ k: routeKey(route), route, dir: 0, kind: undefined, leave: null, id: 0 });
  if (nav.current.k !== routeKey(route)) {
    const old = nav.current;
    const dir = subviewDir(old.route.name, route.name);
    // onglet du bas différent : fondu croisé ; même onglet (pilules du haut) : le contenu glisse sous le bandeau fixe
    const kind = dir ? (sectionOf(old.route) === sectionOf(route) ? "slide" : "fade") : undefined;
    nav.current = { k: routeKey(route), route, dir, kind, id: old.id + 1, leave: dir ? { route: old.route, key: `${routeKey(old.route)}:${theme}`, top: -window.scrollY } : null };
  }
  const [doneId, setDoneId] = useState(0);
  const { dir, kind, leave, id } = nav.current;
  const leaving = leave && doneId !== id ? leave : null;
  usePageSwipe();
  useEdgeFades();
  useEffect(() => {
    if (!leave) return;
    const t = window.setTimeout(() => setDoneId(id), 900); // filet de sécurité si l'animation ne se termine pas
    return () => window.clearTimeout(t);
  }, [leave, id]);

  // On retrouve la position de la liste en revenant d'une sortie ; sinon on remonte en haut.
  useLayoutEffect(() => {
    if (prev.current === "activites" && route.name === "activity") listScroll.current = window.scrollY;
    if (route.name === "activites" && prev.current === "activity") window.scrollTo(0, listScroll.current);
    else window.scrollTo(0, 0);
    prev.current = route.name;
  }, [route.name]);

  const cls = "hk-layer min-w-0 px-4 pb-28 sm:px-6 md:px-0 md:pb-6";
  return (
    <div className="mx-auto flex max-w-[1400px] gap-6 md:p-4">
      <Sidebar route={route} />
      <div className="hk-pager relative min-w-0 flex-1">
        {[
          leaving && (
            <main key={leaving.key} aria-hidden data-role="out" data-dir={dir || undefined} data-kind={kind} className={cls} style={{ top: kind === "slide" ? 0 : leaving.top }} {...({ inert: "" } as object)}>
              <Suspense fallback={null}>
                <View route={leaving.route} />
              </Suspense>
            </main>
          ),
          <main
            key={`${routeKey(route)}:${theme}`}
            data-section={sectionOf(route)}
            data-role="in"
            data-dir={dir || undefined}
            data-kind={kind}
            onAnimationEnd={(e) => { if (/^(lf-in|sl-in)/.test(e.animationName)) setDoneId(id); }}
            className={`${dir ? "" : "page-in"} ${cls}`}
          >
            <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
              <View route={route} />
            </Suspense>
          </main>,
        ]}
      </div>
      <TabBar route={route} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <FiltersProvider>
        <DataProvider>
          <TooltipProvider>
            <Shell />
            <LoginGate />
            <Toaster position="bottom-right" offset={{ bottom: 24, right: 24 }} mobileOffset={{ bottom: 96 }} />
          </TooltipProvider>
        </DataProvider>
      </FiltersProvider>
    </ThemeProvider>
  );
}
