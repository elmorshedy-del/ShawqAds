import { Mail, Inbox, Package, ShoppingBag, Send, Sparkles } from "lucide-react";
import { fmtCurrency } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

const ACCENT = "var(--color-chart-4)";

export type EmailProduct = { product: string; units: number; revenue_usd: number };
export type EmailCampaignRow = { name: string; orders: number; revenue_usd: number };

export interface EmailSummary {
  orders: number;
  units: number;
  revenue_usd: number;
  products?: EmailProduct[];
  campaigns?: EmailCampaignRow[];
}

export interface EmailOrder {
  id: string;
  flag?: string;
  location?: string;
  city?: string;
  product?: string;
  amount: number;
  currency: string;
  items: number;
  time?: string;
  source?: string;
}

export interface EmailCampaignProps {
  summary?: EmailSummary | null;
  orders?: EmailOrder[];
  isLive?: boolean;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount || 0);
  } catch {
    return `${currency || "USD"} ${Math.round(amount || 0)}`;
  }
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 px-3.5 py-3">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums tracking-tight">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-[0.65rem] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function EmailCampaign({ summary, orders = [], isLive = true }: EmailCampaignProps) {
  const orderCount = summary?.orders ?? orders.length;
  const revenue = summary?.revenue_usd ?? orders.reduce((total, order) => total + (Number(order.amount) || 0), 0);
  const units = summary?.units ?? orders.reduce((total, order) => total + (Number(order.items) || 0), 0);
  const aov = orderCount ? revenue / orderCount : 0;
  const products = summary?.products ?? [];
  const campaigns = (summary?.campaigns ?? []).filter((campaign) => campaign.name && campaign.name !== "Email");
  const list = orders.slice(0, 6);
  const hasActivity = orderCount > 0 || list.length > 0;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in oklab, ${ACCENT} 16%, white)`, color: ACCENT }}
        >
          <Mail className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold tracking-tight">Email campaign</h2>
          <p className="text-[0.7rem] text-muted-foreground">
            Orders attributed to email (utm_medium = email) · tracked apart from paid ads &amp; kept out of top movers
          </p>
        </div>
      </div>

      <div
        className="panel relative overflow-hidden p-5"
        style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${ACCENT} 6%, var(--color-card)), var(--color-card) 60%)` }}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5" style={{ background: ACCENT }} />

        <div className="flex items-center justify-between gap-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.1em]"
            style={{ background: `color-mix(in oklab, ${ACCENT} 14%, white)`, color: ACCENT }}
          >
            <Send className="h-3 w-3" /> Email channel
          </span>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {isLive ? "Today" : "Sample"}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile label="Email orders" value={orderCount.toLocaleString()} sub={`${units.toLocaleString()} units`} />
          <StatTile label="Email revenue" value={fmtCurrency(revenue)} sub="Within total Shopify revenue" />
          <StatTile label="Units" value={units.toLocaleString()} sub="Items from email orders" />
          <StatTile label="Avg order" value={orderCount ? fmtCurrency(aov) : "—"} sub="Revenue / email orders" />
        </div>

        {campaigns.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Campaigns</span>
            {campaigns.map((campaign) => (
              <span
                key={campaign.name}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted-foreground"
                title={`${campaign.orders} order${campaign.orders === 1 ? "" : "s"} · ${fmtCurrency(campaign.revenue_usd)}`}
              >
                <Sparkles className="h-3 w-3" style={{ color: ACCENT }} />
                <span className="max-w-[12rem] truncate font-medium text-foreground">{campaign.name}</span>
                <span className="tabular-nums">{fmtCurrency(campaign.revenue_usd)}</span>
              </span>
            ))}
          </div>
        ) : null}

        {hasActivity ? (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <Inbox className="h-3.5 w-3.5" /> Recent email orders
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {list.map((order, index) => {
                  const subtitle = [`${order.items} item${order.items === 1 ? "" : "s"}`, order.product]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li
                      key={order.id}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        index === 0 ? "bg-surface-2" : "hover:bg-surface-2/70",
                      )}
                    >
                      <span
                        className="mt-1 h-2 w-2 shrink-0 self-start rounded-full"
                        style={{ background: ACCENT, opacity: index === 0 ? 1 : 0.6 }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate font-medium">
                            {order.flag ? `${order.flag} ` : ""}
                            {order.location || order.city || "—"}
                          </span>
                          <span className="shrink-0 font-display font-semibold tracking-tight">
                            {formatMoney(order.amount, order.currency)}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                          <span className="truncate">{subtitle || "—"}</span>
                          {order.time ? <span className="shrink-0">{order.time}</span> : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
                {list.length === 0 ? (
                  <li className="rounded-lg px-2.5 py-2 text-sm text-muted-foreground">
                    Email orders counted, awaiting per-order detail
                  </li>
                ) : null}
              </ul>
            </div>

            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <Package className="h-3.5 w-3.5" /> Top products via email
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {products.slice(0, 5).map((product) => (
                  <li
                    key={product.product}
                    className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2/70"
                  >
                    <span className="min-w-0 truncate font-medium">{product.product}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {product.units}u · {fmtCurrency(product.revenue_usd)}
                    </span>
                  </li>
                ))}
                {products.length === 0 ? (
                  <li className="rounded-lg px-2.5 py-2 text-sm text-muted-foreground">No product breakdown yet</li>
                ) : null}
              </ul>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            <ShoppingBag className="h-5 w-5 shrink-0" style={{ color: ACCENT }} />
            <p>
              No email-driven orders yet today. Orders tagged <span className="font-medium text-foreground">utm_medium = email</span>{" "}
              in Shopify land here and are excluded from the paid-ads top movers.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
