import { lazy, Suspense, useLayoutEffect, useRef } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataProvider } from "@/hooks/useQuery";
import { FiltersProvider } from "@/lib/filters";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { routeKey, sectionOf, useRoute, type Route } from "@/lib/route";
import { usePageSwipe } from "@/ui/scrub";
import { Sidebar, TabBar } from "@/ui/shell";
import Synthese from "@/views/Synthese";

// Les écrans autres que la synthèse ne sont chargés qu'à la demande : démarrage plus léger.
const ActivityDetailView = lazy(() => import("@/views/ActivityDetail"));
const L = {
  Piliers: lazy(() => import("@/views/Longevite").then((m) => ({ default: m.Piliers }))),
  Sommeil: lazy(() => import("@/views/Longevite").then((m) => ({ default: m.Sommeil }))),
  Forme: lazy(() => import("@/views/Longevite").then((m) => ({ default: m.Forme }))),
  Activites: lazy(() => import("@/views/Activite").then((m) => ({ default: m.Activites }))),
  Progres: lazy(() => import("@/views/Activite").then((m) => ({ default: m.Progres }))),
  Entrainement: lazy(() => import("@/views/Activite").then((m) => ({ default: m.Entrainement }))),
  Records: lazy(() => import("@/views/Activite").then((m) => ({ default: m.Records }))),
  Programme: lazy(() => import("@/views/Programme")),
};

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
  usePageSwipe();

  // On retrouve la position de la liste en revenant d'une sortie ; sinon on remonte en haut.
  useLayoutEffect(() => {
    if (prev.current === "activites" && route.name === "activity") listScroll.current = window.scrollY;
    if (route.name === "activites" && prev.current === "activity") window.scrollTo(0, listScroll.current);
    else window.scrollTo(0, 0);
    prev.current = route.name;
  }, [route.name]);

  return (
    <div className="mx-auto flex max-w-[1400px] gap-6 md:p-4">
      <Sidebar route={route} />
      <main key={`${routeKey(route)}:${theme}`} data-section={sectionOf(route)} className="page-in min-w-0 flex-1 px-4 pb-28 sm:px-6 md:px-0 md:pb-6">
        <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
          <View route={route} />
        </Suspense>
      </main>
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
            <Toaster position="bottom-right" offset={{ bottom: 24, right: 24 }} mobileOffset={{ bottom: 96 }} />
          </TooltipProvider>
        </DataProvider>
      </FiltersProvider>
    </ThemeProvider>
  );
}
