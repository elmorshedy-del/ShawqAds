import { Bell, Globe, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "good" | "warn" | "bad" | "neutral";

const toneClass: Record<Tone, string> = {
  good: "text-positive",
  warn: "text-gold",
  bad: "text-destructive",
  neutral: "text-foreground",
};

export interface LiveMonitorProps {
  saleTitle: string;
  saleItemsLabel?: string;
  orderChip?: string;
  productChip?: string;
  countryChip?: string;
  adSource?: string;
  fresh?: boolean;
  monitorTime?: string;
  soundEnabled: boolean;
  onEnableSound: () => void;
  metaLabel: string;
  metaSyncText: string;
  syncHealth: string;
  syncHealthTone?: Tone;
  shopifyHealth: string;
  shopifyHealthTone?: Tone;
}

export function LiveMonitor({
  saleTitle,
  saleItemsLabel,
  orderChip,
  productChip,
  countryChip,
  adSource,
  fresh = false,
  monitorTime,
  soundEnabled,
  onEnableSound,
  metaLabel,
  metaSyncText,
  syncHealth,
  syncHealthTone = "good",
  shopifyHealth,
  shopifyHealthTone = "good",
}: LiveMonitorProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div
        className={cn(
          "panel relative overflow-hidden p-5 transition-shadow",
          fresh && "ring-2 ring-positive/50 shadow-[var(--shadow-elegant)]",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-positive" />
            </span>
            <Bell className="h-3.5 w-3.5" /> Live sales monitor
          </div>
          <div className="flex items-center gap-2">
            {monitorTime ? (
              <span className="text-xs text-muted-foreground">{monitorTime}</span>
            ) : null}
            <button
              type="button"
              onClick={onEnableSound}
              title={soundEnabled ? "Sale sound on" : "Enable sale sound"}
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full border border-border transition-colors hover:border-primary/40",
                soundEnabled ? "text-primary" : "text-muted-foreground",
              )}
            >
              {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <p className="mt-3 font-display text-xl font-semibold tracking-tight">
          {saleTitle}
          {saleItemsLabel ? (
            <span className="text-base font-normal text-muted-foreground"> · {saleItemsLabel}</span>
          ) : null}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {orderChip ? (
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-muted-foreground">{orderChip}</span>
          ) : null}
          {productChip ? (
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-muted-foreground">{productChip}</span>
          ) : null}
          {countryChip ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-muted-foreground">
              <Globe className="h-3 w-3" /> {countryChip}
            </span>
          ) : null}
        </div>
        {adSource ? <p className="mt-2 text-xs text-muted-foreground">Ad / source: {adSource}</p> : null}
      </div>

      <div className="panel flex flex-col justify-between p-5">
        <div className="flex items-center justify-between">
          <p className="font-display text-base font-semibold">{metaLabel}</p>
          <RefreshCw className="h-4 w-4 text-primary" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{metaSyncText}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">Sync health</p>
            <p className={cn("mt-1 font-display text-lg font-semibold", toneClass[syncHealthTone])}>
              {syncHealth}
            </p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">Shopify data</p>
            <p className={cn("mt-1 font-display text-lg font-semibold", toneClass[shopifyHealthTone])}>
              {shopifyHealth}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
