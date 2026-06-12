import { ArrowDownRight, ArrowUpRight, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

export function Benchmarks({ data }: { data: { region: string; month: string; items: { label: string; value: number; prev: number; delta: number; prefix?: string; lowerIsBetter: boolean }[] } }) {
  return (
    <div className="panel p-6">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Gauge className="h-4 w-4" />
        </span>
        <h2 className="font-display text-lg font-semibold tracking-tight">Delivery vs benchmark</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Live efficiency compared with the {data.month} {data.region} baseline
      </p>

      <div className="mt-5 space-y-3">
        {data.items.map((b) => {
          const good = b.lowerIsBetter ? b.delta < 0 : b.delta > 0;
          const up = b.delta >= 0;
          return (
            <div key={b.label} className="rounded-xl border border-border bg-surface-2/50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {b.label}
                </p>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold",
                    good ? "bg-positive/12 text-positive" : "bg-destructive/12 text-destructive",
                  )}
                >
                  {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(b.delta).toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="font-display text-2xl font-semibold tabular-nums">
                  {b.prefix}
                  {b.value}
                </p>
                <p className="text-xs text-muted-foreground">
                  vs {b.prefix}
                  {b.prev}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
