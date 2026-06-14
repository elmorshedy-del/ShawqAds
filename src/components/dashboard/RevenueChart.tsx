import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { TrendingUp } from "lucide-react";
import { fmtCurrency, fmtNumber, fmtX, type DayRow } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

const ranges = ["3D", "7D", "14D", "All"] as const;
type Range = (typeof ranges)[number];
const sliceFor: Record<Range, number> = { "3D": 3, "7D": 7, "14D": 14, All: 9999 };

type FocusKey = "revenue" | "profit" | "orders" | "roas";
const focusDefs: { key: FocusKey; label: string; color: string; fmt: (n: number) => string }[] = [
  { key: "revenue", label: "Revenue", color: "var(--color-brand)", fmt: fmtCurrency },
  { key: "profit", label: "Contribution", color: "var(--color-positive)", fmt: fmtCurrency },
  { key: "orders", label: "Orders", color: "var(--color-chart-4)", fmt: fmtNumber },
  { key: "roas", label: "ROAS", color: "var(--color-positive)", fmt: fmtX },
];

function resolveCssColor(value: string) {
  if (typeof window === "undefined" || !value.startsWith("var(")) return value;
  const match = value.match(/var\((--[^)]+)\)/);
  if (!match) return value;
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
  return resolved || value;
}

function yAxisLabel(value: number, focus: FocusKey) {
  if (focus === "roas") return `${value}x`;
  if (focus === "orders") return `${value}`;
  return `$${(value / 1000).toFixed(1)}k`;
}

function buildTrendOption(
  data: Array<{
    date: string;
    revenue: number;
    spend: number;
    profit: number;
    orders: number;
    roas: number;
  }>,
  focus: FocusKey,
  def: (typeof focusDefs)[number],
  showSpend: boolean,
  avg: number,
) {
  const focusColor = resolveCssColor(def.color);
  const spendColor = resolveCssColor("var(--color-gold)");
  const muted = resolveCssColor("var(--color-muted-foreground)") || "#697386";
  const border = resolveCssColor("var(--color-border)") || "#e5e7eb";

  return {
    animationDuration: 900,
    animationEasing: "cubicOut",
    color: [focusColor, spendColor],
    tooltip: {
      trigger: "axis",
      backgroundColor: resolveCssColor("var(--color-card)") || "#fff",
      borderColor: border,
      textStyle: { color: resolveCssColor("var(--color-foreground)") || "#111", fontSize: 12 },
      formatter: (params: Array<{ dataIndex: number; seriesName: string; color: string; value: number }>) => {
        const row = data[params?.[0]?.dataIndex];
        if (!row) return "";
        const roasClass =
          row.roas >= 2.5 ? "color:#0b766c" : row.roas >= 2 ? "color:#c68a00" : "color:#dc2626";
        return [
          `<b>${row.date}</b>`,
          `<span style="color:${focusColor}">●</span> Revenue: <b>${fmtCurrency(row.revenue)}</b>`,
          `<span style="color:${spendColor}">●</span> Meta spend: <b>${fmtCurrency(row.spend)}</b>`,
          `<span style="color:${focusColor}">●</span> Contribution: <b>${fmtCurrency(row.profit)}</b>`,
          `ROAS: <b style="${roasClass}">${fmtX(row.roas)}</b>`,
        ].join("<br/>");
      },
    },
    grid: { left: 52, right: 8, top: 8, bottom: 24 },
    xAxis: {
      type: "category",
      data: data.map((row) => row.date),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: muted, fontSize: 11, margin: 6 },
    },
    yAxis: {
      type: "value",
      min: 0,
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: border, type: [3, 6] } },
      axisLabel: {
        color: muted,
        fontSize: 11,
        formatter: (value: number) => yAxisLabel(value, focus),
      },
    },
    series: [
      {
        name: def.label,
        type: "line",
        smooth: true,
        symbolSize: 6,
        data: data.map((row) => row[focus]),
        lineStyle: { width: 2.5, color: focusColor },
        itemStyle: { color: focusColor },
        areaStyle: { color: focusColor, opacity: 0.14 },
        emphasis: { focus: "series" },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { type: "dashed", color: focusColor, opacity: 0.5, width: 1 },
          data: [{ yAxis: Number(avg.toFixed(2)) }],
        },
      },
      showSpend
        ? {
            name: "Meta spend",
            type: "line",
            smooth: true,
            showSymbol: false,
            data: data.map((row) => row.spend),
            lineStyle: { width: 2, type: "dashed", color: spendColor },
          }
        : null,
    ].filter(Boolean),
  };
}

export function RevenueChart({ rows }: { rows: DayRow[] }) {
  const [range, setRange] = useState<Range>("All");
  const [focus, setFocus] = useState<FocusKey>("revenue");
  const def = focusDefs.find((f) => f.key === focus)!;

  const enriched = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        profit: r.revenue - r.spend,
        margin: r.revenue ? ((r.revenue - r.spend) / r.revenue) * 100 : 0,
      })),
    [rows],
  );

  const data = useMemo(
    () =>
      enriched.slice(-sliceFor[range]).map((r) => ({
        date: r.date.slice(5),
        revenue: Math.round(r.revenue),
        spend: Math.round(r.spend),
        profit: Math.round(r.profit),
        orders: r.orders,
        roas: Number(r.roas.toFixed(2)),
      })),
    [enriched, range],
  );

  const showSpend = focus === "revenue" || focus === "profit";
  const avg = useMemo(() => {
    if (!data.length) return 0;
    if (focus === "roas") {
      const rev = data.reduce((a, d) => a + d.revenue, 0);
      const sp = data.reduce((a, d) => a + d.spend, 0);
      return sp ? rev / sp : 0;
    }
    return data.reduce((a, d) => a + (d[focus] as number), 0) / data.length;
  }, [data, focus]);

  const chartOption = useMemo(
    () => buildTrendOption(data, focus, def, showSpend, avg),
    [data, focus, def, showSpend, avg],
  );

  return (
    <div className="panel p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <TrendingUp className="h-4 w-4" />
            </span>
            <h2 className="font-display text-lg font-semibold tracking-tight">Performance trend</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {def.label}
            {focus === "profit" ? " (revenue − ad spend)" : ""} per day
            {showSpend ? " vs. Meta spend" : ""} · dashed line ={" "}
            {focus === "roas" ? "spend-weighted period ROAS" : "period average"}
          </p>
        </div>

        <div className="inline-flex self-start rounded-full border border-border bg-surface-2 p-1">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-all",
                range === r
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {focusDefs.map((f) => {
          const on = focus === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFocus(f.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                on
                  ? "border-transparent text-foreground shadow-sm"
                  : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
              )}
              style={on ? { background: "color-mix(in oklab, " + f.color + " 14%, white)" } : undefined}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: f.color }} />
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 h-[340px] w-full sm:h-[300px]">
        <ReactECharts option={chartOption} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
      </div>
    </div>
  );
}
