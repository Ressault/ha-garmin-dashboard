import { useEffect, useRef } from "react";
import { echarts, type EChartsInstance, type Opt } from "@/lib/echarts";

interface Options {
  /** Charts d'un même groupe : curseur et zoom synchronisés */
  group?: string;
  onInit?: (chart: EChartsInstance) => void;
}

export function useChart(option: Opt | null, { group, onInit }: Options = {}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsInstance | null>(null);
  const onInitRef = useRef(onInit);
  onInitRef.current = onInit;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: "svg" });
    chartRef.current = chart;
    if (group) {
      chart.group = group;
      echarts.connect(group);
    }
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    onInitRef.current?.(chart);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [group]);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart && option) chart.setOption(option as never, true);
  }, [option]);

  return { ref, chartRef };
}
