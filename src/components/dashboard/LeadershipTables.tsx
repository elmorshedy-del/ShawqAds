import { useState } from "react";
import { Crown, Package, Megaphone } from "lucide-react";
import { fmtCurrency, fmtPct, type ProductLeader, type AdLeader } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

type Tab = "products" | "ads";

function roasClass(v: number) {
  if (v >= 3) return "text-positive";
  if (v >= 1.5) return "text-gold";
  if (v > 0) return "text-destructive";
  return "text-muted-foreground";
}

export function LeadershipTables({ products, ads }: { products: ProductLeader[]; ads: AdLeader[] }) {
  const [tab, setTab] = useState<Tab>("products");
  const maxUnits = Math.max(...products.map((p) => p.units), 1);
  const maxSpend = Math.max(...ads.map((a) => a.spend), 1);

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Crown className="h-4 w-4" />
            </span>
            <h2 className="font-display text-lg font-semibold tracking-tight">Leadership tables</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Top Shopify products and Shopify-captured ads for the selected window
          </p>
        </div>
        <div className="inline-flex self-start rounded-full border border-border bg-surface-2 p-1">
          {([
            { key: "products", label: "Products", icon: Package },
            { key: "ads", label: "Ads", icon: Megaphone },
          ] as const).map((t) => {
            const on = tab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                  on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "products" ? (
        <div className="divide-y divide-border/70">
          {products.map((p, i) => (
            <div key={p.name} className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-surface-2/50">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 font-display text-sm font-semibold text-foreground">
                {p.initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.category}</p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(p.units / maxUnits) * 100}%`, background: "var(--gradient-primary)" }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-base font-semibold tabular-nums">{p.units}</p>
                <p className="text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground">units</p>
              </div>
              <div className="w-24 shrink-0 text-right tabular-nums">
                <p className="text-sm font-semibold text-positive">{fmtCurrency(p.revenue)}</p>
                {i === 0 && (
                  <span className="text-[0.6rem] font-medium text-gold">top seller</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground">
                <th className="px-6 py-3 text-left font-medium">Ad</th>
                <th className="px-3 py-3 text-right font-medium">Sales</th>
                <th className="px-3 py-3 text-right font-medium">ROAS</th>
                <th className="px-3 py-3 text-right font-medium">CTR</th>
                <th className="px-3 py-3 text-right font-medium">ATC</th>
                <th className="px-3 py-3 text-right font-medium">IC</th>
                <th className="px-6 py-3 text-right font-medium">Spend</th>
              </tr>
            </thead>
            <tbody>
              {ads.map((a) => (
                <tr key={a.name} className="border-t border-border/70 transition-colors hover:bg-surface-2/50">
                  <td className="px-6 py-3">
                    <p className="font-medium leading-tight">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.category} · {a.campaigns} campaign{a.campaigns > 1 ? "s" : ""}
                    </p>
                    <div className="mt-1.5 h-1 w-32 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(a.spend / maxSpend) * 100}%`, background: "var(--color-gold)" }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{a.sales}</td>
                  <td className={cn("px-3 py-3 text-right font-semibold tabular-nums", roasClass(a.roas))}>
                    {a.roas.toFixed(2)}x
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{fmtPct(a.ctr)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{a.atc}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{a.ic}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-muted-foreground">{fmtCurrency(a.spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
