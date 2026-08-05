import { Clock4, Globe2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { CUSTOMER_CLOCK_MIN_ORDERS, formatHourWindow } from "@/lib/customerClock";
import { EmptyState } from "@/components/dashboard/EmptyState";

interface HourBucket {
  hour: number;
  orders: number;
  revenue: number;
}
interface WeekdayBucket {
  index: number;
  name: string;
  short: string;
  orders: number;
}
export interface CustomerClockData {
  totalOrders: number;
  mapped: number;
  unmapped: number;
  approximate: number;
  unmappedCountries: string[];
  disagreementRate: number;
  hours: HourBucket[];
  weekdays: WeekdayBucket[];
  merchantWeekdays: WeekdayBucket[];
  peakWindow: { start: number; end: number; width: number; orders: number; share: number } | null;
  merchantZone: string;
}

const pad = (hour: number) => String(hour).padStart(2, "0");

function inWindow(hour: number, window: CustomerClockData["peakWindow"]) {
  if (!window) return false;
  for (let offset = 0; offset < window.width; offset += 1) {
    if ((window.start + offset) % 24 === hour) return true;
  }
  return false;
}

function WeekdayRow({
  label,
  rows,
  tone,
}: {
  label: string;
  rows: WeekdayBucket[];
  tone: "customer" | "merchant";
}) {
  const max = Math.max(...rows.map((r) => r.orders), 1);
  const top = rows.reduce((best, row) => (row.orders > best.orders ? row : best), rows[0]);
  return (
    <div>
      <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <div className="flex items-end gap-1.5">
        {rows.map((row) => {
          const isTop = row.index === top.index && row.orders > 0;
          return (
            <div key={row.index} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span
                className={cn(
                  "text-[0.6rem] tabular-nums",
                  isTop ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {row.orders}
              </span>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${Math.max(3, (row.orders / max) * 56)}px`,
                  background: isTop
                    ? tone === "customer"
                      ? "var(--color-brand)"
                      : "var(--color-muted-foreground)"
                    : tone === "customer"
                      ? "color-mix(in oklch, var(--color-brand) 32%, transparent)"
                      : "var(--color-border)",
                }}
              />
              <span
                className={cn(
                  "text-[0.6rem]",
                  isTop ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {row.short}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CustomerClock({ data }: { data: CustomerClockData }) {
  if (!data || !data.mapped) {
    return (
      <section className="panel overflow-hidden">
        <EmptyState
          icon={Clock4}
          title="No orders with timestamps in this window"
          hint="Customer-local timing needs paid orders carrying a created-at timestamp and a destination country."
        />
      </section>
    );
  }
  if (data.mapped < CUSTOMER_CLOCK_MIN_ORDERS) {
    return (
      <section className="panel overflow-hidden">
        <EmptyState
          icon={Clock4}
          title="Not enough orders for a timing pattern"
          hint={`${data.mapped} mapped orders in this window. Widen the date window to at least ${CUSTOMER_CLOCK_MIN_ORDERS} orders before using hour or weekday patterns.`}
        />
      </section>
    );
  }

  const maxHour = Math.max(...data.hours.map((h) => h.orders), 1);
  const peak = data.peakWindow;
  const customerTop = data.weekdays.reduce((best, row) => (row.orders > best.orders ? row : best), data.weekdays[0]);
  const merchantTop = data.merchantWeekdays.reduce(
    (best, row) => (row.orders > best.orders ? row : best),
    data.merchantWeekdays[0],
  );
  const daysDisagree = customerTop.index !== merchantTop.index;

  return (
    <section className="panel overflow-hidden">
      <header className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Globe2 className="h-4 w-4" />
          </span>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            When purchases complete in customer-local time
          </h2>
        </div>
        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Every other time view buckets orders on the merchant clock ({data.merchantZone}).
          This view re-buckets purchase-completion timestamps using a representative timezone
          for each destination country. It is an observational scheduling signal, not proof of
          when conversion propensity is highest.
        </p>
      </header>

      {peak ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-brand-soft/40 px-6 py-4">
          <span className="font-display text-2xl font-semibold tracking-tight text-brand tabular-nums">
            {formatHourWindow(peak)}
          </span>
          <span className="text-sm text-foreground">
            is the peak completion window — {Math.round(peak.share * 100)}% of orders in {peak.width} hours
          </span>
        </div>
      ) : null}

      <div className="px-6 py-5">
        <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Orders by customer-local hour
        </p>
        <div className="flex items-end gap-[3px]">
          {data.hours.map((bucket) => {
            const hot = inWindow(bucket.hour, peak);
            return (
              <div
                key={bucket.hour}
                title={`${pad(bucket.hour)}:00 local · ${bucket.orders} order${bucket.orders === 1 ? "" : "s"}`}
                className="flex min-w-0 flex-1 flex-col items-center gap-1"
              >
                <div
                  className="w-full rounded-t transition-[height]"
                  style={{
                    height: `${Math.max(2, (bucket.orders / maxHour) * 72)}px`,
                    background: hot
                      ? "var(--color-brand)"
                      : "color-mix(in oklch, var(--color-brand) 22%, transparent)",
                  }}
                />
                {bucket.hour % 3 === 0 ? (
                  <span className="text-[0.55rem] tabular-nums text-muted-foreground">
                    {pad(bucket.hour)}
                  </span>
                ) : (
                  <span className="text-[0.55rem] text-transparent">·</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Explicitly "total orders": the weekday chart above this panel ranks by
              average orders per occurrence, so an unlabelled ranking here would read as
              a contradiction rather than a different, deliberate measure. Totals are the
              right basis for this comparison — the point is where orders physically
              land, and averaging over one or two occurrences is the unreliable part. */}
          <WeekdayRow label="Customer-local weekday · total orders" rows={data.weekdays} tone="customer" />
          <WeekdayRow
            label={`Merchant weekday (${data.merchantZone.split("/")[1] ?? data.merchantZone}) · total orders`}
            rows={data.merchantWeekdays}
            tone="merchant"
          />
        </div>

        {daysDisagree ? (
          // The whole point of the panel: the two clocks can crown different days,
          // and every other weekday view in the product only shows the merchant one.
          <p className="mt-4 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2.5 text-xs leading-relaxed text-foreground">
            <span className="font-semibold">The two clocks disagree.</span> By total orders the books
            make <span className="font-semibold">{merchantTop.name}</span> the strongest day; in
            customer time it is <span className="font-semibold">{customerTop.name}</span>.{" "}
            {Math.round(data.disagreementRate * 100)}% of orders sit on a different weekday for the
            buyer than in the reporting day they were booked into. Treat the customer view as a test
            hypothesis, not a scheduling instruction.
          </p>
        ) : null}

        <p className="mt-3 flex items-start gap-1.5 text-[0.65rem] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {data.mapped} of {data.totalOrders} orders mapped to a customer timezone
            {data.approximate
              ? `, ${data.approximate} of them approximate — countries spanning several zones (US, Canada, Australia, Spain) use their most-populous zone`
              : ""}
            {data.unmapped
              ? `. ${data.unmapped} unmapped${data.unmappedCountries.length ? ` (${data.unmappedCountries.join(", ")})` : ""}`
              : ""}
            . Daily revenue, spend and ROAS are unaffected — Meta and Shopify both report on the
            merchant clock, so those ratios stay internally consistent.
          </span>
        </p>
      </div>
    </section>
  );
}
