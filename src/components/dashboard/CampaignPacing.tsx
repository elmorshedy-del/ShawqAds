import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, Gauge, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/EmptyState";

type PaceStatus = "stalled" | "over" | "under" | "stale" | "unknown" | "on_track" | "paused";

interface PaceRow {
  id: string;
  name: string;
  level: "campaign" | "adset";
  period: "day" | "flight";
  budget_type: "daily" | "lifetime";
  status: PaceStatus;
  actual: number;
  expected: number | null;
  budget: number;
  paceRatio: number | null;
  projected: number | null;
  remaining: number;
  curveSource?: "historical" | "linear" | "flight";
  baselineDays?: number;
  reason?: string;
  hourlyCurve?: {
    hour: number;
    label: string;
    actualHour: number;
    actualCumulative: number;
    expectedCumulative: number;
  }[];
}

interface CampaignPacingModel {
  configured: boolean;
  reason?: string;
  generatedAt?: string;
  timezone?: string;
  rows: PaceRow[];
  counts: Partial<Record<PaceStatus, number>>;
}

const money = (value: number | null | undefined) => {
  const amount = Number(value || 0);
  return Math.abs(amount) >= 1000 ? `$${(amount / 1000).toFixed(1)}k` : `$${Math.round(amount)}`;
};

const statusCopy: Record<PaceStatus, { label: string; tone: string }> = {
  stalled: { label: "Stalled", tone: "bg-destructive/10 text-destructive" },
  over: { label: "Ahead", tone: "bg-gold/10 text-gold" },
  under: { label: "Behind", tone: "bg-gold/10 text-gold" },
  stale: { label: "Stale", tone: "bg-surface-2 text-muted-foreground" },
  unknown: { label: "Needs schedule", tone: "bg-surface-2 text-muted-foreground" },
  on_track: { label: "On track", tone: "bg-positive/10 text-positive" },
  paused: { label: "Paused", tone: "bg-surface-2 text-muted-foreground" },
};

function StatusPill({ status }: { status: PaceStatus }) {
  const state = statusCopy[status] || statusCopy.unknown;
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", state.tone)}>
      {state.label}
    </span>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Gauge;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className={cn("h-4 w-4", tone)} />
      </div>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PacingTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="panel min-w-[190px] p-3 text-xs shadow-[var(--shadow-elegant)]">
      <p className="font-semibold">{label}</p>
      <div className="mt-2 space-y-1 text-muted-foreground">
        <p>Spend this hour <span className="float-right font-semibold text-foreground">{money(row.actualHour)}</span></p>
        <p>Actual cumulative <span className="float-right font-semibold text-foreground">{money(row.actualCumulative)}</span></p>
        <p>Expected cumulative <span className="float-right font-semibold text-foreground">{money(row.expectedCumulative)}</span></p>
      </div>
    </div>
  );
}

export function CampaignPacing({ model }: { model: CampaignPacingModel }) {
  const [selectedId, setSelectedId] = useState(model?.rows?.[0]?.id || "");
  useEffect(() => {
    if (!model?.rows?.some((row) => row.id === selectedId)) setSelectedId(model?.rows?.[0]?.id || "");
  }, [model?.rows, selectedId]);
  const selected = useMemo(
    () => model?.rows?.find((row) => row.id === selectedId) || model?.rows?.[0],
    [model?.rows, selectedId],
  );

  if (!model?.configured) {
    return (
      <section className="panel overflow-hidden">
        <header className="border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-semibold">Campaign pacing</h2>
          <p className="mt-1 text-xs text-muted-foreground">Meta campaign and ad-set budget delivery</p>
        </header>
        <EmptyState
          icon={Gauge}
          title="No campaign budget targets available"
          hint={model?.reason || "The Meta sync must return daily or lifetime budgets before pacing can be calculated."}
        />
      </section>
    );
  }

  const attention = (model.counts.stalled || 0) + (model.counts.over || 0) + (model.counts.under || 0);
  const generated = model.generatedAt
    ? new Date(model.generatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "unknown";

  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Gauge className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold">Campaign pacing</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Actual delivery against Meta daily or lifetime budgets · {model.timezone || "advertiser timezone"}
            </p>
          </div>
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">Checked {generated}</p>
      </header>

      <div className="grid grid-cols-2 gap-2.5 border-b border-border px-5 py-4 sm:grid-cols-4">
        <Summary icon={CheckCircle2} label="On track" value={model.counts.on_track || 0} tone="text-positive" />
        <Summary icon={AlertTriangle} label="Needs attention" value={attention} tone="text-gold" />
        <Summary icon={PauseCircle} label="Paused" value={model.counts.paused || 0} tone="text-muted-foreground" />
        <Summary icon={Gauge} label="Targets monitored" value={model.rows.length} tone="text-brand" />
      </div>

      <div className="divide-y divide-border/70">
        {model.rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setSelectedId(row.id)}
            aria-pressed={selected?.id === row.id}
            className={cn(
              "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-5 py-3.5 text-left transition-colors lg:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(90px,0.65fr))_auto]",
              selected?.id === row.id ? "bg-brand-soft/35" : "hover:bg-surface-2/40",
            )}
          >
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold">{row.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.level === "campaign" ? "Campaign" : "Ad set"} · {row.budget_type === "daily" ? "daily budget" : "lifetime flight"}
              </p>
            </div>
            <div className="self-center lg:hidden"><StatusPill status={row.status} /></div>
            <div className="hidden self-center lg:block">
              <p className="text-xs text-muted-foreground">Budget</p>
              <p className="text-sm font-semibold tabular-nums">{money(row.budget)}</p>
            </div>
            <div className="hidden self-center lg:block">
              <p className="text-xs text-muted-foreground">Actual</p>
              <p className="text-sm font-semibold tabular-nums">{money(row.actual)}</p>
            </div>
            <div className="hidden self-center lg:block">
              <p className="text-xs text-muted-foreground">Expected now</p>
              <p className="text-sm font-semibold tabular-nums">{row.expected == null ? "—" : money(row.expected)}</p>
            </div>
            <div className="hidden self-center lg:block">
              <p className="text-xs text-muted-foreground">Projected close</p>
              <p className="text-sm font-semibold tabular-nums">{row.projected == null ? "—" : money(row.projected)}</p>
            </div>
            <div className="hidden self-center lg:block"><StatusPill status={row.status} /></div>
          </button>
        ))}
      </div>

      {selected ? (
        <div className="border-t border-border px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-base font-semibold">{selected.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {selected.period === "day"
                  ? selected.curveSource === "historical"
                    ? `Expected curve learned from ${selected.baselineDays} completed delivery days.`
                    : "Not enough hourly history yet; expected delivery uses linear clock progress."
                  : "Lifetime budget compared with elapsed campaign flight."}
                {selected.reason ? ` ${selected.reason}` : ""}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-x-5 gap-y-1 text-right">
              <div>
                <p className="text-xs text-muted-foreground">Pace</p>
                <p className="text-sm font-semibold tabular-nums">{selected.paceRatio == null ? "—" : `${Math.round(selected.paceRatio * 100)}%`}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="text-sm font-semibold tabular-nums">{money(selected.remaining)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Projection</p>
                <p className="text-sm font-semibold tabular-nums">{selected.projected == null ? "—" : money(selected.projected)}</p>
              </div>
            </div>
          </div>

          {selected.period === "day" && selected.hourlyCurve?.length ? (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Intraday delivery profile
              </p>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 260 }}>
                  <ComposedChart data={selected.hourlyCurve} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={22} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(value) => money(Number(value))} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
                    <Tooltip content={<PacingTooltip />} />
                    <Bar dataKey="actualHour" name="Spend this hour" fill="var(--color-chart-4)" radius={[3, 3, 0, 0]} opacity={0.45} />
                    <Line dataKey="actualCumulative" name="Actual cumulative" stroke="var(--color-brand)" strokeWidth={2.5} dot={false} connectNulls />
                    <Line dataKey="expectedCumulative" name="Expected cumulative" stroke="var(--color-gold)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand" />Actual cumulative</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-gold" />Expected cumulative</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--color-chart-4)] opacity-60" />Hourly spend</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
