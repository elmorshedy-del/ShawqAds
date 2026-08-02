import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Gauge, TriangleAlert } from "lucide-react";
import {
  averageRoas,
  breakEvenSpend,
  marginalRoas,
  responseCurve,
} from "@/lib/spendResponse";
import { fmtCurrency } from "@/lib/dashboard-data";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { cn } from "@/lib/utils";

const money = (value: number) =>
  Math.abs(value) >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${Math.round(value)}`;

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative" | "watch";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 px-3.5 py-3">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-display text-xl font-semibold tabular-nums",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-destructive",
          tone === "watch" && "text-gold",
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[0.65rem] leading-snug text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function CurveTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const isObserved = row.observed != null;
  return (
    <div className="panel min-w-[190px] px-3.5 py-3 text-xs shadow-[var(--shadow-elegant)]">
      <p className="font-semibold">{money(row.spend)} / day</p>
      {isObserved ? (
        <p className="mt-1 text-muted-foreground">
          Actual day{row.date ? ` · ${row.date}` : ""}: {fmtCurrency(row.observed)} revenue
        </p>
      ) : null}
      {row.revenue != null ? (
        <div className="mt-2 space-y-1">
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Modelled revenue</span>
            <span className="font-semibold tabular-nums">{fmtCurrency(row.revenue)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Average ROAS</span>
            <span className="font-semibold tabular-nums">{row.average ? `${row.average.toFixed(2)}x` : "—"}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Next dollar returns</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                row.marginal >= 1 ? "text-positive" : "text-destructive",
              )}
            >
              {row.marginal.toFixed(2)}x
            </span>
          </div>
        </div>
      ) : null}
      {row.extrapolated ? (
        <p className="mt-2 border-t border-border pt-2 text-[0.65rem] leading-snug text-gold">
          Beyond any spend level tested — modelled, not measured.
        </p>
      ) : null}
    </div>
  );
}

export function SpendResponse({ fit, currentSpend }: { fit: any; currentSpend?: number }) {
  const spend = Number(currentSpend) || fit?.meanSpend || 0;

  const chart = useMemo(() => {
    if (!fit?.ok) return null;
    const be = breakEvenSpend(fit);
    // Plot at most 2.5x the highest spend ever tested. Extending all the way to a
    // distant break-even squeezes every measured day into the left fifth of the
    // chart and gives four fifths of the space to a region with no evidence in it.
    // The break-even figure still appears in the stat row, flagged as extrapolated.
    const ceiling = Math.max(fit.maxSpend * 2.5, spend * 1.4);
    const limit = be ? Math.min(be * 1.15, ceiling) : ceiling;
    const curve = responseCurve(fit, { maxSpend: limit, steps: 70 });
    const observedByBucket = new Map<number, any>();
    for (const point of fit.points || []) {
      observedByBucket.set(point.spend, point);
    }
    const merged: any[] = curve.map((c) => ({
      spend: Math.round(c.spend),
      revenue: c.revenue,
      marginal: c.marginal,
      average: c.average,
      extrapolated: c.extrapolated,
      // Solid inside the tested range, dashed beyond it.
      measured: c.extrapolated ? null : c.revenue,
      modelled: c.extrapolated ? c.revenue : null,
    }));
    // Join the two segments so the line has no visual gap at the handover.
    const lastMeasured = merged.filter((m) => m.measured != null).at(-1);
    if (lastMeasured) {
      const firstModelled = merged.find((m) => m.modelled != null);
      if (firstModelled) lastMeasured.modelled = lastMeasured.measured;
    }
    for (const point of fit.points || []) {
      merged.push({
        spend: Math.round(point.spend),
        observed: point.revenue,
        date: point.date,
      });
    }
    merged.sort((a, b) => a.spend - b.spend);
    return { data: merged, breakEven: be, limit };
  }, [fit, spend]);

  if (!fit?.ok) {
    return (
      <section className="panel overflow-hidden">
        <header className="border-b border-border px-6 py-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Gauge className="h-4 w-4" />
            </span>
            <h2 className="font-display text-lg font-semibold tracking-tight">Spend saturation</h2>
          </div>
        </header>
        <EmptyState
          icon={TriangleAlert}
          title="Not enough signal to model the response curve"
          hint={fit?.reason || "Needs several days of spend at varying levels before diminishing returns can be measured."}
        />
      </section>
    );
  }

  const marginal = marginalRoas(spend, fit);
  const average = averageRoas(spend, fit);
  const be = chart?.breakEven ?? null;
  const beIsExtrapolated = be != null && be > fit.maxSpend;

  return (
    <section className="panel overflow-hidden">
      <header className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Gauge className="h-4 w-4" />
          </span>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Spend saturation &amp; marginal return
          </h2>
        </div>
        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Daily revenue modelled against daily spend as a saturation curve. Blended ROAS averages
          every dollar including the cheap early ones; the <span className="font-medium text-foreground">marginal</span>{" "}
          line is what one more dollar buys at each spend level. Where it crosses 1.0x, extra budget
          stops adding contribution.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 px-6 py-4 lg:grid-cols-4">
        <Stat label="Spending now" value={`${money(spend)}/day`} sub={`${fit.n} days modelled`} />
        <Stat label="Blended ROAS" value={`${average.toFixed(2)}x`} sub="average across all spend" />
        <Stat
          label="Next dollar returns"
          value={`${marginal.toFixed(2)}x`}
          sub="marginal ROAS at current spend"
          tone={marginal >= 1.5 ? "positive" : marginal >= 1 ? "watch" : "negative"}
        />
        <Stat
          label="Break-even spend"
          value={be != null ? `${money(be)}/day` : "—"}
          sub={be == null ? "never reaches 1x" : beIsExtrapolated ? "extrapolated beyond tested range" : "where the next dollar returns 1x"}
          tone={be != null && spend > be ? "negative" : undefined}
        />
      </div>

      <div className="px-6 pb-2">
        <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Response curve · daily revenue vs daily spend
        </p>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart!.data} margin={{ left: 4, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 6" vertical={false} />
              {/* Everything to the right of the highest spend ever run is model, not measurement. */}
              <ReferenceArea
                x1={Math.round(fit.maxSpend)}
                x2={Math.round(chart!.limit)}
                fill="var(--color-gold)"
                fillOpacity={0.05}
              />
              <XAxis
                dataKey="spend"
                type="number"
                domain={[0, Math.round(chart!.limit)]}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                tickFormatter={(v) => money(Number(v))}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                tickFormatter={(v) => money(Number(v))}
              />
              <Tooltip content={<CurveTooltip />} cursor={{ stroke: "var(--color-border)" }} />
              <Area
                type="monotone"
                dataKey="measured"
                stroke="var(--color-brand)"
                strokeWidth={2.5}
                fill="var(--color-brand)"
                fillOpacity={0.08}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="modelled"
                stroke="var(--color-brand)"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Scatter dataKey="observed" fill="var(--color-chart-4)" isAnimationActive={false} />
              <ReferenceDot
                x={Math.round(spend)}
                y={(fit.vmax * spend) / (fit.k + spend)}
                r={6}
                fill="var(--color-brand)"
                stroke="var(--color-card)"
                strokeWidth={2}
              />
              {be != null && be <= chart!.limit ? (
                <ReferenceLine
                  x={Math.round(be)}
                  stroke="var(--color-destructive)"
                  strokeDasharray="4 4"
                  label={{
                    value: "next $1 = 1x",
                    position: "insideTopRight",
                    fill: "var(--color-destructive)",
                    fontSize: 10,
                  }}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="px-6 pb-5">
        <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Marginal return · what one more dollar buys
        </p>
        <div className="h-[170px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart!.data.filter((d) => d.marginal != null)} margin={{ left: 4, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 6" vertical={false} />
              <ReferenceArea
                x1={Math.round(fit.maxSpend)}
                x2={Math.round(chart!.limit)}
                fill="var(--color-gold)"
                fillOpacity={0.05}
              />
              <XAxis
                dataKey="spend"
                type="number"
                domain={[0, Math.round(chart!.limit)]}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                tickFormatter={(v) => money(Number(v))}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                tickFormatter={(v) => `${Number(v).toFixed(1)}x`}
              />
              <Tooltip content={<CurveTooltip />} cursor={{ stroke: "var(--color-border)" }} />
              {/* 1.0x is the whole point of this chart: above it a dollar adds
                  contribution, below it a dollar destroys it. */}
              <ReferenceLine
                y={1}
                stroke="var(--color-destructive)"
                strokeDasharray="4 4"
                label={{ value: "break-even 1.0x", position: "insideTopLeft", fill: "var(--color-destructive)", fontSize: 10 }}
              />
              <Line
                type="monotone"
                dataKey="marginal"
                stroke="var(--color-gold)"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
              <ReferenceDot
                x={Math.round(spend)}
                y={marginal}
                r={5}
                fill="var(--color-gold)"
                stroke="var(--color-card)"
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-[0.65rem] leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-gold" />
          <span>
            Michaelis-Menten fit on {fit.n} days, R² {fit.r2.toFixed(2)}. Tested spend ranged{" "}
            {money(fit.minSpend)}–{money(fit.maxSpend)}/day; the shaded band beyond that is
            extrapolation, so treat it as a direction to step toward rather than a target to jump to.
            The model assumes same-day response and no carryover between days.
          </span>
        </p>
      </div>
    </section>
  );
}
