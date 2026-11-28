import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import L from "leaflet";

import { fmtPace, nf } from "@/lib/format";
import { heatColor, heatGradient, token } from "@/lib/palette";
import { indexAtDistance, range90, type Prepared } from "@/lib/series";

export type MapMode = "pace" | "hr";

export interface TrackMapHandle {
  /** Place le repère sur la carte à une distance donnée (m), ou le retire (null). */
  showAt: (distM: number | null) => void;
}

interface Props {
  track: [number, number, number | null][];
  prep: Prepared | null;
  mode: MapMode;
  onHover?: (distM: number | null) => void;
  className?: string;
}

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export const TrackMap = forwardRef<TrackMapHandle, Props>(function TrackMap({ track, prep, mode, onHover, className }, ref) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  // Géométrie : distances cumulées le long de la trace, rapportées à la distance totale de la série
  const geo = useMemo(() => {
    const latlngs = track.map(([lat, lon]) => [lat, lon] as L.LatLngTuple);
    const cum = [0];
    for (let i = 1; i < latlngs.length; i++) cum.push(cum[i - 1] + haversine([latlngs[i - 1][0], latlngs[i - 1][1]], [latlngs[i][0], latlngs[i][1]]));
    const total = cum[cum.length - 1] || 1;
    const scaleTo = prep?.totalDist ? prep.totalDist / total : 1;
    return { latlngs, cum, total, distAt: (i: number) => cum[i] * scaleTo };
  }, [track, prep]);

  // Valeur de couleur (vitesse ou FC) pour chaque point de la trace
  const coloring = useMemo(() => {
    if (!prep) return null;
    const src = mode === "hr" ? prep.hr : prep.spd;
    const values = geo.latlngs.map((_, i) => {
      const j = indexAtDistance(prep.dist, geo.distAt(i));
      return src[j];
    });
    const filled: (number | null)[] = [];
    let last: number | null = null;
    for (const v of values) {
      if (v != null) last = v;
      filled.push(v ?? last);
    }
    const dom = range90(filled);
    return dom ? { values: filled, lo: dom[0], hi: dom[1] } : null;
  }, [geo, prep, mode]);

  useImperativeHandle(
    ref,
    () => ({
      showAt: (distM) => {
        const map = mapRef.current;
        const marker = markerRef.current;
        if (!map || !marker) return;
        if (distM == null) {
          marker.remove();
          return;
        }
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < geo.latlngs.length; i++) {
          const d = Math.abs(geo.distAt(i) - distM);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        marker.setLatLng(geo.latlngs[best]);
        if (!map.hasLayer(marker)) marker.addTo(map);
      },
    }),
    [geo],
  );

  // Création de la carte
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const map = L.map(el, { preferCanvas: true, zoomSnap: 0.25, zoomControl: false, scrollWheelZoom: false, attributionControl: true });
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) L.control.zoom({ position: "bottomright" }).addTo(map);
    // OpenStreetMap (sans clé) assombri par un filtre CSS (voir .dark-tiles dans index.css)
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      className: "dark-tiles",
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    markerRef.current = L.circleMarker([0, 0], {
      radius: 7,
      color: token("--on-color"),
      weight: 3,
      fillColor: token("--map-track"),
      fillOpacity: 1,
      interactive: false,
    });
    mapRef.current = map;
    // Molette = zoom uniquement après un clic sur la carte (évite de bloquer le défilement de la page)
    map.on("focus", () => map.scrollWheelZoom.enable());
    map.on("blur", () => map.scrollWheelZoom.disable());
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Tracé coloré
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || geo.latlngs.length < 2) return;
    layer.clearLayers();
    L.polyline(geo.latlngs, { color: token("--map-outline"), weight: 9, opacity: 0.55, lineCap: "round", lineJoin: "round", interactive: false }).addTo(layer);
    if (coloring) {
      const { values, lo, hi } = coloring;
      for (let i = 0; i < geo.latlngs.length - 1; i++) {
        const a = values[i];
        const b = values[i + 1];
        const v = a != null && b != null ? (a + b) / 2 : (a ?? b ?? lo);
        L.polyline([geo.latlngs[i], geo.latlngs[i + 1]], {
          color: heatColor((v - lo) / (hi - lo)),
          weight: 5,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(layer);
      }
    } else {
      L.polyline(geo.latlngs, { color: token("--map-track"), weight: 5, lineCap: "round", lineJoin: "round", interactive: false }).addTo(layer);
    }
    const start = geo.latlngs[0];
    const end = geo.latlngs[geo.latlngs.length - 1];
    L.circleMarker(start, { radius: 6, color: token("--on-color"), weight: 2.5, fillColor: token("--map-start"), fillOpacity: 1, interactive: false }).addTo(layer);
    L.circleMarker(end, { radius: 6, color: token("--on-color"), weight: 2.5, fillColor: token("--map-end"), fillOpacity: 1, interactive: false }).addTo(layer);
    map.fitBounds(L.latLngBounds(geo.latlngs), { padding: [28, 28] });
  }, [geo, coloring]);

  // Survol de la carte → distance → graphique
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    let raf = 0;
    const onMove = (e: L.LeafletMouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        let best = -1;
        let bestD = 30 * 30;
        for (let i = 0; i < geo.latlngs.length; i++) {
          const p = map.latLngToContainerPoint(geo.latlngs[i]);
          const dx = p.x - e.containerPoint.x;
          const dy = p.y - e.containerPoint.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (best < 0) {
          marker.remove();
          onHoverRef.current?.(null);
          return;
        }
        marker.setLatLng(geo.latlngs[best]);
        if (!map.hasLayer(marker)) marker.addTo(map);
        onHoverRef.current?.(geo.distAt(best));
      });
    };
    const onOut = () => {
      cancelAnimationFrame(raf);
      marker.remove();
      onHoverRef.current?.(null);
    };
    map.on("mousemove", onMove);
    map.on("mouseout", onOut);
    return () => {
      cancelAnimationFrame(raf);
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
    };
  }, [geo]);

  const foot = prep?.foot ?? true;
  const legend = coloring
    ? mode === "hr"
      ? { lo: `${nf(coloring.lo)} BPM`, hi: `${nf(coloring.hi)} BPM`, title: "Fréquence cardiaque" }
      : {
          lo: foot ? `${fmtPace(coloring.lo)} /km` : `${nf(coloring.lo * 3.6, 1)} km/h`,
          hi: foot ? `${fmtPace(coloring.hi)} /km` : `${nf(coloring.hi * 3.6, 1)} km/h`,
          title: foot ? "Allure" : "Vitesse",
        }
    : null;

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      <div ref={elRef} className="absolute inset-0" role="application" aria-label="Carte du parcours" tabIndex={0} />
      {legend && (
        <div className="glass pointer-events-none absolute bottom-3 left-3 z-[500] flex items-center gap-2.5 rounded-xl border bg-background/70 px-3 py-2 text-[11px] font-medium backdrop-blur-xl">
          <span className="text-muted-foreground">{legend.title}</span>
          <span>{mode === "pace" ? legend.hi : legend.lo}</span>
          <span
            className="h-1.5 w-20 rounded-full"
            style={{ background: heatGradient() }}
          />
          <span>{mode === "pace" ? legend.lo : legend.hi}</span>
        </div>
      )}
    </div>
  );
});
