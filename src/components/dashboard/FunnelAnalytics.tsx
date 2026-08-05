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
import { Filter, TrendingDown, TrendingUp } from "lucide-react";
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

function SummaryCard({
  accent,
  badge,
  title,
  explainer,
  summary,
}: {
  accent: string;
  badge: string;
  title: string;
  explainer: string;
  summary: MetricSummary;
}) {
  const { currentIndex, deltaVsBase, baseRate, currentRaw } = summary;
  const flat = !deltaVsBase;
  const up = (deltaVsBase ?? 0) > 0;
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-muted-foreground">
          {badge}
        </span>
      </div>
      <div className="mt-3 flex items-end gap-3">
        <span className="font-display text-4xl font-semibold tracking-tight tabular-nums" style={{ color: accent }}>
          {idxLabel(currentIndex)}
        </span>
        {deltaVsBase != null ? (
          <span
            className={cn(
              "mb-1.5 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold tabular-nums",
              flat ? "text-muted-foreground" : up ? "text-positive" : "text-destructive",
            )}
          >
            {flat ? null : up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {up ? "+" : ""}
            {Math.round(deltaVsBase)} vs base
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{explainer}</p>
      <p className="mt-3 text-xs text-muted-foreground">
        100 = launch baseline · base rate{" "}
        <span className="font-medium tabular-nums text-foreground">{pctLabel(baseRate)}</span>
        {currentRaw != null ? (
          <>
            {" · now "}
            <span className="font-medium tabular-nums text-foreground">{pctLabel(currentRaw)}</span>
            {" raw"}
          </>
        ) : null}
      </p>
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
}: {
  title: string;
  subtitle: string;
  accent: string;
  metric: MetricData;
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
              {campaigns.map((c) => (
                <Line
                  key={c.id}
                  type="monotone"
                  dataKey={c.id}
                  name={c.name}
                  stroke={colorById[c.id]}
                  strokeWidth={1.5}
                  strokeOpacity={0.85}
                  dot={false}
                  connectNulls
                  isAnimationActive
                  animationDuration={700}
                />
              ))}
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
        {campaigns.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="h-2 w-3 rounded-full" style={{ background: colorById[c.id] }} />
            {c.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function FunnelAnalytics({ data }: { data: FunnelData }) {
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
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Filter className="h-4 w-4" />
          </span>
          <h2 className="font-display text-lg font-semibold tracking-tight">Conversion funnel</h2>
        </div>
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
          Add-to-cart → checkout → purchase since the June 3 launch. Because Meta counts ATC and checkout on
          different attribution bases (the raw ratio can exceed 100%), each rate is shown as an <strong>index grounded
          to the launch baseline = 100</strong> — bias-normalized, volume-weighted across campaigns, {win}-day rolling
          and shrinkage-stabilized. Above 100 = converting better than launch. Purchases are Shopify orders
          attributed to a Meta campaign (account = all ad-attributed orders; per-campaign = its own). Raw % is in each tooltip.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryCard
          accent="var(--color-brand)"
          badge="IC / ATC"
          title="Checkout start rate"
          explainer="Add-to-carts that go on to begin checkout, indexed to launch."
          summary={data.icAtc.summary}
        />
        <SummaryCard
          accent="var(--color-positive)"
          badge="Purchase / IC"
          title="Purchase rate"
          explainer="Started checkouts that convert to an ad-attributed Shopify order, indexed to launch."
          summary={data.purchaseIc.summary}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <FunnelChart
          title="Checkout start rate"
          subtitle={`IC / ATC · indexed to launch (100) · ${win}-day rolling`}
          accent="var(--color-brand)"
          metric={data.icAtc}
        />
        <FunnelChart
          title="Purchase rate"
          subtitle={`Shopify orders / IC · indexed to launch (100) · ${win}-day rolling`}
          accent="var(--color-positive)"
          metric={data.purchaseIc}
        />
      </div>
    </section>
  );
}
