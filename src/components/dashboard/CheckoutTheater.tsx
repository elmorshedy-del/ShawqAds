import { useEffect, useMemo, useState } from "react";
import { MousePointer2, Pause, Play } from "lucide-react";
import { CHECKOUT_THEATER_STEPS } from "@/lib/checkoutTheater";
import { cn } from "@/lib/utils";
import { pagePathLabel } from "@/lib/pagePath";

interface TheaterFrame {
  step_id: string;
  step_label: string;
  event_name: string;
  timestamp: string;
  elapsed_ms: number;
  path?: string;
  country_code?: string;
  line_items?: Array<{ title?: string; product?: string; quantity?: number }>;
}

interface CheckoutTheaterPayload {
  frames?: TheaterFrame[];
  reached_steps?: string[];
  last_step_id?: string;
  duration_ms?: number;
  outcome?: string;
}

function formatMs(ms = 0) {
  const total = Math.max(0, Math.round(Number(ms || 0) / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

function productLine(frame: TheaterFrame) {
  const items = frame.line_items || [];
  if (!items.length) return null;
  const first = items[0];
  const title = first.title || first.product || "Product";
  return items.length > 1 ? `${title} + ${items.length - 1} more` : title;
}

export function CheckoutTheater({ theater }: { theater?: CheckoutTheaterPayload | null }) {
  const frames = theater?.frames || [];
  const [playing, setPlaying] = useState(false);
  const [cursorIndex, setCursorIndex] = useState(0);

  const stepCards = useMemo(
    () => CHECKOUT_THEATER_STEPS.map((step) => ({
      ...step,
      reached: (theater?.reached_steps || []).includes(step.id),
      active: frames[cursorIndex]?.step_id === step.id,
      completedBeforeCursor: frames.slice(0, cursorIndex + 1).some((frame) => frame.step_id === step.id),
    })),
    [theater?.reached_steps, frames, cursorIndex],
  );

  useEffect(() => {
    if (!playing || !frames.length) return undefined;
    const timer = window.setInterval(() => {
      setCursorIndex((current) => {
        if (current >= frames.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 1200);
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

  useEffect(() => {
    setCursorIndex(0);
    setPlaying(false);
  }, [theater?.last_step_id, frames.length]);

  if (!frames.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center">
        <p className="text-sm font-medium">No checkout journey to replay yet</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Once the Customer Events pixel posts checkout steps, this panel auto-plays the shopper path through contact, shipping, and payment — including hosted Shopify checkout where DOM recording is blocked.
        </p>
      </div>
    );
  }

  const current = frames[cursorIndex];

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Checkout journey replay</p>
          <p className="text-xs text-muted-foreground">
            Pixel step replay · {formatMs(theater?.duration_ms)} · {frames.length} moments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? "Pause" : "Play journey"}
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-b from-surface-2/80 to-surface p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {stepCards.map((step) => (
            <div
              key={step.id}
              className={cn(
                "rounded-lg border px-2 py-2 text-center transition-colors",
                step.active
                  ? "border-brand bg-brand-soft/50 shadow-sm"
                  : step.reached
                    ? "border-positive/30 bg-positive/5"
                    : "border-border bg-surface/60 opacity-60",
              )}
            >
              <p className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{step.id}</p>
              <p className="mt-1 break-words text-[0.65rem] font-medium leading-snug">{step.label}</p>
            </div>
          ))}
        </div>

        <div
          className="pointer-events-none absolute left-4 top-4 flex items-center gap-1 rounded-full bg-brand px-2 py-1 text-[0.65rem] font-semibold text-white shadow-lg transition-all duration-500"
          style={{
            transform: `translate(${Math.min(cursorIndex * 36, 280)}px, ${Math.min(120 + (cursorIndex % 3) * 18, 180)}px)`,
          }}
        >
          <MousePointer2 className="h-3 w-3" />
          Live
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-2/50 px-3 py-3">
        <p className="text-xs font-semibold">{current.step_label}</p>
        <p className="mt-1 text-[0.65rem] leading-relaxed text-muted-foreground">
          {current.event_name.replace(/_/g, " ")} · {formatMs(current.elapsed_ms)} into session
          {current.path ? ` · ${pagePathLabel(current.path)}` : ""}
        </p>
        {productLine(current) ? (
          <p className="mt-2 text-xs font-medium text-foreground">{productLine(current)}</p>
        ) : null}
      </div>

      <div className="flex gap-1">
        {frames.map((frame, index) => (
          <button
            key={`${frame.timestamp}-${frame.event_name}-${index}`}
            type="button"
            aria-label={`Jump to ${frame.step_label}`}
            onClick={() => {
              setCursorIndex(index);
              setPlaying(false);
            }}
            className={cn(
              "h-2 flex-1 rounded-full transition-colors",
              index <= cursorIndex ? "bg-brand" : "bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}
