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
let last: { label: string; x: number; w: number; scroll: number; t: number } | null = null;

export function ChipRow({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLElement>(null);
  const glide = useRef<HTMLSpanElement>(null);
  useScrubNav(ref, "a.hk-chip");
  useLayoutEffect(() => {
    const row = ref.current, g = glide.current;
    const cur = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !cur || !g) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Marges de bout de rangée : la première et la dernière pilule peuvent elles aussi se centrer au milieu de l'écran (mobile)
    const chips = [...row.querySelectorAll<HTMLElement>("a.hk-chip")];
    const edges = () => {
      if (matchMedia("(min-width: 768px)").matches) { row.style.paddingLeft = row.style.paddingRight = ""; return; }
      row.style.paddingLeft = `${Math.max(16, (row.clientWidth - chips[0].offsetWidth) / 2)}px`;
      row.style.paddingRight = `${Math.max(16, (row.clientWidth - chips[chips.length - 1].offsetWidth) / 2)}px`;
    };
    edges();
    const rect = () => {
      const r = row.getBoundingClientRect(), c = cur.getBoundingClientRect();
      return { r, c, x: c.left - r.left + row.scrollLeft, w: c.width };
    };
    const target = () => {
      const { r, c } = rect();
      return Math.max(0, Math.min(row.scrollWidth - row.clientWidth, row.scrollLeft + (c.left - r.left) - (r.width - c.width) / 2));
    };
    const from = last && last.label === label && performance.now() - last.t < 4000 ? last : null;
    if (from) row.scrollLeft = Math.min(from.scroll, row.scrollWidth - row.clientWidth);
    row.scrollTo({ left: target(), behavior: from && !reduce ? "smooth" : "auto" });
    const to = rect();
    g.style.transition = "none";
    g.style.width = `${from ? from.w : to.w}px`;
    g.style.transform = `translateX(${from ? from.x : to.x}px)`;
    void g.offsetWidth;
    g.style.transition = "";
    g.style.width = `${to.w}px`;
    g.style.transform = `translateX(${to.x}px)`;
    last = { label, x: to.x, w: to.w, scroll: row.scrollLeft, t: performance.now() };
    const id = requestAnimationFrame(() => { // recalage unique une fois les polices posées
      edges();
      if (!from) row.scrollLeft = target();
      const n = rect();
      g.style.transform = `translateX(${n.x}px)`;
      last = { label, x: n.x, w: n.w, scroll: row.scrollLeft, t: performance.now() };
    });
    const onScroll = () => { if (last) last.scroll = row.scrollLeft; };
    row.addEventListener("scroll", onScroll, { passive: true });
    return () => { cancelAnimationFrame(id); row.removeEventListener("scroll", onScroll); };
  }, []);
  return (
    <nav ref={ref} aria-label={label} data-fixed className="hk-scroll hk-carousel -mx-4 -mb-2.5 px-4 pb-3 sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:px-0">
      <span ref={glide} aria-hidden className="hk-chip-glide" />
      {children}
    </nav>
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
