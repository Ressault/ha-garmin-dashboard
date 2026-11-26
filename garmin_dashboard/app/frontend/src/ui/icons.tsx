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
/* Pictogrammes des pilules du haut : même boîte de 34 × 34, formes pleines, extrémités arrondies, léger dégradé de profondeur (façon SF Symbols). */
const Gloss = ({ id }: { id: string }) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor="#fff" stopOpacity=".34" />
    <stop offset=".6" stopColor="#fff" stopOpacity="0" />
  </linearGradient>
);

export const MiniSleep = ({ score }: { score: number | null }) => {
  const r = 12, C = 2 * Math.PI * r;
  const L = (Math.max(0, Math.min(100, score ?? 0)) / 100) * C;
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
      <defs>
        <linearGradient id="ms-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B94FF" />
          <stop offset="1" stopColor="#5E6BFF" />
        </linearGradient>
      </defs>
      <circle cx="17" cy="17" r={r} fill="none" stroke="#5E6BFF" strokeOpacity=".18" strokeWidth="4.4" />
      {L > 0 && <circle cx="17" cy="17" r={r} fill="none" stroke="url(#ms-ring)" strokeWidth="4.4" strokeLinecap="round" strokeDasharray={`${L} ${C}`} transform="rotate(-90 17 17)" />}
      <text x="17" y="17.4" fontSize="11.5" fontWeight="700" textAnchor="middle" dominantBaseline="central" className="fill-foreground">
        {score ?? "–"}
      </text>
    </svg>
  );
};
export const MiniHeart = () => (
  <svg width="34" height="34" viewBox="0.5 0.5 23 22.5" aria-hidden>
    <defs>
      <linearGradient id="mh-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FF5C7E" />
        <stop offset="1" stopColor="#FF2D55" />
      </linearGradient>
      <Gloss id="mh-gloss" />
    </defs>
    <path d="M12 21s-9-5.6-9-12.2C3 5.4 5.4 3 8.4 3c1.6 0 2.9.8 3.6 2 .7-1.2 2-2 3.6-2C18.6 3 21 5.4 21 8.8 21 15.4 12 21 12 21z" fill="url(#mh-fill)" />
    <path d="M12 21s-9-5.6-9-12.2C3 5.4 5.4 3 8.4 3c1.6 0 2.9.8 3.6 2 .7-1.2 2-2 3.6-2C18.6 3 21 5.4 21 8.8 21 15.4 12 21 12 21z" fill="url(#mh-gloss)" />
  </svg>
);
export const MiniTrend = () => (
  <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="mt-line" gradientUnits="userSpaceOnUse" x1="5" y1="28" x2="29" y2="6">
        <stop offset="0" stopColor="#C984F5" />
        <stop offset="1" stopColor="#AF52DE" />
      </linearGradient>
    </defs>
    <path d="M5.5 25 13.5 16.5 19 21.5 28 10.5" stroke="url(#mt-line)" strokeWidth="4.6" />
    <path d="M20.5 7.5h8.5V16" stroke="url(#mt-line)" strokeWidth="4.6" />
  </svg>
);
export const MiniPillars = ({ colors }: { colors: string[] }) => (
  <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
    <defs>
      <Gloss id="mp-gloss" />
    </defs>
    {[[17, 8.6], [25.4, 17], [17, 25.4], [8.6, 17]].map(([x, y], i) => (
      <g key={i}>
        <circle cx={x} cy={y} r="5.3" fill={colors[i] ?? "#C7C7CC"} />
        <circle cx={x} cy={y} r="5.3" fill="url(#mp-gloss)" />
      </g>
    ))}
  </svg>
);
export const MiniList = () => (
  <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
    <defs>
      <linearGradient id="ml-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FF5C7E" />
        <stop offset="1" stopColor="#FF2D55" />
      </linearGradient>
      <Gloss id="ml-gloss" />
    </defs>
    {[[3, 3], [18.8, 3], [3, 18.8], [18.8, 18.8]].map(([x, y], i) => (
      <g key={i}>
        <rect x={x} y={y} width="12.2" height="12.2" rx="4" fill="url(#ml-fill)" />
        <rect x={x} y={y} width="12.2" height="12.2" rx="4" fill="url(#ml-gloss)" />
      </g>
    ))}
  </svg>
);
export const MiniZones = () => (
  <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
    <defs>
      <Gloss id="mz-gloss" />
    </defs>
    {[
      [2.2, 12, "#30B0C7"],
      [10.2, 19, "#34C759"],
      [18.2, 28, "#FFB800"],
      [26.2, 22, "#FF6B2C"],
    ].map(([x, h, c], i) => (
      <g key={i}>
        <rect x={x as number} y={31 - (h as number)} width="5.6" height={h as number} rx="2.8" fill={c as string} />
        <rect x={x as number} y={31 - (h as number)} width="5.6" height={h as number} rx="2.8" fill="url(#mz-gloss)" />
      </g>
    ))}
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
