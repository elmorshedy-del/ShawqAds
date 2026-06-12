import { useState } from "react";
import { ListChecks } from "lucide-react";
import { fmtCurrency, type AdSetDecision } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

type SortKey = "spend" | "sales" | "roas" | "cpm" | "reachPerDollar";

function deltaClass(v: number, lowerIsBetter = false) {
  if (v === 0) return "text-muted-foreground";
  const good = lowerIsBetter ? v < 0 : v > 0;
  return good ? "text-positive" : "text-destructive";
}

function Delta({ v, lowerIsBetter }: { v: number; lowerIsBetter?: boolean }) {
  return (
    <span className={cn("tabular-nums", deltaClass(v, lowerIsBetter))}>
      {v > 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

export function AdSetDecisionTable({ rows }: { rows: AdSetDecision[] }) {
  const [sort, setSort] = useState<SortKey>("spend");
  const sorted = [...rows].sort((a, b) => (b[sort] as number) - (a[sort] as number));

  const sorts: { key: SortKey; label: string }[] = [
    { key: "spend", label: "Spend" },
    { key: "sales", label: "Sales" },
    { key: "roas", label: "ROAS" },
    { key: "cpm", label: "CPM" },
    { key: "reachPerDollar", label: "Reach/$" },
  ];

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <ListChecks className="h-4 w-4" />
            </span>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Ad set decision table
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            USA launch delivery vs March benchmark with a recommended next action
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="text-[0.65rem] uppercase tracking-[0.1em] text-muted-foreground">
              <th className="px-6 py-3 text-left font-medium">Ad set</th>
              <th className="px-3 py-3 text-right font-medium">Sales</th>
              <th className="px-3 py-3 text-right font-medium">ROAS</th>
              <th className="px-3 py-3 text-right font-medium">Spend</th>
              <th className="px-3 py-3 text-right font-medium">Freq</th>
              <th className="px-3 py-3 text-right font-medium">CPM</th>
              <th className="px-3 py-3 text-right font-medium">Reach/$</th>
              <th className="px-3 py-3 text-right font-medium">CPM vs Mar</th>
              <th className="px-6 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r: AdSetDecision) => (
              <tr
                key={r.adSet}
                className="border-t border-border/70 transition-colors hover:bg-surface-2/50"
              >
                <td className="px-6 py-3">
                  <p className="font-medium leading-tight">{r.adSet}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.campaign} · {r.status}
                  </p>
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{r.sales}</td>
                <td
                  className={cn(
                    "px-3 py-3 text-right font-semibold tabular-nums",
                    r.roas >= 3 ? "text-positive" : r.roas > 0 ? "text-gold" : "text-muted-foreground",
                  )}
                >
                  {r.roas.toFixed(2)}x
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {fmtCurrency(r.spend)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {r.freq.toFixed(2)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {fmtCurrency(r.cpm)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {r.reachPerDollar.toFixed(1)}
                </td>
                <td className="px-3 py-3 text-right text-xs font-medium">
                  <Delta v={r.cpmVsMar} lowerIsBetter />
                </td>
                <td className="px-6 py-3 text-right">
                  <span className="inline-flex rounded-full bg-gold/12 px-2.5 py-1 text-xs font-medium text-gold">
                    {r.action}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-6 py-3 text-xs text-muted-foreground">
        CTR shown as link CTR. Low-sample ad sets need more delivery before ROAS is trustworthy.
      </p>
    </div>
  );
}
