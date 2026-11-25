import { useLayoutEffect, useRef } from "react";

import { Filters, Header, MobileNav } from "@/components/Header";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataProvider } from "@/hooks/useQuery";
import { FiltersProvider } from "@/lib/filters";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { routeKey, useRoute, type Route } from "@/lib/route";
import ActivityDetailView from "@/views/ActivityDetail";
import FitnessView from "@/views/Fitness";
import OverviewView from "@/views/Overview";
import ProgressView from "@/views/Progress";
import PlanView from "@/views/Plan";
import PredictionsView from "@/views/Predictions";

function View({ route }: { route: Route }) {
  switch (route.name) {
    case "activity":
      return <ActivityDetailView id={route.id} />;
    case "progress":
      return <ProgressView />;
    case "fitness":
      return <FitnessView />;
    case "plan":
      return <PlanView />;
    case "predictions":
      return <PredictionsView />;
    default:
      return <OverviewView />;
  }
}

function Shell() {
  const route = useRoute();
  const { theme } = useTheme();
  const overviewScroll = useRef(0);
  const prev = useRef<Route["name"]>(route.name);

  // On retrouve la position de la liste en revenant d'une sortie ; sinon on remonte en haut.
  useLayoutEffect(() => {
    if (prev.current === "overview" && route.name !== "overview") overviewScroll.current = window.scrollY;
    if (route.name === "overview" && prev.current === "activity") window.scrollTo(0, overviewScroll.current);
    else window.scrollTo(0, 0);
    prev.current = route.name;
  }, [route.name]);

  return (
    <>
      <Header route={route} />
      <main key={`${routeKey(route)}:${theme}`} className="page-in mx-auto max-w-[1240px] px-4 pt-6 pb-28 sm:px-6 md:pb-14">
        {/* Mobile : seuls les filtres qui agissent sur la page sont affichés (sur ordinateur ils sont dans l'en-tête) */}
        {(route.name === "overview" || route.name === "fitness") && (
          <div className="mb-5 md:hidden">
            <Filters stacked sportApplies={route.name === "overview"} only={route.name === "fitness" ? "period" : undefined} />
          </div>
        )}
        <View route={route} />
      </main>
      <MobileNav route={route} />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <FiltersProvider>
        <DataProvider>
          <TooltipProvider>
            <Shell />
            <Toaster position="bottom-right" offset={{ bottom: 24, right: 24 }} mobileOffset={{ bottom: 84 }} />
          </TooltipProvider>
        </DataProvider>
      </FiltersProvider>
    </ThemeProvider>
  );
}
