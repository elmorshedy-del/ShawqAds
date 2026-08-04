/* ----------------------------------------------------------------------------
 * Shared types, formatters, and static design config for the dashboard.
 * (Demo data removed — all data is supplied live via props from App.jsx.)
 * ------------------------------------------------------------------------- */

export const fmtCurrency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
export const fmtNumber = (n: number) => n.toLocaleString("en-US");
export const fmtX = (n: number) => `${n.toFixed(2)}x`;
export const fmtPct = (n: number) => `${n.toFixed(2)}%`;

export interface DayRow {
  date: string;
  revenue: number;
  spend: number;
  items: number;
  orders: number;
  aov: number;
  cac: number;
  roas: number;
  developing?: boolean;
}

export interface Leader {
  date: string;
  topProduct: { name: string; units: number; revenue: number; category?: string; image?: string };
  topAd: { name: string; sales: number; revenue: number; category?: string };
}

export interface MetricDef {
  key: keyof DayRow;
  label: string;
  short: string;
  format: (n: number) => string;
  /** true when a higher value is good (revenue) vs bad (spend/cac) */
  positiveWhenUp: boolean;
  color: string;
}

export const metricDefs: MetricDef[] = [
  { key: "revenue", label: "Revenue", short: "Rev", format: fmtCurrency, positiveWhenUp: true, color: "var(--color-brand)" },
  { key: "orders", label: "Orders", short: "Orders", format: fmtNumber, positiveWhenUp: true, color: "var(--color-chart-4)" },
  { key: "aov", label: "AOV", short: "AOV", format: fmtCurrency, positiveWhenUp: true, color: "var(--color-chart-5)" },
  { key: "spend", label: "Meta spend", short: "Spend", format: fmtCurrency, positiveWhenUp: false, color: "var(--color-gold)" },
  { key: "cac", label: "CAC", short: "CAC", format: fmtCurrency, positiveWhenUp: false, color: "var(--color-destructive)" },
  { key: "roas", label: "ROAS", short: "ROAS", format: fmtX, positiveWhenUp: true, color: "var(--color-positive)" },
];

/* ----------------------------------------------------------------------------
 * Campaign Shopify ROAS tree
 * ------------------------------------------------------------------------- */

export type TreeFlag = "clean" | "inferred" | "warning";

export interface AdSetNode {
  name: string;
  parent: string;
  flag: TreeFlag;
  flagNote: string;
  category?: string;
  children?: AdSetNode[];
  spend: number;
  ctr: number;
  atc: number;
  ic: number;
  metaSales: number;
  shopify: number;
  mapped: number;
  metaRoas: number;
  shopifyRoas: number;
  mappedRoas: number;
}

export interface CampaignNode extends Omit<AdSetNode, "parent"> {
  region: string;
  children: AdSetNode[];
}

/* ----------------------------------------------------------------------------
 * USA benchmark strip
 * ------------------------------------------------------------------------- */

export interface BenchmarkItem {
  label: string;
  value: number;
  prev: number;
  delta: number;
  prefix?: string;
  lowerIsBetter: boolean;
}

export interface Benchmarks {
  region: string;
  month: string;
  items: BenchmarkItem[];
}

/* ----------------------------------------------------------------------------
 * Leadership tables
 * ------------------------------------------------------------------------- */

export interface ProductLeader {
  initial: string;
  name: string;
  category: string;
  units: number;
  revenue: number;
}

export interface AdLeader {
  name: string;
  category: string;
  campaigns: number;
  sales: number;
  roas: number;
  ctr: number;
  atc: number;
  ic: number;
  spend: number;
}

/* ----------------------------------------------------------------------------
 * USA_ABO history vs June USA launch
 * ------------------------------------------------------------------------- */

export interface UsaPhaseStat {
  name: string;
  period: string;
  days: number;
  sales: number;
  spend: number;
  freq: number;
  cpm: number;
  reachPerDollar: number;
  variant: "history" | "launch";
}

export interface UsaCurvePoint {
  day: number;
  historyReach: number | null;
  historyCpm: number | null;
  historyFreq: number | null;
  launchReach: number | null;
  launchCpm: number | null;
  launchFreq: number | null;
}

export type UsaMetricKey = "reach" | "cpm" | "freq";

export const usaMetricDefs: Record<
  UsaMetricKey,
  { label: string; unit: string; format: (v: number) => string; better: "high" | "low" }
> = {
  reach: {
    label: "Unique reach / $",
    unit: "reach per $",
    format: (v) => v.toFixed(1),
    better: "high",
  },
  cpm: { label: "CPM", unit: "cost per 1k", format: (v) => `$${v.toFixed(2)}`, better: "low" },
  freq: { label: "Frequency", unit: "avg impressions / person", format: (v) => v.toFixed(2), better: "low" },
};

/* ----------------------------------------------------------------------------
 * Daily delivery shape (Meta reach / frequency / CPM / spend)
 * ------------------------------------------------------------------------- */

export interface DeliveryPoint {
  date: string;
  reach: number;
  frequency: number;
  cpm: number;
  spend: number;
}

/* ----------------------------------------------------------------------------
 * Product demand after launch
 * ------------------------------------------------------------------------- */

export interface ProductDemand {
  tipsPeople: number;
  tipsTotal: number;
  totalUnits: number;
  since: string;
  families: { label: string; units: number }[];
  topProducts: { name: string; units: number }[];
}

/* ----------------------------------------------------------------------------
 * Ad set decision table (USA launch)
 * ------------------------------------------------------------------------- */

export interface AdSetDecision {
  adSet: string;
  campaign: string;
  status: string;
  sales: number;
  roas: number;
  spend: number;
  activeDays: number;
  freq: number;
  cpm: number;
  reachPerDollar: number;
  freqVsMar: number;
  cpmVsMar: number;
  reachVsMar: number;
  action: string;
}

/* ----------------------------------------------------------------------------
 * Country sales + ROAS with product family breakdown
 * ------------------------------------------------------------------------- */

export interface CountrySplit {
  label: string;
  pct: number;
}

export interface CountrySales {
  flag: string;
  country: string;
  roas: number;
  units: number;
  orders: number;
  revenue: number;
  spend: number;
  products: number;
  splits: CountrySplit[];
}

export const familyColors: Record<string, string> = {
  Tops: "var(--color-brand)",
  "Denim pants": "var(--color-chart-4)",
  Crewnecks: "var(--color-chart-5)",
  Hoodies: "var(--color-gold)",
  Skirts: "var(--color-positive)",
  "Kuffiyah accessory": "var(--color-chart-2)",
  "Art-frame": "var(--color-chart-3)",
  Other: "var(--color-muted-foreground)",
};

/* ----------------------------------------------------------------------------
 * Product development — cumulative units per leading product across the window
 * ------------------------------------------------------------------------- */

export interface ProductLine {
  key: string;
  label: string;
  color: string;
  total: number;
}
