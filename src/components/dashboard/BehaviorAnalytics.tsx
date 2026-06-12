import { useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BehaviorStep {
  products?: any[];
  countries?: any[];
  gender?: any[];
  global?: { rate?: number };
}
interface BehaviorData {
  period?: { since?: string; until?: string };
  extraction?: Record<string, any>;
  matrix?: { checkout?: BehaviorStep; submit_payment?: BehaviorStep };
  dwell_pages?: any[];
  journeys?: { steps?: any[] };
}

function countryFlag(code?: string) {
  const cc = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "•";
  return [...cc].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join("");
}

function rateLabel(value: any) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value || 0) * 100)}%` : "n/a";
}

function confidenceChip(value?: string) {
  const v = String(value || "").toLowerCase();
  if (v.includes("high")) return "bg-positive/10 text-positive";
  if (v.includes("med")) return "bg-gold/10 text-gold";
  if (v.includes("low")) return "bg-destructive/10 text-destructive";
  return "bg-surface-2 text-muted-foreground";
}

function EmptyBlock({ title, text, dense }: { title: string; text: string; dense?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border bg-surface-2/30 text-center",
        dense ? "p-3" : "p-6",
      )}
    >
      <p className="text-xs font-semibold">{title}</p>
      <p className="mt-1 text-[0.65rem] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function ExtractionStatus({ behavior }: { behavior: BehaviorData }) {
  const items: [string, any][] = [
    ["Checkout abandon", behavior?.extraction?.abandoned_checkouts],
    ["Payment abandon", behavior?.extraction?.meta_payment],
    ["Gender slice", behavior?.extraction?.meta_demographics],
    ["Session pixel", behavior?.extraction?.session_events],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([label, status]) => {
        const ok = Boolean(status?.ok);
        return (
          <div
            key={label}
            title={status?.error || status?.note || ""}
            className={cn(
              "rounded-xl border p-3",
              ok ? "border-positive/30 bg-positive/5" : "border-border bg-surface-2/40",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={cn("h-2 w-2 rounded-full", ok ? "bg-positive" : "bg-muted-foreground/40")}
              />
              <span className="text-xs font-semibold">{label}</span>
            </div>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              {ok ? `${compact(status?.count || status?.sessions || 0)} rows` : "extracting · path ready"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function StepCell({ row, label, global }: { row: any; label: string; global?: { rate?: number } }) {
  if (!row || !Number(row.exposed || 0)) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-2/30 p-3">
        <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 font-display text-sm font-semibold text-muted-foreground">n/a</p>
        <p className="mt-0.5 text-[0.65rem] text-muted-foreground">No events reached this step yet</p>
      </div>
    );
  }
  const vs = Number(row.vs_site_pp || 0);
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</p>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium",
            confidenceChip(row.confidence),
          )}
        >
          {row.confidence}
        </span>
      </div>
      <p className="mt-0.5 font-display text-base font-semibold tabular-nums">
        {row.abandoned}/{row.exposed}
      </p>
      <p className="text-[0.65rem] text-muted-foreground">
        {rateLabel(row.shrunk_rate)} shrunk rate · site {rateLabel(global?.rate || 0)}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[0.6rem] tabular-nums",
            vs >= 0 ? "bg-destructive/10 text-destructive" : "bg-positive/10 text-positive",
          )}
        >
          {vs >= 0 ? "+" : ""}
          {vs.toFixed(1)}pp vs site
        </span>
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[0.6rem] tabular-nums text-muted-foreground">
          {Number(row.excess_abandons || 0).toFixed(1)} excess
        </span>
      </div>
    </div>
  );
}

function ProductMatrix({ behavior }: { behavior: BehaviorData }) {
  const checkoutRows = behavior?.matrix?.checkout?.products || [];
  const paymentRows = behavior?.matrix?.submit_payment?.products || [];
  const checkoutByKey = new Map(checkoutRows.map((row: any) => [row.key, row]));
  const paymentByKey = new Map(paymentRows.map((row: any) => [row.key, row]));
  const keys = [...new Set([...checkoutByKey.keys(), ...paymentByKey.keys()])];
  const rows = keys
    .map((key) => {
      const checkout = checkoutByKey.get(key);
      const payment = paymentByKey.get(key);
      const main = checkout || payment || {};
      return {
        key,
        main,
        checkout,
        payment,
        score:
          Number(checkout?.excess_abandons || 0) + Number(payment?.excess_abandons || 0),
      };
    })
    .filter(
      ({ checkout, payment }) =>
        Number(checkout?.abandoned || 0) > 0 || Number(payment?.abandoned || 0) > 0,
    )
    .sort(
      (a, b) =>
        b.score - a.score || Number(b.main.exposed || 0) - Number(a.main.exposed || 0),
    )
    .slice(0, 6);

  return (
    <div>
      <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Friction by product
      </p>
      {rows.length ? (
        <div className="space-y-3">
          {rows.map(({ key, main, checkout, payment }) => (
            <div key={key} className="rounded-xl border border-border bg-surface-2/40 p-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="flex items-center gap-3">
                  {main.image_url ? (
                    <img
                      src={main.image_url}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft font-display text-sm font-semibold text-brand">
                      {(main.family || "S").slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {main.product || "Unknown product"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {main.family || "Other"} · {main.subtype || "Unknown"}
                    </p>
                  </div>
                </div>
                <StepCell
                  row={checkout}
                  label="Checkout"
                  global={behavior?.matrix?.checkout?.global}
                />
                <StepCell
                  row={payment}
                  label="Submit payment"
                  global={behavior?.matrix?.submit_payment?.global}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(checkout?.countries || payment?.countries || [])
                  .slice(0, 3)
                  .map((country: any) => (
                    <span
                      key={country.country_code}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[0.65rem]"
                    >
                      <span>{countryFlag(country.country_code)}</span>
                      {country.country_code || "UNK"}
                      <span className="tabular-nums text-muted-foreground">
                        {country.abandoned}/{country.exposed}
                      </span>
                    </span>
                  ))}
                {!(checkout?.countries || payment?.countries || []).length ? (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.65rem] text-muted-foreground">
                    No country split yet
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyBlock
          title="No abandonment rows in this date window yet"
          text="Checkout abandonments come from Shopify abandoned checkouts. Submit-payment rows come from Meta AddPaymentInfo now, with exact session-level rows added when the customer-events pixel sends payment_info_submitted."
        />
      )}
    </div>
  );
}

function SegmentPanel({
  title,
  rows,
  type,
}: {
  title: string;
  rows: any[];
  type: "country" | "gender";
}) {
  const visibleRows = (rows || [])
    .filter((row: any) => Number(row.exposed || 0) > 0 && Number(row.abandoned || 0) > 0)
    .slice(0, 5);
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-[0.65rem] text-muted-foreground">Rate + denominator, not raw count</p>
      <div className="mt-3 space-y-2">
        {visibleRows.length ? (
          visibleRows.map((row: any) => (
            <div
              key={`${type}-${row.key || row.segment || row.country_code}`}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-xs">
                {type === "country" ? (
                  <span className="shrink-0">{countryFlag(row.country_code)}</span>
                ) : null}
                <span className="truncate">
                  {type === "country"
                    ? row.country || row.country_code || "Unknown"
                    : row.segment || row.gender || "Unknown"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs font-semibold tabular-nums">
                  {row.abandoned}/{row.exposed}
                </span>
                <span className="text-[0.65rem] tabular-nums text-muted-foreground">
                  {rateLabel(row.shrunk_rate)}
                </span>
              </span>
            </div>
          ))
        ) : (
          <EmptyBlock
            dense
            title="No actionable segment rows yet"
            text="Rows with zero abandonments are hidden until they become useful."
          />
        )}
      </div>
    </div>
  );
}

function DwellPages({ pages }: { pages: any[] }) {
  const visiblePages = (pages || [])
    .filter(
      (page: any) =>
        Number(page.sessions || 0) > 0 &&
        Number(page.non_purchaser_median_dwell_seconds || page.median_dwell_seconds || 0) > 0,
    )
    .slice(0, 6);
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Pages with dwell</p>
        <span className="text-[0.65rem] text-muted-foreground">High dwell + exit = friction</span>
      </div>
      <div className="mt-3 space-y-3">
        {visiblePages.length ? (
          visiblePages.map((page: any) => {
            const dwell = Number(
              page.non_purchaser_median_dwell_seconds || page.median_dwell_seconds || 0,
            );
            const width = Math.min(100, Math.max(8, dwell / 6));
            return (
              <div key={page.path}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs font-medium" title={page.path}>
                    {page.path}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums">
                    {Math.round(dwell)}s
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${width}%` }} />
                </div>
                <p className="mt-1 text-[0.65rem] text-muted-foreground">
                  {page.sessions} sessions · {page.read || "Neutral"}
                </p>
              </div>
            );
          })
        ) : (
          <EmptyBlock
            dense
            title="No dwell rows yet"
            text="The session pixel will calculate dwell once page-view sessions are populated."
          />
        )}
      </div>
    </div>
  );
}

function JourneyColumn({
  tone,
  label,
  steps,
  render,
  emptyTitle,
  emptyText,
}: {
  tone: "brand" | "muted";
  label: string;
  steps: any[];
  render: (row: any) => string;
  emptyTitle: string;
  emptyText: string;
}) {
  return (
    <div>
      <p
        className={cn(
          "mb-2 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide",
          tone === "brand" ? "text-brand" : "text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            tone === "brand" ? "bg-brand" : "bg-muted-foreground/50",
          )}
        />
        {label}
      </p>
      <div className="space-y-1.5">
        {steps.length ? (
          steps.map((row: any) => (
            <div
              key={`${label}-${row.step}-${row.path}`}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5"
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold tabular-nums",
                  tone === "brand" ? "bg-brand-soft text-brand" : "bg-surface-2 text-muted-foreground",
                )}
              >
                {row.step}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{row.path}</p>
                <p className="text-[0.6rem] text-muted-foreground">{render(row)}</p>
              </div>
            </div>
          ))
        ) : (
          <EmptyBlock dense title={emptyTitle} text={emptyText} />
        )}
      </div>
    </div>
  );
}

function JourneyComparison({ journeys }: { journeys: { steps?: any[] } }) {
  const steps = journeys?.steps || [];
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Purchaser vs non-purchaser journey</p>
        <span className="text-[0.65rem] text-muted-foreground">Shared sequence &amp; divergence</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <JourneyColumn
          tone="brand"
          label="Purchasers"
          steps={steps.filter((row: any) => row.purchasers > 0).slice(0, 5)}
          render={(row) =>
            `${Math.round(row.purchaser_support * 100)}% support · lift ${Number(row.lift || 0).toFixed(1)}x`
          }
          emptyTitle="No purchaser path yet"
          emptyText="Waiting for session path + checkout_completed events."
        />
        <JourneyColumn
          tone="muted"
          label="Non-purchasers"
          steps={steps.filter((row: any) => row.non_purchasers > 0).slice(0, 5)}
          render={(row) =>
            `${Math.round(row.non_purchaser_support * 100)}% support · ${row.non_purchasers} sessions`
          }
          emptyTitle="No non-purchaser path yet"
          emptyText="Waiting for page_viewed events from sessions that do not purchase."
        />
      </div>
    </div>
  );
}

export function BehaviorAnalytics({ behavior }: { behavior: BehaviorData }) {
  const [open, setOpen] = useState(false);
  const period = behavior?.period || {};
  const checkoutCountries = behavior?.matrix?.checkout?.countries || [];
  const paymentCountries = behavior?.matrix?.submit_payment?.countries || [];
  const checkoutGender = behavior?.matrix?.checkout?.gender || [];
  const paymentGender = behavior?.matrix?.submit_payment?.gender || [];

  return (
    <div className="panel overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-4 p-6 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <FlaskConical className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Behavior friction &amp; journeys
              </h2>
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-gold">
                In development
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Session intelligence, abandonment, and journeys · collapsed by default
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {period.since ? (
            <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
              {period.since} – {period.until}
            </span>
          ) : null}
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </div>
      </button>

      {open ? (
        <div className="space-y-6 border-t border-border px-6 pb-6 pt-5">
          <div>
            <h3 className="font-display text-sm font-semibold">Behavior friction matrix</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Checkout abandonment comes from Shopify abandoned checkouts + paid checkout exposures.
              Submit-payment uses Meta AddPaymentInfo now; dwell and page journeys use first-party
              session events.
            </p>
          </div>

          <ExtractionStatus behavior={behavior} />
          <ProductMatrix behavior={behavior} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SegmentPanel title="Checkout countries" rows={checkoutCountries} type="country" />
            <SegmentPanel title="Submit-payment countries" rows={paymentCountries} type="country" />
            <SegmentPanel title="Checkout age / gender" rows={checkoutGender} type="gender" />
            <SegmentPanel title="Payment age / gender" rows={paymentGender} type="gender" />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <DwellPages pages={behavior?.dwell_pages || []} />
            <JourneyComparison journeys={behavior?.journeys || {}} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
