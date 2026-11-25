import { useEffect, useState } from "react";

export type Route =
  | { name: "overview" }
  | { name: "activity"; id: number }
  | { name: "progress" }
  | { name: "fitness" }
  | { name: "predictions" }
  | { name: "plan" };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "activity" && parts[1] && !Number.isNaN(Number(parts[1]))) return { name: "activity", id: Number(parts[1]) };
  if (parts[0] === "progress") return { name: "progress" };
  if (parts[0] === "fitness") return { name: "fitness" };
  if (parts[0] === "predictions") return { name: "predictions" };
  if (parts[0] === "plan") return { name: "plan" };
  return { name: "overview" };
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
