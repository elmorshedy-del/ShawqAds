import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BadgeDollarSign, Info, TriangleAlert } from "lucide-react";

function currency(value: number | null | undefined, code = "USD", compact = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code || "USD",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(n);
}

function percent(value: number | null | undefined, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function number(value: number | null | undefined, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function ordinal(value: number | null | undefined) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return "—";
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th";
  return `${n}${suffix}`;
}

async function loadSpendingPower() {
  for (const target of ["/api/data/shopify-products.json", "/data/shopify-products.json"]) {
    try {
      const res = await fetch(target, { cache: "no-store" });
      if (!res.ok) continue;
      const payload = await res.json();
      if (payload?.customer_spending_power) return payload.customer_spending_power;
    } catch {}
  }
  return null;
}

function SpendingPowerTooltip({ active, payload, currencyCode = "USD" }: any) {
  if (!active || !payload?.length) return null;
  const point = payload.find((row: any) => row.dataKey === "lifetime_spend")?.payload || payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="panel min-w-[210px] px-3.5 py-3 text-xs shadow-[var(--shadow-elegant)]">
      <p className="font-semibold">Anonymous customer</p>
      <div className="mt-2 space-y-1.5 text-muted-foreground">
        <div className="flex justify-between gap-5">
          <span>Area median income</span>
          <span className="font-semibold tabular-nums text-foreground">{currency(point.area_income_usd, "USD", true)}</span>
        </div>
        <div className="flex justify-between gap-5">
          <span>US area percentile</span>
          <span className="font-semibold tabular-nums text-foreground">{ordinal(point.spending_power_percentile)}</span>
        </div>
        <div className="flex justify-between gap-5">
          <span>Lifetime ShawQ spend</span>
          <span className="font-semibold tabular-nums text-foreground">{currency(point.lifetime_spend, currencyCode)}</span>
        </div>
        <div className="flex justify-between gap-5">
          <span>Orders</span>
          <span className="font-semibold tabular-nums text-foreground">{point.orders}</span>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 px-3.5 py-3">
      <p className="text-[0.62rem] font-medium uppercase tracking-[0.11em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-[0.68rem] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function CustomerSpendingPower() {
  const [data, setData] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSpendingPower().then((value) => {
      if (!cancelled) {
        setData(value);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const points = useMemo(
    () => [...(data?.points || [])].sort((a, b) => Number(a.area_income_usd || 0) - Number(b.area_income_usd || 0)),
    [data],
  );

  if (!loaded) {
    return (
      <div className="panel p-5 sm:p-6">
        <p className="text-sm text-muted-foreground">Loading customer spending-power analysis…</p>
      </div>
    );
  }

  if (!data || data.status !== "ready" || points.length < 2) {
    return (
      <div className="panel p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <BadgeDollarSign className="h-4 w-4" />
          </span>
          <h2 className="font-display text-base font-semibold tracking-tight sm:text-lg">Customer Spending Power</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {data?.error
            ? "Economic enrichment is temporarily unavailable. The next Shopify refresh will retry it automatically."
            : "Not enough customers are matched to a supported area-level economic source yet."}
        </p>
      </div>
    );
  }

  const summary = data.summary || {};
  const regression = summary.regression || {};
  const coverage = data.coverage || {};
  const source = data.source || {};
  const shopCurrency = source.shop_currency || "USD";
  const slope = Number(regression.slope_per_10000_income);
  const relationship = Number.isFinite(slope)
    ? `${slope >= 0 ? "+" : ""}${currency(slope, shopCurrency)} lifetime spend per +$10k area income`
    : "Relationship not estimated";
  const historyScopeUnconfirmed = data.shop?.read_all_orders_scope !== true;

  return (
    <div className="panel min-w-0 overflow-hidden p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <BadgeDollarSign className="h-4 w-4" />
            </span>
            <h2 className="font-display text-base font-semibold tracking-tight sm:text-lg">Customer Spending Power</h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Lifetime customer economics · area-level spending-capacity proxy from delivery geography · fitted against actual ShawQ lifetime spend
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-muted-foreground">
          <span className="flex items-center gap-1.5" title={data.methodology?.note}>
            <Info className="h-3.5 w-3.5" />
            Area estimate, not individual income
          </span>
          {historyScopeUnconfirmed ? (
            <span className="flex items-center gap-1.5 text-gold" title={data.shop?.history_access}>
              <TriangleAlert className="h-3.5 w-3.5" />
              Lifetime Shopify access not confirmed
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <Metric
          label="Matched US customers"
          value={String(coverage.matched_customers || 0)}
          hint={`${percent(coverage.supported_customer_match_rate)} of US-postcode customers · ${percent(coverage.overall_customer_coverage)} of all identified`}
        />
        <Metric
          label="Median area income"
          value={currency(summary.median_area_income_usd, "USD", true)}
          hint="US ZCTA household median"
        />
        <Metric
          label="Median US area percentile"
          value={ordinal(summary.median_spending_power_percentile)}
          hint="Household-weighted national rank"
        />
        <Metric
          label="Top-20% customer share"
          value={percent(summary.top_20_customer_share)}
          hint={`${number(summary.top_20_over_index, 2)}× US population expectation`}
        />
        <Metric
          label="Regression R²"
          value={number(regression.r2, 2)}
          hint={relationship}
        />
      </div>

      <div className="mt-5 rounded-xl border border-border bg-surface-2/20 p-3 sm:p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Spending power vs. customer spend</p>
            <p className="text-xs text-muted-foreground">Each dot is one anonymous matched customer; the line is an ordinary least-squares fit.</p>
          </div>
          <p className="text-[0.68rem] text-muted-foreground">n = {regression.n || points.length} · current calibrated geography: US</p>
        </div>

        <div className="mt-3 h-[330px] w-full sm:h-[300px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 900, height: 320 }}>
            <ComposedChart data={points} margin={{ left: 2, right: 14, top: 10, bottom: 6 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 6" vertical={false} />
              <XAxis
                type="number"
                dataKey="area_income_usd"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => currency(Number(v), "USD", true)}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                dy={7}
                name="Area median household income"
              />
              <YAxis
                type="number"
                dataKey="lifetime_spend"
                domain={[0, "auto"]}
                tickFormatter={(v) => currency(Number(v), shopCurrency, true)}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                width={54}
                name="Lifetime ShawQ spend"
              />
              <Tooltip content={<SpendingPowerTooltip currencyCode={shopCurrency} />} cursor={{ stroke: "var(--color-border)" }} />
              <Scatter
                dataKey="lifetime_spend"
                name="Customer lifetime spend"
                fill="var(--color-brand)"
                fillOpacity={0.62}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="fitted_spend"
                name="Regression fit"
                stroke="var(--color-gold)"
                strokeWidth={2.4}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1.5 text-[0.68rem] leading-relaxed text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          Source: {source.provider} · {source.dataset} {source.vintage} · {source.geography}
        </span>
        <span>
          Lifetime request {data.period?.since || "store opening"} → {data.period?.until || "latest refresh"}
        </span>
      </div>
    </div>
  );
}
