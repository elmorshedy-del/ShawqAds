import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import { familyColors, fmtCurrency, type CountrySales } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

const ranges = ["3D", "7D", "14D", "All"] as const;
type Range = (typeof ranges)[number];

function roasClass(v: number) {
  if (v >= 3) return "text-positive";
  if (v >= 1.5) return "text-gold";
  return "text-destructive";
}

function CountryRow({ c, delay }: { c: CountrySales; delay: number }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-4 transition-colors hover:bg-surface-2/70">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="text-xl leading-none">{c.flag}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{c.country}</p>
          <p className="text-xs text-muted-foreground">
            {c.units} units · {c.products} products
          </p>
        </div>
        <div className="text-right">
          <p className={cn("font-display text-base font-semibold tabular-nums", roasClass(c.roas))}>
            {c.roas.toFixed(2)}x
          </p>
          <p className="text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground">ROAS</p>
        </div>
      </button>

      {/* Stacked product-mix bar */}
      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        {c.splits.map((s, i) => (
          <div
            key={s.label}
            className="h-full transition-[width] duration-700 ease-out"
            style={{
              width: mounted ? `${s.pct}%` : "0%",
              transitionDelay: `${delay + i * 60}ms`,
              background: familyColors[s.label] ?? "var(--color-brand)",
            }}
            title={`${s.label} ${s.pct}%`}
          />
        ))}
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <span className="text-muted-foreground">
              Shopify <span className="font-semibold text-positive">{fmtCurrency(c.revenue)}</span>
            </span>
            <span className="text-right text-muted-foreground">
              Spend <span className="font-semibold text-foreground">{fmtCurrency(c.spend)}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
            {c.splits.map((s) => (
              <span key={s.label} className="flex items-center gap-1.5 text-xs">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: familyColors[s.label] ?? "var(--color-brand)" }}
                />
                {s.label} <span className="font-semibold tabular-nums">{s.pct}%</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function CountrySalesPanel({
  countries,
  windows,
}: {
  countries: CountrySales[];
  /** Optional per-window country aggregates. Falls back to `countries` (the
   *  full launch-window view) for any range that isn't supplied. */
  windows?: Partial<Record<Range, CountrySales[]>>;
}) {
  const [range, setRange] = useState<Range>("All");
  const shown = windows?.[range] ?? countries;

  return (
    <div className="panel p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Globe2 className="h-4 w-4" />
            </span>
            <h2 className="font-display text-lg font-semibold tracking-tight">Country sales + ROAS</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Per-market revenue, spend and product-mix breakdown
            {range === "All" ? " since launch" : ` · trailing ${range}`} · tap a country for detail
          </p>
        </div>

        <div className="inline-flex self-start rounded-full border border-border bg-surface-2 p-1">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-all",
                range === r
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c, i) => (
            <CountryRow key={`${range}-${c.country}`} c={c} delay={i * 40} />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-border bg-surface-2/40 px-4 py-10 text-center text-sm text-muted-foreground">
          No country sales in the trailing {range} window.
        </div>
      )}
    </div>
  );
}
