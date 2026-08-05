import { useMemo } from "react";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Clock, Radar } from "lucide-react";
import { fmtCurrency, fmtNumber, type DeliveryPoint } from "@/lib/dashboard-data";

function DeliveryTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const r = payload[0]?.payload;
  if (!r) return null;
  return (
    <div className="panel min-w-[180px] px-3.5 py-3 text-xs shadow-[var(--shadow-elegant)]">
      <p className="mb-2 font-semibold">{label}</p>
      <div className="space-y-1.5">
        <Row dot="var(--color-brand)" name="Reach" value={fmtNumber(r.reach)} />
        <Row dot="var(--color-gold)" name="CPM" value={fmtCurrency(r.cpm)} />
        <Row dot="var(--color-chart-4)" name="Frequency" value={r.frequency.toFixed(2)} />
        <Row dot="var(--color-positive)" name="Spend" value={fmtCurrency(r.spend)} />
      </div>
    </div>
  );
}

function Row({ dot, name, value }: { dot: string; name: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
        {name}
      </span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function DailyDelivery({
  data,
  developingDay,
}: {
  data: DeliveryPoint[];
  /** Reporting day excluded from the series because it is still accumulating. */
  developingDay?: string;
}) {
  // Fixed, stable frequency axis — rounded up to the next 0.5, floor of 2 — so the
  // line reads against a real scale instead of silently rescaling each render.
  const freqMax = useMemo(() => {
    const peak = data.reduce((mx, d) => Math.max(mx, Number(d.frequency) || 0), 0);
    return Math.max(2, Math.ceil((peak + 0.3) * 2) / 2);
  }, [data]);

  return (
    <div className="panel p-6">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Radar className="h-4 w-4" />
        </span>
        <h2 className="font-display text-lg font-semibold tracking-tight">Daily delivery shape</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Reach (area, left) vs CPM and frequency (right axes). Reach flattening while frequency
        climbs is the audience-saturation signal.
      </p>
      {developingDay ? (
        // Without this the chart always ends in a cliff: the current reporting day has
        // only accumulated part of its delivery, which reads as a collapse in reach.
        <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
          <Clock className="h-3 w-3" />
          {developingDay} excluded — still accumulating
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[0.65rem] text-muted-foreground">
        <Legend dot="var(--color-brand)" label="Reach · left" />
        <Legend dot="var(--color-gold)" label="CPM ($) · right" dashed />
        <Legend dot="var(--color-chart-4)" label="Frequency · right" dashed />
      </div>

      <div className="mt-4 h-[330px] w-full sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="reachFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0.02} />
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
              yAxisId="reach"
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              yAxisId="cpm"
              orientation="right"
              tickLine={false}
              axisLine={false}
              width={40}
              tick={{ fill: "var(--color-gold)", fontSize: 11 }}
              tickFormatter={(v) => `$${v}`}
            />
            <YAxis
              yAxisId="freq"
              orientation="right"
              tickLine={false}
              axisLine={false}
              width={30}
              domain={[0, freqMax]}
              tick={{ fill: "var(--color-chart-4)", fontSize: 11 }}
              tickFormatter={(v) => v.toFixed(1)}
            />
            <Tooltip content={<DeliveryTooltip />} cursor={{ stroke: "var(--color-border)" }} />
            <Area
              yAxisId="reach"
              type="monotone"
              dataKey="reach"
              name="Reach"
              stroke="var(--color-brand)"
              strokeWidth={2.5}
              fill="url(#reachFill)"
              isAnimationActive
              animationDuration={900}
            />
            <Line
              yAxisId="cpm"
              type="monotone"
              dataKey="cpm"
              name="CPM"
              stroke="var(--color-gold)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive
              animationDuration={1100}
            />
            <Line
              yAxisId="freq"
              type="monotone"
              dataKey="frequency"
              name="Frequency"
              stroke="var(--color-chart-4)"
              strokeWidth={2}
              strokeDasharray="2 4"
              dot={{ r: 2.5, fill: "var(--color-chart-4)", strokeWidth: 0 }}
              isAnimationActive
              animationDuration={1300}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ dot, label, dashed }: { dot: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-0.5 w-4 rounded-full"
        style={{
          background: dashed ? "none" : dot,
          borderTop: dashed ? `2px dashed ${dot}` : "none",
        }}
      />
      {label}
    </span>
  );
}
