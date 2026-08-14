import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { fmtCurrency, fmtX } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/EmptyState";

export interface CreativeRow {
  key: string;
  name: string;
  campaign?: string;
  adset?: string;
  category?: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  ctr: number;
  atc: number;
  atcRate: number | null;
  purchases: number;
  visits: number;
  effectivePurchases: number;
  aov: number | null;
  roas: number | null;
  pointCvr: number | null;
  winProb: number | null;
  p10: number | null;
  p90: number | null;
  expectedSales: number;
  estimatedRoas: number | null;
  probAboveTarget: number | null;
  roasLow: number | null;
  roasHigh: number | null;
  spendShare: number;
  dataStrength: { key: string; label: string };
  standing: { key: string; label: string };
}

type SortKey = "spend" | "purchases" | "estimatedRoas" | "probAboveTarget" | "visits" | "ctr";

/**
 * Standing chips describe where a creative's return sits. They are statements
 * about the account, not instructions — no chip tells the reader to cut, scale
 * or pause anything.
 */
const standingTone: Record<string, string> = {
  ABOVE: "bg-positive/12 text-positive",
  AT: "bg-surface-2 text-muted-foreground",
  BELOW: "bg-destructive/10 text-destructive",
  UNREAD: "bg-surface-2 text-muted-foreground",
};

const num = (value: number | null | undefined, decimals = 0) =>
  value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const pct = (value: number | null | undefined, decimals = 1) =>
  value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(decimals)}%`;

const money = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "—" : fmtCurrency(value);

const roasText = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "—" : fmtX(value);

export function CreativeTable({
  rows,
  target,
  costPerSale,
}: {
  rows: CreativeRow[];
  target: number;
  costPerSale: number;
}) {
  const [sort, setSort] = useState<SortKey>("spend");

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (Number(b[sort] ?? 0) - Number(a[sort] ?? 0))),
    [rows, sort],
  );

  const sorts: { key: SortKey; label: string }[] = [
    { key: "spend", label: "Spend" },
    { key: "purchases", label: "Sales" },
    { key: "estimatedRoas", label: "Est. ROAS" },
    { key: "probAboveTarget", label: "Confidence" },
    { key: "visits", label: "Visits" },
    { key: "ctr", label: "CTR" },
  ];

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Sparkles className="h-4 w-4" />
            </span>
            <h2 className="font-display text-lg font-semibold tracking-tight">Creative performance</h2>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Return per dollar against the {roasText(target)} account blend. Est. ROAS is the observed
            figure pulled toward that blend by a prior worth {money(costPerSale)} of spend — one
            expected sale — with the range covering the middle 80% of what the delivery so far
            supports. Confidence is the chance the true return clears the target. A creative needs
            about {money(costPerSale)} of spend before zero sales means anything.
          </p>
        </div>
        <div className="inline-flex flex-wrap gap-1 self-start rounded-full border border-border bg-surface-2 p-1">
          {sorts.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-all",
                sort === s.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!sorted.length ? (
        <EmptyState
          title="No creative delivery in this window"
          body="Ad-level rows appear once Meta reports impressions for the selected range."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[62rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">#</th>
                <th className="px-4 py-3 text-left font-medium">Creative</th>
                <th className="px-4 py-3 text-right font-medium">Spend</th>
                <th className="px-4 py-3 text-right font-medium">% of spend</th>
                <th className="px-4 py-3 text-right font-medium">Impressions</th>
                <th className="px-4 py-3 text-right font-medium">CTR</th>
                <th className="px-4 py-3 text-right font-medium">Add to cart</th>
                <th className="px-4 py-3 text-right font-medium">Sales</th>
                <th className="px-4 py-3 text-right font-medium">Visits</th>
                <th className="px-4 py-3 text-right font-medium">AOV</th>
                <th className="px-4 py-3 text-right font-medium">ROAS</th>
                <th className="px-4 py-3 text-right font-medium">Est. ROAS</th>
                <th className="px-4 py-3 text-right font-medium">Range</th>
                <th className="px-4 py-3 text-right font-medium">Confidence</th>
                <th className="px-4 py-3 text-left font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((creative, index) => (
                <tr key={creative.key} className="border-b border-border/60 last:border-b-0">
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{index + 1}</td>
                  <td className="max-w-[16rem] px-4 py-3">
                    <div className="truncate font-medium" title={creative.name}>
                      {creative.name}
                    </div>
                    {creative.category ? (
                      <div className="truncate text-xs text-muted-foreground">{creative.category}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(creative.spend)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {pct(creative.spendShare * 100, 1)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{num(creative.impressions)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(creative.ctr, 2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{num(creative.atc)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{num(creative.purchases)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{num(creative.visits)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(creative.aov)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{roasText(creative.roas)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {roasText(creative.estimatedRoas)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {creative.roasLow == null || creative.roasHigh == null
                      ? "—"
                      : `${creative.roasLow.toFixed(1)}–${creative.roasHigh.toFixed(1)}x`}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {pct(creative.probAboveTarget == null ? null : creative.probAboveTarget * 100, 0)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.65rem] font-semibold tracking-[0.04em]",
                        standingTone[creative.standing.key] ?? "bg-surface-2 text-muted-foreground",
                      )}
                    >
                      {creative.standing.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
