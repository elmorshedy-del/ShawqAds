import { useEffect, useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  formatDwellSeconds,
  journeyStepInsight,
  normalizePagePath,
  pagePathLabel,
} from "@/lib/pagePath";
import { dwellPageInsight } from "@/lib/dwellStats";
import { PanelScopeToggle, type PanelScope } from "@/components/dashboard/PanelScopeToggle";

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

function ratePoints(value: any) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "n/a";
  const rounded = Math.round(n);
  return `${rounded >= 0 ? "+" : ""}${rounded} pts`;
}

function segmentExtremes(rows: any[], { minExposed = 5, take = 2 } = {}) {
  const eligible = (rows || []).filter((row) => Number(row.exposed || 0) >= minExposed);
  if (!eligible.length) return { worst: [], best: [] };
  const sorted = [...eligible].sort(
    (a, b) => Number(b.shrunk_rate || 0) - Number(a.shrunk_rate || 0),
  );
  return {
    worst: sorted.slice(0, take),
    best: sorted.slice(-take).reverse(),
  };
}

function segmentKey(row: any) {
  return row.key || row.country_code || row.segment || "";
}

function FrictionLegend() {
  return (
    <p className="mt-1 text-[0.65rem] leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground">Abandon rate</span> — share who reached this step but did not finish.
      {" "}
      <span className="font-medium text-foreground">Adjusted rate</span> pulls thin data toward your site average so one
      quiet day is not mistaken for a crisis.
      {" "}
      <span className="font-medium text-foreground">Pts vs avg</span> — how many percentage points above or below that
      site average.
      {" "}
      <span className="font-medium text-foreground">Extra quits</span> — roughly how many more people left than you would
      expect at the site rate.
    </p>
  );
}

function ExtremeRow({
  row,
  type,
  tone,
}: {
  row: any;
  type: "country" | "gender";
  tone: "worst" | "best";
}) {
  const vs = Number(row.vs_site_pp || 0);
  const label =
    type === "country"
      ? row.country || row.country_code || "Unknown"
      : row.segment || row.gender || "Unknown";
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border border-border/70 bg-surface px-2.5 py-2">
      <span className="flex min-w-0 items-center gap-1.5 text-xs">
        {type === "country" ? <span className="shrink-0">{countryFlag(row.country_code)}</span> : null}
        <span className="truncate">{label}</span>
      </span>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "text-xs font-semibold tabular-nums",
            tone === "worst" ? "text-destructive" : "text-positive",
          )}
        >
          {rateLabel(row.shrunk_rate)} abandon
        </p>
        <p className="text-[0.6rem] tabular-nums text-muted-foreground">
          {row.abandoned}/{row.exposed} · {ratePoints(vs)} vs avg
        </p>
      </div>
    </div>
  );
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

function SessionIngestBanner({ behavior }: { behavior: BehaviorData }) {
  const [live, setLive] = useState<{ count: number; sessions: number; last_received_at: string } | null>(null);
  const cached = behavior?.extraction?.session_events;
  const cachedCount = Number(cached?.count || 0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/session-events/status", { cache: "no-store" });
        if (!res.ok) return;
        const payload = await res.json();
        if (!cancelled && payload?.ok) {
          setLive({
            count: Number(payload.count || 0),
            sessions: Number(payload.sessions || 0),
            last_received_at: String(payload.last_received_at || ""),
          });
        }
      } catch {
        // Ignore transient network errors; banner falls back to cached extraction status.
      }
    }
    poll();
    const timer = window.setInterval(poll, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!live?.count) return null;
  const synced = cached?.ok && cachedCount >= live.count;
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-xs",
        synced ? "border-positive/30 bg-positive/5 text-positive" : "border-gold/30 bg-gold/5 text-gold",
      )}
    >
      <p className="font-semibold">
        {synced ? "Session pixel data synced" : "Session pixel events arriving"}
      </p>
      <p className="mt-1 leading-relaxed opacity-90">
        Live ingest: {compact(live.count)} events · {compact(live.sessions)} sessions
        {live.last_received_at ? ` · last ${new Date(live.last_received_at).toLocaleString()}` : ""}.
        {synced
          ? " Behavior aggregates include these events."
          : cachedCount
            ? ` Behavior snapshot has ${compact(cachedCount)} events — refreshing aggregates on the next load.`
            : " Behavior aggregates refresh automatically after ingest."}
      </p>
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
  const excess = Math.max(0, Number(row.excess_abandons || 0));
  const siteRate = rateLabel(global?.rate || 0);
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</p>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium",
            confidenceChip(row.confidence),
          )}
          title="How much data backs this read — thin samples stay cautious"
        >
          {row.confidence}
        </span>
      </div>
      <p className="mt-0.5 font-display text-xl font-semibold tabular-nums tracking-tight">
        {rateLabel(row.shrunk_rate)}
        <span className="ml-1 text-sm font-medium text-muted-foreground">abandon</span>
      </p>
      <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
        {row.abandoned} of {row.exposed} quit here · site avg {siteRate}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <span
          title="Percentage points above or below your site-wide abandon rate at this step"
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[0.6rem] tabular-nums",
            vs >= 0 ? "bg-destructive/10 text-destructive" : "bg-positive/10 text-positive",
          )}
        >
          {ratePoints(vs)} vs avg
        </span>
        {excess >= 0.5 ? (
          <span
            title="Estimated extra abandonments vs if this segment matched the site rate"
            className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[0.6rem] tabular-nums text-muted-foreground"
          >
            ~{Math.round(excess)} extra quits
          </span>
        ) : null}
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
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Friction by product
      </p>
      <FrictionLegend />
      {rows.length ? (
        <div className="mt-3 space-y-3">
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
                        {rateLabel(
                          Number(country.exposed)
                            ? Number(country.abandoned || 0) / Number(country.exposed)
                            : 0,
                        )}{" "}
                        · {country.abandoned}/{country.exposed}
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
  siteRate,
}: {
  title: string;
  rows: any[];
  type: "country" | "gender";
  siteRate?: number;
}) {
  const { worst, best } = segmentExtremes(rows, { minExposed: 5, take: 2 });
  const bestRows = best.filter((row) => !worst.some((w) => segmentKey(w) === segmentKey(row)));
  const hasExtremes = worst.length > 0 || bestRows.length > 0;
  const siteLabel = Number.isFinite(Number(siteRate)) ? rateLabel(siteRate) : null;

  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
        {siteLabel ? `Site average ${siteLabel} abandon · ` : ""}
        Highest and lowest segments — adjusted rate, not raw counts alone
      </p>
      <div className="mt-3 space-y-3">
        {hasExtremes ? (
          <>
            {worst.length ? (
              <div>
                <p className="mb-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-destructive">
                  Most abandon
                </p>
                <div className="space-y-1.5">
                  {worst.map((row: any) => (
                    <ExtremeRow
                      key={`worst-${type}-${row.key || row.country_code || row.segment}`}
                      row={row}
                      type={type}
                      tone="worst"
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {bestRows.length ? (
              <div>
                <p className="mb-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-positive">
                  Smoothest
                </p>
                <div className="space-y-1.5">
                  {bestRows.map((row: any) => (
                    <ExtremeRow
                      key={`best-${type}-${segmentKey(row)}`}
                      row={row}
                      type={type}
                      tone="best"
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyBlock
            dense
            title="Not enough segment data yet"
            text="Need a few exposed sessions per country or demographic before ranking highs and lows."
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
        <p className="text-sm font-semibold">Where people get stuck</p>
        <span className="text-[0.65rem] text-muted-foreground">Mann-Whitney on session medians · BH-adjusted p</span>
      </div>
      <div className="mt-3 space-y-3">
        {visiblePages.length ? (
          visiblePages.map((page: any) => {
            const dwell = Number(
              page.non_purchaser_median_dwell_seconds || page.median_dwell_seconds || 0,
            );
            const buyerDwell = Number(page.purchaser_median_dwell_seconds || 0);
            const buyerSessions = Number(page.purchaser_sessions || 0);
            const width = Math.min(100, Math.max(8, dwell / 6));
            const label = pagePathLabel(page.path);
            const insight = page.insight || dwellPageInsight(page);
            return (
              <div key={normalizePagePath(page.path)}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs font-medium" title={label}>
                    {label}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums">
                    {formatDwellSeconds(dwell)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${width}%` }} />
                </div>
                <p className="mt-1 text-[0.65rem] font-medium text-foreground">{insight.headline}</p>
                <p className="mt-0.5 text-[0.65rem] leading-relaxed text-muted-foreground">
                  {insight.detail}
                  {buyerSessions > 0 ? ` Buyer median: ${formatDwellSeconds(buyerDwell)}.` : ""}
                </p>
                {page.confidence ? (
                  <p className="mt-1 text-[0.6rem] text-muted-foreground">
                    {page.confidence}
                    {page.p_value_adjusted != null ? ` · adjusted p=${Number(page.p_value_adjusted).toFixed(3)}` : ""}
                  </p>
                ) : null}
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
              key={`${label}-${row.step}-${normalizePagePath(row.path)}`}
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
                <p className="truncate text-xs font-medium">{pagePathLabel(row.path)}</p>
                <p className="text-[0.6rem] leading-relaxed text-muted-foreground">{render(row)}</p>
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
          render={(row) => journeyStepInsight(row)}
          emptyTitle="No purchaser path yet"
          emptyText="Waiting for session path + checkout_completed events."
        />
        <JourneyColumn
          tone="muted"
          label="Non-purchasers"
          steps={steps.filter((row: any) => row.non_purchasers > 0).slice(0, 5)}
          render={(row) => journeyStepInsight(row)}
          emptyTitle="No non-purchaser path yet"
          emptyText="Waiting for page_viewed events from sessions that do not purchase."
        />
      </div>
    </div>
  );
}

export function BehaviorAnalytics({
  behavior,
  scope = "launch",
  onScopeChange,
  rangeLabel,
}: {
  behavior: BehaviorData;
  scope?: PanelScope;
  onScopeChange?: (scope: PanelScope) => void;
  rangeLabel?: string;
}) {
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
          {onScopeChange ? (
            <PanelScopeToggle scope={scope} onScopeChange={onScopeChange} className="hidden sm:flex" />
          ) : null}
          {(rangeLabel || period.since) ? (
            <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
              {rangeLabel || `${period.since} – ${period.until}`}
            </span>
          ) : null}
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </div>
      </button>

      {open ? (
        <div className="space-y-6 border-t border-border px-6 pb-6 pt-5">
          {onScopeChange ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Date scope for session intelligence and journeys</p>
              <PanelScopeToggle scope={scope} onScopeChange={onScopeChange} className="sm:hidden" />
            </div>
          ) : null}
          <div>
            <h3 className="font-display text-sm font-semibold">Behavior friction matrix</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Checkout abandonment comes from Shopify abandoned checkouts + paid checkout exposures.
              Submit-payment uses Meta AddPaymentInfo now; dwell and page journeys use first-party
              session events.
            </p>
          </div>

          <SessionIngestBanner behavior={behavior} />
          <ExtractionStatus behavior={behavior} />
          <ProductMatrix behavior={behavior} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SegmentPanel
              title="Checkout countries"
              rows={checkoutCountries}
              type="country"
              siteRate={behavior?.matrix?.checkout?.global?.rate}
            />
            <SegmentPanel
              title="Submit-payment countries"
              rows={paymentCountries}
              type="country"
              siteRate={behavior?.matrix?.submit_payment?.global?.rate}
            />
            <SegmentPanel
              title="Checkout age / gender"
              rows={checkoutGender}
              type="gender"
              siteRate={behavior?.matrix?.checkout?.global?.rate}
            />
            <SegmentPanel
              title="Payment age / gender"
              rows={paymentGender}
              type="gender"
              siteRate={behavior?.matrix?.submit_payment?.global?.rate}
            />
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
