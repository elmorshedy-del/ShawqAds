// Shared loaders + helpers for the European-delivery analysis.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Raw pulls land here (gitignored). Override with ANALYSIS_DATA_DIR.
const DIR = process.env.ANALYSIS_DATA_DIR || fileURLToPath(new URL('./data', import.meta.url));

export const meta = JSON.parse(fs.readFileSync(`${DIR}/meta-country-daily.json`, 'utf8'));
export const shop = JSON.parse(fs.readFileSync(`${DIR}/shopify-orders.json`, 'utf8'));
const fxRaw = JSON.parse(fs.readFileSync(`${DIR}/fx-try-usd.json`, 'utf8'));

// Daily TRY->USD, forward-filled across weekends/holidays.
const fxDates = Object.keys(fxRaw.rates).sort();
export function fxUsd(date) {
  let lo = 0; let hi = fxDates.length - 1; let best = fxDates[0];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fxDates[mid] <= date) { best = fxDates[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return fxRaw.rates[best].USD;
}

export const EUROPE = new Set(['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'CH', 'DK', 'SE', 'NO', 'FI',
  'IE', 'PT', 'PL', 'CZ', 'GR', 'LU', 'HU', 'RO', 'SK', 'SI', 'HR', 'BG', 'EE', 'LV', 'LT', 'MT', 'CY',
  'IS', 'LI', 'MC', 'SM', 'AD', 'GI', 'GG', 'IM', 'FO', 'AL', 'BA', 'ME', 'MK', 'RS', 'MD', 'UA', 'XK']);
export const GCC = new Set(['AE', 'SA', 'QA', 'KW', 'OM', 'BH']);
export const ANGLO = new Set(['US', 'CA', 'AU', 'NZ']);
// GDPR/consent regime: EU/EEA + UK enforce a consent gate before pixel fires.
export const GDPR = new Set(['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'DK', 'SE', 'NO', 'FI', 'IE',
  'PT', 'PL', 'CZ', 'GR', 'LU', 'HU', 'RO', 'SK', 'SI', 'HR', 'BG', 'EE', 'LV', 'LT', 'MT', 'CY', 'IS', 'LI']);

export function region(cc) {
  if (EUROPE.has(cc)) return 'Europe';
  if (GCC.has(cc)) return 'GCC';
  if (ANGLO.has(cc)) return 'Anglo';
  return 'Other';
}

export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : 0);
export function sd(a) {
  if (a.length < 2) return 0;
  const mu = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - mu) ** 2)) / (a.length - 1));
}
export const cv = (a) => (mean(a) ? sd(a) / mean(a) : 0);
export function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function quantile(a, q) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const pos = (s.length - 1) * q;
  const b = Math.floor(pos);
  return s[b] + (s[Math.min(b + 1, s.length - 1)] - s[b]) * (pos - b);
}
export function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = mean(x.slice(0, n)); const my = mean(y.slice(0, n));
  let num = 0; let dx = 0; let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = x[i] - mx; const b = y[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}
export function spearman(x, y) {
  const rank = (v) => {
    const idx = v.map((val, i) => [val, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(v.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  return pearson(rank(x), rank(y));
}
// Two-sided normal tail, good enough for the z-scores used here.
export function normP(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 2 * p;
}

/** Meta country x day rows, cleaned: real country codes only, spend > 0. */
export function metaRows() {
  return meta.country_daily.filter((r) => r.country && r.country !== 'unknown' && r.spend > 0);
}

/** Shopify orders, cleaned: non-test, non-cancelled, with a country. */
export function shopOrders() {
  return shop.orders.filter((o) => !o.test && !o.cancelled_at && o.country_code);
}

export function groupBy(rows, keyFn) {
  const out = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return out;
}

export function aggMeta(rows) {
  return {
    spend: sum(rows.map((r) => r.spend)),
    spend_usd: sum(rows.map((r) => r.spend * fxUsd(r.date))),
    impressions: sum(rows.map((r) => r.impressions)),
    reach: sum(rows.map((r) => r.reach)),
    clicks: sum(rows.map((r) => r.clicks)),
    link_clicks: sum(rows.map((r) => r.link_clicks)),
    purchases: sum(rows.map((r) => r.purchases)),
    purchase_value: sum(rows.map((r) => r.purchase_value)),
    purchase_value_usd: sum(rows.map((r) => r.purchase_value * fxUsd(r.date))),
    atc: sum(rows.map((r) => r.add_to_cart)),
    ic: sum(rows.map((r) => r.checkout_initiated)),
    lpv: sum(rows.map((r) => r.landing_page_views)),
    days: new Set(rows.map((r) => r.date)).size,
    adsets: new Set(rows.map((r) => r.adset_id)).size,
    campaigns: new Set(rows.map((r) => r.campaign_id)).size,
  };
}

export const f = (n, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : 0);
