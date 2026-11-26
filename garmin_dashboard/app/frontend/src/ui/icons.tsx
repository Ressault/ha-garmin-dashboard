import type { Group } from "./derive";

/* Pictogrammes au trait, couleur = currentColor (s'adaptent au thème et aux pétales) */
type P = { size?: number; className?: string };
const S = ({ size = 18, className, children, vb = "0 0 24 24" }: P & { children: React.ReactNode; vb?: string }) => (
  <svg width={size} height={size} viewBox={vb} aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const IRun = (p: P) => (
  <S {...p}>
    <circle cx="14" cy="4" r="2.2" fill="currentColor" stroke="none" />
    <path d="M9 21l3-6 3 3v4M7 11l3-4 4 2 2 3 3 1M10 7l-1 6" />
  </S>
);
export const IBike = (p: P) => (
  <S {...p}>
    <circle cx="5.5" cy="15" r="4" />
    <circle cx="18.5" cy="15" r="4" />
    <path d="M5.5 15l4.5-7h5.5l3 7M10 8l3 7M13.5 5h3" />
  </S>
);
export const IMtb = (p: P) => (
  <S {...p}>
    <circle cx="5.5" cy="15" r="4.5" strokeWidth="2.6" />
    <circle cx="18.5" cy="15" r="4.5" strokeWidth="2.6" />
    <path d="M5.5 15l4.5-7h5.5l3 7M10 8l3 7M12.5 4.5l2 1" />
  </S>
);
export const IWalk = (p: P) => (
  <S {...p}>
    <circle cx="13" cy="4" r="2.2" fill="currentColor" stroke="none" />
    <path d="M10 21l2-6 3 2 1 4M9 13l1-5 4 1 2 4M10 8l-3 3" />
  </S>
);
export const IGym = (p: P) => (
  <S {...p} >
    <path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12" strokeWidth="2.4" />
  </S>
);
export const IOther = (p: P) => (
  <S {...p}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </S>
);
export const GROUP_ICON: Record<Group, (p: P) => React.ReactElement> = { foot: IRun, road: IBike, mtb: IMtb, walk: IWalk, gym: IGym, other: IOther };

export const IGrid = (p: P) => (
  <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden className={p.className} fill="currentColor">
    <rect x="2" y="2" width="9" height="9" rx="2.4" />
    <rect x="13" y="2" width="9" height="9" rx="2.4" />
    <rect x="2" y="13" width="9" height="9" rx="2.4" />
    <rect x="13" y="13" width="9" height="9" rx="2.4" />
  </svg>
);
export const IHeart = (p: P) => (
  <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 22" aria-hidden className={p.className} fill="currentColor">
    <path d="M12 21s-9-5.6-9-12.2C3 5.4 5.4 3 8.4 3c1.6 0 2.9.8 3.6 2 .7-1.2 2-2 3.6-2C18.6 3 21 5.4 21 8.8 21 15.4 12 21 12 21z" />
  </svg>
);
export const IFlower = (p: P) => (
  <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" aria-hidden className={p.className}>
    <g fill="currentColor">
      <circle cx="12" cy="4.5" r="3.3" />
      <circle cx="18.5" cy="8.3" r="3.3" />
      <circle cx="18.5" cy="15.7" r="3.3" />
      <circle cx="12" cy="19.5" r="3.3" />
      <circle cx="5.5" cy="15.7" r="3.3" />
      <circle cx="5.5" cy="8.3" r="3.3" />
    </g>
    <circle cx="12" cy="12" r="2.6" style={{ fill: "var(--background)" }} />
  </svg>
);
export const ISearch = (p: P) => (
  <S {...p} size={p.size ?? 16}>
    <circle cx="11" cy="11" r="7" />
    <path d="M16.5 16.5L21 21" />
  </S>
);
export const IMoon = (p: P) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" aria-hidden className={p.className}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor" />
  </svg>
);
export const ISun = (p: P) => (
  <S {...p} size={p.size ?? 20}>
    <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
  </S>
);

/* Mini-pictogrammes en couleur pour les pastilles */
export const MiniSleep = ({ score }: { score: number | null }) => {
  const C = 2 * Math.PI * 11;
  const L = ((score ?? 0) / 100) * C;
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
      <circle cx="15" cy="15" r="11" fill="none" stroke="#5E6BFF" strokeOpacity=".18" strokeWidth="5" />
      <circle cx="15" cy="15" r="11" fill="none" stroke="#5E6BFF" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${L} ${C}`} transform="rotate(-90 15 15)" />
      <text x="15" y="19" fontSize="10" fontWeight="700" textAnchor="middle" className="fill-foreground">
        {score ?? "–"}
      </text>
    </svg>
  );
};
export const MiniHeart = () => (
  <span style={{ color: "#FF375F" }}>
    <IHeart size={26} />
  </span>
);
export const MiniTrend = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden fill="none" stroke="#AF52DE" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 22l7-8 5 4 10-12" />
    <path d="M19 6h6v6" />
  </svg>
);
export const MiniPillars = ({ colors }: { colors: string[] }) => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
    {[[15, 7], [23, 15], [15, 23], [7, 15]].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="5.5" fill={colors[i] ?? "#C7C7CC"} />
    ))}
  </svg>
);
export const MiniList = () => (
  <span style={{ color: "#FF375F" }}>
    <IGrid size={26} />
  </span>
);
export const MiniZones = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
    <rect x="3" y="16" width="4" height="8" rx="2" fill="#30B0C7" />
    <rect x="9" y="12" width="4" height="12" rx="2" fill="#34C759" />
    <rect x="15" y="6" width="4" height="18" rx="2" fill="#FFB800" />
    <rect x="21" y="10" width="4" height="14" rx="2" fill="#FF6B2C" />
  </svg>
);
/* Pictogrammes pleins façon SF Symbols (poids Semibold) : « calendar » et « trophy.fill » */
export const MiniPlan = () => (
  <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
    <defs>
      <linearGradient id="mp-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4BE06E" />
        <stop offset="1" stopColor="#30D158" />
      </linearGradient>
    </defs>
    <rect x="10" y="2.5" width="3.6" height="8" rx="1.8" fill="#23A843" />
    <rect x="20.4" y="2.5" width="3.6" height="8" rx="1.8" fill="#23A843" />
    <rect x="3.5" y="5.5" width="27" height="25.5" rx="7.5" fill="url(#mp-body)" />
    <path d="M3.5 13a7.5 7.5 0 0 1 7.5-7.5h12A7.5 7.5 0 0 1 30.5 13v.5h-27z" fill="#23A843" opacity=".55" />
    <rect x="10" y="2.5" width="3.6" height="8" rx="1.8" fill="#23A843" />
    <rect x="20.4" y="2.5" width="3.6" height="8" rx="1.8" fill="#23A843" />
    {[[10.5, 20], [17, 20], [23.5, 20], [10.5, 26], [17, 26]].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="2.1" fill="#fff" />
    ))}
    <circle cx="23.5" cy="26" r="2.1" fill="#fff" opacity=".5" />
  </svg>
);
export const MiniMedal = () => (
  <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
    <defs>
      <linearGradient id="mm-gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFC247" />
        <stop offset="1" stopColor="#FF9F0A" />
      </linearGradient>
    </defs>
    <path d="M9.5 7.5H7A2 2 0 0 0 5 9.5c0 4.2 2.6 6.6 6.2 7.2M24.5 7.5H27a2 2 0 0 1 2 2c0 4.2-2.6 6.6-6.2 7.2" fill="none" stroke="url(#mm-gold)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8.5 4.5h17v10.2c0 5-3.8 8.8-8.5 8.8s-8.5-3.8-8.5-8.8z" fill="url(#mm-gold)" />
    <rect x="15" y="22" width="4" height="4.5" fill="url(#mm-gold)" />
    <rect x="9.5" y="26" width="15" height="4.5" rx="2.25" fill="url(#mm-gold)" />
    <path d="M12.2 7.5v7c0 2.2 1 3.9 2.6 4.8" fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/** Grand cœur dégradé (widget et page Forme et santé) */
export function BigHeart({ id }: { id: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 220 200" aria-hidden>
      <defs>
        <radialGradient id={id} cx=".38" cy=".32" r=".85">
          <stop offset="0" stopColor="#FF9AAB" />
          <stop offset=".55" stopColor="#FF4467" />
          <stop offset="1" stopColor="#E3224A" />
        </radialGradient>
      </defs>
      <path d="M110 186s-96-58-96-126C14 30 38 8 68 8c18 0 34 10 42 25 8-15 24-25 42-25 30 0 54 22 54 52 0 68-96 126-96 126z" fill={`url(#${id})`} />
    </svg>
  );
}
