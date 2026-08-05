import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Sprout } from "lucide-react";
import { fmtNumber, type ProductLine } from "@/lib/dashboard-data";

function DevTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const rows = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="panel min-w-[190px] px-3.5 py-3 text-xs shadow-[var(--shadow-elegant)]">
      <p className="mb-2 font-semibold">Day {label}</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: r.stroke }}
              />
              <span className="truncate">{r.name}</span>
            </span>
            <span className="font-semibold tabular-nums">{fmtNumber(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DevelopingGrowth({
  data,
  lines,
}: {
  data: Record<string, number | string>[];
  lines: ProductLine[];
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div className="panel p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Sprout className="h-4 w-4" />
          </span>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Product development
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Cumulative units per leading product — how each one develops against the others
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {lines.map((l) => {
          const off = hidden.has(l.key);
          return (
            <button
              key={l.key}
              onClick={() => toggle(l.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium transition-colors ${
                off
                  ? "border-border bg-transparent text-muted-foreground"
                  : "border-transparent bg-surface-2 text-foreground"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: off ? "var(--color-muted-foreground)" : l.color }}
              />
              {l.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 h-[290px] w-full sm:h-[240px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 320 }}>
          <LineChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
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
              width={32}
              allowDecimals={false}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            />
            <Tooltip content={<DevTooltip />} cursor={{ stroke: "var(--color-border)" }} />
            {lines.map((l) =>
              hidden.has(l.key) ? null : (
                <Line
                  key={l.key}
                  type="monotone"
                  dataKey={l.key}
                  name={l.label}
                  stroke={l.color}
                  strokeWidth={2.25}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive
                  animationDuration={900}
                  animationEasing="ease-out"
                />
              ),
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
