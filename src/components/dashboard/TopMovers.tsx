import { Package, Megaphone, Globe2, Sparkles, type LucideIcon } from "lucide-react";
import { fmtCurrency, fmtX } from "@/lib/dashboard-data";

type Kind = "product" | "ad" | "country";

interface LeaderLike {
  name?: string;
  category?: string;
  units?: number;
  revenue?: number;
  sales?: number;
  /** null when there was no spend to divide by — not the same as 0x. */
  roas?: number | null;
  roasBasisSpend?: number | null;
  /** True when the window is a day still in progress, so spend is incomplete. */
  partialDay?: boolean;
  flag?: string;
  country?: string;
}

export interface TopMoverCompare {
  label: string;
  entry?: LeaderLike | null;
}

export interface TopMoverCard {
  kind: Kind;
  label: string;
  /** Leader over the window the card is scoped to — not necessarily a single day. */
  hero?: LeaderLike | null;
  /** Context windows, labelled by the caller because they depend on the scope. */
  compare?: TopMoverCompare[];
}

interface TopMoversProps {
  cards: TopMoverCard[];
  focusLabel?: string;
}

/**
 * Multiple above which a still-running day earns the partial-spend caveat.
 *
 * This gates a sentence, never a number: every ad's ROAS is reported as it
 * computes, whatever this is set to. It is only the point past which a figure is
 * better explained by the day being young than by the ad being exceptional.
 */
const SAME_DAY_CAVEAT_ABOVE_ROAS = 5;

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
  // An ad with no spend has no return to divide, which is not the same as 0x.
  // Any ad that did spend shows its ROAS as computed — the spend behind it is
  // on the line below, so a large multiple on thin spend reads as thin spend.
  if (kind === "ad" && e.roas == null) return fmtCurrency(e.revenue ?? 0);
  // A country with revenue but no recorded spend has no return to state. It used
  // to render as "0.00x", which reads as a market that returned nothing.
  if (kind === "country" && e.roas == null) return fmtCurrency(e.revenue ?? 0);
  return fmtX(e.roas ?? 0);
}

function subOf(kind: Kind, e?: LeaderLike | null) {
  if (!e) return "Awaiting first sale";
  if (kind === "product") return `${e.units ?? 0} units · ${e.category ?? "—"}`;
  if (kind === "ad") {
    const base = `${e.sales ?? 0} sales · ${e.category ?? "—"}`;
    if (e.roas == null) return `${base} · no spend recorded`;
    // A day still running has only part of its spend recorded. Early on, the
    // denominator is a small fraction of where it will close, which both widens
    // the range this figure can take and biases it upward — so the note names
    // the spread and the direction, not just the fact that the day is unfinished.
    if (e.partialDay && (e.roas ?? 0) >= SAME_DAY_CAVEAT_ABOVE_ROAS) {
      return `${base} (day in progress — spend accrues through the day, so early readings range widely and converge lower)`;
    }
    return base;
  }
  if (e.roas == null) return `${e.units ?? 0} units · ${fmtCurrency(e.revenue ?? 0)} · no spend recorded`;
  return `${e.units ?? 0} units · ${fmtCurrency(e.revenue ?? 0)}`;
}

function compactOf(kind: Kind, e?: LeaderLike | null) {
  if (!e) return { name: "—", metric: "no data" };
  if (kind === "product") return { name: e.name ?? "—", metric: `${e.units ?? 0}u · ${fmtCurrency(e.revenue ?? 0)}` };
  if (kind === "ad") {
    return {
      name: e.name ?? "—",
      metric: e.roas == null ? `${e.sales ?? 0} · ${fmtCurrency(e.revenue ?? 0)}` : `${e.sales ?? 0} · ${fmtX(e.roas)}`,
    };
  }
  // Every compare cell carries its volume. A bare "22.04x" with no denominator
  // gives the reader nothing to weigh it against, and a bare "0.00x" hides that
  // the spend behind it was simply never recorded.
  return {
    name: `${e.flag ?? ""} ${e.country ?? "—"}`.trim(),
    metric: e.roas == null
      ? `${e.units ?? 0}u · ${fmtCurrency(e.revenue ?? 0)} · no spend`
      : `${e.units ?? 0}u · ${fmtX(e.roas)}`,
  };
}

function headingFor(focusLabel: string) {
  if (focusLabel === "Today") return "Today's top movers";
  if (focusLabel === "Selected range") return "Top movers for selected range";
  return `Top movers for ${focusLabel}`;
}

function copyFor(focusLabel: string) {
  if (focusLabel === "Selected range") return "Leaders for the selected range, against the previous period of equal length";
  if (focusLabel === "Today") return "Today's leaders with this week & last week for context";
  return `Leaders for ${focusLabel} with this week & last week for context`;
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

function MoverCard({ card, focusLabel }: { card: TopMoverCard; focusLabel: string }) {
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
          {focusLabel}
        </span>
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 break-words font-display text-base font-semibold leading-snug">
          {titleOf(card.kind, card.hero)}
        </p>
        <p className="shrink-0 font-display text-lg font-semibold tabular-nums" style={{ color: m.color }}>
          {heroOf(card.kind, card.hero)}
        </p>
      </div>
      <p className="mt-0.5 break-words text-xs leading-snug text-muted-foreground">{subOf(card.kind, card.hero)}</p>

      {card.compare?.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
          {card.compare.map((c) => (
            <CompareCell key={c.label} label={c.label} kind={card.kind} entry={c.entry} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TopMovers({ cards, focusLabel = "Today" }: TopMoversProps) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">{headingFor(focusLabel)}</h2>
          <p className="text-[0.7rem] text-muted-foreground">{copyFor(focusLabel)}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {cards.map((card) => (
          <MoverCard key={card.kind} card={card} focusLabel={focusLabel} />
        ))}
      </div>
    </section>
  );
}
