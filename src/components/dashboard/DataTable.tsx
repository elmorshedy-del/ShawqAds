import { fmtCurrency, fmtNumber } from "@/lib/dashboard-data";
import type { DayRow } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

const cols = [
  { key: "revenue", label: "Revenue" },
  { key: "spend", label: "Meta spend" },
  { key: "items", label: "Items" },
  { key: "orders", label: "Orders" },
  { key: "aov", label: "AOV" },
  { key: "cac", label: "CAC" },
  { key: "roas", label: "ROAS" },
] as const;

export function DataTable({ rows }: { rows: DayRow[] }) {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Daily breakdown</h2>
          <p className="text-xs text-muted-foreground">Per-day performance across the selected window</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="px-6 py-3 font-medium">Date</th>
              {cols.map((c) => (
                <th key={c.key} className="px-4 py-3 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.date}
                className="border-t border-border/70 transition-colors hover:bg-surface-2/60"
              >
                <td className="whitespace-nowrap px-6 py-3.5 font-medium">
                  {r.date}
                  {r.developing && (
                    <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[0.65rem] font-semibold text-primary">
                      Developing
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5 font-medium">{fmtCurrency(r.revenue)}</td>
                <td className="px-4 py-3.5 text-muted-foreground">{fmtCurrency(r.spend)}</td>
                <td className="px-4 py-3.5 text-muted-foreground">{fmtNumber(r.items)}</td>
                <td className="px-4 py-3.5 text-muted-foreground">{fmtNumber(r.orders)}</td>
                <td className="px-4 py-3.5 text-muted-foreground">{fmtCurrency(r.aov)}</td>
                <td className="px-4 py-3.5 text-muted-foreground">{fmtCurrency(r.cac)}</td>
                <td
                  className={cn(
                    "px-4 py-3.5 font-semibold",
                    r.roas >= 2.5 ? "text-positive" : r.roas >= 2 ? "text-gold" : "text-destructive",
                  )}
                >
                  {r.roas.toFixed(2)}x
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
