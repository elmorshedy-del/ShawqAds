import { Package, Megaphone, Globe2, Sparkles, type LucideIcon } from "lucide-react";
import { fmtCurrency, fmtX } from "@/lib/dashboard-data";

type Kind = "product" | "ad" | "country";

interface LeaderLike {
  name?: string;
  category?: string;
  units?: number;
  revenue?: number;
  sales?: number;
  roas?: number;
  flag?: string;
  country?: string;
}

export interface TopMoverCard {
  kind: Kind;
  label: string;
  today?: LeaderLike | null;
  currentWeek?: LeaderLike | null;
  prevWeek?: LeaderLike | null;
}

const kindMeta: Record<Kind, { icon: LucideIcon; color: string; heroLabel: string }> = {
  product: { icon: Package, color: "var(--color-brand)", heroLabel: "revenue" },
  ad: { icon: Megaphone, color: "var(--color-gold)", heroLabel: "ROAS" },
  country: { icon: Globe2, color: "var(--color-positive)", heroLabel: "ROAS" },
};

function titleOf(kind: Kind, e?: LeaderLike | null) {
  if (!e) return "No sale captured";
  if (kind === "country") return `${e.flag ?? ""} ${e.country ?? e.name ?? "—"}`.trim();
  return e.name ?? "—";
}

function heroOf(kind: Kind, e?: LeaderLike | null) {
  if (!e) return "—";
  if (kind === "product") return fmtCurrency(e.revenue ?? 0);
  return fmtX(e.roas ?? 0);
}

function subOf(kind: Kind, e?: LeaderLike | null) {
  if (!e) return "Awaiting first sale";
  if (kind === "product") return `${e.units ?? 0} units · ${e.category ?? "—"}`;
  if (kind === "ad") return `${e.sales ?? 0} sales · ${e.category ?? "—"}`;
  return `${e.units ?? 0} units · ${fmtCurrency(e.revenue ?? 0)}`;
}

function compactOf(kind: Kind, e?: LeaderLike | null) {
  if (!e) return { name: "—", metric: "no data" };
  if (kind === "product") return { name: e.name ?? "—", metric: `${e.units ?? 0}u · ${fmtCurrency(e.revenue ?? 0)}` };
  if (kind === "ad") return { name: e.name ?? "—", metric: `${e.sales ?? 0} · ${fmtX(e.roas ?? 0)}` };
  return { name: `${e.flag ?? ""} ${e.country ?? "—"}`.trim(), metric: fmtX(e.roas ?? 0) };
}

function CompareCell({ label, kind, entry }: { label: string; kind: Kind; entry?: LeaderLike | null }) {
  const c = compactOf(kind, entry);
  return (
    <div className="min-w-0 rounded-lg bg-surface-2/50 px-2.5 py-2">
      <p className="text-[0.55rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-xs font-medium leading-snug">{c.name}</p>
      <p className="mt-0.5 truncate text-[0.65rem] tabular-nums leading-snug text-muted-foreground">{c.metric}</p>
    </div>
  );
}

function MoverCard({ card }: { card: TopMoverCard }) {
  const m = kindMeta[card.kind];
  const Icon = m.icon;
  return (
    <div
      className="panel relative overflow-hidden p-5"
      style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${m.color} 6%, var(--color-card)), var(--color-card) 60%)` }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5" style={{ background: m.color }} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{ background: `color-mix(in oklab, ${m.color} 16%, white)`, color: m.color }}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{card.label}</span>
        </div>
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Today
        </span>
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 break-words font-display text-base font-semibold leading-snug">
          {titleOf(card.kind, card.today)}
        </p>
        <p className="shrink-0 font-display text-lg font-semibold tabular-nums" style={{ color: m.color }}>
          {heroOf(card.kind, card.today)}
        </p>
      </div>
      <p className="mt-0.5 break-words text-xs leading-snug text-muted-foreground">{subOf(card.kind, card.today)}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
        <CompareCell label="This week" kind={card.kind} entry={card.currentWeek} />
        <CompareCell label="Prev week" kind={card.kind} entry={card.prevWeek} />
      </div>
    </div>
  );
}

export function TopMovers({ cards }: { cards: TopMoverCard[] }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">Today&apos;s top movers</h2>
          <p className="text-[0.7rem] text-muted-foreground">Today&apos;s leaders with this week &amp; last week for context</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {cards.map((card) => (
          <MoverCard key={card.kind} card={card} />
        ))}
      </div>
    </section>
  );
}
