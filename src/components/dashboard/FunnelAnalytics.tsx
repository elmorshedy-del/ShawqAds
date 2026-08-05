import { useState } from "react";
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
import { Filter, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// Muted, distinct palette for per-campaign lines. The account line uses the brand
// (or positive) accent and sits on top, so the campaign lines stay secondary.
const PALETTE = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#a855f7", "#14b8a6", "#ec4899",
];

interface Campaign {
  id: string;
  name: string;
}

interface MetricSummary {
  currentIndex: number | null;
  launchIndex: number | null;
  deltaVsBase: number | null;
  deltaSinceLaunch: number | null;
  currentRaw: number | null;
  baseRate: number | null;
  totalNum: number;
  totalDen: number;
}

interface MetricData {
  points: Array<Record<string, number | string | null>>;
  campaigns: Campaign[];
  summary: MetricSummary;
}

export interface FunnelData {
  dates: string[];
  window: number;
  launchDate: string;
  icAtc: MetricData;
  purchaseIc: MetricData;
  hasData: boolean;
}

const idxLabel = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : `${Math.round(v)}`;
const pctLabel = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : `${Math.round(v)}%`;
const mmdd = (d: string) => (d && d.length >= 10 ? d.slice(5) : d);

const countLabel = (value: number) => Math.round(value || 0).toLocaleString();

function StageFunnel({ data }: { data: FunnelData }) {
  const stages = [
    { label: "Added to cart", count: data.icAtc.summary.totalDen, color: "var(--color-brand)" },
    { label: "Started checkout", count: data.icAtc.summary.totalNum, color: "var(--color-chart-4)" },
    { label: "Purchased", count: data.purchaseIc.summary.totalNum, color: "var(--color-positive)" },
  ];
  const maxCount = Math.max(...stages.map((stage) => stage.count), 1);
  const hasAttributionMismatch = stages.some((stage, index) => index > 0 && stage.count > stages[index - 1].count);

  return (
    <div className="panel p-6">
      <div>
        <h3 className="font-display text-base font-semibold tracking-tight">Since-launch funnel</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Raw stage totals and step-to-step rates.</p>
      </div>
      <div className="mt-5 space-y-4">
        {stages.map((stage, index) => {
          const previous = stages[index - 1];
          const rate = previous?.count ? (stage.count / previous.count) * 100 : null;
          return (
            <div key={stage.label}>
              {previous ? (
                <p className="mb-1.5 text-right text-xs font-medium tabular-nums text-muted-foreground">
                  {pctLabel(rate)} of previous stage
                </p>
              ) : null}
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{stage.label}</span>
                <span className="font-display text-lg font-semibold tabular-nums">{countLabel(stage.count)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    background: stage.color,
                    width: `${Math.max(2, (stage.count / maxCount) * 100)}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {hasAttributionMismatch ? (
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Meta models add-to-cart and checkout on different attribution bases, so checkout totals can exceed add-to-cart totals.
        </p>
      ) : null}
    </div>
  );
}

interface FunnelTooltipPayloadItem {
  dataKey: string;
  value: number | null;
  color?: string;
  payload?: Record<string, number | string | null>;
}

interface FunnelTooltipProps {
  active?: boolean;
  payload?: FunnelTooltipPayloadItem[];
  label?: string;
  nameById: Record<string, string>;
  colorById: Record<string, string>;
  accent: string;
}

function FunnelTooltip({ active, payload, label, nameById, colorById, accent }: FunnelTooltipProps) {
  if (!active || !payload?.length) return null;
  const items = payload
    .filter((p) => p.value != null)
    .map((p) => {
      const raw = p.payload ? (p.payload[`${p.dataKey}__raw`] as number | null) : null;
      return {
        key: p.dataKey,
        isAccount: p.dataKey === "account",
        name: p.dataKey === "account" ? "Account (all campaigns)" : nameById[p.dataKey] || p.dataKey,
        color: p.dataKey === "account" ? accent : colorById[p.dataKey] || p.color,
        index: Number(p.value),
        raw,
      };
    })
    .sort((a, b) => (b.isAccount ? 1 : 0) - (a.isAccount ? 1 : 0) || b.index - a.index);
  if (!items.length) return null;
  return (
    <div className="panel min-w-[220px] px-3.5 py-3 text-xs shadow-[var(--shadow-elegant)]">
      <p className="mb-2 font-semibold text-foreground">{mmdd(label || "")}</p>
      <div className="space-y-1.5">
        {items.map((it) => (
          <div key={it.key} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: it.color }} />
              {it.name}
            </span>
            <span className={cn("font-semibold tabular-nums text-foreground", it.isAccount && "text-brand")}>
              {Math.round(it.index)}
              {it.raw != null ? <span className="font-normal text-muted-foreground"> · {Math.round(it.raw)}% raw</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FunnelChart({
  title,
  subtitle,
  accent,
  metric,
  showCampaigns,
}: {
  title: string;
  subtitle: string;
  accent: string;
  metric: MetricData;
  showCampaigns: boolean;
}) {
  const { points, campaigns } = metric;
  const nameById: Record<string, string> = {};
  const colorById: Record<string, string> = {};
  campaigns.forEach((c, i) => {
    nameById[c.id] = c.name;
    colorById[c.id] = PALETTE[i % PALETTE.length];
  });
  const hasSeries = points.some((p) => p.account != null);

  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className="font-display text-2xl font-semibold tabular-nums" style={{ color: accent }}>
          {idxLabel(metric.summary.currentIndex)}
        </span>
      </div>

      <div className="mt-5 h-[300px] w-full">
        {hasSeries ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 320 }}>
            <LineChart data={points} margin={{ left: -12, right: 10, top: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={mmdd}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                dy={6}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={40}
                domain={[0, "auto"]}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              />
              <Tooltip
                content={<FunnelTooltip nameById={nameById} colorById={colorById} accent={accent} />}
                cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
              />
              <ReferenceLine
                y={100}
                stroke="var(--color-muted-foreground)"
                strokeDasharray="4 5"
                strokeOpacity={0.6}
                label={{ value: "baseline 100", position: "insideTopRight", fill: "var(--color-muted-foreground)", fontSize: 10 }}
              />
              {showCampaigns ? campaigns.map((c) => (
                <Line
                  key={c.id}
                  type="monotone"
                  dataKey={c.id}
                  name={c.name}
                  stroke={colorById[c.id]}
                  strokeWidth={1.5}
                  strokeOpacity={0.85}
                  dot={false}
                  isAnimationActive
                  animationDuration={700}
                />
              )) : null}
              <Line
                type="monotone"
                dataKey="account"
                name="Account (all campaigns)"
                stroke={accent}
                strokeWidth={3}
                dot={false}
                connectNulls
                isAnimationActive
                animationDuration={850}
                activeDot={{ r: 5, stroke: "var(--color-card)", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Not enough funnel data yet for this step.
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="inline-flex items-center gap-2 font-semibold text-foreground">
          <span className="h-2.5 w-4 rounded-full" style={{ background: accent }} />
          Account (all campaigns)
        </span>
        {showCampaigns ? campaigns.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="h-2 w-3 rounded-full" style={{ background: colorById[c.id] }} />
            {c.name}
          </span>
        )) : null}
      </div>
    </div>
  );
}

export function FunnelAnalytics({ data }: { data: FunnelData }) {
  const [showCampaigns, setShowCampaigns] = useState(false);
  if (!data || !data.hasData) {
    return (
      <div className="panel flex flex-col items-center gap-3 p-10 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Filter className="h-5 w-5" />
        </span>
        <p className="font-display text-base font-semibold">Conversion funnel</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Waiting for Meta funnel actions (add-to-cart, checkout) and Shopify orders since the June 3 launch.
        </p>
      </div>
    );
  }
  const win = data.window || 7;
  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Filter className="h-4 w-4" />
            </span>
            <h2 className="font-display text-lg font-semibold tracking-tight">Conversion funnel</h2>
          </div>
          <button
            type="button"
            aria-pressed={showCampaigns}
            onClick={() => setShowCampaigns((shown) => !shown)}
            className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {showCampaigns ? "Hide campaign detail" : "Show campaign detail"}
          </button>
        </div>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Raw stage totals show volume; the trends below show whether conversion is improving relative to the launch baseline.
        </p>
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground/75">How the trend index works</summary>
          <p className="mt-2 max-w-3xl leading-relaxed">
            100 is the since-launch baseline. The {win}-day rolling rate is volume-weighted and stabilized for small samples.
            Meta uses different attribution bases for add-to-cart and checkout, while purchases are attributed Shopify orders,
            so the index is safer for trend comparison than treating the mixed-source raw ratios as exact probabilities.
          </p>
        </details>
      </div>

      <StageFunnel data={data} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <FunnelChart
          title="Checkout start rate"
          subtitle={`IC / ATC · indexed to launch (100) · ${win}-day rolling`}
          accent="var(--color-brand)"
          metric={data.icAtc}
          showCampaigns={showCampaigns}
        />
        <FunnelChart
          title="Purchase rate"
          subtitle={`Shopify orders / IC · indexed to launch (100) · ${win}-day rolling`}
          accent="var(--color-positive)"
          metric={data.purchaseIc}
          showCampaigns={showCampaigns}
        />
      </div>
    </section>
  );
}
