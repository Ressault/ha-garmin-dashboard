import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Loader2, Moon, RefreshCw, Sun } from "lucide-react";
import { toast } from "sonner";

import { useDataVersion } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import { PATH, sectionOf, type Route } from "@/lib/route";
import { useTheme } from "@/lib/theme";
import { IFlower, IGrid, IHeart, ISearch } from "./icons";
import { useScrubNav } from "./scrub";
import { whenLabel } from "./status";

const TABS = [
  { key: "synthese", label: "Synthèse", href: PATH.synthese, Icon: IHeart },
  { key: "longevite", label: "Longévité", href: PATH.piliers, Icon: IFlower },
  { key: "activite", label: "Activité", href: PATH.activites, Icon: IGrid },
] as const;

/* ---------- Liquid Glass : réfraction réelle ----------
 * Approche : `backdrop-filter: url(#filtre)` avec un SVG <feDisplacementMap>. Une carte de déplacement (générée en
 * canvas à la taille exacte de la barre) décale les pixels de l'arrière-plan le long du bord de la capsule : au bord,
 * le fond défile « plié » comme dans un verre épais, au centre il reste net. Trois déplacements légèrement
 * différents (R, V, B) donnent la dispersion chromatique. Le tout est suivi d'un flou et d'une saturation.
 * Moteur : Chromium (Chrome, WebView Android, app HA). Ailleurs : flou classique (repli), voir index.css. */
function refractionMap(w: number, h: number, bezel: number): string {
  const k = 2; // résolution ×2
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(c.width, c.height);
  const r = h / 2;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const px = (x + 0.5) / k, py = (y + 0.5) / k;
      const qx = Math.min(Math.max(px, r), w - r);
      const dx = px - qx, dy = py - r;
      const dist = Math.hypot(dx, dy);
      const d = r - dist; // profondeur sous le bord
      let R = 128, G = 128;
      if (d >= 0 && d < bezel && dist > 0) {
        const t = 1 - d / bezel;
        const m = Math.pow(t, 2.2); // profil convexe : fort au bord, nul vers l'intérieur
        R = 128 - (dx / dist) * m * 127; // on lit vers l'intérieur : le bord montre le fond « replié »
        G = 128 - (dy / dist) * m * 127;
      }
      const i = (y * c.width + x) * 4;
      img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = 128; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

function Refraction({ id, w, h, bezel, scale, blur }: { id: string; w: number; h: number; bezel: number; scale: number; blur: number }) {
  const map = useMemo(() => (w > 0 && h > 0 ? refractionMap(w, h, bezel) : ""), [w, h, bezel]);
  if (!map) return null;
  const ch = (r: number, g: number, b: number) => `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`;
  return (
    <filter id={id} x="0" y="0" width={w} height={h} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
      <feImage href={map} x="0" y="0" width={w} height={h} preserveAspectRatio="none" result="map" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale={scale * 0.9} xChannelSelector="R" yChannelSelector="G" result="dr" />
      <feColorMatrix in="dr" type="matrix" values={ch(1, 0, 0)} result="r" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" result="dg" />
      <feColorMatrix in="dg" type="matrix" values={ch(0, 1, 0)} result="g" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale={scale * 1.12} xChannelSelector="R" yChannelSelector="G" result="db" />
      <feColorMatrix in="db" type="matrix" values={ch(0, 0, 1)} result="b" />
      <feBlend in="r" in2="g" mode="screen" result="rg" />
      <feBlend in="rg" in2="b" mode="screen" result="rgb" />
      <feGaussianBlur in="rgb" stdDeviation={blur} result="bl" />
      <feColorMatrix in="bl" type="saturate" values="1.7" />
    </filter>
  );
}

/** Ressort à amortissement critique (aucun dépassement), réponse 0,34 s, intégré à pas fixe, interruptible */
class Spring {
  x: number; v = 0; to: number;
  constructor(x: number) { this.x = x; this.to = x; }
  step(dt: number) {
    const w = (2 * Math.PI) / 0.34, k = w * w, c = 2 * 1 * w;
    for (let t = 0; t < dt; t += 1 / 240) {
      const h = Math.min(1 / 240, dt - t);
      this.v += (-k * (this.x - this.to) - c * this.v) * h;
      this.x += this.v * h;
    }
  }
  get rest() { return Math.abs(this.x - this.to) < 0.05 && Math.abs(this.v) < 0.5; }
}

const TAB_W = 92, TAB_STEP = 94;

/** Barre d'onglets flottante en verre épais (mobile) : réfraction, reflets, goutte de verre à ressort */
export function TabBar({ route }: { route: Route }) {
  const sec = sectionOf(route);
  const ref = useRef<HTMLElement>(null);
  const drop = useRef<HTMLSpanElement>(null);
  useScrubNav(ref, "a.hk-tab");
  const idx = Math.max(0, TABS.findIndex((t) => t.key === sec));
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sx = useRef(new Spring(idx * TAB_STEP));
  const sp = useRef(new Spring(1)); // échelle d'appui : la goutte « gonfle » sous le doigt
  const raf = useRef(0);
  const last = useRef(0);

  // Moteur de réfraction disponible ? (Chromium hors iOS, transparence autorisée)
  useLayoutEffect(() => {
    const ua = navigator.userAgent;
    const ok = /Chrome\//.test(ua) && !/(CriOS|FxiOS|EdgiOS)/.test(ua) && CSS.supports("backdrop-filter", "blur(1px)") && !matchMedia("(prefers-reduced-transparency: reduce)").matches;
    if (ok) document.documentElement.dataset.refract = "1";
    return () => { delete document.documentElement.dataset.refract; };
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = () => setSize({ w: Math.round(el.offsetWidth), h: Math.round(el.offsetHeight) });
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paint = () => {
    const d = drop.current;
    if (!d) return;
    const press = Math.min(sp.current.x, 1.08); // jamais de dépassement d'échelle
    d.style.transform = `translate3d(${sx.current.x}px,0,0) scale(${press.toFixed(4)})`;
  };
  const tick = (t: number) => {
    const dt = Math.min((t - last.current) / 1000 || 1 / 60, 1 / 20);
    last.current = t;
    sx.current.step(dt); sp.current.step(dt);
    paint();
    if (sx.current.rest && sp.current.rest) { sx.current.x = sx.current.to; sx.current.v = 0; sp.current.x = sp.current.to; sp.current.v = 0; paint(); raf.current = 0; return; }
    raf.current = requestAnimationFrame(tick);
  };
  const run = () => { if (!raf.current) { last.current = performance.now(); raf.current = requestAnimationFrame(tick); } };

  useLayoutEffect(() => {
    sx.current.to = idx * TAB_STEP;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { sx.current.x = sx.current.to; sx.current.v = 0; paint(); } else run();
  }, [idx]);
  useLayoutEffect(() => { paint(); return () => cancelAnimationFrame(raf.current); }, []);

  const press = (v: number) => () => { sp.current.to = v; run(); };
  const dropH = Math.max(0, size.h - 10);

  return (
    <nav
      ref={ref}
      aria-label="Navigation principale"
      className="hk-tabbar md:hidden"
      onPointerDown={press(1.06)}
      onPointerUp={press(1)}
      onPointerCancel={press(1)}
      onPointerLeave={press(1)}
    >
      <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <Refraction id="hk-refract" w={size.w} h={size.h} bezel={22} scale={30} blur={3.2} />
          <Refraction id="hk-lens" w={TAB_W} h={dropH} bezel={17} scale={20} blur={0.6} />
        </defs>
      </svg>
      <span aria-hidden className="hk-dock-glass" />
      <span aria-hidden ref={drop} className="hk-drop" />
      {TABS.map(({ key, label, href, Icon }) => (
        <a key={key} href={href} className="hk-tab hk-press" aria-current={sec === key ? "page" : undefined}>
          <span style={{ color: sec === key ? "var(--sys-blue)" : "currentColor" }}>
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
            <span style={{ color: sec === key ? "var(--sys-blue)" : "currentColor" }}>
              <Icon size={18} />
            </span>
            {label}
          </a>
        ))}
      </nav>
      <p className="mx-2.5 mt-4 mb-1.5 text-[13px] font-semibold text-label2">Longévité</p>
      <nav aria-label="Longévité" className="flex flex-col gap-0.5">
        <a href={PATH.piliers} aria-current={cur("piliers")}>{dot("var(--sys-green)")}Mes piliers</a>
        <a href={PATH.sommeil} aria-current={cur("sommeil")}>{dot("var(--c-iris)")}Sommeil</a>
        <a href={PATH.forme} aria-current={cur("forme")}>{dot("var(--sys-pink)")}Forme et santé</a>
      </nav>
      <p className="mx-2.5 mt-4 mb-1.5 text-[13px] font-semibold text-label2">Activité</p>
      <nav aria-label="Activité" className="flex flex-col gap-0.5">
        <a href={PATH.activites} aria-current={cur("activites") ?? (route.name === "activity" ? "page" : undefined)}>{dot("var(--sys-pink)")}Activités</a>
        <a href={PATH.progres} aria-current={cur("progres")}>{dot("var(--sys-purple)")}Progrès</a>
        <a href={PATH.entrainement} aria-current={cur("entrainement")}>{dot("var(--c-amber)")}Entraînement</a>
        <a href={PATH.records} aria-current={cur("records")}>{dot("var(--c-gold)")}Records</a>
        <a href={PATH.plan} aria-current={cur("plan")}>{dot("var(--sys-teal)")}Programme</a>
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
    <button type="button" onClick={toggle} className="hk-press flex size-11 shrink-0 items-center justify-center rounded-full bg-fill" aria-label={dark ? "Passer au thème clair" : "Passer au thème sombre"}>
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
      // Garmin n'a que ce que la montre lui a envoyé : si son dernier envoi est ancien, la synchro ne peut rien ramener de neuf
      const sent = r.watch_upload_at ? new Date(r.watch_upload_at) : null;
      const late = sent && Date.now() - sent.getTime() > 45 * 60_000;
      if (late) toast.warning(`Ta montre n'a rien envoyé à Garmin depuis ${whenLabel(r.watch_upload_at)}`, { id, duration: 9000, description: "Les chiffres s'arrêtent à cette heure. Ouvre Garmin Connect sur ton téléphone pour envoyer les données de la montre, puis resynchronise." });
      else if (r.error_count > 0) toast.warning("Synchronisation terminée avec des avertissements", { id, description: `${msg} · ${r.error_count} erreur${r.error_count > 1 ? "s" : ""} ignorée${r.error_count > 1 ? "s" : ""}` });
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
      className={`hk-press flex h-11 items-center justify-center gap-2 rounded-full bg-fill text-[14px] font-semibold disabled:opacity-60 ${wide ? "flex-1 px-3" : "size-11 shrink-0"}`}
    >
      {syncing ? <Loader2 className="size-[18px] animate-spin" /> : <RefreshCw className="size-[18px]" />}
      {wide && (syncing ? "Synchro…" : "Synchroniser")}
    </button>
  );
}
