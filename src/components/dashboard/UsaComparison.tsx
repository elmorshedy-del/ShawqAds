import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { History } from "lucide-react";
import {
  usaMetricDefs,
  fmtCurrency,
  type UsaMetricKey,
  type UsaPhaseStat,
  type UsaCurvePoint,
} from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

function PhaseCard({ s }: { s: UsaPhaseStat }) {
  const launch = s.variant === "launch";
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        launch ? "border-brand/40 bg-brand-soft/40" : "border-border bg-surface-2/50",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-6 rounded-full"
          style={{
            background: launch ? "var(--color-brand)" : "transparent",
            border: launch ? "none" : "2px dashed var(--color-muted-foreground)",
          }}
        />
        <p className="text-sm font-semibold">{s.name}</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {s.period} · {s.days} completed days
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Shopify sales" value={String(s.sales)} />
        <Stat label="Spend" value={fmtCurrency(s.spend)} />
        <Stat label="Avg freq" value={s.freq.toFixed(2)} />
        <Stat label="Avg CPM" value={fmtCurrency(s.cpm)} />
        <Stat label="Reach / $" value={s.reachPerDollar.toFixed(1)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-base font-semibold tabular-nums">{value}</p>
      <p className="text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
    </div>
  );
}

const METRICS: UsaMetricKey[] = ["reach", "cpm", "freq"];

function CurveTooltip({ active, payload, label, metric, indexed }: any) {
  if (!active || !payload?.length) return null;
  const def = usaMetricDefs[metric as UsaMetricKey];
  return (
    <div className="panel min-w-[180px] px-3 py-2.5 text-xs shadow-[var(--shadow-elegant)]">
      <p className="mb-1.5 font-semibold">Active day {label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold tabular-nums">
            {p.value == null ? "—" : indexed ? `${Math.round(p.value)}` : def.format(p.value)}
          </span>
        </div>
      ))}
      {indexed ? (
        <p className="mt-1.5 border-t border-border pt-1.5 text-[0.65rem] text-muted-foreground">
          Indexed · each line starts at 100 on its own day 1
        </p>
      ) : null}
    </div>
  );
}

export function UsaComparison({
  comparison,
  curve,
}: {
  comparison: { history: UsaPhaseStat; launch: UsaPhaseStat };
  curve: UsaCurvePoint[];
}) {
  const [metric, setMetric] = useState<UsaMetricKey>("reach");
  const [mode, setMode] = useState<"absolute" | "index">("absolute");
  const def = usaMetricDefs[metric];
  const indexed = mode === "index";
  const stageDay = comparison.launch.days;

  const historyKey = `history${metric === "reach" ? "Reach" : metric === "cpm" ? "Cpm" : "Freq"}`;
  const launchKey = `launch${metric === "reach" ? "Reach" : metric === "cpm" ? "Cpm" : "Freq"}`;

  // Indexed view rebases each line to 100 on its own day 1, so trajectory shape can
  // be compared without the spend-level confound. The delta reads the raw (absolute)
  // gap at the launch's current active day. Pure reshaping — no business logic here.
  const { plot, delta } = useMemo(() => {
    const firstH = curve.find((p) => (p as any)[historyKey] != null);
    const firstL = curve.find((p) => (p as any)[launchKey] != null);
    const baseH = firstH ? Number((firstH as any)[historyKey]) : 0;
    const baseL = firstL ? Number((firstL as any)[launchKey]) : 0;

    const plot = curve.map((p) => {
      const hv = (p as any)[historyKey];
      const lv = (p as any)[launchKey];
      if (indexed) {
        return {
          day: p.day,
          [historyKey]: hv != null && baseH ? (Number(hv) / baseH) * 100 : null,
          [launchKey]: lv != null && baseL ? (Number(lv) / baseL) * 100 : null,
        };
      }
      return { day: p.day, [historyKey]: hv ?? null, [launchKey]: lv ?? null };
    });

    const at = curve.find((p) => p.day === stageDay);
    const rawH = at ? (at as any)[historyKey] : null;
    const rawL = at ? (at as any)[launchKey] : null;
    const hvAt = rawH == null ? null : Number(rawH);
    const lvAt = rawL == null ? null : Number(rawL);
    const delta = hvAt != null && lvAt != null && hvAt !== 0 ? (lvAt / hvAt - 1) * 100 : null;

    return { plot, delta };
  }, [curve, historyKey, launchKey, indexed, stageDay]);

  const deltaGood = delta == null ? null : def.better === "high" ? delta >= 0 : delta <= 0;

  return (
    <div className="panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <History className="h-4 w-4" />
            </span>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              USA_ABO lifecycle vs June USA launch
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Dashed = Testing_USA_ABO full 40-day cycle (Feb–Apr). Solid = USA launch from Jun 06.
            Aligned by active day to compare the same delivery stage. Switch to{" "}
            <span className="font-medium text-foreground">Indexed</span> to compare trajectory shape
            without the spend-level gap between the two runs.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-border bg-surface-2/60 p-0.5">
          {METRICS.map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                metric === m
                  ? "bg-brand text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {usaMetricDefs[m].label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.65rem] text-muted-foreground">
        <div className="inline-flex rounded-lg border border-border bg-surface-2/60 p-0.5">
          {(["absolute", "index"] as const).map((mo) => (
            <button
              key={mo}
              onClick={() => setMode(mo)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[0.65rem] font-medium transition-colors",
                mode === mo
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mo === "absolute" ? "Absolute" : "Indexed · D1=100"}
            </button>
          ))}
        </div>
        <span className="rounded-full bg-surface-2 px-2 py-0.5">
          {indexed ? "index (D1 = 100)" : def.unit}
        </span>
        <span>
          {def.better === "high" ? "Higher is better" : "Lower is better"} · launch is{" "}
          {comparison.launch.days} days into a {comparison.history.days}-day curve
        </span>
        {delta != null ? (
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold",
              deltaGood ? "bg-positive/12 text-positive" : "bg-destructive/12 text-destructive",
            )}
            title={`Raw ${def.label} gap at the launch's active day ${stageDay}`}
          >
            launch {delta >= 0 ? "+" : ""}
            {delta.toFixed(0)}% vs Testing · day {stageDay}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PhaseCard s={comparison.history} />
        <PhaseCard s={comparison.launch} />
      </div>

      <div className="mt-5 h-[330px] w-full sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={plot} margin={{ left: -10, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              tickFormatter={(v) => `D${v}`}
              dy={6}
              interval={4}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              tickFormatter={(v) => (indexed ? `${Math.round(v)}` : def.format(v))}
            />
            <Tooltip
              content={<CurveTooltip metric={metric} indexed={indexed} />}
              cursor={{ stroke: "var(--color-border)" }}
            />
            {indexed ? (
              <ReferenceLine
                y={100}
                stroke="var(--color-muted-foreground)"
                strokeDasharray="2 4"
                strokeOpacity={0.5}
                label={{
                  value: "D1 = 100",
                  position: "insideTopLeft",
                  fill: "var(--color-muted-foreground)",
                  fontSize: 10,
                }}
              />
            ) : null}
            <ReferenceLine
              x={stageDay}
              stroke="var(--color-brand)"
              strokeDasharray="3 4"
              strokeOpacity={0.5}
              label={{
                value: "launch today",
                position: "insideTopRight",
                fill: "var(--color-brand)",
                fontSize: 10,
              }}
            />
            <Line
              type="monotone"
              dataKey={historyKey}
              name="Testing_USA_ABO"
              stroke="var(--color-muted-foreground)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              connectNulls
              isAnimationActive
              animationDuration={800}
            />
            <Line
              type="monotone"
              dataKey={launchKey}
              name="USA launch"
              stroke="var(--color-brand)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "var(--color-brand)", strokeWidth: 0 }}
              connectNulls
              isAnimationActive
              animationDuration={800}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
