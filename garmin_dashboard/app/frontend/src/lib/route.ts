import { useEffect, useState } from "react";

export type Section = "synthese" | "longevite" | "activite";
export type Route =
  | { name: "synthese" }
  | { name: "piliers" }
  | { name: "sommeil" }
  | { name: "forme" }
  | { name: "activites" }
  | { name: "progres" }
  | { name: "entrainement" }
  | { name: "records" }
  | { name: "plan" }
  | { name: "activity"; id: number };

const SIMPLE: Record<string, Route["name"]> = {
  longevite: "piliers",
  piliers: "piliers",
  sommeil: "sommeil",
  forme: "forme",
  activite: "activites",
  progres: "progres",
  entrainement: "entrainement",
  records: "records",
  plan: "plan",
  // anciennes adresses
  progress: "progres",
  predictions: "progres",
  fitness: "piliers",
};

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "activity" && parts[1] && !Number.isNaN(Number(parts[1]))) return { name: "activity", id: Number(parts[1]) };
  const n = SIMPLE[parts[0] ?? ""];
  return n ? ({ name: n } as Route) : { name: "synthese" };
}

export const PATH: Record<Exclude<Route["name"], "activity">, string> = {
  synthese: "#/",
  piliers: "#/longevite",
  sommeil: "#/sommeil",
  forme: "#/forme",
  activites: "#/activite",
  progres: "#/progres",
  entrainement: "#/entrainement",
  records: "#/records",
  plan: "#/plan",
};

export function sectionOf(r: Route): Section {
  if (r.name === "piliers" || r.name === "sommeil" || r.name === "forme") return "longevite";
  if (r.name === "activites" || r.name === "progres" || r.name === "entrainement" || r.name === "records" || r.name === "plan" || r.name === "activity") return "activite";
  return "synthese";
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export const go = (path: string) => {
  window.location.hash = path;
};

export const routeKey = (r: Route) => (r.name === "activity" ? `activity-${r.id}` : r.name);
