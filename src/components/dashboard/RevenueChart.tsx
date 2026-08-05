import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp, Waves } from "lucide-react";
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

function movingAverage(values: number[], window: number) {
  if (window <= 1) return values;
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = values.slice(start, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

function smoothWindow(pointCount: number, range: Range) {
  if (pointCount < 3 || range === "3D" || range === "7D") return 0;
  if (range === "14D") return 3;
  return pointCount > 30 ? 7 : 3;
}

function ChartTooltip({ active, payload, label, smoothing }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="panel min-w-[180px] px-3.5 py-3 text-xs shadow-[var(--shadow-elegant)]">
      <p className="mb-2 font-semibold text-foreground">{label}</p>
      {smoothing ? (
        <p className="mb-2 -mt-1 text-[0.65rem] leading-tight text-muted-foreground">
          Actual values — the line is a {smoothing}-day average
        </p>
      ) : null}
      <div className="space-y-1.5">
        <Row dot="var(--color-brand)" name="Revenue" value={fmtCurrency(row.revenue)} />
        <Row dot="var(--color-gold)" name="Meta spend" value={fmtCurrency(row.spend)} />
        <div className="my-1.5 border-t border-border" />
        <Row dot="var(--color-positive)" name="Contribution (rev − ad spend)" value={fmtCurrency(row.profit)} strong />
        <div className="flex items-center justify-between gap-6 text-muted-foreground">
          <span>ROAS</span>
          <span
            className={cn(
              "font-semibold",
              row.roas >= 2.5 ? "text-positive" : row.roas >= 2 ? "text-gold" : "text-destructive",
            )}
          >
            {fmtX(row.roas)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({ dot, name, value, strong }: { dot: string; name: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
        {name}
      </span>
      <span className={cn("font-semibold text-foreground", strong && "text-positive")}>{value}</span>
    </div>
  );
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

  const chartData = useMemo(() => {
    const window = smoothWindow(data.length, range);
    if (!window) return data;
    const revenuePlot = movingAverage(data.map((row) => row.revenue), window);
    const spendPlot = movingAverage(data.map((row) => row.spend), window);
    const profitPlot = movingAverage(data.map((row) => row.profit), window);
    const ordersPlot = movingAverage(data.map((row) => row.orders), window);
    const roasPlot = movingAverage(data.map((row) => row.roas), window);
    return data.map((row, index) => ({
      ...row,
      revenuePlot: revenuePlot[index],
      spendPlot: spendPlot[index],
      profitPlot: profitPlot[index],
      ordersPlot: ordersPlot[index],
      roasPlot: roasPlot[index],
    }));
  }, [data, range]);

  const plotKey = useMemo(() => {
    const window = smoothWindow(data.length, range);
    if (!window) return focus;
    return `${focus}Plot` as const;
  }, [data.length, range, focus]);

  // The plotted curve is a moving average whenever this is non-zero. It has to be
  // stated: a smoothed line flattens single-day collapses that the findings panel
  // reports as anomalies, and a chart that disagrees with the analysis is worse
  // than no chart.
  const smoothing = smoothWindow(data.length, range);
  const showSpend = focus === "revenue" || focus === "profit";
  const spendPlotKey = smoothing ? "spendPlot" : "spend";
  const showDots = data.length <= 21;

  const avg = useMemo(() => {
    if (!data.length) return 0;
    if (focus === "roas") {
      const rev = data.reduce((a, d) => a + d.revenue, 0);
      const sp = data.reduce((a, d) => a + d.spend, 0);
      return sp ? rev / sp : 0;
    }
    return data.reduce((a, d) => a + (d[focus] as number), 0) / data.length;
  }, [data, focus]);

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
          {smoothing ? (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-gold/10 px-2 py-0.5 text-[0.65rem] font-medium text-gold">
              <Waves className="h-3 w-3" />
              Line is a {smoothing}-day moving average · hover for actual daily values
            </p>
          ) : null}
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
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 300 }}>
          <ComposedChart data={chartData} margin={{ left: -8, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="focusFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={def.color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={def.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              dy={6}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              tickFormatter={(v) =>
                focus === "roas" ? `${v}x` : focus === "orders" ? `${v}` : `$${(v / 1000).toFixed(1)}k`
              }
            />
            <Tooltip
              content={<ChartTooltip smoothing={smoothing} />}
              cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
            />
            <ReferenceLine
              y={Number(avg.toFixed(2))}
              stroke={def.color}
              strokeDasharray="4 5"
              strokeOpacity={0.5}
            />
            <Area
              type="monotone"
              dataKey={plotKey}
              name={def.label}
              stroke={def.color}
              strokeWidth={2.5}
              fill="url(#focusFill)"
              dot={showDots ? { r: 3, fill: def.color, strokeWidth: 0 } : false}
              activeDot={{ r: 5, stroke: "var(--color-card)", strokeWidth: 2 }}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
            />
            {showSpend && (
              <Line
                type="monotone"
                dataKey={spendPlotKey}
                name="Meta spend"
                stroke="var(--color-gold)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive
                animationDuration={1100}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
