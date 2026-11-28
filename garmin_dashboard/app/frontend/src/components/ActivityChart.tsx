import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from "react";

import { Chart } from "@/components/common";
import { fmtPaceSec, nf } from "@/lib/format";
import { C } from "@/lib/palette";
import { axisPointerLine, axisText, tipRow, tipTitle, tooltipBase, type EChartsInstance, type Opt } from "@/lib/echarts";
import { clipToAxis, niceAxis, paceRange, range90, smooth, type Prepared } from "@/lib/series";

export interface ActivityChartHandle {
  /** Place le curseur du graphique à une distance donnée (m), ou le retire (null). */
  showAt: (distM: number | null) => void;
}

const MAX_POINTS = 700;

export const ActivityChart = forwardRef<ActivityChartHandle, { prep: Prepared; onHover?: (distM: number | null) => void }>(
  function ActivityChart({ prep, onHover }, ref) {
    const chartRef = useRef<EChartsInstance | null>(null);
    const onHoverRef = useRef(onHover);
    onHoverRef.current = onHover;
    const last = useRef<number | null>(null);

    const data = useMemo(() => {
      const step = Math.max(1, Math.ceil(prep.n / MAX_POINTS));
      const idx: number[] = [];
      for (let i = 0; i < prep.n; i += step) idx.push(i);
      const alt = smooth(prep.alt, 2);
      const hr = smooth(prep.hr, 2);
      const pace = smooth(prep.pace, 4);
      return {
        idx,
        x: idx.map((i) => +prep.x[i].toFixed(3)),
        alt: idx.map((i) => alt[i]),
        hr: idx.map((i) => hr[i]),
        pace: idx.map((i) => pace[i]),
        spd: idx.map((i) => prep.spd[i]),
      };
    }, [prep]);

    const option = useMemo<Opt>(() => {
      const km = prep.xKind === "km";
      const showPace = prep.foot;
      const hasHr = data.hr.some((v) => v != null);
      const hasAlt = data.alt.some((v) => v != null);
      const rows: { key: "alt" | "hr" | "pace"; top: number; height: number }[] = [];
      if (hasAlt) rows.push({ key: "alt", top: 0, height: 0 });
      if (hasHr) rows.push({ key: "hr", top: 0, height: 0 });
      rows.push({ key: "pace", top: 0, height: 0 });
      const gap = 14;
      const total = 100;
      const each = (total - gap * (rows.length - 1) * 0.35) / rows.length;
      rows.forEach((r, i) => {
        r.top = i * (each + gap * 0.35);
        r.height = each - 3;
      });

      const grids = rows.map((r, i) => ({
        left: 46,
        right: 14,
        top: `${r.top + 2}%`,
        height: `${r.height - (i === rows.length - 1 ? 8 : 0)}%`,
      }));
      const xAxes = rows.map((_, i) => ({
        type: "value",
        gridIndex: i,
        min: 0,
        max: +(data.x[data.x.length - 1] ?? 1).toFixed(2),
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { ...axisText, show: i === rows.length - 1, formatter: (v: number) => `${nf(v, km ? 0 : 0)}${km ? " km" : " min"}` },
        axisPointer: { show: true, ...axisPointerLine },
      }));

      const lineBase = { type: "line", showSymbol: false, symbol: "none", smooth: 0.3, smoothMonotone: "x", connectNulls: false, sampling: "lttb" as const, animation: false };
      const yBase = { splitNumber: 3, axisLine: { show: false }, axisTick: { show: false }, axisLabel: axisText, splitLine: { lineStyle: { color: C.grid } } };

      // axe d'allure rond ; les arrêts (allure hors axe) coupent la courbe au lieu de la faire plonger
      const pr = showPace ? paceRange(data.pace) : range90(data.spd);
      const paceAx = !pr ? null : showPace ? niceAxis(pr, { pad: 0.25, pace: true }) : (() => { const k = niceAxis([pr[0] * 3.6, pr[1] * 3.6], { pad: 0.25 }); return { min: k.min / 3.6, max: k.max / 3.6, interval: k.interval / 3.6 }; })();
      const paceVals = paceAx ? clipToAxis(showPace ? data.pace : data.spd, paceAx) : showPace ? data.pace : data.spd;
      const yAxes: Opt[] = [];
      const series: Opt[] = [];
      rows.forEach((r, i) => {
        if (r.key === "alt") {
          yAxes.push({ ...yBase, type: "value", gridIndex: i, scale: true, axisLabel: { ...axisText, formatter: (v: number) => `${nf(v)} m` } });
          series.push({
            ...lineBase,
            name: "Altitude",
            xAxisIndex: i,
            yAxisIndex: i,
            data: data.x.map((x, k) => [x, data.alt[k]]),
            lineStyle: { width: 1.5, color: C.gray },
            areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(142,142,147,0.38)" }, { offset: 1, color: "rgba(142,142,147,0.02)" }] } },
          });
        } else if (r.key === "hr") {
          yAxes.push({ ...yBase, type: "value", gridIndex: i, scale: true, axisLabel: { ...axisText, formatter: (v: number) => `${nf(v)}` } });
          series.push({ ...lineBase, name: "FC", xAxisIndex: i, yAxisIndex: i, data: data.x.map((x, k) => [x, data.hr[k]]), lineStyle: { width: 2, color: C.red } });
        } else {
          yAxes.push({
            ...yBase,
            type: "value",
            gridIndex: i,
            inverse: showPace,
            scale: true,
            ...(paceAx ? { min: paceAx.min, max: paceAx.max, interval: paceAx.interval } : {}),
            axisLabel: { ...axisText, formatter: (v: number) => (showPace ? fmtPaceSec(v) : `${nf(v * 3.6)}`) },
          });
          series.push({
            ...lineBase,
            name: showPace ? "Allure" : "Vitesse",
            xAxisIndex: i,
            yAxisIndex: i,
            data: data.x.map((x, k) => [x, paceVals[k]]),
            lineStyle: { width: 2, color: C.blue },
          });
        }
      });

      return {
        animation: false,
        grid: grids,
        xAxis: xAxes,
        yAxis: yAxes,
        series,
        axisPointer: { link: [{ xAxisIndex: "all" }], snap: true },
        tooltip: {
          ...tooltipBase,
          trigger: "axis",
          axisPointer: { type: "line", lineStyle: { color: C.pointer } },
          formatter: (params: { dataIndex: number }[]) => {
            const k = params[0]?.dataIndex ?? 0;
            const x = data.x[k];
            let html = tipTitle(km ? `${nf(x, 2)} km` : `${nf(x, 1)} min`);
            if (hasAlt && data.alt[k] != null) html += tipRow(C.gray, "Altitude", `${nf(data.alt[k])} m`);
            if (hasHr && data.hr[k] != null) html += tipRow(C.red, "FC", `${nf(data.hr[k])} BPM`);
            if (showPace && data.pace[k] != null) html += tipRow(C.blue, "Allure", `${fmtPaceSec(data.pace[k])} /km`);
            if (!showPace && data.spd[k] != null) html += tipRow(C.blue, "Vitesse", `${nf((data.spd[k] as number) * 3.6, 1)} km/h`);
            return html;
          },
        },
      } as Opt;
    }, [prep, data]);

    const emitHover = useCallback((chart: EChartsInstance) => {
      chart.on("updateAxisPointer", (e: unknown) => {
        const ev = e as { axesInfo?: { value: number }[] };
        const v = ev.axesInfo?.[0]?.value;
        if (v == null) return;
        const km = prep.xKind === "km";
        const dist = km ? v * 1000 : (prep.dist[prep.dist.length - 1] ?? 0) * (v / (prep.x[prep.x.length - 1] || 1));
        if (last.current != null && Math.abs(last.current - dist) < 1) return;
        last.current = dist;
        onHoverRef.current?.(km ? dist : null);
      });
      chart.getZr().on("globalout", () => {
        last.current = null;
        onHoverRef.current?.(null);
      });
    }, [prep]);

    useImperativeHandle(
      ref,
      () => ({
        showAt: (distM) => {
          const c = chartRef.current;
          if (!c) return;
          if (distM == null) {
            c.dispatchAction({ type: "hideTip" });
            return;
          }
          const x = prep.xKind === "km" ? distM / 1000 : 0;
          let best = 0;
          let bestD = Infinity;
          for (let i = 0; i < data.x.length; i++) {
            const d = Math.abs(data.x[i] - x);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
          c.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: best });
        },
      }),
      [prep, data],
    );

    return (
      <Chart
        option={option}
        height={prep.foot ? 420 : 380}
        label="Profil d'altitude, fréquence cardiaque et allure au fil de la sortie"
        onInit={(c) => {
          chartRef.current = c;
          emitHover(c);
        }}
      />
    );
  },
);
