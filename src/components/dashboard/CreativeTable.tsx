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
  dataStrength: { key: string; label: string };
  verdict: { key: string; label: string };
}

type SortKey = "purchases" | "spend" | "roas" | "winProb" | "visits" | "ctr";

const dataStrengthTone: Record<string, string> = {
  LOW: "bg-surface-2 text-muted-foreground",
  MED: "bg-gold/12 text-gold",
  HIGH: "bg-positive/12 text-positive",
};

const verdictTone: Record<string, string> = {
  WINNER: "bg-positive/12 text-positive",
  PROMISING: "bg-gold/12 text-gold",
  NEUTRAL: "bg-surface-2 text-muted-foreground",
  LOSER: "bg-destructive/10 text-destructive",
  DEAD: "bg-destructive/16 text-destructive",
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
  baselineCvr,
}: {
  rows: CreativeRow[];
  baselineCvr: number;
}) {
  const [sort, setSort] = useState<SortKey>("purchases");

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (Number(b[sort] ?? 0) - Number(a[sort] ?? 0))),
    [rows, sort],
  );

  const sorts: { key: SortKey; label: string }[] = [
    { key: "purchases", label: "Sales" },
    { key: "spend", label: "Spend" },
    { key: "roas", label: "ROAS" },
    { key: "winProb", label: "Win prob" },
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
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Each creative&rsquo;s conversion rate against the {pct(baselineCvr * 100, 2)} account baseline.
            Win prob is the chance it genuinely beats that baseline; P10 is how bad it plausibly is.
            Both are shrunk toward the baseline, so a creative with one visit cannot post 100%.
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
                <th className="px-4 py-3 text-right font-medium">Impressions</th>
                <th className="px-4 py-3 text-right font-medium">CTR</th>
                <th className="px-4 py-3 text-right font-medium">Add to cart</th>
                <th className="px-4 py-3 text-right font-medium">ATC rate</th>
                <th className="px-4 py-3 text-right font-medium">Sales</th>
                <th className="px-4 py-3 text-right font-medium">Visits</th>
                <th className="px-4 py-3 text-right font-medium">Win prob</th>
                <th className="px-4 py-3 text-right font-medium">P10</th>
                <th className="px-4 py-3 text-left font-medium">Data</th>
                <th className="px-4 py-3 text-left font-medium">Result</th>
                <th className="px-4 py-3 text-right font-medium">AOV</th>
                <th className="px-4 py-3 text-right font-medium">ROAS</th>
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
                  <td className="px-4 py-3 text-right tabular-nums">{num(creative.impressions)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(creative.ctr, 2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{num(creative.atc)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(creative.atcRate, 2)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{num(creative.purchases)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{num(creative.visits)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {pct(creative.winProb == null ? null : creative.winProb * 100, 1)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {pct(creative.p10 == null ? null : creative.p10 * 100, 2)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold tracking-[0.04em]",
                        dataStrengthTone[creative.dataStrength.key] ?? "bg-surface-2 text-muted-foreground",
                      )}
                    >
                      {creative.dataStrength.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold tracking-[0.04em]",
                        verdictTone[creative.verdict.key] ?? "bg-surface-2 text-muted-foreground",
                      )}
                    >
                      {creative.verdict.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(creative.aov)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-positive">
                    {roasText(creative.roas)}
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
