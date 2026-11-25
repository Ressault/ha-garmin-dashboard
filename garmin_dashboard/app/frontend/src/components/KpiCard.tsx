import type { CSSProperties, ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Carte KPI façon Apple Health : pastille colorée + titre, puis contenu. */
export function KpiCard({
  title,
  icon,
  color,
  href,
  children,
  className,
  style,
}: {
  title: string;
  icon: ReactNode;
  color: string;
  href?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const inner = (
    <Card
      className={cn(
        "h-full gap-3.5 px-5 py-4 transition-colors duration-200",
        href && "group-hover:bg-foreground/[0.04] group-active:bg-foreground/[0.07]",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex size-6 items-center justify-center rounded-full [&_svg]:size-3.5"
          style={{ background: `${color}2e`, color }}
        >
          {icon}
        </span>
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        {href && (
          <ChevronRight className="text-muted-foreground ml-auto size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        )}
      </div>
      {children}
    </Card>
  );
  if (!href) return <div style={style}>{inner}</div>;
  return (
    <a
      href={href}
      style={style}
      className="group block rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
    >
      {inner}
    </a>
  );
}
