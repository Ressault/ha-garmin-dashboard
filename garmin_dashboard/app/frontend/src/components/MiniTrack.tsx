import { useMemo } from "react";
import { GROUP_META, groupOf } from "@/ui/derive";

/** Mini-tracé GPS en SVG (sans fond de carte) : projection simple corrigée de la latitude. */
export function MiniTrack({ points, type, className }: { points?: [number, number][] | null; type: string | null; className?: string }) {
  const shape = useMemo(() => {
    if (!points || points.length < 2) return null;
    const lats = points.map((p) => p[0]);
    const lons = points.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const w = Math.max((maxLon - minLon) * k, 1e-6);
    const h = Math.max(maxLat - minLat, 1e-6);
    const scale = Math.min(76 / w, 36 / h);
    const ox = (88 - w * scale) / 2;
    const oy = (48 - h * scale) / 2;
    const xy = points.map(([lat, lon]) => [ox + (lon - minLon) * k * scale, oy + (maxLat - lat) * scale] as const);
    return { d: xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(""), start: xy[0], end: xy[xy.length - 1] };
  }, [points]);

  const color = GROUP_META[groupOf(type)].color;
  return (
    <svg viewBox="0 0 88 48" className={className} aria-hidden>
      <rect width="88" height="48" rx="10" fill="currentColor" fillOpacity="0.05" />
      {shape && (
        <>
          <path d={shape.d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={shape.start[0]} cy={shape.start[1]} r="2.6" fill="#30D158" />
          <circle cx={shape.end[0]} cy={shape.end[1]} r="2.6" fill="#FF453A" />
        </>
      )}
    </svg>
  );
}
