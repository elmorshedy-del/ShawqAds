import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import { familyColors, fmtCurrency, type CountrySales } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

// Conversion count, not unit quantity, determines whether a market has enough
// independent outcomes to colour its ROAS as a verdict. One bulk order can contain
// five units without providing five observations.
const LOW_SAMPLE_ORDERS = 5;

function roasClass(v: number, lowSample = false) {
  if (lowSample) return "text-muted-foreground";
  if (v >= 3) return "text-positive";
  if (v >= 1.5) return "text-gold";
  return "text-destructive";
}

function CountryRow({ c, delay }: { c: CountrySales; delay: number }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const lowSample = c.orders < LOW_SAMPLE_ORDERS;
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-2/40 p-4 transition-colors hover:bg-surface-2/70">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="text-xl leading-none">{c.flag}</span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-snug">{c.country}</p>
          <p className="text-xs text-muted-foreground">
            {c.orders} orders · {c.units} units · {c.products} products
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "font-display text-base font-semibold tabular-nums",
              roasClass(c.roas, lowSample),
            )}
            title={
              lowSample
                ? `Only ${c.orders} order${c.orders === 1 ? "" : "s"} — too few independent outcomes to read this ROAS as a verdict`
                : undefined
            }
          >
            {c.roas.toFixed(2)}x
          </p>
          <p className="text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground">
            {lowSample ? "ROAS · low sample" : "ROAS"}
          </p>
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
  scopeLabel,
}: {
  countries: CountrySales[];
  scopeLabel?: string;
}) {
  return (
    <div className="panel min-w-0 overflow-hidden p-4 sm:p-6">
      <div className="min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Globe2 className="h-4 w-4" />
            </span>
            <h2 className="font-display text-base font-semibold tracking-tight sm:text-lg">
              Country sales + ROAS
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Per-market revenue, spend and product mix · {scopeLabel || "selected window"} · tap a country for detail
          </p>
        </div>
      </div>

      {countries.length ? (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {countries.map((c, i) => (
            <CountryRow key={c.country} c={c} delay={i * 40} />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-border bg-surface-2/40 px-4 py-10 text-center text-sm text-muted-foreground">
          No country sales in the selected window.
        </div>
      )}
    </div>
  );
}
