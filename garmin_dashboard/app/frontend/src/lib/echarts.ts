import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  LegendComponent,
  AxisPointerComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { C, onPaletteChange } from "./palette";

// Rendu SVG : les textes d'axes héritent de `font-variant-numeric: tabular-nums` (impossible en canvas).
echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  LegendComponent,
  AxisPointerComponent,
  SVGRenderer,
]);

export { echarts };
export type EChartsInstance = ReturnType<typeof echarts.init>;
export type Opt = Record<string, unknown>;

export const FONT = '"Inter Variable", system-ui, "Segoe UI", sans-serif';

export const axisText: Record<string, unknown> = { color: C.label2, fontSize: 11, fontFamily: FONT };

export const tooltipBase: Record<string, unknown> = {
  backgroundColor: C.tipBg,
  borderColor: C.tipBorder,
  borderWidth: 1,
  padding: [10, 12],
  textStyle: { color: C.label, fontSize: 12, fontFamily: FONT },
  extraCssText: "",
  confine: true,
};

export const axisPointerLine: Record<string, unknown> = {
  type: "line",
  lineStyle: { color: C.pointer, width: 1 },
  label: { show: false },
};

// Objets partagés : on les met à jour en place quand le thème change
onPaletteChange(() => {
  axisText.color = C.label2;
  tooltipBase.backgroundColor = C.tipBg;
  tooltipBase.borderColor = C.tipBorder;
  tooltipBase.textStyle = { color: C.label, fontSize: 12, fontFamily: FONT };
  tooltipBase.extraCssText = `border-radius:14px;backdrop-filter:blur(16px);box-shadow:0 12px 32px ${C.tipShadow};font-variant-numeric:tabular-nums;`;
  axisPointerLine.lineStyle = { color: C.pointer, width: 1 };
});
tooltipBase.extraCssText = `border-radius:14px;backdrop-filter:blur(16px);box-shadow:0 12px 32px ${C.tipShadow};font-variant-numeric:tabular-nums;`;

/** Ligne de tooltip : pastille + libellé + valeur alignée à droite */
export function tipRow(color: string, label: string, value: string): string {
  return `<div style="display:flex;align-items:center;gap:8px;margin-top:4px"><span style="width:8px;height:8px;border-radius:50%;background:${color};flex:none"></span><span style="color:${C.label2}">${label}</span><span style="margin-left:auto;padding-left:16px;font-weight:600">${value}</span></div>`;
}

export const tipTitle = (t: string) => `<div style="font-weight:600;margin-bottom:2px">${t}</div>`;
