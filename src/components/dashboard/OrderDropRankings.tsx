import { Globe2, Megaphone, TrendingDown } from "lucide-react";

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
  context?: 'ended-day' | 'selected-day';
}

function DropList({
  title,
  icon: Icon,
  rows,
  emptyLabel,
}: {
  title: string;
  icon: typeof Globe2;
  rows: DropRow[];
  emptyLabel: string;
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
            className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-surface-2/50 px-3 py-2.5 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug break-words">
                <span className="mr-1.5 text-xs font-semibold text-muted-foreground">{index + 1}.</span>
                {row.label}
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                {row.previous} → {row.current} orders
              </p>
            </div>
            <span className="shrink-0 font-display text-sm font-semibold tabular-nums text-destructive">
              {row.delta}
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
  context = 'ended-day',
}: OrderDropRankingsProps) {
  const title = context === 'ended-day' ? 'Yesterday\'s order drop' : 'What dragged orders down';
  const lead = context === 'ended-day'
    ? `The day that just ended (${day}) finished down ${Math.abs(Math.round(orderDeltaPct))}% vs ${prevDay}`
    : `${day} vs ${prevDay}`;

  return (
    <section className="panel overflow-hidden p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <TrendingDown className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
            <p className="text-xs text-muted-foreground">
              {lead} · {currentOrders} orders vs {previousOrders}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DropList title="Countries" icon={Globe2} rows={countries} emptyLabel="No country lost orders day over day" />
        <DropList title="Ads / sources" icon={Megaphone} rows={ads} emptyLabel="No attributed ad lost orders day over day" />
      </div>
    </section>
  );
}
