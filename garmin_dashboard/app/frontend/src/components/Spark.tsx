import { useMemo } from "react";

import { Chart } from "@/components/common";
import { axisPointerLine, tipRow, tipTitle, tooltipBase, type Opt } from "@/lib/echarts";
import { C } from "@/lib/palette";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const anim = () => ({ animation: !reduced(), animationDuration: 600, animationEasing: "cubicOut" });
const grid = { left: 3, right: 10, top: 6, bottom: 2 };

export interface SparkPoint {
  label: string;
  value: number | null;
}

/** Courbe compacte : dernière valeur marquée, bande de référence et ligne de zéro optionnelles. */
export function SparkLine({
  points,
  color,
  unit,
  name,
  band,
  zero,
  height = 64,
  label,
}: {
  points: SparkPoint[];
  color: string;
  unit: string;
  name: string;
  band?: { from: number; to: number; color: string };
  zero?: boolean;
  height?: number;
  label: string;
}) {
  const option = useMemo(() => {
    const vals = points.map((p) => p.value).filter((v): v is number => v != null);
    const lo = Math.min(...vals, band?.from ?? Infinity, zero ? 0 : Infinity);
    const hi = Math.max(...vals, band?.to ?? -Infinity, zero ? 0 : -Infinity);
    const pad = (hi - lo) * 0.12 || 1;
    const lastIdx = points.length - 1;
    const markLine = zero
      ? { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: C.ghost, type: "dashed", width: 1 }, data: [{ yAxis: 0 }] }
      : undefined;
    const markArea = band
      ? { silent: true, itemStyle: { color: band.color, opacity: 1 }, data: [[{ yAxis: band.from }, { yAxis: band.to }]] }
      : undefined;
    return {
      ...anim(),
      grid,
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: axisPointerLine,
        formatter: (p: { dataIndex: number }[]) => {
          const pt = points[p[0].dataIndex];
          return pt.value == null ? "" : tipTitle(pt.label) + tipRow(color, name, `${Math.round(pt.value * 10) / 10} ${unit}`.trim());
        },
      },
      xAxis: { type: "category", show: false, data: points.map((p) => p.label), boundaryGap: false },
      yAxis: { type: "value", show: false, min: lo - pad, max: hi + pad },
      series: [
        {
          type: "line",
          smooth: 0.35,
          symbol: "none",
          lineStyle: { color, width: 2.25, cap: "round" },
          areaStyle: {
            color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${color}40` }, { offset: 1, color: `${color}00` }] },
          },
          data: points.map((p, i) =>
            i === lastIdx && p.value != null
              ? { value: p.value, symbol: "circle", symbolSize: 7, itemStyle: { color, borderColor: C.card, borderWidth: 2 } }
              : p.value,
          ),
          markLine,
          markArea,
        },
      ],
    } as Opt;
  }, [points, color, unit, name, band, zero]);
  return <Chart option={option} height={height} label={label} />;
}

/** Barres hebdomadaires : l'historique est atténué, la semaine en cours est pleine, la moyenne est en pointillés. */
export function SparkBars({
  labels,
  values,
  color,
  avg,
  height = 64,
  label,
}: {
  labels: string[];
  values: number[];
  color: string;
  avg?: number | null;
  height?: number;
  label: string;
}) {
  const option = useMemo(() => {
    const last = values.length - 1;
    return {
      ...anim(),
      grid,
      tooltip: {
        ...tooltipBase,
        trigger: "axis",
        axisPointer: { type: "shadow", shadowStyle: { color: C.faint } },
        formatter: (p: { dataIndex: number }[]) => tipTitle(`Semaine du ${labels[p[0].dataIndex]}`) + tipRow(color, "Distance", `${values[p[0].dataIndex]} km`),
      },
      xAxis: { type: "category", show: false, data: labels },
      yAxis: { type: "value", show: false, min: 0, max: Math.max(...values, avg ?? 0, 1) * 1.1 },
      series: [
        {
          type: "bar",
          barCategoryGap: "28%",
          itemStyle: { borderRadius: [4, 4, 1, 1] },
          data: values.map((v, i) => ({
            value: v,
            itemStyle: i === last ? { color } : { color: `${color}59` },
          })),
          markLine:
            avg != null && avg > 0
              ? { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: C.ghost, type: "dashed", width: 1 }, data: [{ yAxis: avg }] }
              : undefined,
        },
      ],
    } as Opt;
  }, [labels, values, color, avg]);
  return <Chart option={option} height={height} label={label} />;
}
