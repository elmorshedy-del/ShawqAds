import { useEffect, useState } from "react";
import { Check, Pencil, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const money = (value: number) =>
  Math.abs(value) >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${Math.round(value)}`;

export interface Pacing {
  configured: boolean;
  budget: number;
  totalDays: number;
  remainingDays: number;
  timeShare: number;
  spentToDate: number;
  dailyRate: number;
  projected: number;
  projectedVsBudget: number | null;
  budgetShare: number;
  paceIndex: number | null;
  remainingBudget: number;
  requiredDailyRate: number | null;
  status: "hot" | "cold" | "on_track" | "unknown";
  daysOfRunway: number | null;
}

const statusCopy: Record<string, { label: string; tone: string; bar: string }> = {
  hot: { label: "Running hot", tone: "text-destructive", bar: "var(--color-destructive)" },
  cold: { label: "Underspending", tone: "text-gold", bar: "var(--color-gold)" },
  on_track: { label: "On track", tone: "text-positive", bar: "var(--color-positive)" },
  unknown: { label: "No budget set", tone: "text-muted-foreground", bar: "var(--color-border)" },
};

export function BudgetPacing({
  pacing,
  budget,
  onBudgetChange,
}: {
  pacing: Pacing | null;
  budget: number;
  onBudgetChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(!budget);
  const [draft, setDraft] = useState(budget ? String(budget) : "");

  useEffect(() => {
    setDraft(budget ? String(budget) : "");
    if (budget) setEditing(false);
  }, [budget]);

  if (!pacing) return null;
  const state = statusCopy[pacing.status] ?? statusCopy.unknown;

  // Bar is scaled to whichever is larger — budget or projected — so an overspend
  // is visible as overflow rather than being clipped at 100%.
  const scale = Math.max(pacing.budget, pacing.projected, 1);
  const spentPct = (pacing.spentToDate / scale) * 100;
  const projectedPct = (pacing.projected / scale) * 100;
  const budgetPct = (pacing.budget / scale) * 100;
  const timePct = pacing.timeShare * 100 * (pacing.budget / scale);

  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Wallet className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">Budget pacing</h2>
            <p className="text-xs text-muted-foreground">
              Meta spend this month · {pacing.remainingDays.toFixed(1)} of {pacing.totalDays} days left
            </p>
          </div>
        </div>

        {editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = Number(draft);
              if (Number.isFinite(value) && value >= 0) onBudgetChange(value);
              setEditing(false);
            }}
          >
            <label className="sr-only" htmlFor="monthly-budget">
              Monthly ad budget in USD
            </label>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                id="monthly-budget"
                type="number"
                min={0}
                step={100}
                inputMode="numeric"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. 25000"
                className="w-24 bg-transparent text-sm tabular-nums outline-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-medium text-white"
            >
              <Check className="h-3.5 w-3.5" /> Set
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
            {money(pacing.budget)} / month
          </button>
        )}
      </header>

      {!pacing.configured ? (
        <div className="px-6 py-5 text-sm text-muted-foreground">
          Set a monthly ad budget to track pacing. Spend so far this month is{" "}
          <span className="font-semibold text-foreground">{money(pacing.spentToDate)}</span> at{" "}
          {money(pacing.dailyRate)}/day, projecting {money(pacing.projected)} by month end.
        </div>
      ) : (
        <div className="px-6 py-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={cn("font-display text-2xl font-semibold tabular-nums", state.tone)}>
              {state.label}
            </span>
            {pacing.paceIndex != null ? (
              <span className="text-sm text-muted-foreground">
                {Math.round(Math.abs(pacing.paceIndex - 1) * 100)}%{" "}
                {pacing.paceIndex >= 1 ? "ahead of" : "behind"} an even pace
              </span>
            ) : null}
          </div>

          <div className="mt-4">
            <div className="relative h-7 w-full overflow-hidden rounded-lg bg-surface-2">
              {/* Projected end position, sitting behind actual spend. */}
              <div
                className="absolute inset-y-0 left-0 rounded-lg opacity-30"
                style={{ width: `${Math.min(100, projectedPct)}%`, background: state.bar }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-lg"
                style={{ width: `${Math.min(100, spentPct)}%`, background: state.bar }}
              />
              {/* Where an even pace would have you today. */}
              <div
                className="absolute inset-y-0 w-0.5 bg-foreground/60"
                style={{ left: `${Math.min(100, timePct)}%` }}
                title="Where an even pace would be today"
              />
              {/* The budget line itself. */}
              {budgetPct < 100 ? (
                <div
                  className="absolute inset-y-0 w-0.5 bg-foreground"
                  style={{ left: `${budgetPct}%` }}
                  title="Monthly budget"
                />
              ) : null}
            </div>
            <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 text-[0.65rem] text-muted-foreground">
              <span>
                <span className="font-semibold text-foreground">{money(pacing.spentToDate)}</span> spent
                · {Math.round(pacing.budgetShare * 100)}% of budget
              </span>
              <span>
                even pace marker at {Math.round(pacing.timeShare * 100)}% of the month
              </span>
              <span>
                budget <span className="font-semibold text-foreground">{money(pacing.budget)}</span>
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cell label="Run rate" value={`${money(pacing.dailyRate)}/day`} sub="completed days only" />
            <Cell
              label="Projected"
              value={money(pacing.projected)}
              sub={
                pacing.projectedVsBudget != null
                  ? `${pacing.projectedVsBudget >= 0 ? "+" : "−"}${money(Math.abs(pacing.projectedVsBudget))} vs budget`
                  : undefined
              }
              tone={pacing.projectedVsBudget != null && pacing.projectedVsBudget > 0 ? "bad" : "good"}
            />
            <Cell
              label="To land on budget"
              value={
                pacing.requiredDailyRate != null && pacing.requiredDailyRate > 0
                  ? `${money(pacing.requiredDailyRate)}/day`
                  : "—"
              }
              sub={
                pacing.requiredDailyRate != null && pacing.requiredDailyRate <= 0
                  ? "budget already spent"
                  : "for the rest of the month"
              }
            />
            <Cell
              label="Runway"
              value={pacing.daysOfRunway != null ? `${pacing.daysOfRunway.toFixed(1)} days` : "—"}
              sub={
                pacing.daysOfRunway != null && pacing.daysOfRunway < pacing.remainingDays
                  ? "runs out before month end"
                  : "covers the month"
              }
              tone={
                pacing.daysOfRunway != null && pacing.daysOfRunway < pacing.remainingDays ? "bad" : "good"
              }
            />
          </div>
        </div>
      )}
    </section>
  );
}

function Cell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 px-3.5 py-2.5">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-display text-base font-semibold tabular-nums",
          tone === "bad" && "text-destructive",
          tone === "good" && "text-foreground",
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-[0.62rem] leading-snug text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
