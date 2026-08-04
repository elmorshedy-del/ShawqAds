import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  Lightbulb,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type FindingTone = "positive" | "negative" | "watch" | "neutral";

export interface Finding {
  id: string;
  metric?: string;
  tone: FindingTone;
  headline: string;
  context?: string;
  driver?: string;
  action?: string;
}

export interface Verdict {
  tone: FindingTone;
  headline: string;
  detail?: string;
}

const toneStyles: Record<FindingTone, { dot: string; text: string; rail: string; chip: string }> = {
  positive: {
    dot: "bg-positive",
    text: "text-positive",
    rail: "before:bg-positive/45",
    chip: "bg-positive/10 text-positive",
  },
  negative: {
    dot: "bg-destructive",
    text: "text-destructive",
    rail: "before:bg-destructive/45",
    chip: "bg-destructive/10 text-destructive",
  },
  watch: {
    dot: "bg-gold",
    text: "text-gold",
    rail: "before:bg-gold/45",
    chip: "bg-gold/10 text-gold",
  },
  neutral: {
    dot: "bg-border",
    text: "text-muted-foreground",
    rail: "before:bg-border",
    chip: "bg-surface-2 text-muted-foreground",
  },
};

const verdictIcon: Record<FindingTone, any> = {
  positive: CheckCircle2,
  negative: AlertTriangle,
  watch: Eye,
  neutral: Minus,
};

const findingIcon: Record<FindingTone, any> = {
  positive: TrendingUp,
  negative: TrendingDown,
  watch: Eye,
  neutral: Minus,
};

function FindingRow({ finding }: { finding: Finding }) {
  const style = toneStyles[finding.tone];
  const Icon = findingIcon[finding.tone];
  return (
    <li
      className={cn(
        "relative px-6 py-4 pl-7 transition-colors hover:bg-surface-2/40",
        "before:absolute before:left-0 before:top-4 before:bottom-4 before:w-1 before:rounded-full",
        style.rail,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.text)} />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold leading-snug text-foreground">{finding.headline}</p>
          {finding.context ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{finding.context}</p>
          ) : null}
          {finding.driver ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/70">Driver · </span>
              {finding.driver}
            </p>
          ) : null}
          {finding.action ? (
            <p className="flex items-start gap-1.5 pt-0.5 text-xs font-medium leading-relaxed text-brand">
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {finding.action}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * Compact findings strip for a single tab. Same finding contract as the Overview
 * panel, without the verdict header — each tab answers a narrower question and
 * does not need its own overall grade.
 */
export function PanelFindings({
  title,
  findings,
  hint,
  emptyText = "No material movement found, or there is not enough comparable data yet.",
}: {
  title: string;
  findings: Finding[];
  hint?: string;
  emptyText?: string;
}) {
  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Lightbulb className="h-3.5 w-3.5" />
        </span>
        <h2 className="font-display text-sm font-semibold tracking-tight">{title}</h2>
        {hint ? <span className="text-xs text-muted-foreground">· {hint}</span> : null}
      </header>
      {findings.length ? (
        <ul className="divide-y divide-border/70">
          {findings.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
        </ul>
      ) : (
        <div className="flex items-start gap-2.5 px-6 py-4 text-xs leading-relaxed text-muted-foreground">
          <Minus className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{emptyText}</p>
        </div>
      )}
    </section>
  );
}

export function KeyFindings({
  verdict,
  findings,
  rangeLabel,
}: {
  verdict: Verdict;
  findings: Finding[];
  rangeLabel?: string;
}) {
  const VerdictIcon = verdictIcon[verdict.tone];
  const tone = toneStyles[verdict.tone];

  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-border px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              tone.chip,
            )}
          >
            <VerdictIcon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold leading-tight tracking-tight">
                {verdict.headline}
              </h2>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Key findings
              </span>
            </div>
            {verdict.detail ? (
              <p className="mt-1 text-sm leading-snug text-muted-foreground">{verdict.detail}</p>
            ) : null}
          </div>
        </div>
        {rangeLabel ? (
          <span className="shrink-0 self-start rounded-full bg-surface-2 px-3 py-1 text-xs tabular-nums text-muted-foreground">
            {rangeLabel}
          </span>
        ) : null}
      </header>

      {findings.length ? (
        <ul className="divide-y divide-border/70">
          {findings.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
        </ul>
      ) : (
        <div className="flex items-start gap-3 px-6 py-6">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Not enough history in this window to call anything out</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Findings compare the selected window against the days before it. Widen the date window
              to get period-over-period context, drivers and anomaly detection.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
