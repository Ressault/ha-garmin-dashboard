import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useScrubNav } from "./scrub";

/* Briques visuelles de la refonte « Apple Santé » */

export const TINT = {
  blue: "#3E62FF",
  sky: "#3E8EF7",
  pink: "#FF375F",
  red: "#FF2D55",
  green: "#34C759",
  teal: "#00B8A9",
  cyan: "#30B0C7",
  indigo: "#5E6BFF",
  purple: "#AF52DE",
  orange: "#FF9F0A",
  gold: "#F5C33B",
} as const;

type Tint = keyof typeof TINT;
const tintStyle = (t?: Tint): CSSProperties | undefined => (t ? ({ "--tint": TINT[t] } as CSSProperties) : undefined);

export function Page({ tint, children, className }: { tint?: Tint; children: ReactNode; className?: string }) {
  return (
    <div className={cn("hk-page -mx-4 min-h-screen px-4 pt-[max(env(safe-area-inset-top),20px)] pb-32 sm:-mx-6 sm:px-6 md:mx-0 md:rounded-[30px] md:px-8 md:pt-8 md:pb-14", className)} style={tintStyle(tint)}>
      {children}
    </div>
  );
}

export function Card({ tint, href, children, className, label, as }: { tint?: Tint; href?: string; children: ReactNode; className?: string; label?: string; as?: "section" | "div" }) {
  const props = { className: cn("hk-card", className), style: tintStyle(tint), "data-tint": tint ? "" : undefined };
  if (href) {
    return (
      <a href={href} aria-label={label} {...props}>
        {children}
      </a>
    );
  }
  const Tag = as ?? "section";
  return <Tag {...props}>{children}</Tag>;
}

export const Chev = () => (
  <span aria-hidden className="font-semibold text-[#C4C4C7]">
    {" ›"}
  </span>
);

/** Libellé gris au-dessus d'une valeur ; `more` ajoute le chevron des cartes cliquables */
export function Lbl({ children, more, className, style }: { children: ReactNode; more?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <p className={cn("m-0 text-[15px] leading-snug text-label2", className)} style={style}>
      {children}
      {more && <Chev />}
    </p>
  );
}
export function Sm({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <p className={cn("m-0 text-[13px] leading-snug text-label2", className)} style={style}>
      {children}
    </p>
  );
}
export function Val({ children, size = 20, className, style }: { children: ReactNode; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <p className={cn("m-0 mt-0.5 font-semibold tracking-[-0.01em] tabular-nums", className)} style={{ fontSize: size, lineHeight: 1.15, ...style }}>
      {children}
    </p>
  );
}
export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("m-0 text-[15px] leading-[1.4]", className)}>{children}</p>;
}
export const Hr = () => <div className="my-4 h-px bg-sep" />;

export type BadgeTone = "green" | "blue" | "orange" | "red" | "teal" | "indigo" | "gray";
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`hk-badge b-${tone} shrink-0 rounded-full px-2.5 py-[5px] text-[13px] font-semibold whitespace-nowrap`}>{children}</span>;
}

export function Up({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
      <path d="M6 1.5L11 8.5H1z" fill={color} />
    </svg>
  );
}
export function Down({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
      <path d="M6 10.5L11 3.5H1z" fill={color} />
    </svg>
  );
}
/** Écart avec la période précédente : vert si hausse, gris si baisse (une semaine plus légère n'est pas un échec) */
export function Delta({ value, text, invert }: { value: number | null | undefined; text: string; invert?: boolean }) {
  if (value == null || !Number.isFinite(value)) return null;
  if (Math.abs(value) < 1e-9) return <span className="text-[13px] font-semibold text-label2">= stable</span>;
  const up = value > 0;
  const good = invert ? !up : up;
  const color = good ? "var(--ok)" : "var(--label2)";
  return (
    <span className="inline-flex items-center gap-[3px] text-[13px] font-semibold tabular-nums" style={{ color }}>
      {up ? <Up color={color} /> : <Down color={color} />}
      {text}
    </span>
  );
}

export function Hero({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="hero-in px-1 pt-7 pb-5">
      <h1 className="m-0 text-[32px] leading-[1.1] font-bold tracking-[-0.022em] md:text-[40px]">{title}</h1>
      {children && <p className="m-0 mt-2.5 max-w-[680px] text-[21px] leading-[1.28] tracking-[-0.01em] text-label2">{children}</p>}
    </div>
  );
}
export function Title({ children }: { children: ReactNode }) {
  return <h1 className="m-0 mb-3.5 px-1 text-[34px] leading-[1.1] font-bold tracking-[-0.022em]">{children}</h1>;
}
export function H2({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-6 mb-2.5 flex items-baseline justify-between px-1">
      <h2 className="m-0 text-[22px] font-bold tracking-[-0.015em]">{children}</h2>
      {right}
    </div>
  );
}

/** Pastille cliquable (raccourci en haut d'écran ou onglet de section) */
export function Chip({ href, icon, label, value, current }: { href: string; icon: ReactNode; label: string; value: ReactNode; current?: boolean }) {
  return (
    <a href={href} className="hk-chip hk-press" aria-current={current ? "page" : undefined}>
      <span className="hk-chip-ico">{icon}</span>
      <span>
        <span className="block text-[14px] leading-tight text-label2">{label}</span>
        <span className="block text-[16px] leading-tight font-semibold whitespace-nowrap">{value}</span>
      </span>
    </a>
  );
}
// Le bandeau reste en place d'une pilule à l'autre (le contenu dessous glisse) : on garde la position du reflet
// et le défilement de la rangée précédente (même bandeau = même libellé) pour les faire glisser vers la pilule active.
let last: { label: string; idx: number; scroll: number; t: number } | null = null;

/** Carte de réfraction d'un rectangle arrondi (rayon R) : au bord, le fond est lu « replié » vers l'intérieur */
function roundedMap(w: number, h: number, R: number, bezel: number): string {
  const k = 2, c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(c.width, c.height);
  const bx = w / 2 - R, by = h / 2 - R;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const px = (x + 0.5) / k - w / 2, py = (y + 0.5) / k - h / 2;
    const qx = Math.abs(px) - bx, qy = Math.abs(py) - by;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), ol = Math.hypot(ox, oy);
    const d = -(ol + Math.min(Math.max(qx, qy), 0) - R); // profondeur sous le bord
    let nx = 0, ny = 0;
    if (ol > 0) { nx = Math.sign(px) * ox / ol; ny = Math.sign(py) * oy / ol; } else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
    let Rv = 128, Gv = 128;
    if (d >= 0 && d < bezel) { const m = Math.pow(1 - d / bezel, 2.2); Rv = 128 - nx * m * 127; Gv = 128 - ny * m * 127; }
    const i = (y * c.width + x) * 4;
    img.data[i] = Rv; img.data[i + 1] = Gv; img.data[i + 2] = 128; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}
const SVGNS = "http://www.w3.org/2000/svg";
/** Filtre SVG de verre (même chaîne que la barre du bas : déplacement R/V/B, flou, saturation) */
function glassFilter(id: string, w: number, h: number, map: string, scale: number, blur: number): SVGFilterElement {
  const f = document.createElementNS(SVGNS, "filter");
  const set = (el: Element, a: Record<string, string | number>) => { for (const [n, v] of Object.entries(a)) el.setAttribute(n, String(v)); return el; };
  set(f, { id, x: 0, y: 0, width: w, height: h, filterUnits: "userSpaceOnUse", primitiveUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB" });
  const ch = (r: number, g: number, b: number) => `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`;
  const add = (tag: string, a: Record<string, string | number>) => f.appendChild(set(document.createElementNS(SVGNS, tag), a));
  add("feImage", { href: map, x: 0, y: 0, width: w, height: h, preserveAspectRatio: "none", result: "map" });
  ([["r", 0.9, ch(1, 0, 0)], ["g", 1, ch(0, 1, 0)], ["b", 1.12, ch(0, 0, 1)]] as const).forEach(([n, s, m]) => {
    add("feDisplacementMap", { in: "SourceGraphic", in2: "map", scale: scale * s, xChannelSelector: "R", yChannelSelector: "G", result: "d" + n });
    add("feColorMatrix", { in: "d" + n, type: "matrix", values: m, result: n });
  });
  add("feBlend", { in: "r", in2: "g", mode: "screen", result: "rg" });
  add("feBlend", { in: "rg", in2: "b", mode: "screen", result: "rgb" });
  add("feGaussianBlur", { in: "rgb", stdDeviation: blur, result: "bl" });
  add("feColorMatrix", { in: "bl", type: "saturate", values: 1.8 });
  return f;
}

export function ChipRow({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const defs = useRef<SVGSVGElement>(null);
  useScrubNav(ref, "a.hk-chip");
  useLayoutEffect(() => {
    const row = ref.current, tr = track.current, svg = defs.current;
    if (!row || !tr || !svg) return;
    const chips = [...row.querySelectorAll<HTMLElement>("a.hk-chip")];
    const idx = chips.findIndex((c) => c.getAttribute("aria-current") === "page");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Verre hors du rail défilant (un backdrop-filter dans un conteneur à défilement ne voit pas la page) :
    // un corps de verre par pilule dans un rail collant, décalé de -scrollLeft pour suivre la rangée.
    const bodies = chips.map((_, i) => {
      const s = document.createElement("span");
      s.className = "hk-pg";
      if (i === idx) s.dataset.on = "";
      s.appendChild(document.createElement("i")); // voile blanc de la pilule active
      tr.appendChild(s);
      return s;
    });
    const uid = Math.random().toString(36).slice(2, 7);
    const sizes: string[] = [];
    const place = () => {
      chips.forEach((c, i) => {
        const w = c.offsetWidth, h = c.offsetHeight, b = bodies[i];
        b.style.transform = `translateX(${c.offsetLeft}px)`; b.style.width = `${w}px`;
        if (w && sizes[i] !== `${w}x${h}`) { // filtre de réfraction à la taille exacte de la pilule
          sizes[i] = `${w}x${h}`;
          const id = `hk-pgf-${uid}-${i}`;
          svg.querySelector(`#${id}`)?.remove();
          svg.appendChild(glassFilter(id, w, h, roundedMap(w, h, 22, 14), 22, 5));
          b.style.setProperty("--pgf", `url(#${id})`);
        }
      });
      tr.style.width = `${row.scrollWidth}px`;
      tr.style.transform = `translateX(${-row.scrollLeft}px)`;
    };
    const target = () => {
      const cur = chips[idx];
      if (!cur) return row.scrollLeft;
      const r = row.getBoundingClientRect(), c = cur.getBoundingClientRect();
      return Math.max(0, Math.min(row.scrollWidth - row.clientWidth, row.scrollLeft + (c.left - r.left) - (r.width - c.width) / 2));
    };
    const from = last && last.label === label && performance.now() - last.t < 4000 ? last : null;
    if (from) row.scrollLeft = Math.min(from.scroll, row.scrollWidth - row.clientWidth);
    if (idx >= 0) row.scrollTo({ left: target(), behavior: from && !reduce ? "smooth" : "auto" });
    place();
    // Changement de pilule : la pilule choisie grossit légèrement puis se pose ; le voile blanc passe de l'ancienne à la nouvelle
    if (from && idx >= 0 && from.idx !== idx) {
      const on = bodies[idx].firstElementChild as HTMLElement, off = bodies[from.idx]?.firstElementChild as HTMLElement | undefined;
      const fade = { duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)" };
      on.animate([{ opacity: 0 }, { opacity: 1 }], fade);
      if (off) { off.animate([{ opacity: 1 }, { opacity: 0 }], fade); }
      if (!reduce) {
        const zoom: Keyframe[] = [{ scale: 1, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }, { scale: 1.07, offset: 0.35, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }, { scale: 1 }];
        [chips[idx], bodies[idx]].forEach((el) => el.animate(zoom, { duration: 420 }));
      }
    }
    last = { label, idx, scroll: target(), t: performance.now() };
    const id = requestAnimationFrame(() => { if (!from && idx >= 0) row.scrollLeft = target(); place(); }); // recalage une fois les polices posées
    const onScroll = () => { tr.style.transform = `translateX(${-row.scrollLeft}px)`; if (last) last.scroll = row.scrollLeft; };
    // appui : la pilule et son verre s'enfoncent ensemble dès le contact
    const press = (e: PointerEvent) => {
      const i = chips.findIndex((c) => c.contains(e.target as Node));
      if (i < 0) return;
      const els = [chips[i], bodies[i]];
      els.forEach((el) => { el.style.transition = "scale 120ms cubic-bezier(0.23, 1, 0.32, 1)"; el.style.scale = "0.96"; });
      const up = () => { els.forEach((el) => { el.style.transition = "scale 260ms cubic-bezier(0.32, 0.72, 0, 1)"; el.style.scale = ""; }); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
      window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    };
    row.addEventListener("scroll", onScroll, { passive: true });
    row.addEventListener("pointerdown", press);
    const ro = new ResizeObserver(place);
    ro.observe(row);
    return () => {
      cancelAnimationFrame(id); row.removeEventListener("scroll", onScroll); row.removeEventListener("pointerdown", press); ro.disconnect();
      bodies.forEach((b) => b.remove()); svg.replaceChildren();
    };
  }, []);
  return (
    <>
      <div aria-hidden className="hk-rail -mx-4 sm:-mx-6">
        <svg ref={defs} width="0" height="0" style={{ position: "absolute" }} />
        <div ref={track} className="hk-rail-track" />
      </div>
      <nav ref={ref} aria-label={label} data-fixed className="hk-scroll hk-carousel -mx-4 -mb-2.5 px-4 pb-3 sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:px-0">
        {children}
      </nav>
    </>
  );
}

/** Groupe de lignes façon réglages iOS */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-[26px] bg-card shadow-[var(--card-shadow)] [&>*+*]:border-t [&>*+*]:border-sep", className)}>{children}</div>;
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("hk-stagger flex flex-col gap-3.5", className)}>{children}</div>;
}

export function Grid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("hk-stagger grid items-start gap-3.5 lg:grid-cols-2 2xl:grid-cols-3", className)}>{children}</div>;
}

export function Skel({ h = 160 }: { h?: number }) {
  return <div className="hk-card animate-pulse" style={{ height: h }} aria-hidden />;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Card>
      <P className="text-label2">{children}</P>
    </Card>
  );
}
