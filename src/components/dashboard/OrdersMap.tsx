import { useEffect, useMemo, useState } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import worldData from "world-atlas/countries-110m.json";
import { Bell, Globe, MapPin, ShoppingBag, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

export type Purchase = {
  id: string;
  name?: string;
  country: string;
  location?: string;
  city: string;
  region?: string;
  countryCode: string;
  flag: string;
  amount: number;
  currency: string;
  items: number;
  product?: string;
  source?: string;
  channel?: string;
  coordinates: [number, number];
  time: string;
  createdAt?: string;
};

type Tone = "good" | "warn" | "bad" | "neutral";

const toneText: Record<Tone, string> = {
  good: "text-positive",
  warn: "text-gold",
  bad: "text-destructive",
  neutral: "text-foreground",
};

const toneDot: Record<Tone, string> = {
  good: "bg-positive",
  warn: "bg-gold",
  bad: "bg-destructive",
  neutral: "bg-muted-foreground",
};

export interface OrdersMapProps {
  purchases: Purchase[];
  title?: string;
  statusLabel?: string;
  checkedLabel?: string;
  metaSyncText?: string;
  soundEnabled?: boolean;
  onEnableSound?: () => void;
  syncHealth?: string;
  syncHealthTone?: Tone;
  shopifyHealth?: string;
  shopifyHealthTone?: Tone;
  className?: string;
}

const WIDTH = 880;
const HEIGHT = 430;
const SHAWQ_HQ: [number, number] = [35.24, 38.96];

// World land geometry, converted from TopoJSON once at module load.
const land = feature(
  worldData as unknown as Parameters<typeof feature>[0],
  (worldData as unknown as { objects: { countries: unknown } }).objects.countries as Parameters<typeof feature>[1],
) as unknown as GeoJSON.FeatureCollection;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount || 0);
  } catch {
    return `${currency || "USD"} ${Math.round(amount || 0)}`;
  }
}

type PlacedPurchase = Purchase & { x: number; y: number; newest: boolean };

export function OrdersMap({
  purchases,
  title = "Live sales monitor",
  statusLabel,
  checkedLabel,
  metaSyncText,
  soundEnabled,
  onEnableSound,
  syncHealth,
  syncHealthTone = "good",
  shopifyHealth,
  shopifyHealthTone = "good",
  className,
}: OrdersMapProps) {
  const reducedMotion = usePrefersReducedMotion();

  const { paths, sphere, hqPoint } = useMemo(() => {
    const projection = geoEqualEarth().fitExtent(
      [
        [18, 18],
        [WIDTH - 18, HEIGHT - 18],
      ],
      { type: "Sphere" },
    );
    const pathGen = geoPath(projection);
    const sphereObject = { type: "Sphere" } as const;
    return {
      paths: (land.features || []).map((f, i) => ({ id: i, d: pathGen(f) || "" })),
      sphere: pathGen(sphereObject) || "",
      hqPoint: projection(SHAWQ_HQ) as [number, number] | null,
    };
  }, []);

  // Recompute projected points whenever the orders array changes. Duplicate
  // coordinates are nudged apart in a small spiral so every dot stays visible.
  const placed: PlacedPurchase[] = useMemo(() => {
    const projection = geoEqualEarth().fitExtent(
      [
        [18, 18],
        [WIDTH - 18, HEIGHT - 18],
      ],
      { type: "Sphere" },
    );
    const seen = new Map<string, number>();
    const out: PlacedPurchase[] = [];
    purchases.forEach((purchase, index) => {
      const projected = projection(purchase.coordinates);
      if (!projected) return;
      let [x, y] = projected;
      const key = `${Math.round(x)}:${Math.round(y)}`;
      const count = seen.get(key) || 0;
      seen.set(key, count + 1);
      if (count > 0) {
        const angle = count * 2.39996;
        const radius = 5 + count * 2.2;
        x += Math.cos(angle) * radius;
        y += Math.sin(angle) * radius;
      }
      out.push({ ...purchase, x, y, newest: index === 0 });
    });
    return out;
  }, [purchases]);

  const newest = placed.find((p) => p.newest) || null;
  const others = placed.filter((p) => !p.newest);

  const routePath = useMemo(() => {
    if (!hqPoint || !newest) return "";
    const [hqX, hqY] = hqPoint;
    const orderX = newest.x;
    const orderY = newest.y;
    return `M ${hqX} ${hqY} Q ${(hqX + orderX) / 2} ${Math.min(hqY, orderY) - 62} ${orderX} ${orderY}`;
  }, [hqPoint, newest]);

  const recent = useMemo(() => purchases.slice(0, 5), [purchases]);

  return (
    <section className={cn("panel relative overflow-hidden", className)}>
      {/* Headline: the live sales monitor folded into the map section */}
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <span className="relative flex h-2.5 w-2.5">
              {!reducedMotion && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
              )}
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-positive" />
            </span>
            <Bell className="h-3.5 w-3.5" /> {title}
            {onEnableSound ? (
              <button
                type="button"
                onClick={onEnableSound}
                title={soundEnabled ? "Sale sound on" : "Enable sale sound"}
                className={cn(
                  "ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border transition-colors hover:border-primary/40",
                  soundEnabled ? "text-primary" : "text-muted-foreground",
                )}
              >
                {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>
            ) : null}
          </div>
          {metaSyncText ? <p className="mt-1 truncate text-xs text-muted-foreground">{metaSyncText}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          {checkedLabel ? <span className="text-muted-foreground">{checkedLabel}</span> : null}
          {syncHealth ? (
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", toneDot[syncHealthTone])} />
              <span className="text-muted-foreground">Sync</span>
              <span className={cn("font-semibold", toneText[syncHealthTone])}>{syncHealth}</span>
            </span>
          ) : null}
          {shopifyHealth ? (
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", toneDot[shopifyHealthTone])} />
              <span className="text-muted-foreground">Shopify</span>
              <span className={cn("font-semibold", toneText[shopifyHealthTone])}>{shopifyHealth}</span>
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
        <div className="p-3 sm:p-4">
          <div className="orders-map-canvas overflow-hidden rounded-xl">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="block w-full"
              role="img"
              aria-label="World map of recent Shopify orders"
            >
              <defs>
                <radialGradient id="orders-map-ocean" cx="22%" cy="2%" r="120%">
                  <stop offset="0%" stopColor="var(--omap-ocean-1)" />
                  <stop offset="100%" stopColor="var(--omap-ocean-2)" />
                </radialGradient>
                <filter id="orders-map-glow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="5.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <path d={sphere} fill="url(#orders-map-ocean)" stroke="var(--omap-border)" strokeWidth={1} />
              <g>
                {paths.map((p) => (
                  <path
                    key={p.id}
                    d={p.d}
                    fill="var(--omap-land)"
                    stroke="var(--omap-land-stroke)"
                    strokeWidth={0.5}
                  />
                ))}
              </g>

              {/* Animated route from ShawQ HQ to the newest order only */}
              {routePath ? (
                <path
                  d={routePath}
                  fill="none"
                  stroke="var(--omap-route)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  className={cn("orders-map-route", reducedMotion && "orders-map-route--static")}
                />
              ) : null}

              {/* Older orders: small static pink dots */}
              {others.map((p) => (
                <g key={p.id}>
                  <circle cx={p.x} cy={p.y} r={3.4} fill="var(--omap-dot)" fillOpacity={0.9} />
                  <circle cx={p.x} cy={p.y} r={3.4} fill="none" stroke="var(--omap-dot-strong)" strokeOpacity={0.6} strokeWidth={0.8} />
                </g>
              ))}

              {/* Newest order: expanding pulse + stronger glow */}
              {newest ? (
                <g>
                  {!reducedMotion ? (
                    <circle cx={newest.x} cy={newest.y} r={6} fill="var(--omap-dot)" className="orders-map-pulse" />
                  ) : null}
                  <circle cx={newest.x} cy={newest.y} r={6.5} fill="var(--omap-dot-strong)" filter="url(#orders-map-glow)" />
                  <circle cx={newest.x} cy={newest.y} r={2.8} fill="var(--omap-bg-2)" />
                </g>
              ) : null}

              {/* ShawQ HQ marker */}
              {hqPoint ? (
                <g>
                  <circle cx={hqPoint[0]} cy={hqPoint[1]} r={4.5} fill="var(--omap-hq)" stroke="var(--omap-bg-2)" strokeWidth={1.4} />
                  <text
                    x={hqPoint[0] + 8}
                    y={hqPoint[1] + 3.5}
                    className="orders-map-hq-label"
                    fill="var(--omap-text)"
                  >
                    SHAWQ
                  </text>
                </g>
              ) : null}
            </svg>
          </div>
        </div>

        <aside className="flex flex-col border-t border-border p-4 sm:p-5 lg:border-l lg:border-t-0">
          {newest ? (
            <div
              className={cn(
                "rounded-xl border border-primary/30 bg-brand-soft/60 p-3.5",
                !reducedMotion && "shadow-[var(--shadow-elegant)]",
              )}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                <MapPin className="h-3.5 w-3.5" /> New order in {newest.city}
              </p>
              <p className="mt-1.5 font-display text-lg font-semibold tracking-tight">
                {newest.flag} {formatMoney(newest.amount, newest.currency)}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  · {newest.items} item{newest.items === 1 ? "" : "s"}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {newest.location || newest.country} · {newest.time}
              </p>
              {newest.name || newest.product ? (
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {newest.name ? (
                    <span className="rounded-full bg-surface-2 px-2.5 py-1 text-muted-foreground">{newest.name}</span>
                  ) : null}
                  {newest.product ? (
                    <span className="max-w-[14rem] truncate rounded-full bg-surface-2 px-2.5 py-1 text-muted-foreground">
                      {newest.product}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {newest.source ? (
                <p className="mt-2 truncate text-xs text-muted-foreground">Ad / source: {newest.source}</p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-3.5 text-sm text-muted-foreground">
              {statusLabel || "Waiting for the next paid order"}
            </div>
          )}

          <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <ShoppingBag className="h-3.5 w-3.5" /> Last {recent.length || 5} orders
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {recent.map((p, index) => {
              const subtitle = [`${p.items} item${p.items === 1 ? "" : "s"}`, p.product]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  key={p.id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    index === 0 ? "bg-surface-2" : "hover:bg-surface-2/70",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 self-start rounded-full",
                      index === 0 ? "bg-primary" : "bg-brand/70",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">{p.flag} {p.location || p.city}</span>
                      <span className="shrink-0 font-display font-semibold tracking-tight">
                        {formatMoney(p.amount, p.currency)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                      <span className="truncate">{subtitle}</span>
                      <span className="shrink-0">{p.time}</span>
                    </div>
                  </div>
                </li>
              );
            })}
            {recent.length === 0 ? (
              <li className="rounded-lg px-2.5 py-2 text-sm text-muted-foreground">No orders yet today</li>
            ) : null}
          </ul>
        </aside>
      </div>
    </section>
  );
}
