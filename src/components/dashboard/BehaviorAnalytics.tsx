import { useEffect, useState } from "react";
import {
  ChevronDown,
  Clock,
  Eye,
  FlaskConical,
  Globe,
  Heart,
  Package,
  Users,
} from "lucide-react";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  formatDwellSeconds,
  journeyStepInsight,
  normalizePagePath,
  pagePathLabel,
} from "@/lib/pagePath";
import {
  comparabilityTier,
  MIN_COMPARABLE_SESSIONS,
  SAMPLE_TIER_LEGEND,
} from "@/lib/sampleTiers";
import { BRAND_PAGES_LABEL, brandPageName } from "@/lib/pageCategory";
import { PanelScopeToggle, type PanelScope } from "@/components/dashboard/PanelScopeToggle";

interface BehaviorStep {
  products?: any[];
  countries?: any[];
  gender?: any[];
  global?: { rate?: number; exposed?: number; abandoned?: number };
}
interface BehaviorData {
  period?: { since?: string; until?: string };
  coverage?: {
    developing_day?: boolean;
    cached_until?: string;
    reporting_today?: string;
    requested_until?: string;
    cache_lags_calendar?: boolean;
  };
  extraction?: Record<string, any>;
  matrix?: { checkout?: BehaviorStep; submit_payment?: BehaviorStep };
  dwell_pages?: any[];
  most_visited_pages?: { top?: any[]; brand?: any[] };
  journeys?: { steps?: any[] };
}

// Time on a page is capped in the data layer (BEHAVIOR_MAX_DWELL_SECONDS, default 600s)
// so a tab left open overnight cannot report "30 min" for every page.
const DWELL_CAP_LABEL = "10 min";

function rateLabel(value: any, { exposed }: { exposed?: number } = {}) {
  if (exposed === 0) return "n/a";
  if (value == null || !Number.isFinite(Number(value))) return "n/a";
  return `${Math.round(Number(value) * 100)}%`;
}

function observedRate(row: any) {
  const exposed = Number(row?.exposed || 0);
  return exposed ? Number(row?.abandoned || 0) / exposed : null;
}

function countryFlag(code?: string) {
  const cc = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "•";
  return [...cc].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join("");
}

function ratePoints(value: any) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "n/a";
  const rounded = Math.round(n);
  return `${rounded >= 0 ? "+" : ""}${rounded} pts`;
}

function segmentKey(row: any) {
  return row.key || row.country_code || row.segment || "";
}

// Plain-language confidence pill driven by session count (no statistical symbols).
function TierPill({ sessions }: { sessions?: number }) {
  const n = Number(sessions || 0);
  const tier = comparabilityTier(n);
  const tone =
    tier.rank >= 3
      ? "bg-positive/10 text-positive"
      : tier.rank === 2
        ? "bg-brand-soft text-brand"
        : tier.rank === 1
          ? "bg-gold/10 text-gold"
          : "bg-surface-2 text-muted-foreground";
  return (
    <span
      title={`${tier.label} — accuracy ${tier.accuracy} · ${compact(n)} sessions`}
      className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium", tone)}
    >
      {tier.label}
    </span>
  );
}

function SampleTierLegend() {
  return (
    <p className="mt-1 text-[0.65rem] leading-relaxed text-muted-foreground">{SAMPLE_TIER_LEGEND}</p>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: any;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <h3 className="font-display text-sm font-semibold tracking-tight">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
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

function BehaviorDevelopingBanner({ behavior }: { behavior: BehaviorData }) {
  const coverage = behavior?.coverage;
  if (!coverage?.developing_day) return null;
  const cachedUntil = coverage.cached_until || "";
  return (
    <div className="rounded-xl border border-brand/30 bg-brand-soft/40 px-4 py-3 text-xs text-foreground">
      <p className="font-semibold">Today&apos;s behavior window is still developing</p>
      <p className="mt-1 leading-relaxed text-muted-foreground">
        The Istanbul reporting day just rolled over, but the behavior snapshot has not refreshed for{" "}
        {coverage.reporting_today || "today"} yet
        {cachedUntil ? ` (last aggregates through ${cachedUntil})` : ""}.
        Checkout friction, dwell, and journeys stay n/a here until abandoned-checkout and session-pixel rollups catch up —
        not 0% abandon.
      </p>
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

function StepCell({ row, label, siteRate }: { row: any; label: string; siteRate?: number }) {
  if (!row || !Number(row.exposed || 0)) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-2/30 p-3">
        <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 font-display text-sm font-semibold text-muted-foreground">n/a</p>
        <p className="mt-0.5 text-[0.65rem] text-muted-foreground">No sessions reached this step</p>
      </div>
    );
  }
  const exposed = Number(row.exposed || 0);
  const abandoned = Number(row.abandoned || 0);
  const rate = exposed ? abandoned / exposed : 0;
  const site = Number(siteRate);
  const vs = Number.isFinite(site) ? (rate - site) * 100 : 0;
  const siteLabel = Number.isFinite(site) ? rateLabel(site) : "n/a";
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</p>
        <TierPill sessions={exposed} />
      </div>
      <p className="mt-0.5 font-display text-xl font-semibold tabular-nums tracking-tight">
        {rateLabel(rate)}
        <span className="ml-1 text-sm font-medium text-muted-foreground">abandon</span>
      </p>
      <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
        {abandoned} of {exposed} left here · site avg {siteLabel}
      </p>
      <div className="mt-1.5">
        <span
          title="Percentage points above or below your site-wide abandon rate at this step"
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[0.6rem] tabular-nums",
            vs >= 0 ? "bg-destructive/10 text-destructive" : "bg-positive/10 text-positive",
          )}
        >
          {ratePoints(vs)} vs avg
        </span>
      </div>
    </div>
  );
}

function ProductMatrix({ behavior }: { behavior: BehaviorData }) {
  const developingDay = Boolean(behavior?.coverage?.developing_day);
  const checkoutRows = behavior?.matrix?.checkout?.products || [];
  const paymentRows = behavior?.matrix?.submit_payment?.products || [];
  const checkoutGlobal = behavior?.matrix?.checkout?.global?.rate;
  const paymentGlobal = behavior?.matrix?.submit_payment?.global?.rate;
  const checkoutByKey = new Map(checkoutRows.map((row: any) => [row.key, row]));
  const paymentByKey = new Map(paymentRows.map((row: any) => [row.key, row]));
  const keys = [...new Set([...checkoutByKey.keys(), ...paymentByKey.keys()])];

  const merged = keys
    .map((key) => {
      const checkout = checkoutByKey.get(key);
      const payment = paymentByKey.get(key);
      const main = checkout || payment || {};
      const checkoutExposed = Number(checkout?.exposed || 0);
      const paymentExposed = Number(payment?.exposed || 0);
      // Rank on the checkout step when it has a comparable sample; otherwise fall back to payment.
      const useCheckout =
        checkoutExposed >= MIN_COMPARABLE_SESSIONS || checkoutExposed >= paymentExposed;
      const rate = useCheckout ? observedRate(checkout) : observedRate(payment);
      const sample = Math.max(checkoutExposed, paymentExposed);
      const comparable = sample >= MIN_COMPARABLE_SESSIONS;
      return { key, main, checkout, payment, rate: rate ?? 0, sample, comparable };
    })
    .filter(
      ({ checkout, payment }) =>
        Number(checkout?.exposed || 0) > 0 || Number(payment?.exposed || 0) > 0,
    );

  const comparableRows = merged
    .filter((row) => row.comparable)
    .sort((a, b) => a.rate - b.rate || b.sample - a.sample) // lowest abandon first
    .slice(0, 8);
  const setAside = merged.filter((row) => !row.comparable).length;

  return (
    <div className="space-y-3">
      <SectionHeading
        icon={Package}
        title="Friction by product"
        subtitle="Products with a comparable sample, ordered from lowest to highest abandonment. Checkout abandonment comes from Shopify; submit-payment from Meta AddPaymentInfo plus session-pixel rows."
      />
      <SampleTierLegend />
      {comparableRows.length ? (
        <div className="space-y-3">
          {comparableRows.map(({ key, main, checkout, payment }) => (
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
                    <p className="break-words text-sm font-semibold">{main.product || "Unknown product"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {main.family || "Other"} · {main.subtype || "Unknown"}
                    </p>
                  </div>
                </div>
                <StepCell row={checkout} label="Checkout" siteRate={checkoutGlobal} />
                <StepCell row={payment} label="Submit payment" siteRate={paymentGlobal} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyBlock
          title={developingDay ? "Today's friction aggregates are still building" : "No products with a comparable sample yet"}
          text={
            developingDay
              ? "Behavior JSON refreshes after Shopify/Meta extracts and session-pixel rollups. Switch to Since launch for full-window context, or check back after the next behavior refresh."
              : `Products appear here once they reach ${MIN_COMPARABLE_SESSIONS} checkout sessions so the abandon rates can be compared fairly.`
          }
        />
      )}
      {setAside > 0 ? (
        <p className="text-[0.65rem] text-muted-foreground">
          {setAside} {setAside === 1 ? "product" : "products"} set aside — fewer than {MIN_COMPARABLE_SESSIONS} sessions, so their rates are not comparable yet.
        </p>
      ) : null}
    </div>
  );
}

function RankRow({
  row,
  type,
  siteRate,
  rank,
}: {
  row: any;
  type: "country" | "gender";
  siteRate?: number;
  rank: number;
}) {
  const exposed = Number(row.exposed || 0);
  const abandoned = Number(row.abandoned || 0);
  const rate = exposed ? abandoned / exposed : 0;
  const site = Number(siteRate);
  const vs = Number.isFinite(site) ? (rate - site) * 100 : 0;
  const label =
    type === "country"
      ? row.country || row.country_code || "Unknown"
      : row.segment || row.gender || "Unknown";
  const high = vs >= 0;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-surface px-2.5 py-2">
      <span className="flex min-w-0 items-center gap-2 text-xs">
        <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">{rank}</span>
        {type === "country" ? <span className="shrink-0">{countryFlag(row.country_code)}</span> : null}
        <span className="truncate">{label}</span>
      </span>
      <div className="flex shrink-0 items-center gap-2 text-right">
        <div>
          <p
            className={cn(
              "text-xs font-semibold tabular-nums",
              high ? "text-destructive" : "text-positive",
            )}
          >
            {rateLabel(rate)} <span className="font-normal text-muted-foreground">abandon</span>
          </p>
          <p className="text-[0.6rem] tabular-nums text-muted-foreground">
            {abandoned}/{exposed} · {ratePoints(vs)} vs avg
          </p>
        </div>
        <TierPill sessions={exposed} />
      </div>
    </div>
  );
}

function SegmentRanking({
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
  const all = rows || [];
  const comparable = all.filter((row) => Number(row.exposed || 0) >= MIN_COMPARABLE_SESSIONS);
  const ranked = [...comparable].sort((a, b) => {
    const ra = observedRate(a) ?? 0;
    const rb = observedRate(b) ?? 0;
    return ra - rb; // best (fewest abandons) first
  });
  const setAside = all.length - comparable.length;
  const siteLabel = Number.isFinite(Number(siteRate)) ? rateLabel(siteRate) : null;
  const noun = type === "country" ? "country" : "segment";
  const nounPlural = type === "country" ? "countries" : "segments";

  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {siteLabel ? (
          <span className="shrink-0 text-[0.65rem] tabular-nums text-muted-foreground">
            Site avg {siteLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-[0.65rem] text-muted-foreground">Ranked best (fewest abandons) to worst</p>
      {ranked.length ? (
        <div className="mt-3 space-y-1.5">
          {ranked.map((row, index) => (
            <RankRow
              key={`${type}-${segmentKey(row) || index}`}
              row={row}
              type={type}
              siteRate={siteRate}
              rank={index + 1}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <EmptyBlock
            dense
            title="Not enough sessions to compare yet"
            text={`${type === "country" ? "Countries" : "Segments"} appear here once they reach ${MIN_COMPARABLE_SESSIONS} sessions so the rates are comparable.`}
          />
        </div>
      )}
      {setAside > 0 ? (
        <p className="mt-2 text-[0.6rem] text-muted-foreground">
          {setAside} {setAside === 1 ? noun : nounPlural} set aside — fewer than {MIN_COMPARABLE_SESSIONS} sessions.
        </p>
      ) : null}
    </div>
  );
}

function PageBar({ row, max }: { row: any; max: number }) {
  const views = Number(row.views || 0);
  const width = max > 0 ? Math.min(100, Math.max(6, (views / max) * 100)) : 6;
  const distinctive = Array.isArray(row.distinctive_countries) ? row.distinctive_countries : [];
  const label = brandPageName(row.path) || row.label;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 break-words text-xs font-medium" title={label}>
          {label}
        </span>
        <span className="shrink-0 text-[0.65rem] tabular-nums text-muted-foreground">
          {compact(views)} views · {compact(Number(row.sessions || 0))} sessions
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brand" style={{ width: `${width}%` }} />
      </div>
      {distinctive.length ? (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-[0.6rem] text-muted-foreground">Mostly from</span>
          {distinctive.map((c: any) => (
            <span
              key={c.country_code}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-0.5 text-[0.6rem] tabular-nums"
              title={`${c.country || c.country_code} · ${c.views} views`}
            >
              <span>{countryFlag(c.country_code)}</span>
              {c.country_code}
              <span className="text-muted-foreground">{Math.round(Number(c.share || 0) * 100)}%</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MostVisitedPages({
  data,
}: {
  data?: { top?: any[]; brand?: any[]; brand_share?: number; brand_views?: number; total_views?: number };
}) {
  const top = data?.top || [];
  const brand = data?.brand || [];
  const maxTop = top.reduce((m: number, r: any) => Math.max(m, Number(r.views || 0)), 0);
  const maxBrand = brand.reduce((m: number, r: any) => Math.max(m, Number(r.views || 0)), 0);
  const brandShare = Number(data?.brand_share || 0);
  const brandPct = brandShare > 0 ? `${(brandShare * 100).toFixed(brandShare < 0.1 ? 1 : 0)}%` : null;
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-4">
      <p className="text-sm font-semibold">Most-visited pages</p>
      <p className="mt-0.5 text-[0.65rem] text-muted-foreground">Ranked by page views in this window</p>
      <div className="mt-3 space-y-3">
        {top.length ? (
          top.map((row: any) => <PageBar key={`top-${normalizePagePath(row.path)}`} row={row} max={maxTop} />)
        ) : (
          <EmptyBlock
            dense
            title="No page views yet"
            text="Pages appear here once the session pixel records page views."
          />
        )}
      </div>
      <div className="mt-4 border-t border-border/70 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Heart className="h-3.5 w-3.5 text-brand" />
            {BRAND_PAGES_LABEL}
          </p>
          {brandPct ? (
            <span
              className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[0.6rem] font-semibold tabular-nums text-brand"
              title={`${compact(Number(data?.brand_views || 0))} of ${compact(Number(data?.total_views || 0))} page views across the site land on brand & mission pages`}
            >
              {brandPct} of all visits
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[0.6rem] leading-relaxed text-muted-foreground">
          Always shown — the real About Us and Donations pages and the Shawq Journal, even when commerce pages out-rank them.
        </p>
        <div className="mt-2 space-y-3">
          {brand.length ? (
            brand.map((row: any) => (
              <PageBar key={`brand-${normalizePagePath(row.path)}`} row={row} max={maxBrand} />
            ))
          ) : (
            <p className="rounded-lg bg-surface-2/60 px-2.5 py-2 text-[0.65rem] text-muted-foreground">
              No brand &amp; mission page views in this window yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function dwellRead(page: any) {
  const nonBuyer = Number(page.non_purchaser_median_dwell_seconds || 0);
  const buyer = Number(page.purchaser_median_dwell_seconds || 0);
  const buyerSessions = Number(page.purchaser_sessions || 0);
  const gap = nonBuyer - buyer;
  if (buyerSessions === 0) return "Only non-buyer visits so far";
  if (gap > 20) return "Non-buyers linger longer here — worth a look";
  if (gap < -20) return "Buyers spend more time here — a decision page";
  return "Buyers and non-buyers spend similar time";
}

function DwellPages({ pages }: { pages: any[] }) {
  const visiblePages = (pages || [])
    .filter(
      (page: any) =>
        Number(page.sessions || 0) > 0 &&
        Number(page.non_purchaser_median_dwell_seconds || page.median_dwell_seconds || 0) > 0,
    )
    .slice(0, 6);
  const maxDwell = visiblePages.reduce(
    (m: number, p: any) =>
      Math.max(m, Number(p.non_purchaser_median_dwell_seconds || p.median_dwell_seconds || 0)),
    0,
  );
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Time on page · buyers vs non-buyers</p>
        <span className="shrink-0 text-[0.65rem] text-muted-foreground">Median per session · capped at {DWELL_CAP_LABEL}</span>
      </div>
      <div className="mt-3 space-y-3">
        {visiblePages.length ? (
          visiblePages.map((page: any) => {
            const dwell = Number(
              page.non_purchaser_median_dwell_seconds || page.median_dwell_seconds || 0,
            );
            const buyerDwell = Number(page.purchaser_median_dwell_seconds || 0);
            const buyerSessions = Number(page.purchaser_sessions || 0);
            const sessions = Number(page.sessions || 0);
            const width = maxDwell > 0 ? Math.min(100, Math.max(8, (dwell / maxDwell) * 100)) : 8;
            const label = brandPageName(page.path) || pagePathLabel(page.path);
            return (
              <div key={normalizePagePath(page.path)}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 break-words text-xs font-medium" title={label}>
                    {label}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums">
                    {formatDwellSeconds(dwell)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${width}%` }} />
                </div>
                <p className="mt-1 text-[0.65rem] font-medium text-foreground">{dwellRead(page)}</p>
                <p className="mt-0.5 text-[0.65rem] leading-relaxed text-muted-foreground">
                  Non-buyers {formatDwellSeconds(dwell)}
                  {buyerSessions > 0 ? ` · buyers ${formatDwellSeconds(buyerDwell)}` : ""}
                  {" · based on "}
                  {compact(sessions)} session{sessions === 1 ? "" : "s"}
                </p>
              </div>
            );
          })
        ) : (
          <EmptyBlock
            dense
            title="No time-on-page data yet"
            text="The session pixel calculates time on page once page-view sessions are populated."
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
                <p className="break-words text-xs font-medium">{brandPageName(row.path) || pagePathLabel(row.path)}</p>
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
  const checkoutGlobal = behavior?.matrix?.checkout?.global?.rate;
  const paymentGlobal = behavior?.matrix?.submit_payment?.global?.rate;

  // Age/gender breakdowns only surface when at least one cohort is comparable.
  const checkoutGenderComparable = checkoutGender.some(
    (row: any) => Number(row.exposed || 0) >= MIN_COMPARABLE_SESSIONS,
  );
  const paymentGenderComparable = paymentGender.some(
    (row: any) => Number(row.exposed || 0) >= MIN_COMPARABLE_SESSIONS,
  );
  const showAudience = checkoutGenderComparable || paymentGenderComparable;

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
              Product &amp; country friction, pages, dwell, and journeys · collapsed by default
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
        <div className="space-y-7 border-t border-border px-6 pb-6 pt-5">
          {onScopeChange ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Date scope for session intelligence and journeys</p>
              <PanelScopeToggle scope={scope} onScopeChange={onScopeChange} className="sm:hidden" />
            </div>
          ) : null}

          <BehaviorDevelopingBanner behavior={behavior} />
          <SessionIngestBanner behavior={behavior} />
          <ExtractionStatus behavior={behavior} />

          {/* 1 — Where the money leaks: product-level friction */}
          <ProductMatrix behavior={behavior} />

          {/* 2 — Where geographically: every comparable country ranked best → worst */}
          <div className="space-y-3">
            <SectionHeading
              icon={Globe}
              title="Drop-off by country"
              subtitle="Every country with a comparable sample, ranked from fewest to most abandons at each step."
            />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <SegmentRanking
                title="Checkout"
                rows={checkoutCountries}
                type="country"
                siteRate={checkoutGlobal}
              />
              <SegmentRanking
                title="Submit payment"
                rows={paymentCountries}
                type="country"
                siteRate={paymentGlobal}
              />
            </div>
          </div>

          {/* 3 — Who: age & gender, only when a cohort is comparable */}
          {showAudience ? (
            <div className="space-y-3">
              <SectionHeading
                icon={Users}
                title="Audience · age &amp; gender"
                subtitle="Shown only when a cohort has a comparable sample. Gender is Meta's aggregate reporting, not user-level."
              />
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {checkoutGenderComparable ? (
                  <SegmentRanking
                    title="Checkout"
                    rows={checkoutGender}
                    type="gender"
                    siteRate={checkoutGlobal}
                  />
                ) : null}
                {paymentGenderComparable ? (
                  <SegmentRanking
                    title="Submit payment"
                    rows={paymentGender}
                    type="gender"
                    siteRate={paymentGlobal}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {/* 4 — What they look at: most-visited pages + brand/mission reach */}
          <div className="space-y-3">
            <SectionHeading
              icon={Eye}
              title="Pages people visit"
              subtitle="Most-visited pages this window, with brand &amp; mission pages always surfaced."
            />
            <MostVisitedPages data={behavior?.most_visited_pages} />
          </div>

          {/* 5 — How long & which path */}
          <div className="space-y-3">
            <SectionHeading icon={Clock} title="Time on page &amp; journeys" />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <DwellPages pages={behavior?.dwell_pages || []} />
              <JourneyComparison journeys={behavior?.journeys || {}} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
