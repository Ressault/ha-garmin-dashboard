import { useCallback, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import {
  Activity as ActivityIcon,
  Bike,
  Dumbbell,
  Footprints,
  Info,
  Mountain,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useChart } from "@/hooks/useChart";
import type { EChartsInstance, Opt } from "@/lib/echarts";
import { sportGroup, type SportGroup } from "@/lib/format";
import { C } from "@/lib/palette";
import { cn } from "@/lib/utils";

/* ---------- Contrôle segmenté (pastille qui glisse : transform uniquement) ---------- */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  disabled,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const n = options.length;
  const idx = Math.max(0, options.findIndex((o) => o.value === value));

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const next = (idx + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
      onChange(options[next].value);
    },
    [idx, n, onChange, options],
  );

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled}
      onKeyDown={onKey}
      className={cn(
        "bg-secondary relative inline-grid rounded-full p-0.5 transition-opacity duration-200",
        disabled && "pointer-events-none opacity-40",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 rounded-full bg-card shadow-sm dark:bg-foreground/20 transition-transform duration-300 ease-[var(--ease-out-strong)]"
        style={{ width: `calc((100% - 4px) / ${n})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 flex items-center justify-center rounded-full px-3 font-medium whitespace-nowrap outline-none after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/50",
              size === "sm" ? "h-8 text-[13px]" : "h-9 text-[14px]",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Variation (flèche + valeur) ---------- */
export function Delta({
  value,
  text,
  goodWhen = "up",
  neutral,
  className,
}: {
  value: number | null | undefined;
  text: string;
  goodWhen?: "up" | "down";
  /** Écart purement informatif (ex. volume) : gris, sans jugement bon/mauvais. */
  neutral?: boolean;
  className?: string;
}) {
  if (value == null || !Number.isFinite(value)) return null;
  const flat = Math.abs(value) < 1e-9;
  const good = flat ? null : (value > 0) === (goodWhen === "up");
  const color = flat || neutral ? C.label2 : good ? C.green : C.orange;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", className)}
      style={{ color, background: `${color}22` }}
    >
      {!flat && (
        <span aria-hidden className="text-[9px] leading-none">
          {value > 0 ? "▲" : "▼"}
        </span>
      )}
      {text.replace(/^[+−-]\s?/, "")}
    </span>
  );
}

/* ---------- Pastille de statut ---------- */
export function StatusPill({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", className)}
      style={{ color, background: `${color}24` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

/* ---------- Info-bulle « i » ---------- */
export function InfoTip({ children, label = "Plus d'informations" }: { children: ReactNode; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="text-muted-foreground hover:text-foreground relative inline-flex size-5 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 after:absolute after:-inset-3 after:content-['']"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}

/* ---------- Valeur + unité ---------- */
export function Value({
  value,
  unit,
  size = "md",
  className,
}: {
  value: ReactNode;
  unit?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "text-base font-semibold",
    md: "text-xl font-semibold",
    lg: "text-[28px] leading-8 font-semibold",
    xl: "text-[38px] leading-10 font-semibold",
  } as const;
  return (
    <span className={cn("inline-flex items-baseline gap-1 tracking-tight tabular-nums", className)}>
      <span className={sizes[size]}>{value}</span>
      {unit && <span className="text-muted-foreground text-[13px] font-medium">{unit}</span>}
    </span>
  );
}

/* ---------- Icône + couleur du sport ---------- */
export const SPORT_STYLE: Record<SportGroup, { color: string; Icon: typeof ActivityIcon }> = {
  run: { color: C.green, Icon: Footprints },
  trail: { color: C.orange, Icon: Mountain },
  bike: { color: C.blue, Icon: Bike },
  walk: { color: C.cyan, Icon: Footprints },
  strength: { color: C.violet, Icon: Dumbbell },
  other: { color: C.gray, Icon: ActivityIcon },
};

export function SportTile({ type, className }: { type: string | null | undefined; className?: string }) {
  const { color, Icon } = SPORT_STYLE[sportGroup(type)];
  return (
    <span
      aria-hidden
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", className)}
      style={{ background: `${color}26`, color }}
    >
      <Icon className="size-[19px]" strokeWidth={2.2} />
    </span>
  );
}

/* ---------- Graphique ECharts ---------- */
export function Chart({
  option,
  height = 240,
  group,
  onInit,
  className,
  label,
}: {
  option: Opt | null;
  height?: number;
  group?: string;
  onInit?: (c: EChartsInstance) => void;
  className?: string;
  label: string;
}) {
  const { ref } = useChart(option, { group, onInit });
  const style: CSSProperties = { height };
  return <div ref={ref} role="img" aria-label={label} className={cn("w-full", className)} style={style} />;
}

/* ---------- États vides / erreurs ---------- */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="bg-secondary mb-2 flex size-12 items-center justify-center rounded-2xl">
        <ActivityIcon className="text-muted-foreground size-6" />
      </div>
      <p className="text-base font-semibold tracking-tight">{title}</p>
      {description && <p className="text-muted-foreground max-w-sm text-sm text-balance">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function QueryError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[#FF453A]/30 bg-[#FF453A]/10 p-4">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[#FF453A]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Données indisponibles</p>
        <p className="text-muted-foreground mt-0.5 text-sm">{error.message}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Réessayer
      </Button>
    </div>
  );
}
