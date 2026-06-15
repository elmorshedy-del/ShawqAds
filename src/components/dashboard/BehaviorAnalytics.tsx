import { useEffect, useState } from "react";
import { ChevronDown, FlaskConical, Info } from "lucide-react";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  BEHAVIOR_SCOPE_NOTE,
  formatAdjustedP,
  launchScopeLabel,
  plainBaseline,
  plainConfidence,
  plainConfidenceTip,
  plainDwellRead,
  plainExcessAbandons,
  plainVsBaseline,
} from "@/lib/behaviorCopy.js";

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
  journeys?: { steps?: any[]; lift_reliable?: boolean; note?: string };
  scoring?: Record<string, any>;
}

type RankMode = "anomaly" | "impact";

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
  if (v.includes("high") || v.includes("strong")) return "bg-positive/10 text-positive";
  if (v.includes("actionable") || v.includes("worth") || v.includes("directional") || v.includes("early")) return "bg-gold/10 text-gold";
  if (v.includes("watch") || v.includes("underpowered") || v.includes("too few")) return "bg-surface-2 text-muted-foreground";
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

function MethodNote() {
  return (
    <div className="rounded-xl border border-border/70 bg-surface-2/50 px-4 py-3 text-[0.72rem] leading-relaxed text-muted-foreground">
      <p className="font-semibold text-foreground">How to read this tab</p>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        <li>Popular products naturally see more drop-offs — we compare <strong>rates</strong> to similar products (hoodie vs hoodies), not raw counts.</li>
        <li><strong>Worst rate</strong> finds items truly above normal. <strong>Biggest impact</strong> ranks where fixing the rate would save the most carts.</li>
        <li>Signals are corrected when many products are tested at once, so bestsellers are not flagged just because they are busy.</li>
      </ul>
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
      <p className="font-semibold">{synced ? "Store pixel synced" : "Store pixel events arriving"}</p>
      <p className="mt-1 leading-relaxed opacity-90">
        Live: {compact(live.count)} events · {compact(live.sessions)} sessions
        {live.last_received_at ? ` · last ${new Date(live.last_received_at).toLocaleString()}` : ""}.
        {synced
          ? " Dwell and journey panels include these sessions."
          : cachedCount
            ? ` Snapshot has ${compact(cachedCount)} events — refreshing on the next load.`
            : " Aggregates refresh automatically after ingest."}
      </p>
    </div>
  );
}

function ExtractionStatus({ behavior }: { behavior: BehaviorData }) {
  const items: [string, string, any][] = [
    ["Checkout drop-offs", "Shopify abandoned carts", behavior?.extraction?.abandoned_checkouts],
    ["Payment step", "Meta payment signals", behavior?.extraction?.meta_payment],
    ["Audience split", "Meta age & gender", behavior?.extraction?.meta_demographics],
    ["Session pixel", "First-party store events", behavior?.extraction?.session_events],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([label, sub, status]) => {
        const ok = Boolean(status?.ok);
        return (
          <div
            key={label}
            title={status?.error || status?.note || sub}
            className={cn(
              "rounded-xl border p-3",
              ok ? "border-positive/30 bg-positive/5" : "border-border bg-surface-2/40",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", ok ? "bg-positive" : "bg-muted-foreground/40")} />
              <span className="text-xs font-semibold">{label}</span>
            </div>
            <p className="mt-0.5 text-[0.62rem] text-muted-foreground">{sub}</p>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              {ok ? `${compact(status?.count || status?.sessions || 0)} rows` : "Waiting for data"}
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
        <p className="mt-0.5 font-display text-sm font-semibold text-muted-foreground">Not enough data</p>
        <p className="mt-0.5 text-[0.65rem] text-muted-foreground">No sessions reached this step yet</p>
      </div>
    );
  }

  const plain = row.confidence_plain || plainConfidence(row.confidence);
  const tip = plainConfidenceTip(row.confidence);
  const baseline = plainBaseline(row.baseline_label || "Site average");
  const vsPlain = plainVsBaseline(row.vs_site_pp);
  const excessPlain = plainExcessAbandons(row.excess_abandons);
  const chancePlain = formatAdjustedP(row.p_value_adjusted_label || row.p_value_label);

  return (
    <div className="rounded-lg border border-border bg-surface p-3" title={tip}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className={cn("rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium", confidenceChip(plain))}>
          {plain}
        </span>
      </div>
      <p className="mt-0.5 font-display text-base font-semibold tabular-nums">
        {row.abandoned}/{row.exposed} dropped
      </p>
      <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
        {rateLabel(row.shrunk_rate)} drop-off rate · {baseline}
      </p>
      <p className="mt-1 text-[0.62rem] leading-relaxed text-muted-foreground">{vsPlain}</p>
      {chancePlain ? <p className="text-[0.62rem] leading-relaxed text-muted-foreground">{chancePlain}</p> : null}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[0.6rem] tabular-nums text-muted-foreground">
          Store avg {rateLabel(global?.rate || row.site_rate || 0)}
        </span>
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">
          {excessPlain}
        </span>
      </div>
    </div>
  );
}

function RankToggle({ mode, onChange }: { mode: RankMode; onChange: (mode: RankMode) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {([
        ["anomaly", "Worst rate"],
        ["impact", "Biggest impact"],
      ] as const).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-[0.65rem] font-semibold transition-colors",
            mode === value ? "bg-brand text-white shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ProductMatrix({ behavior, rankMode }: { behavior: BehaviorData; rankMode: RankMode }) {
  const checkoutRows = behavior?.matrix?.checkout?.products || [];
  const paymentRows = behavior?.matrix?.submit_payment?.products || [];
  const checkoutByKey = new Map(checkoutRows.map((row: any) => [row.key, row]));
  const paymentByKey = new Map(paymentRows.map((row: any) => [row.key, row]));
  const keys = [...new Set([...checkoutByKey.keys(), ...paymentByKey.keys()])];

  const merged = keys
    .map((key) => {
      const checkout = checkoutByKey.get(key);
      const payment = paymentByKey.get(key);
      const main = checkout || payment || {};
      return {
        key,
        main,
        checkout,
        payment,
        score: rankMode === "anomaly"
          ? Math.max(Number(checkout?.vs_site_pp || 0), Number(payment?.vs_site_pp || 0))
          : Number(checkout?.excess_abandons || 0) + Number(payment?.excess_abandons || 0),
      };
    })
    .filter(({ checkout, payment }) => Number(checkout?.abandoned || 0) > 0 || Number(payment?.abandoned || 0) > 0)
    .sort((a, b) => b.score - a.score || Number(b.main.exposed || 0) - Number(a.main.exposed || 0))
    .slice(0, 6);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Where shoppers drop off
          </p>
          <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
            {rankMode === "anomaly"
              ? "Ranked by how much worse the rate is vs similar products — not by traffic alone."
              : "Ranked by estimated extra drop-offs if this product stayed at the normal rate."}
          </p>
        </div>
      </div>
      {merged.length ? (
        <div className="space-y-3">
          {merged.map(({ key, main, checkout, payment }) => (
            <div key={key} className="rounded-xl border border-border bg-surface-2/40 p-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="flex items-center gap-3">
                  {main.image_url ? (
                    <img src={main.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft font-display text-sm font-semibold text-brand">
                      {(main.family || "S").slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{main.product || "Unknown product"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {main.family || "Other"} · {main.subtype || "Unknown"}
                    </p>
                  </div>
                </div>
                <StepCell row={checkout} label="Checkout" global={behavior?.matrix?.checkout?.global} />
                <StepCell row={payment} label="Payment step" global={behavior?.matrix?.submit_payment?.global} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(checkout?.countries || payment?.countries || []).slice(0, 3).map((country: any) => (
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
          title="No drop-off rows in this window yet"
          text="Checkout rows come from Shopify abandoned carts. Payment rows use Meta until the store pixel sends payment-step events."
        />
      )}
    </div>
  );
}

function SegmentPanel({ title, rows, type }: { title: string; rows: any[]; type: "country" | "gender" }) {
  const visibleRows = (rows || [])
    .filter((row: any) => Number(row.exposed || 0) > 0 && Number(row.abandoned || 0) > 0)
    .slice(0, 5);
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-[0.65rem] text-muted-foreground">Share who dropped vs who reached the step</p>
      <div className="mt-3 space-y-2">
        {visibleRows.length ? (
          visibleRows.map((row: any) => (
            <div key={`${type}-${row.key || row.segment || row.country_code}`} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-xs">
                {type === "country" ? <span className="shrink-0">{countryFlag(row.country_code)}</span> : null}
                <span className="truncate">
                  {type === "country" ? row.country || row.country_code || "Unknown" : row.segment || row.gender || "Unknown"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs font-semibold tabular-nums">{row.abandoned}/{row.exposed}</span>
                <span className="text-[0.65rem] tabular-nums text-muted-foreground" title={plainConfidence(row.confidence)}>
                  {rateLabel(row.shrunk_rate)}
                </span>
              </span>
            </div>
          ))
        ) : (
          <EmptyBlock dense title="Nothing to rank yet" text="Segments appear once there are both attempts and drop-offs." />
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
        <p className="text-sm font-semibold">Pages where browsers linger</p>
        <span className="text-[0.65rem] text-muted-foreground">Long time + no purchase can mean friction</span>
      </div>
      <div className="mt-3 space-y-3">
        {visiblePages.length ? (
          visiblePages.map((page: any) => {
            const dwell = Number(page.non_purchaser_median_dwell_seconds || page.median_dwell_seconds || 0);
            const width = Math.min(100, Math.max(8, dwell / 6));
            const readPlain = plainDwellRead(page.read);
            const chancePlain = formatAdjustedP(page.p_value_label);
            return (
              <div key={page.path}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs font-medium" title={page.path}>{page.path}</span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums">{Math.round(dwell)}s</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${width}%` }} />
                </div>
                <p className="mt-1 text-[0.65rem] leading-relaxed text-muted-foreground">
                  {page.sessions} sessions · {readPlain}
                </p>
                {chancePlain ? <p className="text-[0.62rem] text-muted-foreground">{chancePlain}</p> : null}
              </div>
            );
          })
        ) : (
          <EmptyBlock dense title="No dwell rows yet" text="Appears once the session pixel records page views and time on page." />
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
      <p className={cn("mb-2 flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide", tone === "brand" ? "text-brand" : "text-muted-foreground")}>
        <span className={cn("h-2 w-2 rounded-full", tone === "brand" ? "bg-brand" : "bg-muted-foreground/50")} />
        {label}
      </p>
      <div className="space-y-1.5">
        {steps.length ? (
          steps.map((row: any) => (
            <div key={`${label}-${row.step}-${row.path}`} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5">
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold tabular-nums", tone === "brand" ? "bg-brand-soft text-brand" : "bg-surface-2 text-muted-foreground")}>
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

function JourneyComparison({ journeys }: { journeys: BehaviorData["journeys"] }) {
  const steps = journeys?.steps || [];
  const liftReliable = Boolean(journeys?.lift_reliable);
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Buyer vs browser paths</p>
        <span className="text-[0.65rem] text-muted-foreground">Which pages each group hits first</span>
      </div>
      {!liftReliable && journeys?.note ? (
        <p className="mt-2 text-[0.65rem] leading-relaxed text-gold">{journeys.note}</p>
      ) : null}
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <JourneyColumn
          tone="brand"
          label="Buyers"
          steps={steps.filter((row: any) => row.purchasers > 0).slice(0, 5)}
          render={(row) =>
            liftReliable && row.lift != null
              ? `${Math.round(row.purchaser_support * 100)}% of buyers visit here · ${Number(row.lift || 0).toFixed(1)}× more common among buyers`
              : `${Math.round(row.purchaser_support * 100)}% of buyers visit here`
          }
          emptyTitle="No buyer path yet"
          emptyText="Needs checkout_completed events from the store pixel."
        />
        <JourneyColumn
          tone="muted"
          label="Browsers who didn't buy"
          steps={steps.filter((row: any) => row.non_purchasers > 0).slice(0, 5)}
          render={(row) => `${Math.round(row.non_purchaser_support * 100)}% of non-buyers · ${row.non_purchasers} sessions`}
          emptyTitle="No browser-only path yet"
          emptyText="Needs page_view events from sessions without a purchase."
        />
      </div>
    </div>
  );
}

export function BehaviorAnalytics({
  behavior,
  scopeLabel,
}: {
  behavior: BehaviorData;
  scopeLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rankMode, setRankMode] = useState<RankMode>("anomaly");
  const period = behavior?.period || {};
  const scope = scopeLabel || launchScopeLabel(period.since, period.until);

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
              <h2 className="font-display text-lg font-semibold tracking-tight">Behavior & drop-offs</h2>
              <span className="rounded-full border border-brand/30 bg-brand/5 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-brand">
                Launch window
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{BEHAVIOR_SCOPE_NOTE}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">{scope}</span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open ? (
        <div className="space-y-6 border-t border-border px-6 pb-6 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-semibold">Drop-off intelligence</h3>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Answers two questions: which products drop off more than they should, and where extra fixes would recover the most carts.
                Popularity is adjusted — bestsellers are not flagged just because they are busy.
              </p>
            </div>
            <RankToggle mode={rankMode} onChange={setRankMode} />
          </div>

          <MethodNote />

          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2 text-[0.65rem] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Date scope: {scope}. Behavior always uses the launch window, independent of the main dashboard date picker.</span>
          </div>

          <SessionIngestBanner behavior={behavior} />
          <ExtractionStatus behavior={behavior} />
          <ProductMatrix behavior={behavior} rankMode={rankMode} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SegmentPanel title="Checkout by country" rows={behavior?.matrix?.checkout?.countries || []} type="country" />
            <SegmentPanel title="Payment by country" rows={behavior?.matrix?.submit_payment?.countries || []} type="country" />
            <SegmentPanel title="Checkout by age & gender" rows={behavior?.matrix?.checkout?.gender || []} type="gender" />
            <SegmentPanel title="Payment by age & gender" rows={behavior?.matrix?.submit_payment?.gender || []} type="gender" />
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
