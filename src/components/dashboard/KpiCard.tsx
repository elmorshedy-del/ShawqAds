import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Info, Minus, Sparkles, TrendingDown } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { burstKpiConfetti } from "@/lib/kpiConfetti.js";

export interface KpiProjection {
  label: string;
  value: string;
}

export interface KpiRecord {
  text: string;
  detail?: string;
  tip?: string;
  favorable?: boolean;
  celebrate?: boolean;
  recordKey?: string;
  high?: boolean;
}

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  delta: number;
  /** What the delta is measured against, e.g. "vs previous period". */
  deltaLabel?: string;
  series: number[];
  positiveWhenUp?: boolean;
  accent?: "brand" | "positive" | "gold" | "violet" | "blue";
  valueColor?: string | null;
  projection?: KpiProjection | null;
  record?: KpiRecord | null;
  /** False when the selected window contains no rows at all — suppresses the delta. */
  hasData?: boolean;
  /** False when there is no comparable prior window to measure the delta against. */
  hasComparison?: boolean;
  /** Plain-language definition surfaced on hover/focus. */
  definition?: string;
  /** Why the metric matters, shown under the definition. */
  whyItMatters?: string;
}

const accentColor: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  brand: "var(--color-brand)",
  positive: "var(--color-positive)",
  gold: "var(--color-gold)",
  violet: "var(--color-chart-4)",
  blue: "var(--color-chart-5)",
};

const celebratedRecords = new Set<string>();

export function KpiCard({
  label,
  value,
  sub,
  delta,
  deltaLabel,
  series,
  positiveWhenUp = true,
  accent = "brand",
  valueColor = null,
  projection = null,
  record = null,
  hasData = true,
  hasComparison = true,
  definition,
  whyItMatters,
}: KpiCardProps) {
  const up = delta >= 0;
  const good = positiveWhenUp ? up : !up;
  const color = accentColor[accent];
  const gradId = `spark-${label.replace(/\s+/g, "")}`;
  const data = series.map((v, i) => ({ i, v }));
  const cardRef = useRef<HTMLDivElement>(null);
  const [definitionOpen, setDefinitionOpen] = useState(false);

  useEffect(() => {
    if (!record?.celebrate || !record.recordKey || celebratedRecords.has(record.recordKey)) return;
    const node = cardRef.current;
    if (!node) return;

    const celebrate = () => {
      if (celebratedRecords.has(record.recordKey!)) return;
      celebratedRecords.add(record.recordKey!);
      const rect = node.getBoundingClientRect();
      burstKpiConfetti({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    };

    if (typeof IntersectionObserver === "undefined") {
      celebrate();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            celebrate();
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [record]);

  return (
    <div
      ref={cardRef}
      className="panel group relative flex flex-col overflow-hidden p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-elegant)]"
      style={{ containerType: "inline-size" }}
    >
      <div className="flex min-h-[2.25rem] items-center justify-center gap-1 text-[0.7rem] font-semibold uppercase leading-tight tracking-[0.12em] text-muted-foreground">
        <span>{label}</span>
        {definition || projection ? (
          <button
            type="button"
            aria-label={`Explain ${label}`}
            aria-expanded={definitionOpen}
            onClick={() => setDefinitionOpen((open) => !open)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-surface-2 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {definitionOpen && (definition || projection) ? (
        <div className="mb-1 rounded-lg border border-border bg-surface-2/70 px-3 py-2 text-left normal-case tracking-normal">
          {definition ? <p className="text-xs font-medium leading-relaxed text-foreground">{definition}</p> : null}
          {whyItMatters ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/75">Why it matters · </span>
              {whyItMatters}
            </p>
          ) : null}
          {projection ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/75">Projection · </span>
              {projection.label}{" "}
              <span className="font-semibold tabular-nums text-foreground">{projection.value}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <p
        className="mt-1 whitespace-nowrap font-display text-[clamp(1.15rem,13cqw,1.875rem)] font-semibold leading-none tracking-tight tabular-nums text-foreground"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </p>

      {!hasData ? (
        <div className="mt-2 inline-flex items-center gap-1 self-center rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
          <Minus className="h-3 w-3" />
          No data yet
        </div>
      ) : !hasComparison ? (
        // A 0.0% delta rendered in "good" green is a claim that nothing changed.
        // With no comparable prior window there is nothing to claim.
        <div className="mt-2 inline-flex items-center gap-1 self-center rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
          <Minus className="h-3 w-3" />
          No prior period
        </div>
      ) : (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-0.5 self-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold",
            good ? "bg-positive/12 text-positive" : "bg-destructive/12 text-destructive",
          )}
        >
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(delta).toFixed(1)}%
        </div>
      )}

      {hasData && hasComparison && deltaLabel ? (
        <p className="mt-1 text-[0.65rem] leading-tight text-muted-foreground">{deltaLabel}</p>
      ) : null}

      {sub ? <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p> : null}

      {record ? (
        <div
          title={record.tip}
          className={cn(
            "mt-2 inline-flex max-w-[94%] flex-col items-center gap-0.5 self-center rounded-2xl px-3 py-1 text-center leading-tight",
            record.favorable
              ? "bg-positive/15 text-positive ring-1 ring-positive/25"
              : "bg-destructive/15 text-destructive ring-1 ring-destructive/25",
          )}
        >
          <span className="inline-flex items-center gap-1 text-[0.62rem] font-semibold">
            {record.celebrate ? (
              <Sparkles className="h-3 w-3 shrink-0" />
            ) : record.high ? (
              <ArrowUpRight className="h-3 w-3 shrink-0" />
            ) : (
              <TrendingDown className="h-3 w-3 shrink-0" />
            )}
            {record.text}
          </span>
          {record.detail ? (
            <span className="text-[0.58rem] font-medium tabular-nums opacity-75">{record.detail}</span>
          ) : null}
        </div>
      ) : null}

      <div className="-mx-5 mt-auto">
        <div className="-mb-5 mt-2 h-12 opacity-90 transition-opacity duration-300 group-hover:opacity-100">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 72 }}>
            <AreaChart data={data} margin={{ top: 6, bottom: 0, left: 0, right: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
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
    </div>
  );
}
