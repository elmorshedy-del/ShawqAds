import { Megaphone, Trophy } from "lucide-react";
import { fmtCurrency } from "@/lib/dashboard-data";
import type { Leader } from "@/lib/dashboard-data";

export function SalesLeaders({ leader }: { leader: Leader }) {
  return (
    <div className="panel p-6">
      <h2 className="font-display text-lg font-semibold tracking-tight">Daily sales leaders</h2>
      <p className="text-xs text-muted-foreground">Top product and ad/source for {leader.date}</p>

      <div className="mt-5 space-y-4">
        <div className="rounded-xl border border-border bg-surface-2/60 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-gold">
            <Trophy className="h-4 w-4" /> Top product
          </div>
          <p className="mt-2 font-medium leading-snug">{leader.topProduct.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {leader.topProduct.units} units · {fmtCurrency(leader.topProduct.revenue)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-2/60 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <Megaphone className="h-4 w-4" /> Top ad / source
          </div>
          <p className="mt-2 font-medium leading-snug">{leader.topAd.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {leader.topAd.sales} sales · {fmtCurrency(leader.topAd.revenue)}
          </p>
        </div>
      </div>
    </div>
  );
}
