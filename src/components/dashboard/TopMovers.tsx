import { useEffect, useMemo, useState } from "react";
import { Package, Megaphone, Globe2, Sparkles, type LucideIcon } from "lucide-react";
import { fmtCurrency, fmtX } from "@/lib/dashboard-data";
import { loadSettledTopMovers } from "@/lib/topMoverData";

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
  /** True only for the current reporting day. */
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
  hero?: LeaderLike | null;
  compare?: TopMoverCompare[];
}

interface TopMoversProps {
  cards: TopMoverCard[];
  focusLabel?: string;
}

interface SettledModel {
  hero?: Partial<Record<Kind, LeaderLike | null>>;
  thisWeek?: Partial<Record<Kind, LeaderLike | null>>;
  lastWeek?: Partial<Record<Kind, LeaderLike | null>>;
  windows?: { hero?: { since?: string; until?: string } | null };
}

const kindMeta: Record<Kind, { icon: LucideIcon; color: string }> = {
  product: { icon: Package, color: "var(--color-brand)" },
  ad: { icon: Megaphone, color: "var(--color-gold)" },
  country: { icon: Globe2, color: "var(--color-positive)" },
};

function currentReportingDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftIsoDate(date: string, days: number) {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function titleOf(kind: Kind, e?: LeaderLike | null) {
  if (!e) return "No sale captured";
  if (kind === "country") return `${e.flag ?? ""} ${e.country ?? e.name ?? "—"}`.trim();
  return e.name ?? "—";
}

function heroOf(kind: Kind, e?: LeaderLike | null) {
  if (!e) return "—";
  if (kind === "product") return fmtCurrency(e.revenue ?? 0);
  if (e.roas == null) return fmtCurrency(e.revenue ?? 0);
  return fmtX(e.roas);
}

function subOf(kind: Kind, e?: LeaderLike | null) {
  if (!e) return "Awaiting first sale";
  if (kind === "product") return `${e.units ?? 0} units · ${e.category ?? "—"}`;
  if (kind === "ad") {
    const base = `${e.sales ?? 0} sales · ${e.category ?? "—"}`;
    return e.roas == null ? `${base} · no spend recorded` : base;
  }
  return e.roas == null
    ? `${e.units ?? 0} units · ${fmtCurrency(e.revenue ?? 0)} · no spend recorded`
    : `${e.units ?? 0} units · ${fmtCurrency(e.revenue ?? 0)}`;
}

function compactOf(kind: Kind, e?: LeaderLike | null) {
  if (!e) return { name: "—", metric: "no settled data" };
  if (kind === "product") {
    return { name: e.name ?? "—", metric: `${e.units ?? 0}u · ${fmtCurrency(e.revenue ?? 0)}` };
  }
  if (kind === "ad") {
    return {
      name: e.name ?? "—",
      metric: e.roas == null
        ? `${e.sales ?? 0} · ${fmtCurrency(e.revenue ?? 0)}`
        : `${e.sales ?? 0} · ${fmtX(e.roas)}`,
    };
  }
  return {
    name: `${e.flag ?? ""} ${e.country ?? "—"}`.trim(),
    metric: e.roas == null
      ? `${e.units ?? 0}u · ${fmtCurrency(e.revenue ?? 0)} · no spend`
      : `${e.units ?? 0}u · ${fmtX(e.roas)}`,
  };
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

function LiveCell({ kind, entry }: { kind: Kind; entry?: LeaderLike | null }) {
  const c = compactOf(kind, entry);
  const spendDependent = kind === "ad" || kind === "country";
  return (
    <div className="rounded-lg border border-border/80 bg-surface-2/35 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.55rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Today · live</p>
        <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[0.52rem] font-semibold uppercase tracking-[0.08em] text-gold">
          Provisional
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <p className="min-w-0 break-words text-xs font-medium leading-snug">{c.name}</p>
        <p className="shrink-0 text-xs font-semibold tabular-nums">{c.metric}</p>
      </div>
      {spendDependent && entry ? (
        <p className="mt-1.5 text-[0.62rem] leading-snug text-muted-foreground">
          Day in progress — Meta spend is still accruing, so ROAS is provisional and can read artificially high before close.
        </p>
      ) : null}
    </div>
  );
}

function MoverCard({
  card,
  focusLabel,
  live,
}: {
  card: TopMoverCard;
  focusLabel: string;
  live?: LeaderLike | null;
}) {
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

      {live ? <div className="mt-3"><LiveCell kind={card.kind} entry={live} /></div> : null}

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

/**
 * Today is intentionally not the authoritative Top Movers window.
 *
 * Revenue can land before Meta has accrued the day's full spend, so a live ROAS
 * is useful as a pulse but unsafe as the headline or as input to weekly ranking.
 * For the Today dashboard scope we therefore render:
 *   1. latest completed day as the hero,
 *   2. today as a smaller live/provisional card,
 *   3. this week using completed days only,
 *   4. the full prior Monday-Sunday week.
 *
 * Historical/custom scopes continue to use the caller-provided model unchanged.
 */
export function TopMovers({ cards, focusLabel = "Today" }: TopMoversProps) {
  const todayScope = focusLabel === "Today";
  const [settled, setSettled] = useState<SettledModel | null>(null);
  const [settledError, setSettledError] = useState(false);

  useEffect(() => {
    if (!todayScope) return undefined;
    let cancelled = false;
    setSettledError(false);
    loadSettledTopMovers(currentReportingDay())
      .then((model) => { if (!cancelled) setSettled(model as SettledModel); })
      .catch(() => { if (!cancelled) setSettledError(true); });
    return () => { cancelled = true; };
  }, [todayScope]);

  const displayCards = useMemo(() => {
    if (!todayScope || !settled) return cards;
    return cards.map((card) => ({
      ...card,
      hero: settled.hero?.[card.kind] ?? null,
      compare: [
        { label: "This week", entry: settled.thisWeek?.[card.kind] ?? null },
        { label: "Last week", entry: settled.lastWeek?.[card.kind] ?? null },
      ],
    }));
  }, [cards, settled, todayScope]);

  const settledDay = settled?.windows?.hero?.until || "";
  const reportingToday = currentReportingDay();
  const expectedYesterday = shiftIsoDate(reportingToday, -1);
  const displayFocus = todayScope && settled
    ? (settledDay === expectedYesterday ? "Yesterday" : (settledDay || "Latest completed"))
    : focusLabel;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">
            {todayScope ? "Top movers · settled + live" : (focusLabel === "Selected range" ? "Top movers for selected range" : `Top movers for ${focusLabel}`)}
          </h2>
          <p className="text-[0.7rem] text-muted-foreground">
            {todayScope
              ? "Latest completed day is authoritative; today stays visible as a provisional pulse"
              : "Leaders for the selected range with comparison context"}
          </p>
          {todayScope && settledError ? (
            <p className="mt-0.5 text-[0.62rem] text-muted-foreground">Settled comparison is temporarily unavailable; live values remain provisional.</p>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {displayCards.map((card, index) => {
          const liveHero = cards[index]?.hero;
          return (
            <MoverCard
              key={card.kind}
              card={card}
              focusLabel={displayFocus}
              live={todayScope && liveHero ? { ...liveHero, partialDay: true } : null}
            />
          );
        })}
      </div>
    </section>
  );
}
