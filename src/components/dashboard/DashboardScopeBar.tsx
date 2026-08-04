import { AlertTriangle, CalendarRange, Database } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardScopeBarProps {
  range: { since?: string; until?: string };
  presetLabel: string;
  metaUntil?: string;
  shopifyUntil?: string;
  laggingSource?: string;
  revenueScope: string;
  onRevenueScopeChange: (scope: string) => void;
}

function dateLabel(range: DashboardScopeBarProps["range"]) {
  if (!range.since || !range.until) return "No selected dates";
  return range.since === range.until ? range.since : `${range.since} → ${range.until}`;
}

export function DashboardScopeBar({
  range,
  presetLabel,
  metaUntil,
  shopifyUntil,
  laggingSource,
  revenueScope,
  onRevenueScopeChange,
}: DashboardScopeBarProps) {
  const matchedThrough = [metaUntil, shopifyUntil].filter(Boolean).sort()[0] || "";

  return (
    <section className="panel flex flex-col gap-3 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarRange className="h-4 w-4 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Selected window · {presetLabel}
            </p>
            <p className="truncate text-xs font-medium tabular-nums text-foreground">{dateLabel(range)}</p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          {laggingSource ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-gold" />
          ) : (
            <Database className="h-4 w-4 shrink-0 text-positive" />
          )}
          <div>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Matched coverage
            </p>
            <p className={cn("text-xs font-medium tabular-nums", laggingSource ? "text-gold" : "text-foreground")}>
              {matchedThrough
                ? `Meta + Shopify through ${matchedThrough}`
                : "Waiting for both sources"}
              {laggingSource ? ` · ${laggingSource} is behind` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Revenue scope
        </span>
        <div className="inline-flex rounded-full border border-border bg-surface-2 p-1 text-xs">
          {[
            ["shopify_email", "All Shopify orders"],
            ["shopify", "Exclude email"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onRevenueScopeChange(value)}
              aria-pressed={revenueScope === value}
              className={cn(
                "rounded-full px-3 py-1 font-medium transition-all",
                revenueScope === value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
