import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  sub: string;
  delta: number;
  series: number[];
  positiveWhenUp?: boolean;
  accent?: "brand" | "positive" | "gold" | "violet" | "blue";
}

const accentColor: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  brand: "var(--color-brand)",
  positive: "var(--color-positive)",
  gold: "var(--color-gold)",
  violet: "var(--color-chart-4)",
  blue: "var(--color-chart-5)",
};

export function KpiCard({
  label,
  value,
  sub,
  delta,
  series,
  positiveWhenUp = true,
  accent = "brand",
}: KpiCardProps) {
  const up = delta >= 0;
  const good = positiveWhenUp ? up : !up;
  const color = accentColor[accent];
  const gradId = `spark-${label.replace(/\s+/g, "")}`;
  const data = series.map((v, i) => ({ i, v }));

  return (
    <div
      className="panel group relative flex flex-col overflow-hidden p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-elegant)]"
      style={{ containerType: "inline-size" }}
    >
      <p className="flex min-h-[2.25rem] items-center justify-center text-[0.7rem] font-semibold uppercase leading-tight tracking-[0.12em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 whitespace-nowrap font-display text-[clamp(1.15rem,13cqw,1.875rem)] font-semibold leading-none tracking-tight tabular-nums text-foreground">
        {value}
      </p>

      <div
        className={cn(
          "mt-2 inline-flex items-center gap-0.5 self-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold",
          good ? "bg-positive/12 text-positive" : "bg-destructive/12 text-destructive",
        )}
      >
        {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {Math.abs(delta).toFixed(1)}%
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>

      <div className="-mx-5 -mb-5 mt-auto h-12 opacity-90 transition-opacity duration-300 group-hover:opacity-100">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, bottom: 0, left: 0, right: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="linear"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradId})`}
              dot={false}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
