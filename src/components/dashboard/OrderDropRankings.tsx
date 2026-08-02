import type { ComponentType } from "react";
import { Globe2, Megaphone, TrendingDown, TrendingUp } from "lucide-react";

export interface DropRow {
  key: string;
  label: string;
  current: number;
  previous: number;
  delta: number;
}

export interface OrderDropRankingsProps {
  day: string;
  prevDay: string;
  currentOrders: number;
  previousOrders: number;
  orderDeltaPct: number;
  countries: DropRow[];
  ads: DropRow[];
  variant?: "daggers" | "rockets";
  sameTimePreviousDay?: boolean;
}

const VARIANTS = {
  daggers: {
    title: "Today's daggers",
    accent: "var(--color-destructive)",
    Icon: TrendingDown,
    badge: "Pulling down",
    emptyCountry: "No country lost orders",
    emptyAd: "No attributed ad lost orders",
    positive: false,
  },
  rockets: {
    title: "Today's rockets",
    accent: "var(--color-positive)",
    Icon: TrendingUp,
    badge: "Lifting up",
    emptyCountry: "No country gained orders",
    emptyAd: "No attributed ad gained orders",
    positive: true,
  },
} as const;

function formatShortDate(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function MoverList({
  title,
  icon: Icon,
  rows,
  emptyLabel,
  positive,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  rows: DropRow[];
  emptyLabel: string;
  positive: boolean;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {rows.length ? rows.map((row, index) => (
          <li
            key={row.key}
            className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-surface-2/50 px-3 py-2.5 text-sm transition-colors hover:bg-surface-2/80"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug break-words">
                <span className="mr-1.5 text-[0.65rem] font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                {row.label}
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                {row.previous} orders → {row.current}
              </p>
            </div>
            <span
              className={
                positive
                  ? "shrink-0 rounded-full bg-positive/10 px-2 py-0.5 font-display text-xs font-semibold tabular-nums text-positive"
                  : "shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 font-display text-xs font-semibold tabular-nums text-destructive"
              }
            >
              {row.delta > 0 ? `+${row.delta}` : row.delta}
            </span>
          </li>
        )) : (
          <li className="rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
            {emptyLabel}
          </li>
        )}
      </ul>
    </div>
  );
}

export function OrderDropRankings({
  day,
  prevDay,
  currentOrders,
  previousOrders,
  orderDeltaPct,
  countries,
  ads,
  variant = "daggers",
  sameTimePreviousDay = false,
}: OrderDropRankingsProps) {
  const config = VARIANTS[variant];
  const dayLabel = formatShortDate(day);
  const prevDayLabel = formatShortDate(prevDay);
  const movePct = Math.abs(Math.round(orderDeltaPct));
  const comparisonNote = sameTimePreviousDay ? "same time yesterday" : "full prior day";

  const subtitle = config.positive
    ? `${dayLabel} vs ${prevDayLabel} (${comparisonNote}) · ${currentOrders} orders vs ${previousOrders} (+${movePct}%)`
    : `${dayLabel} vs ${prevDayLabel} (${comparisonNote}) · ${currentOrders} orders vs ${previousOrders} (−${movePct}%)`;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in oklab, ${config.accent} 14%, var(--color-surface-2))`, color: config.accent }}
        >
          <config.Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold tracking-tight">{config.title}</h2>
          <p className="text-[0.7rem] leading-snug text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div
        className="panel relative overflow-hidden p-5"
        style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${config.accent} 5%, var(--color-card)), var(--color-card) 65%)` }}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5" style={{ background: config.accent }} />

        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.1em]"
            style={{
              background: `color-mix(in oklab, ${config.accent} 12%, transparent)`,
              color: config.accent,
            }}
          >
            {config.badge}
          </span>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Top 3 movers
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:max-w-md">
          <div className="rounded-xl border border-border bg-surface-2/40 px-3.5 py-3">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{dayLabel}</p>
            <p className="mt-1 font-display text-lg font-semibold tabular-nums tracking-tight">{currentOrders}</p>
            <p className="mt-0.5 text-[0.65rem] text-muted-foreground">orders</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2/40 px-3.5 py-3">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{prevDayLabel}</p>
            <p className="mt-1 font-display text-lg font-semibold tabular-nums tracking-tight">{previousOrders}</p>
            <p className="mt-0.5 text-[0.65rem] text-muted-foreground">orders ({comparisonNote})</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
          <MoverList
            title="Countries"
            icon={Globe2}
            rows={countries}
            emptyLabel={config.emptyCountry}
            positive={config.positive}
          />
          <MoverList
            title="Ads / sources"
            icon={Megaphone}
            rows={ads}
            emptyLabel={config.emptyAd}
            positive={config.positive}
          />
        </div>
      </div>
    </section>
  );
}
