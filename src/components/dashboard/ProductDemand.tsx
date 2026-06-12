import { useEffect, useState } from "react";
import { Boxes, HandCoins } from "lucide-react";
import { familyColors, fmtCurrency } from "@/lib/dashboard-data";

export function ProductDemand({ data }: { data: { tipsPeople: number; tipsTotal: number; totalUnits: number; since: string; families: { label: string; units: number }[]; topProducts: { name: string; units: number }[] } }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const maxFam = Math.max(...data.families.map((f) => f.units), 1);
  const maxProd = Math.max(...data.topProducts.map((p) => p.units), 1);

  return (
    <div className="panel p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Boxes className="h-4 w-4" />
            </span>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Product demand after launch
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.totalUnits} merch units · since {data.since}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-surface-2/60 px-3 py-1.5 text-xs">
          <HandCoins className="h-3.5 w-3.5 text-gold" />
          <span className="font-semibold">{data.tipsPeople} tips</span>
          <span className="text-muted-foreground">{fmtCurrency(data.tipsTotal)}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-x-8 gap-y-6 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            By product family
          </p>
          <div className="space-y-3">
            {data.families.map((f, i) => (
              <div key={f.label}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm">{f.label}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{f.units}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      width: mounted ? `${(f.units / maxFam) * 100}%` : "0%",
                      transitionDelay: `${i * 50}ms`,
                      background: familyColors[f.label] ?? "var(--color-brand)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Top products sold overall
          </p>
          <div className="space-y-3">
            {data.topProducts.map((p, i) => (
              <div key={p.name}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm" title={p.name}>
                    {p.name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{p.units}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      width: mounted ? `${(p.units / maxProd) * 100}%` : "0%",
                      transitionDelay: `${i * 50}ms`,
                      background: "var(--gradient-primary)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
