import { useMemo, useState, type ReactNode } from "react";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";
import { BarChart3, CalendarRange, Lightbulb, TrendingUp } from "lucide-react";
import { fmtNumber } from "@/lib/dashboard-data";
import { buildHistoricalInsights, HISTORICAL_SCOPES, WEEK_BUCKETS } from "@/lib/historicalInsights.js";
import { cn } from "@/lib/utils";

const ACCENT = "var(--color-brand)";

type Scope = "last_month" | "last_3_months" | "launch" | "all_time";

export interface HistoricalDailyRow {
  date: string;
  orders: number;
}

export interface HistoricalInsightsProps {
  daily?: HistoricalDailyRow[];
  developingDay?: string | null;
  timezone?: string;
}

const nivoTheme = {
  background: "transparent",
  text: { fill: "var(--color-muted-foreground)", fontSize: 11 },
  axis: {
    domain: { line: { stroke: "var(--color-border)", strokeWidth: 1 } },
    ticks: {
      line: { stroke: "var(--color-border)", strokeWidth: 1 },
      text: { fill: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 600 },
    },
    legend: { text: { fill: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 700 } },
  },
  grid: { line: { stroke: "var(--color-border)", strokeWidth: 1, strokeOpacity: 0.45 } },
  tooltip: {
    container: {
      background: "var(--color-card)",
      color: "var(--color-foreground)",
      fontSize: 12,
      borderRadius: 12,
      border: "1px solid var(--color-border)",
      boxShadow: "var(--shadow-elegant)",
    },
  },
};

function fmtAvg(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(1);
}

function confidenceTone(confidence: string) {
  if (confidence === "high") return "border-positive/30 bg-positive/5 text-positive";
  if (confidence === "medium") return "border-brand/30 bg-brand-soft/40 text-brand";
  return "border-border bg-surface-2/60 text-muted-foreground";
}

function pValueTone(significant?: boolean) {
  return significant ? "text-positive font-semibold" : "text-muted-foreground";
}

export function HistoricalInsights({
  daily = [],
  developingDay = null,
  timezone = "Europe/Istanbul",
}: HistoricalInsightsProps) {
  const [scope, setScope] = useState<Scope>("all_time");

  const insights = useMemo(
    () => buildHistoricalInsights(daily, scope, { developingDay, timeZone: timezone }),
    [daily, scope, developingDay, timezone],
  );

  const weekdayChart = insights.weekdayTable.map((row) => ({
    day: row.weekdayShort,
    avgOrders: row.mean ?? 0,
    totalOrders: row.total,
    occurrences: row.n,
  }));

  const monthTrend = insights.monthlyTable.map((month) => ({
    x: month.monthLabel.replace(" 2026", ""),
    y: month.avgDailyOrders ?? 0,
  }));

  const weekKeys = WEEK_BUCKETS.map((b) => b.key);
  const groupedMonthData = insights.monthlyTable.map((month) => {
    const row: Record<string, string | number> = { month: month.monthLabel.replace(" 2026", "") };
    weekKeys.forEach((key) => {
      const bucket = month.weekBuckets[key];
      row[key] = bucket?.hasSufficientData ? bucket.mean ?? 0 : 0;
    });
    return row;
  });

  const hasData = insights.dateRange.daysWithData > 0;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: `color-mix(in oklab, ${ACCENT} 14%, white)`, color: ACCENT }}
          >
            <BarChart3 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">Historical insights</h2>
            <p className="text-[0.7rem] text-muted-foreground">
              Shopify paid orders only · not Meta purchase metrics · {insights.meta.scopeLabel}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {HISTORICAL_SCOPES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setScope(item.key as Scope)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] transition-colors",
                scope === item.key ? "bg-brand text-white shadow-sm" : "bg-surface-2 text-muted-foreground hover:bg-surface-2/80",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="panel relative overflow-hidden p-5"
        style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${ACCENT} 5%, var(--color-card)), var(--color-card) 65%)` }}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5" style={{ background: ACCENT }} />

        {!hasData ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
            No Shopify daily history from February yet. Production must set{" "}
            <span className="font-medium text-foreground">SHOPIFY_BACKFILL_START_DATE=2026-02-01</span>{" "}
            (Shopify fetch is independent of Meta{" "}
            <span className="font-medium text-foreground">BACKFILL_START_DATE</span>) and refresh Shopify data.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
              <StatTile label="Total orders" value={fmtNumber(insights.summary.totalOrders)} sub={`${insights.dateRange.daysWithData} days`} />
              <StatTile label="Avg daily orders" value={fmtAvg(insights.summary.avgDailyOrders)} sub={`Median ${fmtAvg(insights.summary.medianDailyOrders)}`} />
              <StatTile label="28-day rolling avg" value={fmtAvg(insights.summary.rolling28DayAvg)} sub="Last 28 complete days" />
              <StatTile label="Peak day" value={insights.summary.peakDay ? fmtNumber(insights.summary.peakDay.orders) : "—"} sub={insights.summary.peakDay?.date || "No peak"} />
              <StatTile
                label="Weekday effect p"
                value={insights.statistics?.weekdayEffect?.pValueLabel ?? "—"}
                sub={insights.statistics?.weekdayEffect?.significant ? "Kruskal-Wallis · significant" : "Kruskal-Wallis · α = 0.05"}
                valueClassName={pValueTone(insights.statistics?.weekdayEffect?.significant)}
              />
            </div>

            {insights.insights.length ? (
              <div className="mt-4 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {insights.insights.slice(0, 4).map((card) => (
                  <div key={card.id} className="rounded-xl border border-border/70 bg-surface-2/40 px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        <Lightbulb className="h-3.5 w-3.5" style={{ color: ACCENT }} /> Insight
                      </p>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {"pValueLabel" in card && card.pValueLabel ? (
                          <span className={cn("rounded-full border px-2 py-0.5 text-[0.55rem] font-semibold tabular-nums tracking-[0.04em]", card.significant ? "border-positive/30 bg-positive/5 text-positive" : "border-border bg-surface-2/60 text-muted-foreground")}>
                            p = {card.pValueLabel}
                          </span>
                        ) : null}
                        <span className={cn("rounded-full border px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.08em]", confidenceTone(card.confidence))}>
                          {card.confidence}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 font-display text-sm font-semibold leading-snug">{card.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.body}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
              <ChartPanel
                title="Orders by weekday"
                subtitle={`Average orders per calendar day · Kruskal-Wallis p = ${insights.statistics?.weekdayEffect?.pValueLabel ?? "—"}`}
              >
                <div className="h-[260px]">
                  <ResponsiveBar
                    data={weekdayChart}
                    keys={["avgOrders"]}
                    indexBy="day"
                    theme={nivoTheme}
                    margin={{ top: 12, right: 12, bottom: 36, left: 44 }}
                    padding={0.35}
                    colors={[ACCENT]}
                    borderRadius={8}
                    enableLabel={false}
                    axisBottom={{ tickSize: 0, tickPadding: 8 }}
                    axisLeft={{ tickSize: 0, tickPadding: 8 }}
                    tooltip={({ indexValue, value, data }) => (
                      <div className="px-3 py-2 text-xs">
                        <strong>{indexValue}</strong>
                        <div>Avg {Number(value).toFixed(1)} orders/day</div>
                        <div className="text-muted-foreground">{data.totalOrders} total · {data.occurrences} days</div>
                      </div>
                    )}
                  />
                </div>
              </ChartPanel>

              <ChartPanel title="Monthly order rhythm" subtitle="Avg daily orders by calendar month">
                {/* One month is a dot, not a rhythm. A single floating point on a line
                    chart reads as a broken chart rather than as "not enough months yet". */}
                {monthTrend.length < 2 ? (
                  <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-muted-foreground">
                      <CalendarRange className="h-4.5 w-4.5" />
                    </span>
                    <p className="text-sm font-medium">
                      {monthTrend.length === 1
                        ? `Only ${monthTrend[0].x} has data so far`
                        : "No complete months yet"}
                    </p>
                    <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                      Month-over-month rhythm needs at least two complete months. The weekday and
                      week-of-month views below already work on this data.
                    </p>
                  </div>
                ) : (
                <div className="h-[260px]">
                  <ResponsiveLine
                    data={[{ id: "Avg daily orders", data: monthTrend }]}
                    theme={nivoTheme}
                    margin={{ top: 12, right: 12, bottom: 36, left: 44 }}
                    xScale={{ type: "point" }}
                    yScale={{ type: "linear", min: 0, stacked: false }}
                    curve="monotoneX"
                    colors={[ACCENT]}
                    lineWidth={3}
                    pointSize={8}
                    pointBorderWidth={2}
                    pointBorderColor="var(--color-card)"
                    enableArea
                    areaOpacity={0.12}
                    axisBottom={{ tickSize: 0, tickPadding: 8 }}
                    axisLeft={{ tickSize: 0, tickPadding: 8 }}
                    useMesh
                    tooltip={({ point }) => (
                      <div className="px-3 py-2 text-xs">
                        <strong>{point.data.xFormatted}</strong>
                        <div>{Number(point.data.yFormatted).toFixed(1)} avg orders/day</div>
                      </div>
                    )}
                  />
                </div>
                )}
              </ChartPanel>
            </div>

            <div className="mt-5">
              <ChartPanel title="Week-of-month pattern" subtitle="Avg daily orders · W1–W4 buckets within each month (Nivo grouped bars)">
                <div className="h-[280px]">
                  <ResponsiveBar
                    data={groupedMonthData}
                    keys={weekKeys}
                    indexBy="month"
                    groupMode="grouped"
                    theme={nivoTheme}
                    margin={{ top: 12, right: 12, bottom: 36, left: 44 }}
                    padding={0.18}
                    innerPadding={4}
                    colors={["#c084fc", "#818cf8", "#38bdf8", "#34d399"]}
                    borderRadius={6}
                    enableLabel={false}
                    axisBottom={{ tickSize: 0, tickPadding: 8 }}
                    axisLeft={{ tickSize: 0, tickPadding: 8 }}
                    legends={[
                      {
                        dataFrom: "keys",
                        anchor: "top-right",
                        direction: "row",
                        translateY: -4,
                        itemWidth: 52,
                        itemHeight: 16,
                        symbolSize: 10,
                        symbolShape: "circle",
                      },
                    ]}
                  />
                </div>
              </ChartPanel>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div>
                <SectionHeading icon={CalendarRange} title="Month × week averages" />
                <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-surface-2/70 text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">Month</th>
                        {WEEK_BUCKETS.map((bucket) => (
                          <th key={bucket.key} className="px-3 py-2.5 font-semibold">{bucket.key}</th>
                        ))}
                        <th className="px-3 py-2.5 font-semibold">MoM</th>
                        <th className="px-3 py-2.5 font-semibold">p</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insights.monthlyTable.map((month) => (
                        <tr key={month.monthKey} className="border-t border-border/70">
                          <td className="px-3 py-2.5 font-medium">
                            {month.monthLabel.replace(" 2026", "")}
                            {month.isPartial ? <span className="ml-1 text-[0.6rem] text-muted-foreground">partial</span> : null}
                          </td>
                          {WEEK_BUCKETS.map((bucket) => {
                            const cell = month.weekBuckets[bucket.key];
                            return (
                              <td key={bucket.key} className="px-3 py-2.5 tabular-nums text-muted-foreground">
                                {cell?.hasSufficientData ? fmtAvg(cell.mean) : "—"}
                              </td>
                            );
                          })}
                          <td className={cn("px-3 py-2.5 tabular-nums font-medium", (month.momChangePercent ?? 0) >= 0 ? "text-positive" : "text-destructive")}>
                            {month.momChangePercent != null ? `${month.momChangePercent > 0 ? "+" : ""}${month.momChangePercent.toFixed(0)}%` : "—"}
                          </td>
                          <td className={cn("px-3 py-2.5 tabular-nums text-xs", pValueTone(month.momSignificant))}>
                            {month.momPValueLabel ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <SectionHeading icon={TrendingUp} title="Weekday detail" />
                <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-surface-2/70 text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">Day</th>
                        {/* Without the occurrence count a Monday seen once sits next to a
                            Wednesday seen twice with no visible difference in weight, and
                            "27.0 avg" reads as a stable average rather than a single day. */}
                        <th className="px-3 py-2.5 font-semibold">Days</th>
                        <th className="px-3 py-2.5 font-semibold">Total</th>
                        <th className="px-3 py-2.5 font-semibold">Avg/day</th>
                        <th className="px-3 py-2.5 font-semibold">vs mean</th>
                        <th className="px-3 py-2.5 font-semibold">p (adj.)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insights.weekdayTable.map((row) => (
                        <tr
                          key={row.weekday}
                          className={cn("border-t border-border/70", !row.hasSufficientData && "opacity-60")}
                          title={row.hasSufficientData ? undefined : `Only ${row.n} occurrence${row.n === 1 ? "" : "s"} — too few to read as an average`}
                        >
                          <td className="px-3 py-2.5 font-medium">{row.weekdayName}</td>
                          <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{fmtNumber(row.n)}</td>
                          <td className="px-3 py-2.5 tabular-nums">{fmtNumber(row.total)}</td>
                          <td className="px-3 py-2.5 tabular-nums">{fmtAvg(row.mean)}</td>
                          <td
                            className={cn(
                              "px-3 py-2.5 tabular-nums",
                              !row.hasSufficientData
                                ? "text-muted-foreground"
                                : (row.deviationFromWeeklyMean ?? 0) >= 0
                                  ? "text-positive"
                                  : "text-destructive",
                            )}
                          >
                            {row.deviationFromWeeklyMean != null ? `${row.deviationFromWeeklyMean > 0 ? "+" : ""}${row.deviationFromWeeklyMean.toFixed(0)}%` : "—"}
                          </td>
                          <td className={cn("px-3 py-2.5 tabular-nums text-xs", pValueTone(row.significant))}>
                            {row.pValueLabel ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {insights.caveats.length ? (
              <ul className="mt-4 space-y-1.5">
                {insights.caveats.map((caveat) => (
                  <li key={caveat.id} className="rounded-lg bg-surface-2/50 px-3 py-2 text-[0.7rem] leading-relaxed text-muted-foreground">
                    {caveat.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function StatTile({ label, value, sub, valueClassName }: { label: string; value: string; sub?: string; valueClassName?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 px-3.5 py-3">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-display text-lg font-semibold tabular-nums tracking-tight", valueClassName)}>{value}</p>
      {sub ? <p className="mt-0.5 text-[0.65rem] leading-snug text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function ChartPanel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-4">
      <p className="font-display text-sm font-semibold tracking-tight">{title}</p>
      <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{subtitle}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SectionHeading({ icon: Icon, title }: { icon: typeof CalendarRange; title: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {title}
    </p>
  );
}
