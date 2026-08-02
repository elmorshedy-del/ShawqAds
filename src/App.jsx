import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BarChart3, Filter, GitBranch, LayoutDashboard, Rocket, ShoppingBag, SlidersHorizontal } from 'lucide-react';
import { compact, money, pct } from './lib/format.js';
import { buildCampaignAttribution } from './lib/campaignAttribution.js';
import {
  buildKpiProjectionDisplay,
  buildKpiRecordDisplay,
  buildKpiRecordMap,
  buildMonthProjection,
} from './lib/businessKpiInsights.js';
import { metricDefinition } from './lib/metricDefinitions.js';
import { buildKeyFindings, topDrivers } from './lib/analyticsInsights.js';
import { KeyFindings } from './components/dashboard/KeyFindings';
import { buildShopifyHistoricalDaily } from './lib/historicalInsights.js';
import { buildFunnelAnalytics } from './lib/funnelAnalytics.js';
import { buildEmailDailyIndex, applyRevenueScope } from './lib/revenueScope.js';
import { normalizePagePath } from './lib/pagePath.js';
import { dwellAnalysisMeta, rollupDwellPages } from './lib/dwellStats.js';
import { statusLabels, statusOrder } from './features/adset-radar/constants.js';
import { Sidebar, MobileFilters, datePresets } from './components/dashboard/Sidebar';
import { OrdersMap } from './components/dashboard/OrdersMap';
import { KpiCard } from './components/dashboard/KpiCard';
import { RevenueChart } from './components/dashboard/RevenueChart';
import { SalesLeaders } from './components/dashboard/SalesLeaders';
import { Benchmarks } from './components/dashboard/Benchmarks';
import { CampaignRoasTree } from './components/dashboard/CampaignRoasTree';
import { LeadershipTables as LeadershipBoard } from './components/dashboard/LeadershipTables';
import { UsaComparison } from './components/dashboard/UsaComparison';
import { DailyDelivery } from './components/dashboard/DailyDelivery';
import { DevelopingGrowth } from './components/dashboard/DevelopingGrowth';
import { AdSetDecisionTable } from './components/dashboard/AdSetDecisionTable';
import { ProductDemand } from './components/dashboard/ProductDemand';
import { CountrySalesPanel } from './components/dashboard/CountrySalesPanel';
import { TopMovers } from './components/dashboard/TopMovers';
import { EmailCampaign } from './components/dashboard/EmailCampaign';
import { BehaviorAnalytics } from './components/dashboard/BehaviorAnalytics';
import { DataTable } from './components/dashboard/DataTable';
import * as adapt from './lib/adapt.js';
import { OrderDropRankings } from './components/dashboard/OrderDropRankings';
import { buildOrderMoverRankings } from './lib/orderDropRankings.js';
import { buildEmailCampaignSummary, buildEmailCampaignFromPurchases } from './lib/emailCampaignSummary.js';
import { HistoricalInsights } from './components/dashboard/HistoricalInsights';
import { FunnelAnalytics } from './components/dashboard/FunnelAnalytics';
import {
  behaviorCachedUntil,
  behaviorCoverageMeta,
  emptyBehaviorGlobal,
  isDevelopingReportingDayRange,
} from './lib/reportingBounds.js';

const SALE_POLL_MS = 30000;
const META_POLL_MS = 120000;
const BEHAVIOR_POLL_MS = 60000;
const REPORTING_TIMEZONE = 'Europe/Istanbul';
const CAMPAIGN_LAUNCH_DATE = '2026-06-03';

// Demo orders used to visualize the live map before Shopify is connected.
// Newest order is first (Toronto) — it gets the animated route from ShawQ HQ.
const DEMO_PURCHASES = [
  { id: 'demo-1', name: '#3940', country: 'Canada', location: 'Toronto, Canada', city: 'Toronto', region: 'ON', countryCode: 'CA', flag: '🇨🇦', amount: 95.99, currency: 'USD', items: 1, product: 'ShawQ Signature Hoodie', source: 'Meta · Prospecting', coordinates: [-79.3832, 43.6532], time: 'Just now' },
  { id: 'demo-2', name: '#3939', country: 'USA', location: 'New York, New York, USA', city: 'New York', region: 'NY', countryCode: 'US', flag: '🇺🇸', amount: 142, currency: 'USD', items: 2, product: 'ShawQ Tee 2-Pack', source: 'Meta · Retargeting', coordinates: [-74.006, 40.7128], time: '2m ago' },
  { id: 'demo-3', name: '#3938', country: 'USA', location: 'Brooklyn, New York, USA', city: 'Brooklyn', region: 'NY', countryCode: 'US', flag: '🇺🇸', amount: 54, currency: 'USD', items: 1, product: 'ShawQ Tee', source: 'Meta · Retargeting', coordinates: [-73.9442, 40.6782], time: '6m ago' },
  { id: 'demo-4', name: '#3937', country: 'USA', location: 'Los Angeles, California, USA', city: 'Los Angeles', region: 'CA', countryCode: 'US', flag: '🇺🇸', amount: 88.5, currency: 'USD', items: 1, product: 'ShawQ Cap', source: 'Organic', coordinates: [-118.2437, 34.0522], time: '12m ago' },
  { id: 'demo-5', name: '#3936', country: 'USA', location: 'Denver, Colorado, USA', city: 'Denver', region: 'CO', countryCode: 'US', flag: '🇺🇸', amount: 64, currency: 'USD', items: 1, product: 'ShawQ Tee', source: 'Meta · Prospecting', coordinates: [-104.9903, 39.7392], time: '18m ago' },
  { id: 'demo-6', name: '#3935', country: 'France', location: 'Paris, France', city: 'Paris', region: undefined, countryCode: 'FR', flag: '🇫🇷', amount: 120, currency: 'EUR', items: 2, product: 'ShawQ Hoodie', source: 'Meta · Prospecting', coordinates: [2.3522, 48.8566], time: '23m ago' },
  { id: 'demo-7', name: '#3934', country: 'Germany', location: 'Berlin, Germany', city: 'Berlin', region: undefined, countryCode: 'DE', flag: '🇩🇪', amount: 75, currency: 'EUR', items: 1, product: 'ShawQ Tee', source: 'Email campaign · Welcome flow', channel: 'email', coordinates: [13.405, 52.52], time: '34m ago' },
  { id: 'demo-8', name: '#3933', country: 'United Kingdom', location: 'London, United Kingdom', city: 'London', region: undefined, countryCode: 'GB', flag: '🇬🇧', amount: 99, currency: 'GBP', items: 1, product: 'ShawQ Cap', source: 'Meta · Retargeting', coordinates: [-0.1276, 51.5072], time: '48m ago' },
  { id: 'demo-9', name: '#3932', country: 'Australia', location: 'Sydney, Australia', city: 'Sydney', region: undefined, countryCode: 'AU', flag: '🇦🇺', amount: 130, currency: 'AUD', items: 2, product: 'ShawQ Hoodie', source: 'Email campaign · Spring drop', channel: 'email', coordinates: [151.2093, -33.8688], time: '1h ago' },
];


function dateInTimezone(date = new Date(), timeZone = REPORTING_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function currentReportingDay() {
  return dateInTimezone(new Date(), REPORTING_TIMEZONE);
}

function fallbackData() {
  const dates = Array.from({ length: 32 }, (_, i) => {
    const d = new Date('2026-05-01T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const names = ['US | Broad | 25-44 | Auto', 'US | Advantage+ Shopping', 'US | Retarget | 7d | All', 'US | LAL 1% Purchasers', 'US | Video Viewers | 30d', 'US | Interests | Cultural', 'US | Broad | 18-24'];
  const adsets = names.map((name, idx) => {
    const rows = dates.map((date, i) => {
      const wave = Math.sin(i / 4 + idx) * 0.13;
      const fatigue = idx > 3 ? i * 0.018 : i * 0.004;
      const frequency = 1.05 + idx * 0.17 + wave + fatigue;
      const cpm = 13.5 + idx * 1.8 + i * (idx > 3 ? 0.22 : 0.04) + Math.cos(i / 3) * 0.8;
      const reach = 520000 - idx * 42000 + Math.sin(i / 5) * 35000 - (idx > 4 ? i * 5200 : i * 1200);
      const impressions = reach * frequency;
      const spend = impressions * cpm / 1000;
      return { date, frequency, cpm, reach, impressions, spend };
    });
    return { adset_id: `sample_${idx}`, adset_name: name, campaign_name: idx < 2 ? 'Testing_USA_ABO' : 'Scaling_US_ASC', rows };
  });
  return {
    generated_at: new Date().toISOString(),
    source: 'sample-data',
    account_id: 'sample',
    analysis_window: { since: '2026-05-01', until: '2026-06-01' },
    delivery_scope: 'usa_adsets_only',
    data_coverage: { all_adsets: 7, usa_adsets: 7, ads: 14, countries: 6, ad_country_daily_rows: 84 },
    march_baseline: { frequency: 1.38, cpm: 16.8, reach: 490000, impressions: 676200 },
    adset_changes: [
      { date: '2026-05-09', adset_id: 'sample_0', label: 'Budget edited' },
      { date: '2026-05-17', adset_id: 'sample_4', label: 'Creative added' },
      { date: '2026-05-25', adset_id: 'sample_6', label: 'Bid/audience edit' },
    ],
    ads: [
      { ad_id: 'sample_ad_1', ad_name: 'Vescarts Skirt 2', product_family: 'Skirts', ctr: 3.4, add_to_cart: 18, checkout_initiated: 8, purchases: 6, roas: 3.2, spend_usd: 188, purchase_value_usd: 602 },
      { ad_id: 'sample_ad_2', ad_name: 'Vescarts Crewneck 98', product_family: 'Crewnecks', ctr: 2.8, add_to_cart: 14, checkout_initiated: 7, purchases: 4, roas: 2.5, spend_usd: 160, purchase_value_usd: 400 },
      { ad_id: 'sample_ad_3', ad_name: 'Vescarts Denim Pants', product_family: 'Denim pants', ctr: 2.1, add_to_cart: 11, checkout_initiated: 4, purchases: 3, roas: 1.8, spend_usd: 140, purchase_value_usd: 252 },
    ],
    countries: [
      { country_code: 'US', country: 'United States', spend_usd: 980, purchases: 21, roas: 2.8 },
      { country_code: 'AU', country: 'Australia', spend_usd: 260, purchases: 6, roas: 2.1 },
      { country_code: 'CH', country: 'Switzerland', spend_usd: 130, purchases: 3, roas: 1.9 },
    ],
    adsets,
  };
}

function fallbackShopify() {
  const families = ['Skirts', 'Crewnecks', 'Hoodies', 'Denim pants', 'Tops', 'Kuffiyah accessory', 'Art-frame'];
  const totals = { Skirts: 59, Crewnecks: 42, Hoodies: 35, 'Denim pants': 33, Tops: 16, 'Kuffiyah accessory': 14, 'Art-frame': 2 };
  const dates = Array.from({ length: 31 }, (_, i) => {
    const d = new Date('2026-05-01T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const daily = dates.map((date, i) => {
    const phase = (i + 1) / dates.length;
    const orders = Math.round(2 + Math.sin(i / 3) * 1.2 + phase * 7);
    return { date, revenue_usd: Math.max(0, orders * 82 + Math.cos(i / 4) * 90), orders, units: Math.max(0, Math.round(orders * 1.25)) };
  });
  const cumulative = dates.map((date, i) => {
    const day = { date };
    families.forEach((f, idx) => { day[f] = Math.round(totals[f] * Math.pow((i + 1) / dates.length, 0.85 + idx * 0.03)); });
    return day;
  });
  return {
    source: 'sample-shopify',
    generated_at: new Date().toISOString(),
    period: { since: '2026-05-01', until: '2026-06-01', currency: 'USD' },
    daily,
    families: Object.entries(totals).map(([family, units]) => ({ family, units, revenue_usd: units * 82 })),
    products: Object.entries(totals).map(([family, units]) => ({ product: `Sample ${family}`, family, units, revenue_usd: units * 82 })),
    countries: [
      { country_code: 'US', country: 'USA', units: 69, unique_products: 8, mix: { Skirts: 23, Crewnecks: 18, Hoodies: 10, 'Denim pants': 9, 'Kuffiyah accessory': 5, Tops: 4 } },
      { country_code: 'AU', country: 'Australia', units: 23, unique_products: 7, mix: { Hoodies: 7, Crewnecks: 7, Skirts: 6, 'Denim pants': 1, 'Kuffiyah accessory': 1, 'Art-frame': 1 } },
      { country_code: 'CH', country: 'Switzerland', units: 9, unique_products: 5, mix: { Skirts: 3, Hoodies: 2, 'Denim pants': 2, Crewnecks: 1, 'Kuffiyah accessory': 1 } },
      { country_code: 'ES', country: 'Spain', units: 12, unique_products: 5, mix: { Hoodies: 4, 'Denim pants': 3, Tops: 2, Skirts: 2, 'Kuffiyah accessory': 1 } },
      { country_code: 'DK', country: 'Denmark', units: 5, unique_products: 3, mix: { Crewnecks: 2, Skirts: 2, Hoodies: 1 } },
      { country_code: 'AT', country: 'Austria', units: 2, unique_products: 2, mix: { Crewnecks: 1, Hoodies: 1 } },
      { country_code: 'IT', country: 'Italy', units: 1, unique_products: 1, mix: { Hoodies: 1 } },
    ],
    cumulative,
  };
}

function fallbackBehavior() {
  return {
    source: 'sample-behavior',
    generated_at: new Date().toISOString(),
    period: { since: '2026-06-03', until: '2026-06-03', shopify_timezone: 'Europe/Istanbul', meta_timezone: 'Europe/Istanbul' },
    extraction: {
      abandoned_checkouts: { source: 'Shopify abandoned checkouts', configured: false, ok: false, count: 0, note: 'Connect Shopify abandoned checkout API to populate checkout friction.' },
      meta_payment: { source: 'Meta AddPaymentInfo actions', configured: false, ok: false, count: 0, note: 'Connect Meta payment-info actions to populate submit-payment friction immediately.' },
      meta_demographics: { source: 'Meta age/gender breakdown', configured: false, ok: false, count: 0, note: 'Connect Meta demographic breakdowns to populate gender friction.' },
      session_events: { source: 'First-party Shopify customer-events pixel', configured: false, ok: false, count: 0, sessions: 0, note: 'Install the session event pixel to populate payment-submit, dwell, and journey intelligence.' },
    },
    scoring: { method: 'Bayesian shrinkage toward site average plus support-weighted excess abandons' },
    facts: [],
    meta_demographics_rows: [],
    page_facts: [],
    journey_rows: [],
    matrix: { checkout: { global: { exposed: 0, abandoned: 0, rate: 0 }, products: [], countries: [], gender: [] }, submit_payment: { global: { exposed: 0, abandoned: 0, rate: 0 }, products: [], countries: [], gender: [] } },
    dwell_pages: [],
    journeys: { totals: { purchasers: 0, non_purchasers: 0 }, steps: [], paths: [] },
    pixel_contract: { endpoint: '/api/session-events', recommended_events: ['page_viewed', 'product_viewed', 'product_added_to_cart', 'checkout_started', 'payment_info_submitted', 'checkout_completed', 'visibility_hidden'] },
  };
}

async function fetchJsonWithFallback(apiPath, staticPath, fallbackFactory) {
  for (const target of [apiPath, staticPath]) {
    try {
      const res = await fetch(target, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch {}
  }
  return fallbackFactory();
}

// A non-JSON body (an HTML error page from a proxy, a dev server 404) used to surface
// the raw parser message — "Unexpected token '<'" — in the live monitor card. Operators
// get a sentence they can act on instead.
function parseApiJson(text, label) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned an unexpected response`);
  }
}

async function fetchLatestSale() {
  const res = await fetch('/api/shopify/latest-sale', { cache: 'no-store' });
  const text = await res.text();
  const payload = parseApiJson(text, 'Shopify sales monitor');
  if (!res.ok) throw new Error(payload.error || `Shopify sale monitor ${res.status}`);
  return payload;
}

async function fetchLiveMeta() {
  const res = await fetch('/api/meta/live-spend', { cache: 'no-store' });
  const text = await res.text();
  const payload = parseApiJson(text, 'Meta live spend');
  if (!res.ok) throw new Error(payload.error || `Meta live spend ${res.status}`);
  return payload;
}

function aggregateRows(adsets) {
  const byDate = new Map();
  adsets.forEach((adset) => {
    adset.rows?.forEach((r) => {
      const cur = byDate.get(r.date) || { date: r.date, spend: 0, spend_usd: 0, impressions: 0, reach: 0, purchases: 0 };
      cur.spend += Number(r.spend || 0);
      cur.spend_usd += Number(r.spend_usd ?? r.spend ?? 0);
      cur.impressions += Number(r.impressions || 0);
      cur.reach += Number(r.reach || 0);
      cur.purchases += Number(r.purchases || 0);
      byDate.set(r.date, cur);
    });
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({
    ...r,
    frequency: r.reach ? r.impressions / r.reach : 0,
    cpm: r.impressions ? (r.spend_usd / r.impressions) * 1000 : 0,
    reach_per_dollar: r.spend_usd ? r.reach / r.spend_usd : 0,
  }));
}

const META_SUM_FIELDS = [
  'spend', 'spend_usd', 'spend_try', 'impressions', 'reach', 'clicks_all', 'link_clicks',
  'outbound_clicks', 'purchases', 'add_to_cart', 'checkout_initiated',
  'purchase_value', 'purchase_value_usd', 'purchase_value_try',
];

function avg(rows, key) {
  const vals = rows.map((r) => Number(r[key] || 0)).filter((v) => Number.isFinite(v) && v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
function sum(rows, key) { return rows.reduce((a, r) => a + Number(r[key] || 0), 0); }
function reachPerDollar(row = {}) {
  const spendUsd = Number(row.spend_usd ?? row.spend ?? 0);
  return spendUsd > 0 ? Number(row.reach || 0) / spendUsd : 0;
}
function byDate(rows = []) {
  return new Map((rows || []).filter((row) => row?.date).map((row) => [row.date, row]));
}
function rowUntil(row, completedUntil) {
  return !completedUntil || !row?.date || row.date <= completedUntil;
}
function attachShopifySales(rows = [], shopifyRows = [], options = {}) {
  const shopifyByDate = byDate(shopifyRows);
  const completedUntil = options.completedUntil || '';
  const fallbackToCountrySales = Boolean(options.fallbackToCountrySales);
  return (rows || [])
    .filter((row) => rowUntil(row, completedUntil))
    .map((row) => {
      const shop = shopifyByDate.get(row.date) || {};
      const matchedOrders = Number(shop.orders || 0);
      const countryOrders = Number(shop.country_orders || 0);
      const useCountryFallback = fallbackToCountrySales && matchedOrders === 0 && countryOrders > 0;
      const shopifySales = useCountryFallback ? countryOrders : matchedOrders;
      const matchedRevenue = Number(shop.revenue_usd || 0);
      const fallbackRevenue = Number(shop.country_revenue_usd || 0);
      return {
        ...row,
        reach_per_dollar: reachPerDollar(row),
        shopify_sales: shopifySales,
        shopify_units: useCountryFallback ? Number(shop.country_units || 0) : Number(shop.units || 0),
        shopify_revenue_usd: useCountryFallback ? fallbackRevenue : matchedRevenue,
        shopify_sales_source: useCountryFallback ? 'US country orders fallback' : 'campaign-matched orders',
        shopify_matched_orders: Number(shop.matched_orders || shop.orders || 0),
        shopify_country_orders: countryOrders,
        shopify_unmatched_country_orders: Number(shop.unmatched_country_orders || 0),
      };
    });
}
function delta(cur, base) { return base ? ((cur - base) / base) * 100 : 0; }
function localKey(parts) { return parts.filter(Boolean).join('::'); }
function normalizedIdentity(value) { return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function adRollupKey(row) {
  return normalizedIdentity(row.ad_name) || row.ad_id || localKey([row.adset_id, row.ad_name]);
}
function normalizeAttributionKey(value) {
  return normalizedIdentity(value).replace(/[^a-z0-9]+/g, '');
}
function shopifyAdHints(line = {}) {
  const attribution = line.attribution || {};
  const hints = attribution.match_hints || {};
  return [
    hints.ad_id,
    hints.ad_name,
    attribution.ad_hint,
    attribution.utm?.ad_id,
    attribution.utm?.utm_content,
    attribution.utm?.ad,
  ].filter(Boolean);
}
function enrichAdsWithShopifySales(ads = [], orderLines = []) {
  const rows = (ads || []).map((ad) => ({
    ...ad,
    shopify_sales: 0,
    shopify_units: 0,
    shopify_revenue_usd: 0,
    shopify_roas: 0,
    shopify_attribution_source: 'shopify_order_attribution',
    shopify_order_ids: new Set(),
  }));
  const byKey = new Map();
  rows.forEach((ad) => {
    [
      ad.ad_id,
      ad.ad_name,
      normalizeAttributionKey(ad.ad_id),
      normalizeAttributionKey(ad.ad_name),
    ].filter(Boolean).forEach((key) => byKey.set(String(key), ad));
  });
  (orderLines || []).forEach((line) => {
    const target = shopifyAdHints(line)
      .map((hint) => byKey.get(String(hint)) || byKey.get(normalizeAttributionKey(hint)))
      .find(Boolean);
    if (!target) return;
    const orderKey = line.order_id || line.order_name || `${line.date || ''}:${line.created_at || ''}:${shopifyAdHints(line)[0] || ''}`;
    if (orderKey) target.shopify_order_ids.add(String(orderKey));
    target.shopify_units += Number(line.quantity || 0) || 1;
    target.shopify_revenue_usd += Number(line.line_revenue_usd || 0);
  });
  return rows.map((ad) => {
    const shopifySales = ad.shopify_order_ids.size;
    const out = {
      ...ad,
      shopify_sales: shopifySales,
      shopify_roas: Number(ad.spend_usd || 0) ? Number(ad.shopify_revenue_usd || 0) / Number(ad.spend_usd || 0) : 0,
    };
    delete out.shopify_order_ids;
    return out;
  });
}
function inDateRange(date, range) {
  if (!date) return false;
  if (range?.since && date < range.since) return false;
  if (range?.until && date > range.until) return false;
  return true;
}
function filterRowsByDateRange(rows, range) {
  return (rows || []).filter((row) => inDateRange(row.date || row.date_start, range));
}
function isTipLine(line = {}) {
  const text = normalizedIdentity([
    line.product,
    line.title,
    line.name,
    line.product_title,
    line.variant_title,
    line.family,
    line.subtype,
    line.product_type,
  ].filter(Boolean).join(' ')).replace(/[^a-z0-9]+/g, ' ');
  return /(^|\s)(tip|tips|gratuity)(\s|$)/.test(text);
}
function emptyTipSummary() {
  return { orders: 0, people: 0, total_usd: 0, by_date: [] };
}
function summarizeTipLines(lines = []) {
  const orders = new Set();
  const byDate = new Map();
  (lines || []).forEach((line) => {
    const date = line.date || line.date_start;
    if (!date) return;
    const orderKey = line.order_id || line.order_name || `${date}:${line.created_at || ''}:${line.product || line.title || 'tip'}`;
    if (orderKey) orders.add(`${date}::${String(orderKey)}`);
    const amount = Number(line.line_revenue_usd ?? line.line_item_subtotal_usd ?? line.price ?? 0) || 0;
    const row = byDate.get(date) || { date, orders: 0, total_usd: 0 };
    row.orders += orderKey ? 0 : 1;
    row.total_usd += amount;
    byDate.set(date, row);
  });
  orders.forEach((orderKey) => {
    const [date] = String(orderKey).split('::');
    if (!date) return;
    const row = byDate.get(date) || { date, orders: 0, total_usd: 0 };
    row.orders += 1;
    byDate.set(date, row);
  });
  const by_date = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const orderCount = by_date.reduce((total, row) => total + Number(row.orders || 0), 0);
  return {
    orders: orderCount,
    people: orderCount,
    total_usd: by_date.reduce((total, row) => total + Number(row.total_usd || 0), 0),
    by_date,
  };
}
function filterTipSummary(tips = {}, range) {
  const rows = filterRowsByDateRange(tips?.by_date || [], range).map((row) => ({
    date: row.date,
    orders: Number(row.orders || row.people || 0),
    total_usd: Number(row.total_usd || row.revenue_usd || 0),
  }));
  if (!rows.length) return emptyTipSummary();
  const orders = rows.reduce((total, row) => total + Number(row.orders || 0), 0);
  return {
    orders,
    people: orders,
    total_usd: rows.reduce((total, row) => total + Number(row.total_usd || 0), 0),
    by_date: rows,
  };
}
function mergeTipSummaries(...summaries) {
  const byDate = new Map();
  summaries.forEach((summary) => {
    (summary?.by_date || []).forEach((row) => {
      const cur = byDate.get(row.date) || { date: row.date, orders: 0, total_usd: 0 };
      cur.orders += Number(row.orders || row.people || 0);
      cur.total_usd += Number(row.total_usd || 0);
      byDate.set(row.date, cur);
    });
  });
  const by_date = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const orders = by_date.reduce((total, row) => total + Number(row.orders || 0), 0);
  return {
    orders,
    people: orders,
    total_usd: by_date.reduce((total, row) => total + Number(row.total_usd || 0), 0),
    by_date,
  };
}
function rangeFromDateSet(set) {
  const sorted = [...set].filter(Boolean).sort();
  return { since: sorted[0] || '', until: sorted[sorted.length - 1] || '', days: sorted.length, dates: sorted };
}
function loadedDateRange(meta, shopify) {
  const metaDates = new Set();
  const shopifyDates = new Set();
  // Row-backed dates only: `analysis_window` / `period` describe what was *requested*,
  // which can run past the days that actually came back. Anything that decides "is there
  // data here?" must use these sets, not the declared windows.
  const metaRowDates = new Set();
  const shopifyRowDates = new Set();
  const addMeta = (date) => { if (date) metaDates.add(date); };
  const addShopify = (date) => { if (date) shopifyDates.add(date); };
  const addMetaRow = (date) => { if (date) { metaDates.add(date); metaRowDates.add(date); } };
  const addShopifyRow = (date) => { if (date) { shopifyDates.add(date); shopifyRowDates.add(date); } };
  addMeta(meta?.analysis_window?.since); addMeta(meta?.analysis_window?.until);
  addShopify(shopify?.period?.since); addShopify(shopify?.period?.until);
  (meta?.adsets || []).forEach((adset) => (adset.rows || []).forEach((row) => addMetaRow(row.date)));
  (meta?.ad_daily || []).forEach((row) => addMetaRow(row.date));
  (meta?.ad_country_daily || []).forEach((row) => addMetaRow(row.date));
  (meta?.account_daily_metrics || []).forEach((row) => addMetaRow(row.date));
  (meta?.daily_metrics || []).forEach((row) => addMetaRow(row.date));
  (shopify?.daily || []).forEach((row) => addShopifyRow(row.date));
  (shopify?.order_lines || []).forEach((row) => addShopifyRow(row.date));
  const metaRange = rangeFromDateSet(metaDates);
  const shopifyRange = rangeFromDateSet(shopifyDates);
  const unionRange = rangeFromDateSet(new Set([...metaDates, ...shopifyDates]));
  const today = currentReportingDay();
  const calendarRange = rangeFromDateSet(new Set([...unionRange.dates, today]));
  const commonSince = [metaRange.since, shopifyRange.since].filter(Boolean).sort().at(-1) || unionRange.since;
  const commonUntil = [metaRange.until, shopifyRange.until].filter(Boolean).sort()[0] || unionRange.until;
  const hasCommon = Boolean(commonSince && commonUntil && commonSince <= commonUntil);
  const commonDates = unionRange.dates.filter((date) => date >= commonSince && date <= commonUntil);
  const metaRowRange = rangeFromDateSet(metaRowDates);
  const shopifyRowRange = rangeFromDateSet(shopifyRowDates);
  const latestDataDay = [metaRowRange.until, shopifyRowRange.until].filter(Boolean).sort().at(-1) || '';
  return {
    since: unionRange.since,
    until: unionRange.until,
    days: unionRange.days,
    common_since: hasCommon ? commonSince : '',
    common_until: hasCommon ? commonUntil : '',
    common_days: hasCommon ? commonDates.length : 0,
    meta_since: metaRange.since,
    meta_until: metaRange.until,
    shopify_since: shopifyRange.since,
    shopify_until: shopifyRange.until,
    union_since: unionRange.since,
    union_until: unionRange.until,
    calendar_since: calendarRange.since,
    calendar_until: calendarRange.until,
    today,
    reporting_timezone: REPORTING_TIMEZONE,
    is_common: hasCommon,
    latest_meta_day: metaRowRange.until,
    latest_shopify_day: shopifyRowRange.until,
    latest_data_day: latestDataDay,
    has_today_data: Boolean(latestDataDay && latestDataDay >= today),
  };
}
function normalizeDateRange(range, bounds) {
  let since = range?.since || bounds?.calendar_since || bounds?.since || '';
  let until = range?.until || bounds?.calendar_until || bounds?.until || '';
  if (since && until && since > until) [since, until] = [until, since];
  return { since, until };
}
function emptyMetaAggregate(seed) {
  return {
    ...seed,
    spend: 0,
    spend_usd: 0,
    spend_try: 0,
    impressions: 0,
    reach: 0,
    clicks_all: 0,
    link_clicks: 0,
    outbound_clicks: 0,
    purchases: 0,
    add_to_cart: 0,
    checkout_initiated: 0,
    purchase_value: 0,
    purchase_value_usd: 0,
    purchase_value_try: 0,
    active_days_set: new Set(),
    countries_set: new Set(),
    ads_set: new Set(),
    adsets_set: new Set(),
    campaigns_set: new Set(),
  };
}
function finalizeMetaAggregate(row) {
  const out = { ...row };
  out.active_days = out.active_days_set?.size || 0;
  out.country_count = out.countries_set?.size || 0;
  out.ad_count = out.ads_set?.size || 0;
  out.adset_count = out.adsets_set?.size || 0;
  out.campaign_count = out.campaigns_set?.size || 0;
  delete out.active_days_set;
  delete out.countries_set;
  delete out.ads_set;
  delete out.adsets_set;
  delete out.campaigns_set;
  out.frequency = out.reach ? out.impressions / out.reach : 0;
  out.ctr_all = out.impressions ? out.clicks_all / out.impressions * 100 : 0;
  out.ctr = out.impressions ? out.link_clicks / out.impressions * 100 : 0;
  out.ctr_source = out.link_clicks ? 'windowed_link_clicks' : 'windowed_no_link_clicks';
  out.cpm_usd = out.impressions ? out.spend_usd / out.impressions * 1000 : 0;
  out.cpm_try = out.impressions ? out.spend_try / out.impressions * 1000 : 0;
  out.reach_per_dollar = out.spend_usd ? out.reach / out.spend_usd : 0;
  out.cpa_usd = out.purchases ? out.spend_usd / out.purchases : 0;
  out.roas = out.spend_usd ? out.purchase_value_usd / out.spend_usd : 0;
  return out;
}
function aggregateMetaRows(rows, keyFn, seedFn) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const key = keyFn(row);
    if (!key) return;
    if (!map.has(key)) map.set(key, emptyMetaAggregate(seedFn(row)));
    const cur = map.get(key);
    META_SUM_FIELDS.forEach((field) => { cur[field] += Number(row[field] || 0); });
    if (Number(row.spend_usd || row.spend || 0) > 0) cur.active_days_set.add(row.date);
    if (row.country_code) cur.countries_set.add(row.country_code);
    if (row.ad_id) cur.ads_set.add(row.ad_id);
    if (row.adset_id) cur.adsets_set.add(row.adset_id);
    if (row.campaign_id || row.campaign_name) cur.campaigns_set.add(row.campaign_id || row.campaign_name);
  });
  return [...map.values()].map(finalizeMetaAggregate).sort((a, b) => b.spend_usd - a.spend_usd);
}
function filterMetaDataByDateRange(meta, range) {
  const adRows = filterRowsByDateRange(meta?.ad_country_daily || [], range);
  const adDailyRows = filterRowsByDateRange(meta?.ad_daily || [], range);
  const metricAdRows = adDailyRows.length ? adDailyRows : adRows;
  const hasWindowableAdRows = Boolean(meta?.ad_daily?.length || meta?.ad_country_daily?.length);
  const adsets = (meta?.adsets || [])
    .map((adset) => ({ ...adset, rows: filterRowsByDateRange(adset.rows || [], range) }))
    .filter((adset) => adset.rows.length);
  const ads = metricAdRows.length ? aggregateMetaRows(metricAdRows, adRollupKey, (row) => ({
    campaign_id: '',
    campaign_name: '',
    adset_id: '',
    adset_name: '',
    ad_id: adRollupKey(row),
    ad_name: row.ad_name,
    product_family: row.product_family,
    product_subtype: row.product_subtype,
  })) : (hasWindowableAdRows ? [] : (meta?.ads || []));
  const allAdsets = metricAdRows.length ? aggregateMetaRows(metricAdRows, (row) => row.adset_id || localKey([row.campaign_id, row.adset_name]), (row) => ({
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    adset_id: row.adset_id,
    adset_name: row.adset_name,
  })) : (hasWindowableAdRows ? [] : (meta?.all_adsets || []));
  const countries = adRows.length ? aggregateMetaRows(adRows, (row) => row.country_code, (row) => ({
    country_code: row.country_code,
    country: row.country,
  })) : (hasWindowableAdRows ? [] : (meta?.countries || []));
  const accountDaily = filterRowsByDateRange(meta?.account_daily_metrics || [], range);
  const adsetCountryDaily = filterRowsByDateRange(meta?.adset_country_daily || [], range);
  // `daily_metrics` is the last-resort source for account spend. It must be windowed
  // like every other series: leaving it unfiltered let a window with no Meta rows fall
  // through to full-history spend, so an empty day reported the whole campaign's spend.
  const dailyMetrics = filterRowsByDateRange(meta?.daily_metrics || [], range);
  const fxRates = meta?.fx_rates?.rates ? { ...meta.fx_rates, rates: filterRowsByDateRange(meta.fx_rates.rates, range) } : meta?.fx_rates;
  return {
    ...meta,
    analysis_window: { ...(meta?.analysis_window || {}), since: range.since, until: range.until },
    adsets,
    ads,
    all_adsets: allAdsets,
    countries,
    account_daily_metrics: accountDaily,
    daily_metrics: dailyMetrics,
    ad_daily: adDailyRows,
    ad_country_daily: adRows,
    adset_country_daily: adsetCountryDaily,
    adset_changes: filterRowsByDateRange(meta?.adset_changes || [], range),
    fx_rates: fxRates,
    data_coverage: {
      ...(meta?.data_coverage || {}),
      all_adsets: allAdsets.length || adsets.length,
      usa_adsets: allAdsets.filter((row) => row.country_code === 'US' || /(^|_)usa|usa_|us_/i.test(`${row.campaign_name || ''} ${row.adset_name || ''}`)).length,
      ads: ads.length,
      countries: countries.length,
      ad_daily_rows: adDailyRows.length,
      ad_country_daily_rows: adRows.length,
      adset_country_daily_rows: adsetCountryDaily.length,
    },
  };
}
function isEmailLine(line) {
  return String(line?.channel || '').toLowerCase() === 'email';
}

function filterShopifyByDateRange(shopify, range, { excludeEmail = false } = {}) {
  const daily = filterRowsByDateRange(shopify?.daily || [], range);
  const rawLines = filterRowsByDateRange(shopify?.order_lines || [], range);
  const tipLines = rawLines.filter(isTipLine);
  // Email-channel orders (utm_medium=email) are dropped from the product /
  // country / ad aggregates when requested, so the paid-ads leadership and
  // "top movers" views never count them.
  const lines = rawLines.filter((line) => !isTipLine(line) && (!excludeEmail || !isEmailLine(line)));
  const tips = mergeTipSummaries(filterTipSummary(shopify?.tips, range), summarizeTipLines(tipLines));
  if (!lines.length && !(shopify?.order_lines || []).length) {
    return {
      ...shopify,
      period: { ...(shopify?.period || {}), since: range.since, until: range.until },
      daily,
      cumulative: filterRowsByDateRange(shopify?.cumulative || [], range),
      tips,
    };
  }

  const familyMap = new Map();
  const productMap = new Map();
  const countryMap = new Map();
  const byDateFamily = new Map();
  lines.forEach((line) => {
    const units = Number(line.quantity || 0) || 1;
    const revenue = Number(line.line_revenue_usd || 0);
    const family = line.family || 'Other';
    const subtype = line.subtype || 'Unknown';
    const product = line.product || 'Unknown product';
    const familyRow = familyMap.get(family) || { family, units: 0, revenue_usd: 0 };
    familyRow.units += units; familyRow.revenue_usd += revenue; familyMap.set(family, familyRow);
    const productRow = productMap.get(product) || { product, family, subtype, units: 0, revenue_usd: 0, image_url: line.image_url || '' };
    if (!productRow.image_url && line.image_url) productRow.image_url = line.image_url;
    productRow.units += units; productRow.revenue_usd += revenue; productMap.set(product, productRow);
    const countryKey = line.country_code || 'Unknown';
    const countryRow = countryMap.get(countryKey) || { country_code: line.country_code || '', country: line.country || countryKey, units: 0, revenue_usd: 0, unique_products_set: new Set(), mix: {}, subtypes: {} };
    countryRow.units += units;
    countryRow.revenue_usd += revenue;
    countryRow.unique_products_set.add(product);
    countryRow.mix[family] = (countryRow.mix[family] || 0) + units;
    countryRow.subtypes[family] = countryRow.subtypes[family] || {};
    countryRow.subtypes[family][subtype] = (countryRow.subtypes[family][subtype] || 0) + units;
    countryMap.set(countryKey, countryRow);
    const dateMix = byDateFamily.get(line.date) || {};
    dateMix[family] = (dateMix[family] || 0) + units;
    byDateFamily.set(line.date, dateMix);
  });
  const dates = [...new Set([...daily.map((row) => row.date), ...lines.map((line) => line.date)])].filter(Boolean).sort();
  const running = {};
  const cumulative = dates.map((date) => {
    Object.entries(byDateFamily.get(date) || {}).forEach(([family, units]) => {
      running[family] = (running[family] || 0) + units;
    });
    return { date, ...running };
  });
  const countries = [...countryMap.values()].map((row) => {
    const out = { ...row, unique_products: row.unique_products_set.size };
    delete out.unique_products_set;
    return out;
  }).sort((a, b) => b.units - a.units);
  return {
    ...shopify,
    period: { ...(shopify?.period || {}), since: range.since, until: range.until },
    daily,
    order_lines: lines,
    tips,
    families: [...familyMap.values()].sort((a, b) => b.units - a.units),
    products: [...productMap.values()].sort((a, b) => b.units - a.units || b.revenue_usd - a.revenue_usd),
    countries,
    cumulative,
    orders: {
      ...(shopify?.orders || {}),
      included: sum(daily, 'orders'),
    },
  };
}

function mergeLiveTodayShopify(shopify, todaySummary) {
  if (!todaySummary?.date) return shopify;
  const dailyRow = {
    date: todaySummary.date,
    revenue_usd: Number(todaySummary.revenue_usd || 0),
    orders: Number(todaySummary.orders || 0),
    units: Number(todaySummary.units || 0),
    source: todaySummary.source || 'shopify_live_orders',
  };
  const existingDaily = shopify?.daily || [];
  const existingLines = shopify?.order_lines || [];
  const daily = [
    ...existingDaily.filter((row) => row.date !== todaySummary.date),
    dailyRow,
  ].sort((a, b) => a.date.localeCompare(b.date));
  const orderLines = [
    ...existingLines.filter((line) => line.date !== todaySummary.date),
    ...(todaySummary.order_lines || []),
  ].sort((a, b) => `${a.date || ''}:${a.created_at || ''}`.localeCompare(`${b.date || ''}:${b.created_at || ''}`));
  const existingTipRows = (shopify?.tips?.by_date || []).filter((row) => row.date !== todaySummary.date);
  const tips = mergeTipSummaries({ by_date: existingTipRows }, todaySummary.tips || {});
  const until = [shopify?.period?.until, todaySummary.date].filter(Boolean).sort().at(-1) || todaySummary.date;
  return {
    ...shopify,
    period: {
      ...(shopify?.period || {}),
      until,
      current_reporting_day: todaySummary.date,
      live_today_source: todaySummary.source || 'shopify_live_orders',
      live_today_note: todaySummary.coverage_note || '',
    },
    daily,
    order_lines: orderLines,
    tips,
  };
}

function replaceRowsForDate(rows = [], date, replacements = []) {
  if (!date) return rows || [];
  return [
    ...(rows || []).filter((row) => (row.date || row.date_start) !== date),
    ...(replacements || []),
  ].sort((a, b) => String(a.date || a.date_start || '').localeCompare(String(b.date || b.date_start || '')));
}

function isUsaDeliveryRow(row = {}) {
  const country = String(row.country_code || row.country || '').toUpperCase();
  const text = `${row.campaign_name || ''} ${row.adset_name || ''}`;
  return country === 'US' || /(^|_)usa|usa_|(^|_)us_|_us($|_)|\busa\b/i.test(text);
}

function summarizeLiveAdsetRows(rows = [], date) {
  return aggregateMetaRows(rows || [], (row) => row.adset_id || localKey([row.campaign_id, row.adset_name]), (row) => ({
    date,
    date_start: date,
    date_stop: date,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    adset_id: row.adset_id || localKey([row.campaign_id, row.adset_name]),
    adset_name: row.adset_name,
  })).map((row) => ({ ...row, date, date_start: date, date_stop: date, live_today: true }));
}

function mergeLiveAdsets(adsets = [], liveRows = [], date) {
  const liveAdsetRows = summarizeLiveAdsetRows(liveRows.filter(isUsaDeliveryRow), date);
  if (!liveAdsetRows.length) return adsets || [];
  const byAdset = new Map((adsets || []).map((adset) => [adset.adset_id || localKey([adset.campaign_id, adset.adset_name]), {
    ...adset,
    rows: (adset.rows || []).filter((row) => row.date !== date),
  }]));
  liveAdsetRows.forEach((row) => {
    const key = row.adset_id || localKey([row.campaign_id, row.adset_name]);
    const current = byAdset.get(key) || {
      adset_id: key,
      adset_name: row.adset_name,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      rows: [],
    };
    current.rows = [...(current.rows || []), row].sort((a, b) => a.date.localeCompare(b.date));
    byAdset.set(key, current);
  });
  return [...byAdset.values()].filter((adset) => (adset.rows || []).length);
}

function mergeLiveTodayMeta(meta, liveMeta) {
  if (!liveMeta?.date || liveMeta.configured === false) return meta;
  const date = liveMeta.date;
  const accountDaily = replaceRowsForDate(meta?.account_daily_metrics || [], date, liveMeta.account_daily_metrics || []);
  const adCountryDaily = replaceRowsForDate(meta?.ad_country_daily || [], date, liveMeta.ad_country_daily || []);
  const adsetCountryDaily = replaceRowsForDate(meta?.adset_country_daily || [], date, liveMeta.adset_daily || []);
  const liveDailyRows = liveMeta.adset_daily?.length
    ? aggregateRows([{ adset_id: 'live_meta_today', rows: summarizeLiveAdsetRows(liveMeta.adset_daily, date) }])
    : [];
  return {
    ...meta,
    generated_at: liveMeta.checked_at || meta?.generated_at,
    live_meta: {
      status: liveMeta.status || (liveMeta.ok ? 'fresh' : 'unavailable'),
      checked_at: liveMeta.checked_at || '',
      cached: Boolean(liveMeta.cached),
      ttl_ms: Number(liveMeta.ttl_ms || 0),
      account_currency: liveMeta.account_currency || '',
      warnings: liveMeta.warnings || [],
    },
    analysis_window: {
      ...(meta?.analysis_window || {}),
      until: [meta?.analysis_window?.until, date].filter(Boolean).sort().at(-1) || date,
    },
    account_daily_metrics: accountDaily,
    ad_country_daily: adCountryDaily,
    adset_country_daily: adsetCountryDaily,
    daily_metrics: liveDailyRows.length ? replaceRowsForDate(meta?.daily_metrics || [], date, liveDailyRows) : meta?.daily_metrics,
    adsets: mergeLiveAdsets(meta?.adsets || [], liveMeta.adset_daily || [], date),
    data_coverage: {
      ...(meta?.data_coverage || {}),
      ...(liveMeta.data_coverage || {}),
      live_meta_checked_at: liveMeta.checked_at || '',
    },
  };
}

function shiftDate(date, days) {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function mondayOfWeek(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00Z`);
  return shiftDate(dateStr, -((d.getUTCDay() + 6) % 7));
}
function reportingWeekToDate(anchorDate, bounds) {
  return clampDateRange({ since: mondayOfWeek(anchorDate), until: anchorDate }, bounds);
}
function previousWeekToDate(anchorDate, bounds) {
  const current = reportingWeekToDate(anchorDate, bounds);
  return clampDateRange({
    since: shiftDate(current.since, -7),
    until: shiftDate(current.until, -7),
  }, bounds);
}
function clampDateRange(range, bounds) {
  const normalized = normalizeDateRange(range, bounds);
  let since = normalized.since;
  let until = normalized.until;
  const minDate = bounds?.calendar_since || bounds?.since || '';
  const maxDate = bounds?.calendar_until || bounds?.until || '';
  if (minDate && since < minDate) since = minDate;
  if (maxDate && until > maxDate) until = maxDate;
  if (since && until && since > until) since = until;
  return { since, until };
}
function launchAnalysisDateRange(bounds) {
  return clampDateRange({
    since: CAMPAIGN_LAUNCH_DATE,
    until: bounds?.calendar_until || bounds?.until || currentReportingDay(),
  }, bounds);
}
function latestCompletedDataDay(bounds) {
  return bounds?.common_until || bounds?.until || bounds?.union_until || '';
}
function yesterdayPresetDay(bounds) {
  const end = bounds?.today || currentReportingDay();
  const calendarYesterday = shiftDate(end, -1);
  const latestLoaded = latestCompletedDataDay(bounds);
  return latestLoaded && calendarYesterday > latestLoaded ? latestLoaded : calendarYesterday;
}
function presetDateRange(preset, bounds) {
  const end = bounds?.today || currentReportingDay();
  if (!end) return { since: '', until: '' };
  if (preset === 'today') return clampDateRange({ since: end, until: end }, bounds);
  if (preset === 'yesterday') {
    const day = yesterdayPresetDay(bounds);
    return clampDateRange({ since: day, until: day }, bounds);
  }
  if (preset === 'latest') {
    const day = bounds?.latest_data_day || latestCompletedDataDay(bounds) || end;
    return clampDateRange({ since: day, until: day }, bounds);
  }
  if (preset === 'last7') return clampDateRange({ since: shiftDate(end, -6), until: end }, bounds);
  if (preset === 'launch') return launchAnalysisDateRange(bounds);
  if (preset === 'all' && bounds?.common_since && bounds?.common_until) {
    return clampDateRange({ since: bounds.common_since, until: bounds.common_until }, bounds);
  }
  return clampDateRange({ since: bounds?.since || end, until: end }, bounds);
}
function emailPanelRangeLabel(range, preset, isDemo) {
  if (isDemo) return 'Sample';
  if (!range?.since || !range?.until) return 'Selected range';
  if (range.since === range.until) {
    if (preset === 'today') return 'Today';
    if (preset === 'yesterday') return 'Yesterday';
    return range.since;
  }
  return `${range.since} – ${range.until}`;
}
function panelScopeRangeLabel(scope, launchRange, activeRange, preset, isDemo) {
  if (isDemo) return 'Sample';
  if (scope === 'launch') {
    const range = launchRange || {};
    if (!range.since || !range.until) return 'Since launch';
    if (range.since === range.until) return `Since launch · ${range.since}`;
    return `Since launch · ${range.since} – ${range.until}`;
  }
  return emailPanelRangeLabel(activeRange, preset, false);
}
function behaviorPanelRangeLabel(scope, launchRange, activeRange, preset, behavior, reportingToday) {
  const base = panelScopeRangeLabel(scope, launchRange, activeRange, preset, false);
  const cachedUntil = behaviorCachedUntil(behavior);
  const range = scope === 'launch' ? launchRange : activeRange;
  if (
    cachedUntil
    && range?.until
    && range.until > cachedUntil
    && isDevelopingReportingDayRange(range, reportingToday)
  ) {
    return `${base} · aggregates through ${cachedUntil}`;
  }
  if (scope === 'launch' && cachedUntil && range?.until && range.until > cachedUntil) {
    return `${base} · data through ${cachedUntil}`;
  }
  if (scope === 'dashboard' && isDevelopingReportingDayRange(activeRange, reportingToday) && cachedUntil && activeRange?.until > cachedUntil) {
    return `${base} · waiting for ${reportingToday} refresh`;
  }
  return base;
}
function dateRangeLabel(range, preset, bounds) {
  if (!range?.since || !range?.until) return 'Choose dates';
  const calendarYesterday = shiftDate(bounds?.today || currentReportingDay(), -1);
  const isLoadedYesterdayFallback = preset === 'yesterday' && range.since === range.until && range.until && range.until < calendarYesterday;
  const prefix = isLoadedYesterdayFallback
    ? 'Yesterday (latest loaded)'
    : datePresets.find((p) => p.value === preset)?.label || 'Custom';
  return `${prefix}: ${range.since} - ${range.until}`;
}
function countryFlag(code) {
  const cc = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '•';
  return [...cc].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join('');
}
function saleTime(value) {
  if (!value) return 'No timestamp';
  return new Date(value).toLocaleString([], { timeZone: REPORTING_TIMEZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

export function businessWindowRows(rows, windowKey) {
  const sorted = [...(rows || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (windowKey === 'all') return sorted;
  const count = Number(windowKey || 0);
  return count > 0 ? sorted.slice(-count) : sorted;
}

export function markDevelopingBusinessRows(rows, reportingDay) {
  return (rows || []).map((row) => ({
    ...row,
    is_developing: Boolean(reportingDay && row.date === reportingDay),
  }));
}

export function businessTrendPresentationRows(rows, reportingDay) {
  const markedRows = markDevelopingBusinessRows(rows, reportingDay);
  const developingIndex = markedRows.findIndex((row) => row.is_developing);
  return {
    rows: markedRows,
    hasDeveloping: developingIndex >= 0,
    developingIndex,
    solidRows: markedRows.map((row, index) => (index === developingIndex ? null : row)),
    developingRows: markedRows.map((row, index) => (
      developingIndex >= 0 && (index === developingIndex || index === developingIndex - 1) ? row : null
    )),
  };
}

function businessStats(rows) {
  const revenue = sum(rows, 'revenue_usd');
  const spend = sum(rows, 'spend_usd');
  const orders = sum(rows, 'orders');
  const units = sum(rows, 'units');
  return {
    revenue_usd: revenue,
    spend_usd: spend,
    orders,
    units,
    aov: orders ? revenue / orders : 0,
    cac: orders ? spend / orders : 0,
    roas: spend ? revenue / spend : 0,
  };
}

function dayCount(range) {
  if (!range?.since || !range?.until) return 0;
  const since = new Date(`${range.since}T00:00:00Z`);
  const until = new Date(`${range.until}T00:00:00Z`);
  return Math.max(1, Math.round((until - since) / 86400000) + 1);
}

function periodDeltaFromRows(currentRows, previousRows, key, label) {
  const current = businessStats(currentRows);
  const previous = businessStats(previousRows);
  const cur = Number(current[key] || 0);
  const prev = Number(previous[key] || 0);
  return {
    pct: prev ? (cur - prev) / prev * 100 : 0,
    absolute: cur - prev,
    current: cur,
    previous: prev,
    label,
  };
}

function emptyPeriodDelta(key, label = 'no prior period') {
  return periodDeltaFromRows([], [], key, label);
}

function elapsedReportingDayShare(date = new Date(), timeZone = REPORTING_TIMEZONE) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
  const seconds = (Number(parts.hour || 0) * 3600) + (Number(parts.minute || 0) * 60) + Number(parts.second || 0);
  return Math.min(1, Math.max(1 / 86400, seconds / 86400));
}

function scaleBusinessRows(rows = [], share = 1) {
  return (rows || []).map((row) => ({
    ...row,
    revenue_usd: Number(row.revenue_usd || 0) * share,
    spend_usd: Number(row.spend_usd || 0) * share,
    orders: Number(row.orders || 0) * share,
    units: Number(row.units || 0) * share,
  }));
}

function fallbackPeriodDelta(rows, key) {
  const sorted = [...(rows || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return { pct: 0, absolute: 0, label: 'no prior period' };
  const size = sorted.length >= 4 ? Math.floor(sorted.length / 2) : 1;
  const currentRows = sorted.slice(-size);
  const previousRows = sorted.slice(-size * 2, -size);
  return periodDeltaFromRows(currentRows, previousRows, key, sorted.length >= 4 ? 'vs prior period' : 'vs previous day');
}

function businessPeriodDelta(rows, key, activeRange) {
  const sorted = [...(rows || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (!activeRange?.since || !activeRange?.until) return fallbackPeriodDelta(sorted, key);
  const days = dayCount(activeRange);
  const isDevelopingDay = days === 1 && activeRange.since === activeRange.until && activeRange.until === currentReportingDay();
  let currentRows = filterRowsByDateRange(sorted, activeRange);
  if (!currentRows.length && isDevelopingDay) {
    currentRows = [{
      date: activeRange.until,
      revenue_usd: 0,
      spend_usd: 0,
      orders: 0,
      units: 0,
      aov: 0,
      cac: 0,
      roas: 0,
    }];
  } else if (!currentRows.length) {
    return emptyPeriodDelta(key, 'no current data');
  }
  const previousRange = { since: shiftDate(activeRange.since, -days), until: shiftDate(activeRange.until, -days) };
  const previousRows = filterRowsByDateRange(sorted, previousRange);
  if (previousRows.length) {
    const comparisonRows = isDevelopingDay ? scaleBusinessRows(previousRows, elapsedReportingDayShare()) : previousRows;
    return periodDeltaFromRows(currentRows, comparisonRows, key, isDevelopingDay ? 'vs same time previous day' : days === 1 ? 'vs previous day' : 'vs previous period');
  }
  // Day-rollover guard: just after Istanbul midnight the immediate prior day can be
  // missing from cache, which would otherwise produce a misleading 0% delta. Fall
  // back to the latest complete day on record, scaled to the elapsed share of today.
  if (isDevelopingDay) {
    const priorComplete = sorted.filter((row) => (row.date || '') < activeRange.until);
    const lastComplete = priorComplete[priorComplete.length - 1];
    if (lastComplete) {
      const comparisonRows = scaleBusinessRows([lastComplete], elapsedReportingDayShare());
      return periodDeltaFromRows(currentRows, comparisonRows, key, 'vs same time, latest day');
    }
  }
  return periodDeltaFromRows(currentRows, [], key, 'no prior period');
}

// `businessPeriodDelta` reports these labels when it could not build a comparison at
// all. Without this the cards render a green "0.0%", which reads as "flat" rather than
// "unknown".
function hasComparison(delta) {
  return Boolean(delta && delta.label !== 'no prior period' && delta.label !== 'no current data');
}

function enrichAdset(adset, march) {
  const rows = adset.rows || [];
  const last = rows[rows.length - 1] || {};
  const prev = rows.slice(0, Math.max(0, rows.length - 1));
  const histFrequency = avg(prev, 'frequency') || avg(rows, 'frequency');
  const histCpm = avg(prev, 'cpm_usd') || avg(rows, 'cpm_usd') || avg(prev, 'cpm') || avg(rows, 'cpm');
  const histReach = avg(prev, 'reach') || avg(rows, 'reach');
  const histReachPerDollar = avg(prev.map((row) => ({ ...row, reach_per_dollar: reachPerDollar(row) })), 'reach_per_dollar')
    || avg(rows.map((row) => ({ ...row, reach_per_dollar: reachPerDollar(row) })), 'reach_per_dollar');
  const current = {
    frequency: Number(last.frequency || avg(rows.slice(-3), 'frequency') || 0),
    cpm: Number(last.cpm_usd || last.cpm || avg(rows.slice(-3), 'cpm_usd') || avg(rows.slice(-3), 'cpm') || 0),
    reach: Number(last.reach || avg(rows.slice(-3), 'reach') || 0),
    reach_per_dollar: Number(last.reach_per_dollar || reachPerDollar(last) || avg(rows.slice(-3).map((row) => ({ ...row, reach_per_dollar: reachPerDollar(row) })), 'reach_per_dollar') || 0),
    impressions: Number(last.impressions || avg(rows.slice(-3), 'impressions') || 0),
    spend: Number(last.spend_usd || last.spend || avg(rows.slice(-3), 'spend_usd') || avg(rows.slice(-3), 'spend') || 0),
  };
  const marchReachPerDollar = Number(march.reach_per_dollar || reachPerDollar(march));
  const histDelta = { frequency: delta(current.frequency, histFrequency), cpm: delta(current.cpm, histCpm), reach: delta(current.reach, histReach), reach_per_dollar: delta(current.reach_per_dollar, histReachPerDollar) };
  const marchDelta = { frequency: delta(current.frequency, march.frequency), cpm: delta(current.cpm, march.cpm), reach: delta(current.reach, march.reach), reach_per_dollar: delta(current.reach_per_dollar, marchReachPerDollar) };
  let status = 'healthy';
  if (rows.length < 4 || sum(rows, 'spend') < 100) status = 'insufficient';
  else if (histDelta.frequency > 35 && histDelta.cpm > 25 && histDelta.reach < -8) status = 'expensive reach';
  else if (histDelta.frequency > 22 || histDelta.cpm > 25) status = 'fatigue risk';
  else if (histDelta.frequency > 10 || histDelta.cpm > 12 || histDelta.reach < -10) status = 'warming';
  const recommendation = status === 'healthy' ? 'Eligible to scale' : status === 'warming' ? 'Hold and watch 48h' : status === 'fatigue risk' ? 'Refresh creative or cap expansion' : status === 'expensive reach' ? 'Do not scale before reset' : 'Wait for more delivery';
  return { ...adset, current, histDelta, marchDelta, activeDays: rows.filter((r) => Number(r.spend || 0) > 0).length, status, recommendation };
}

function comparisonRows(period = {}, shopifyPeriod = {}) {
  const matchedOrders = Number(shopifyPeriod.totals?.orders || 0);
  const countryOrders = Number(shopifyPeriod.totals?.country_orders || 0);
  return attachShopifySales(period.rows || [], shopifyPeriod.rows || [], {
    completedUntil: shopifyPeriod.completed_until || shopifyPeriod.period?.until || shopifyPeriod.requested_until || '',
    fallbackToCountrySales: matchedOrders === 0 && countryOrders > 0,
  });
}

function comparisonStats(period = {}, shopifyPeriod = {}) {
  const rows = comparisonRows(period, shopifyPeriod);
  return {
    since: rows[0]?.date || period.period?.since || shopifyPeriod.requested_since || '',
    until: rows.at(-1)?.date || period.period?.until || shopifyPeriod.completed_until || '',
    days: rows.length,
    sales: sum(rows, 'shopify_sales'),
    revenue: sum(rows, 'shopify_revenue_usd'),
    spend: sum(rows, 'spend_usd'),
    reach: sum(rows, 'reach'),
    avgFrequency: avg(rows, 'frequency'),
    avgCpm: avg(rows, 'cpm_usd') || avg(rows, 'cpm'),
    avgReachPerDollar: avg(rows, 'reach_per_dollar'),
  };
}

function mergeBusinessRows(metaDaily, shopifyDaily) {
  const metaByDate = new Map((metaDaily || []).map((r) => [r.date, r]));
  const shopifyByDate = new Map((shopifyDaily || []).map((r) => [r.date, r]));
  const dates = [...new Set([...(metaDaily || []).map((r) => r.date), ...(shopifyDaily || []).map((r) => r.date)])]
    .filter(Boolean)
    .sort();
  return dates.map((date) => {
    const shop = shopifyByDate.get(date) || {};
    const meta = metaByDate.get(date) || {};
    const spendUsd = Number(meta.spend_usd ?? meta.spend ?? 0);
    const revenueUsd = Number(shop.revenue_usd || 0);
    const orders = Number(shop.orders || 0);
    return {
      date,
      revenue_usd: revenueUsd,
      spend_usd: spendUsd,
      orders,
      units: Number(shop.units || 0),
      aov: orders ? revenueUsd / orders : 0,
      cac: orders ? spendUsd / orders : 0,
      roas: spendUsd ? revenueUsd / spendUsd : 0,
    };
  });
}

function accountDailyFromAdRows(rows) {
  const byDate = new Map();
  (rows || []).forEach((row) => {
    const cur = byDate.get(row.date) || { date: row.date, spend_usd: 0, spend_try: 0, impressions: 0, reach: 0, purchases: 0, purchase_value_usd: 0 };
    cur.spend_usd += Number(row.spend_usd || 0);
    cur.spend_try += Number(row.spend_try || 0);
    cur.impressions += Number(row.impressions || 0);
    cur.reach += Number(row.reach || 0);
    cur.purchases += Number(row.purchases || 0);
    cur.purchase_value_usd += Number(row.purchase_value_usd || 0);
    byDate.set(row.date, cur);
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function pickTopCountryByUnits(countries = []) {
  return [...(countries || [])]
    .sort((a, b) => Number(b.units || 0) - Number(a.units || 0) || Number(b.revenue || 0) - Number(a.revenue || 0))
    [0] || null;
}
function pickTopProductByUnits(products = []) {
  const sorted = [...(products || [])]
    .sort((a, b) => Number(b.units || 0) - Number(a.units || 0) || String(a.product || '').localeCompare(String(b.product || '')));
  const top = sorted[0];
  if (!top) return null;
  const topUnits = Number(top.units || 0);
  const tied = sorted.filter((row) => Number(row.units || 0) === topUnits);
  if (tied.length > 1) {
    const names = tied.map((row) => row.product || row.family || 'Product');
    return {
      initial: 'T',
      name: `${tied.length} products tied`,
      category: names.slice(0, 2).join(' + ') + (names.length > 2 ? ` + ${names.length - 2} more` : ''),
      units: topUnits,
      revenue: tied.reduce((total, row) => total + Number(row.revenue_usd || 0), 0),
    };
  }
  return adapt.toProductLeaders([top], 1)[0] || null;
}
function pickTopAdBySales(adRows = []) {
  const top = [...(adRows || [])]
    .sort((a, b) => Number(b.shopify_sales || 0) - Number(a.shopify_sales || 0) || Number(b.shopify_revenue_usd || 0) - Number(a.shopify_revenue_usd || 0) || Number(b.spend_usd || 0) - Number(a.spend_usd || 0))
    [0];
  if (!top) return null;
  return adapt.toAdLeaders([top], 1)[0] || null;
}

function dateListForRange(range) {
  if (!range?.since || !range?.until) return [];
  const out = [];
  for (let d = new Date(`${range.since}T00:00:00Z`); d <= new Date(`${range.until}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function cleanAdLabel(line) {
  const attribution = line?.attribution || {};
  const label = attribution.match_hints?.ad_name || attribution.ad_hint || attribution.utm?.utm_content || '';
  const text = String(label || '').trim();
  if (!text || /link.?in.?bio|unattributed|unknown|homepage|direct/i.test(text)) return '';
  return text;
}

function topWinners(items, primaryKey, secondaryKey) {
  const sorted = [...items].sort((a, b) => Number(b[primaryKey] || 0) - Number(a[primaryKey] || 0) || Number(b[secondaryKey] || 0) - Number(a[secondaryKey] || 0));
  const top = sorted[0];
  if (!top) return { winners: [], tieCount: 0 };
  const tied = sorted.filter((item) => Number(item[primaryKey] || 0) === Number(top[primaryKey] || 0));
  return { winners: tied, tieCount: tied.length };
}

function scoreBehaviorRows(rows, { priorStrength = 20, globalRate = 0 } = {}) {
  return rows.map((row) => {
    const exposed = Number(row.exposed || 0);
    const abandoned = Number(row.abandoned || 0);
    const rawRate = exposed ? abandoned / exposed : 0;
    const shrunkRate = (abandoned + priorStrength * globalRate) / ((exposed + priorStrength) || 1);
    const excessRate = shrunkRate - globalRate;
    const supportWeight = Math.min(1, Math.sqrt(exposed / 30));
    let confidence = 'Insufficient';
    if (exposed >= 100 && abandoned >= 8 && excessRate > 0.05) confidence = 'High Confidence';
    else if (exposed >= 50 && abandoned >= 8 && excessRate > 0.10) confidence = 'Actionable';
    else if (exposed >= 20 && abandoned >= 3 && excessRate > 0.05) confidence = 'Directional';
    else if (exposed >= 8) confidence = 'Watch';
    return {
      ...row,
      raw_rate: rawRate,
      shrunk_rate: shrunkRate,
      site_rate: globalRate,
      vs_site_pp: (shrunkRate - globalRate) * 100,
      excess_abandons: Math.max(0, excessRate * exposed),
      risk_score: Math.max(0, excessRate) * supportWeight * 100,
      confidence,
    };
  }).sort((a, b) => b.excess_abandons - a.excess_abandons || b.shrunk_rate - a.shrunk_rate || b.exposed - a.exposed);
}

function rollupBehaviorFacts(facts, step, dimension) {
  const scoped = (facts || []).filter((fact) => fact.step === step);
  const totalExposed = sum(scoped, 'exposed');
  const totalAbandoned = sum(scoped, 'abandoned');
  const globalRate = totalExposed ? totalAbandoned / totalExposed : 0;
  const map = new Map();
  scoped.forEach((fact) => {
    const key = dimension === 'product'
      ? String(fact.source === 'meta_add_payment_info' ? `${fact.family || 'Other'}:${fact.subtype || fact.product || 'Unknown product'}` : (fact.product_id || fact.variant_id || fact.product || 'unknown_product'))
      : String(fact.country_code || 'UNKNOWN');
    const row = map.get(key) || {
      key,
      product_id: fact.product_id || '',
      product: fact.product || 'Unknown product',
      family: fact.family || 'Other',
      subtype: fact.subtype || 'Unknown',
      image_url: fact.image_url || '',
      country_code: fact.country_code || '',
      country: fact.country || countryNameFromCode(fact.country_code || ''),
      exposed: 0,
      abandoned: 0,
      completed: 0,
      units: 0,
      value_usd: 0,
      countries_map: new Map(),
    };
    row.exposed += Number(fact.exposed || 0);
    row.abandoned += Number(fact.abandoned || 0);
    row.completed += Number(fact.completed || 0);
    row.units += Number(fact.units || 0);
    row.value_usd += Number(fact.value_usd || 0);
    if (!row.image_url && fact.image_url) row.image_url = fact.image_url;
    if (fact.country_code) {
      const c = row.countries_map.get(fact.country_code) || { country_code: fact.country_code, country: fact.country || countryNameFromCode(fact.country_code), exposed: 0, abandoned: 0 };
      c.exposed += Number(fact.exposed || 0);
      c.abandoned += Number(fact.abandoned || 0);
      row.countries_map.set(fact.country_code, c);
    }
    map.set(key, row);
  });
  const rows = [...map.values()].map((row) => {
    const countries = [...row.countries_map.values()].sort((a, b) => b.abandoned - a.abandoned || b.exposed - a.exposed).slice(0, 4);
    const out = { ...row, countries };
    delete out.countries_map;
    return out;
  });
  return { global: { exposed: totalExposed, abandoned: totalAbandoned, rate: globalRate }, rows: scoreBehaviorRows(rows, { priorStrength: dimension === 'country' ? 30 : 20, globalRate }) };
}

function countryNameFromCode(code) {
  try {
    return code ? new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code : 'Unknown';
  } catch {
    return code || 'Unknown';
  }
}

function demographicsBehaviorRollup(rows = []) {
  const byAgeGender = new Map();
  rows.forEach((row) => {
    const key = `${row.age || 'unknown'} · ${row.gender || 'unknown'}`;
    const cur = byAgeGender.get(key) || { key, segment: key, age: row.age || 'unknown', gender: row.gender || 'unknown', exposed_checkout: 0, abandoned_checkout: 0, exposed_payment: 0, abandoned_payment: 0, purchases: 0 };
    cur.exposed_checkout += Number(row.checkout_initiated || 0);
    cur.abandoned_checkout += Math.max(0, Number(row.checkout_initiated || 0) - Number(row.purchases || 0));
    cur.exposed_payment += Number(row.payment_info || 0);
    cur.abandoned_payment += Math.max(0, Number(row.payment_info || 0) - Number(row.purchases || 0));
    cur.purchases += Number(row.purchases || 0);
    byAgeGender.set(key, cur);
  });
  const rowsList = [...byAgeGender.values()];
  const checkoutExposure = sum(rowsList, 'exposed_checkout');
  const checkoutAbandoned = sum(rowsList, 'abandoned_checkout');
  const paymentExposure = sum(rowsList, 'exposed_payment');
  const paymentAbandoned = sum(rowsList, 'abandoned_payment');
  const checkoutRows = rowsList.filter((row) => Number(row.exposed_checkout || 0) > 0);
  const paymentRows = rowsList.filter((row) => Number(row.exposed_payment || 0) > 0);
  return {
    checkout: scoreBehaviorRows(checkoutRows.map((row) => ({ ...row, exposed: row.exposed_checkout, abandoned: row.abandoned_checkout })), { priorStrength: 40, globalRate: checkoutExposure ? checkoutAbandoned / checkoutExposure : 0 }).slice(0, 8),
    submit_payment: scoreBehaviorRows(paymentRows.map((row) => ({ ...row, exposed: row.exposed_payment, abandoned: row.abandoned_payment })), { priorStrength: 40, globalRate: paymentExposure ? paymentAbandoned / paymentExposure : 0 }).slice(0, 8),
  };
}

function dwellBehaviorRollup(pageFacts = []) {
  return rollupDwellPages(pageFacts);
}

function journeyBehaviorRollup(journeyRows = []) {
  const totals = { purchasers: 0, non_purchasers: 0 };
  const pageMap = new Map();
  const pathMap = new Map();
  journeyRows.forEach((row) => {
    const cohort = row.purchased ? 'purchasers' : 'non_purchasers';
    totals[cohort] += 1;
    (row.path_sequence || []).forEach((path, index) => {
      const normalized = normalizePagePath(path);
      const key = `${index}:${normalized}`;
      const cur = pageMap.get(key) || { step: index + 1, path: normalized, purchasers: 0, non_purchasers: 0 };
      cur[cohort] += 1;
      pageMap.set(key, cur);
    });
    const pathKey = (row.path_sequence || []).map((path) => normalizePagePath(path)).join(' → ');
    if (pathKey) {
      const curPath = pathMap.get(pathKey) || { path_sequence: row.path_sequence || [], purchasers: 0, non_purchasers: 0 };
      curPath[cohort] += 1;
      pathMap.set(pathKey, curPath);
    }
  });
  const steps = [...pageMap.values()].map((row) => {
    const purchaserSupport = totals.purchasers ? row.purchasers / totals.purchasers : 0;
    const nonPurchaserSupport = totals.non_purchasers ? row.non_purchasers / totals.non_purchasers : 0;
    return { ...row, purchaser_support: purchaserSupport, non_purchaser_support: nonPurchaserSupport, lift: nonPurchaserSupport ? purchaserSupport / nonPurchaserSupport : 0 };
  }).sort((a, b) => a.step - b.step || b.purchaser_support - a.purchaser_support).slice(0, 10);
  const paths = [...pathMap.values()].map((row) => ({ ...row, purchaser_support: totals.purchasers ? row.purchasers / totals.purchasers : 0, non_purchaser_support: totals.non_purchasers ? row.non_purchasers / totals.non_purchasers : 0 }))
    .sort((a, b) => (b.purchasers + b.non_purchasers) - (a.purchasers + a.non_purchasers)).slice(0, 4);
  return { totals, steps, paths };
}

function filterBehaviorByDateRange(behavior, range, reportingToday = currentReportingDay()) {
  const facts = filterRowsByDateRange(behavior?.facts || [], range);
  const demographicRows = filterRowsByDateRange(behavior?.meta_demographics_rows || [], range);
  const pageFacts = filterRowsByDateRange(behavior?.page_facts || [], range);
  const journeyRows = filterRowsByDateRange(behavior?.journey_rows || [], range);
  const coverage = behaviorCoverageMeta(behavior, range, reportingToday);
  const checkoutProducts = rollupBehaviorFacts(facts, 'checkout', 'product');
  const checkoutCountries = rollupBehaviorFacts(facts, 'checkout', 'country');
  const paymentProducts = rollupBehaviorFacts(facts, 'submit_payment', 'product');
  const paymentCountries = rollupBehaviorFacts(facts, 'submit_payment', 'country');
  const demographics = demographicsBehaviorRollup(demographicRows);
  const developingEmpty = coverage.developing_day
    && !facts.length
    && !demographicRows.length
    && !pageFacts.length
    && !journeyRows.length;
  const checkoutGlobal = developingEmpty ? emptyBehaviorGlobal() : checkoutProducts.global;
  const paymentGlobal = developingEmpty ? emptyBehaviorGlobal() : paymentProducts.global;
  return {
    ...behavior,
    period: { ...(behavior?.period || {}), since: range.since, until: range.until },
    coverage,
    matrix: {
      checkout: {
        global: checkoutGlobal,
        products: developingEmpty ? [] : checkoutProducts.rows,
        countries: developingEmpty ? [] : checkoutCountries.rows,
        gender: developingEmpty ? [] : demographics.checkout,
      },
      submit_payment: {
        global: paymentGlobal,
        products: developingEmpty ? [] : paymentProducts.rows,
        countries: developingEmpty ? [] : paymentCountries.rows,
        gender: developingEmpty ? [] : demographics.submit_payment,
      },
    },
    dwell_pages: developingEmpty ? [] : dwellBehaviorRollup(pageFacts),
    dwell_analysis: developingEmpty ? {} : dwellAnalysisMeta(pageFacts),
    journeys: developingEmpty ? { totals: { purchasers: 0, non_purchasers: 0 }, steps: [], paths: [] } : journeyBehaviorRollup(journeyRows),
  };
}

function dailySalesHighlights(lines, range) {
  const rows = dateListForRange(range).map((date) => ({ date, products: new Map(), ads: new Map() }));
  const byDate = new Map(rows.map((row) => [row.date, row]));
  for (const line of lines || []) {
    if (!inDateRange(line.date, range)) continue;
    const row = byDate.get(line.date);
    if (!row) continue;
    const units = Number(line.quantity || 0) || 1;
    const revenue = Number(line.line_revenue_usd || 0);
    const productKey = line.product || 'Unknown product';
    const product = row.products.get(productKey) || {
      product: productKey,
      family: line.family || 'Other',
      subtype: line.subtype || 'Unknown',
      units: 0,
      revenue_usd: 0,
      image_url: line.image_url || '',
    };
    product.units += units;
    product.revenue_usd += revenue;
    if (!product.image_url && line.image_url) product.image_url = line.image_url;
    row.products.set(productKey, product);

    const adLabel = cleanAdLabel(line);
    if (adLabel) {
      const ad = row.ads.get(adLabel) || { ad: adLabel, orders: new Set(), units: 0, revenue_usd: 0 };
      if (line.order_id) ad.orders.add(line.order_id);
      ad.units += units;
      ad.revenue_usd += revenue;
      row.ads.set(adLabel, ad);
    }
  }
  return rows.map((row) => {
    const productWinners = topWinners([...row.products.values()], 'units', 'revenue_usd');
    const adWinners = topWinners([...row.ads.values()]
      .map((item) => ({ ...item, order_count: item.orders.size || item.units, orders: undefined })), 'order_count', 'revenue_usd');
    return { date: row.date, products: productWinners.winners, productTieCount: productWinners.tieCount, ads: adWinners.winners, adTieCount: adWinners.tieCount };
  });
}


function App() {
  const [raw, setRaw] = useState(null);
  const [shopify, setShopify] = useState(null);
  const [behaviorRaw, setBehaviorRaw] = useState(null);
  const [selected, setSelected] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [activeBusiness, setActiveBusiness] = useState('revenue');
  const [businessWindow, setBusinessWindow] = useState('all');
  const [datePreset, setDatePreset] = useState('today');
  const [emailPanelScope, setEmailPanelScope] = useState('launch');
  const [behaviorPanelScope, setBehaviorPanelScope] = useState('launch');
  const [businessRevenueScope, setBusinessRevenueScope] = useState('shopify_email');
  const [dateRange, setDateRange] = useState({ since: '', until: '' });
  const [customRange, setCustomRange] = useState({ since: '', until: '' });
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [saleSoundEnabled, setSaleSoundEnabled] = useState(true);
  const [saleMonitor, setSaleMonitor] = useState({ status: 'checking', sale: null, checkedAt: null, fresh: false, error: '', todaySummary: null, purchases: [] });
  const [metaMonitor, setMetaMonitor] = useState({ status: 'checking', live: null, checkedAt: null, error: '' });
  const [activeTab, setActiveTab] = useState('overview');
  const [autoPresetApplied, setAutoPresetApplied] = useState(false);
  const autoPresetRef = useRef(false);
  const saleAudioRef = useRef(null);
  const saleSoundEnabledRef = useRef(true);
  const lastSaleIdRef = useRef('');
  const saleInitializedRef = useRef(false);
  const saleFlashTimerRef = useRef(null);

  useEffect(() => {
    fetchJsonWithFallback('/api/data/adset-radar.json', '/data/adset-radar.json', fallbackData).then(setRaw);
  }, []);
  useEffect(() => {
    fetchJsonWithFallback('/api/data/shopify-products.json', '/data/shopify-products.json', fallbackShopify).then(setShopify);
  }, []);
  useEffect(() => {
    fetchJsonWithFallback('/api/data/behavior-intelligence.json', '/data/behavior-intelligence.json', fallbackBehavior).then(setBehaviorRaw);
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function pollBehavior() {
      for (const target of ['/api/data/behavior-intelligence.json', '/data/behavior-intelligence.json']) {
        try {
          const res = await fetch(target, { cache: 'no-store' });
          if (!res.ok) continue;
          const payload = await res.json();
          if (!cancelled && payload && typeof payload === 'object') setBehaviorRaw(payload);
          return;
        } catch {
          // Try the next source; keep the last loaded snapshot on failure.
        }
      }
    }
    const timer = window.setInterval(pollBehavior, BEHAVIOR_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    saleSoundEnabledRef.current = saleSoundEnabled;
  }, [saleSoundEnabled]);

  async function playSaleChime() {
    if (!saleAudioRef.current) {
      const audio = new Audio('/assets/shopify_sale_sound.mp3');
      audio.preload = 'auto';
      audio.volume = 0.88;
      saleAudioRef.current = audio;
    }
    const audio = saleAudioRef.current;
    try {
      audio.currentTime = 0;
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  async function enableSaleSound() {
    setSaleSoundEnabled(true);
    saleSoundEnabledRef.current = true;
    await playSaleChime();
  }

  useEffect(() => {
    let cancelled = false;
    async function pollLatestSale() {
      try {
        const payload = await fetchLatestSale();
        if (cancelled) return;
        const sale = payload.sale || null;
        const previousId = lastSaleIdRef.current;
        const isNewSale = Boolean(sale?.id && saleInitializedRef.current && sale.id !== previousId);
        if (sale?.id) lastSaleIdRef.current = sale.id;
        saleInitializedRef.current = true;
        setSaleMonitor({
          status: payload.configured === false ? 'not_configured' : 'live',
          sale,
          todaySummary: payload.today_summary || null,
          purchases: Array.isArray(payload.purchases) ? payload.purchases : [],
          checkedAt: payload.checked_at || new Date().toISOString(),
          fresh: isNewSale,
          error: '',
        });
        if (isNewSale) {
          if (saleSoundEnabledRef.current) playSaleChime();
          window.clearTimeout(saleFlashTimerRef.current);
          saleFlashTimerRef.current = window.setTimeout(() => setSaleMonitor((current) => ({ ...current, fresh: false })), 15000);
        }
      } catch (error) {
        if (!cancelled) setSaleMonitor((current) => ({ ...current, status: 'offline', checkedAt: new Date().toISOString(), fresh: false, error: error.message }));
      }
    }
    pollLatestSale();
    const timer = window.setInterval(pollLatestSale, SALE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(saleFlashTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function pollLiveMeta() {
      try {
        const payload = await fetchLiveMeta();
        if (cancelled) return;
        setMetaMonitor({
          status: payload.configured === false ? 'not_configured' : payload.status || (payload.ok ? 'live' : 'unavailable'),
          live: payload,
          checkedAt: payload.checked_at || new Date().toISOString(),
          error: payload.error || '',
        });
      } catch (error) {
        if (!cancelled) setMetaMonitor((current) => ({ ...current, status: 'offline', checkedAt: new Date().toISOString(), error: error.message }));
      }
    }
    pollLiveMeta();
    const timer = window.setInterval(pollLiveMeta, META_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const fallbackMetaData = useMemo(() => fallbackData(), []);
  const fallbackProductData = useMemo(() => fallbackShopify(), []);
  const metaDataLoaded = raw !== null;
  const shopifyDataLoaded = shopify !== null;
  const staticBaseData = raw || fallbackMetaData;
  const staticProductData = shopify || fallbackProductData;
  const baseData = useMemo(() => mergeLiveTodayMeta(staticBaseData, metaMonitor.live), [staticBaseData, metaMonitor.live]);
  const baseProductData = useMemo(
    () => mergeLiveTodayShopify(staticProductData, saleMonitor.todaySummary),
    [staticProductData, saleMonitor.todaySummary]
  );
  const baseBehaviorData = behaviorRaw || fallbackBehavior();
  const loadedBounds = useMemo(() => loadedDateRange(baseData, baseProductData), [baseData, baseProductData]);
  // Opening on "Today" when the cache has not reached today yet shows an all-zero
  // dashboard that looks like a collapse in the business rather than a gap in the data.
  // Once both sources have settled, fall back once to the latest day that has rows.
  // Any explicit preset choice latches this off so we never fight the user.
  useEffect(() => {
    if (autoPresetRef.current) return;
    if (!metaDataLoaded || !shopifyDataLoaded) return;
    if (!loadedBounds.latest_data_day) return;
    autoPresetRef.current = true;
    if (!loadedBounds.has_today_data) {
      setDatePreset('latest');
      setAutoPresetApplied(true);
    }
  }, [metaDataLoaded, shopifyDataLoaded, loadedBounds.latest_data_day, loadedBounds.has_today_data]);
  useEffect(() => {
    if (!loadedBounds.since || !loadedBounds.until) return;
    if (datePreset !== 'custom') {
      const next = presetDateRange(datePreset, loadedBounds);
      setDateRange(next);
      setCustomRange(next);
      return;
    }
    setDateRange((current) => clampDateRange(current.since ? current : loadedBounds, loadedBounds));
    setCustomRange((current) => clampDateRange(current.since ? current : loadedBounds, loadedBounds));
  }, [loadedBounds.since, loadedBounds.until, loadedBounds.common_since, loadedBounds.common_until, datePreset]);
  const activeDateRange = useMemo(() => clampDateRange(dateRange.since ? dateRange : presetDateRange(datePreset, loadedBounds), loadedBounds), [dateRange, datePreset, loadedBounds]);
  const launchDateRange = useMemo(() => launchAnalysisDateRange(loadedBounds), [loadedBounds]);
  const data = useMemo(() => filterMetaDataByDateRange(baseData, activeDateRange), [baseData, activeDateRange]);
  const productData = useMemo(() => filterShopifyByDateRange(baseProductData, activeDateRange), [baseProductData, activeDateRange]);
  const launchData = useMemo(() => filterMetaDataByDateRange(baseData, launchDateRange), [baseData, launchDateRange]);
  const launchProductData = useMemo(() => filterShopifyByDateRange(baseProductData, launchDateRange), [baseProductData, launchDateRange]);
  const countryRoasDateRange = useMemo(() => clampDateRange({
    since: CAMPAIGN_LAUNCH_DATE,
    until: loadedBounds.common_until || launchDateRange.until,
  }, loadedBounds), [loadedBounds, launchDateRange]);
  const countryRoasData = useMemo(() => filterMetaDataByDateRange(baseData, countryRoasDateRange), [baseData, countryRoasDateRange]);
  const countryRoasProductData = useMemo(() => filterShopifyByDateRange(baseProductData, countryRoasDateRange), [baseProductData, countryRoasDateRange]);
  const emailPanelDateRange = useMemo(
    () => (emailPanelScope === 'launch' ? launchDateRange : activeDateRange),
    [emailPanelScope, launchDateRange, activeDateRange],
  );
  const emailPanelProductData = useMemo(
    () => filterShopifyByDateRange(baseProductData, emailPanelDateRange),
    [baseProductData, emailPanelDateRange],
  );
  const behaviorPanelDateRange = useMemo(
    () => (behaviorPanelScope === 'launch' ? launchDateRange : activeDateRange),
    [behaviorPanelScope, launchDateRange, activeDateRange],
  );
  const reportingToday = loadedBounds.today || currentReportingDay();
  const behaviorData = useMemo(
    () => filterBehaviorByDateRange(baseBehaviorData, behaviorPanelDateRange, reportingToday),
    [baseBehaviorData, behaviorPanelDateRange, reportingToday],
  );
  function handleDatePreset(nextPreset) {
    autoPresetRef.current = true;
    setAutoPresetApplied(false);
    setDatePreset(nextPreset);
    if (nextPreset === 'custom') {
      setCustomRange(activeDateRange);
      return;
    }
    const next = presetDateRange(nextPreset, loadedBounds);
    setDateRange(next);
    setCustomRange(next);
    setDateMenuOpen(false);
  }
  function applyCustomDateRange() {
    const next = clampDateRange(customRange, loadedBounds);
    setDatePreset('custom');
    setDateRange(next);
    setCustomRange(next);
    setDateMenuOpen(false);
  }
  const isUsaFrequencyView = data.delivery_scope === 'usa_adsets_only' && (selected === 'all' || (data.adsets || []).some((a) => a.adset_id === selected));
  const march = { ...(data.march_baseline || {}), applies: isUsaFrequencyView };
  const enriched = useMemo(() => (data.adsets || []).map((a) => enrichAdset(a, march)).sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.current.spend - a.current.spend), [data, march]);
  const filtered = enriched.filter((a) => (statusFilter === 'all' || a.status === statusFilter) && `${a.adset_name} ${a.campaign_name}`.toLowerCase().includes(query.toLowerCase()));
  const chosen = selected === 'all' ? filtered : filtered.filter((a) => a.adset_id === selected);
  const trendRows = aggregateRows(chosen.length ? chosen : filtered);
  const launchEnriched = useMemo(() => (launchData.adsets || []).map((a) => enrichAdset(a, march)).sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.current.spend - a.current.spend), [launchData, march]);
  const launchFiltered = launchEnriched.filter((a) => (statusFilter === 'all' || a.status === statusFilter) && `${a.adset_name} ${a.campaign_name}`.toLowerCase().includes(query.toLowerCase()));
  const launchChosen = selected === 'all' ? launchFiltered : launchFiltered.filter((a) => a.adset_id === selected);
  const deliveryTrendRows = aggregateRows(launchChosen.length ? launchChosen : launchFiltered);
  const launchSelectedIds = new Set((launchChosen.length ? launchChosen : launchFiltered).map((a) => a.adset_id));
  const launchSelectedChanges = (launchData.adset_changes || []).filter((c) => selected === 'all' || launchSelectedIds.has(c.adset_id));
  const budgetChangeCount = launchSelectedChanges.filter((c) => c.is_budget_change).length;
  const otherChangeCount = launchSelectedChanges.length - budgetChangeCount;
  const overall = trendRows[trendRows.length - 1] || {};
  const histRows = trendRows.slice(0, -1);
  const marchReachPerDollar = reachPerDollar(march);
  const hist = { frequency: avg(histRows, 'frequency'), cpm: avg(histRows, 'cpm'), reach: avg(histRows, 'reach'), reach_per_dollar: avg(histRows, 'reach_per_dollar') };
  const overallDelta = { frequency: delta(overall.frequency, hist.frequency), cpm: delta(overall.cpm, hist.cpm), reach: delta(overall.reach, hist.reach), reach_per_dollar: delta(reachPerDollar(overall), hist.reach_per_dollar) };
  const marchDelta = { frequency: delta(overall.frequency, march.frequency), cpm: delta(overall.cpm, march.cpm), reach: delta(overall.reach, march.reach), reach_per_dollar: delta(reachPerDollar(overall), marchReachPerDollar) };
  const metaFallbackActive = metaDataLoaded && data.source === 'sample-data';
  const shopifyFallbackActive = shopifyDataLoaded && productData.source === 'sample-shopify';
  const sourceLabel = !metaDataLoaded
    ? 'Meta data loading'
    : metaFallbackActive
    ? 'Sample fallback'
    : metaMonitor.status === 'not_configured'
      ? 'Meta API not configured'
      : metaMonitor.status === 'offline'
        ? 'Meta API offline'
        : metaMonitor.status === 'checking'
          ? 'Meta API checking'
          : 'Meta API live';
  const refreshText = metaMonitor.checkedAt
    ? `Meta checked ${saleTime(metaMonitor.checkedAt)}`
    : `Refreshed ${data.generated_at ? new Date(data.generated_at).toLocaleString() : 'now'}`;
  const accountDaily = useMemo(() => {
    const accountRows = data.account_daily_metrics?.length ? data.account_daily_metrics : accountDailyFromAdRows(data.ad_daily?.length ? data.ad_daily : (data.ad_country_daily || []));
    return accountRows.length ? accountRows : (data.daily_metrics || aggregateRows(data.adsets || []));
  }, [data]);
  const allLoadedDateRange = useMemo(() => ({
    since: loadedBounds.since,
    until: [loadedBounds.until, loadedBounds.today, baseProductData?.period?.current_reporting_day]
      .filter(Boolean)
      .sort()
      .at(-1) || loadedBounds.until,
  }), [loadedBounds.since, loadedBounds.until, loadedBounds.today, baseProductData?.period?.current_reporting_day]);
  const allLoadedData = useMemo(() => filterMetaDataByDateRange(baseData, allLoadedDateRange), [baseData, allLoadedDateRange]);
  const allLoadedProductDaily = useMemo(
    () => (baseProductData?.daily || []).filter((row) => {
      if (!row?.date) return false;
      if (allLoadedDateRange.since && row.date < allLoadedDateRange.since) return false;
      if (allLoadedDateRange.until && row.date > allLoadedDateRange.until) return false;
      return true;
    }),
    [baseProductData?.daily, allLoadedDateRange.since, allLoadedDateRange.until],
  );
  const allLoadedAccountDaily = useMemo(() => {
    const accountRows = allLoadedData.account_daily_metrics?.length ? allLoadedData.account_daily_metrics : accountDailyFromAdRows(allLoadedData.ad_daily?.length ? allLoadedData.ad_daily : (allLoadedData.ad_country_daily || []));
    return accountRows.length ? accountRows : (allLoadedData.daily_metrics || aggregateRows(allLoadedData.adsets || []));
  }, [allLoadedData]);
  const emailDailyIndex = useMemo(() => buildEmailDailyIndex(baseProductData?.order_lines || []), [baseProductData?.order_lines]);
  const businessRows = useMemo(() => mergeBusinessRows(accountDaily, applyRevenueScope(productData.daily || [], businessRevenueScope, emailDailyIndex)), [accountDaily, productData, businessRevenueScope, emailDailyIndex]);
  const allBusinessRows = useMemo(() => mergeBusinessRows(allLoadedAccountDaily, applyRevenueScope(allLoadedProductDaily, businessRevenueScope, emailDailyIndex)), [allLoadedAccountDaily, allLoadedProductDaily, businessRevenueScope, emailDailyIndex]);
  const business = businessStats(businessRows);
  // No merged rows at all means the window sits outside loaded data. Deltas, records
  // and projections derived from it would be arithmetic on absence, so they are hidden
  // rather than rendered as a -100% collapse or an "all-time low".
  const windowHasData = businessRows.length > 0;
  // Latest day inside the selected window that carries rows. "Top movers" and any
  // other single-day leader view should land here rather than on an empty end date.
  const movesAnchorDay = useMemo(() => {
    const withData = businessRows
      .filter((row) => Number(row.revenue_usd || 0) > 0 || Number(row.orders || 0) > 0 || Number(row.spend_usd || 0) > 0)
      .map((row) => row.date)
      .filter(Boolean)
      .sort();
    return withData.at(-1) || activeDateRange?.until || reportingToday;
  }, [businessRows, activeDateRange?.until, reportingToday]);
  const businessDeltas = useMemo(() => ({
    revenue: businessPeriodDelta(allBusinessRows, 'revenue_usd', activeDateRange),
    sales: businessPeriodDelta(allBusinessRows, 'orders', activeDateRange),
    aov: businessPeriodDelta(allBusinessRows, 'aov', activeDateRange),
    spend: businessPeriodDelta(allBusinessRows, 'spend_usd', activeDateRange),
    cac: businessPeriodDelta(allBusinessRows, 'cac', activeDateRange),
    roas: businessPeriodDelta(allBusinessRows, 'roas', activeDateRange),
  }), [allBusinessRows, activeDateRange]);
  // Same-length window immediately before the selected one, used for the
  // period-over-period drivers in Key findings.
  const previousDateRange = useMemo(() => {
    if (!activeDateRange?.since || !activeDateRange?.until) return { since: '', until: '' };
    const days = dayCount(activeDateRange);
    return { since: shiftDate(activeDateRange.since, -days), until: shiftDate(activeDateRange.until, -days) };
  }, [activeDateRange]);
  const previousProductData = useMemo(
    () => filterShopifyByDateRange(baseProductData, previousDateRange),
    [baseProductData, previousDateRange],
  );
  const insightDrivers = useMemo(() => {
    const toItems = (rows, nameKey, valueKey) => (rows || [])
      .map((row) => ({ name: row[nameKey] || 'Unknown', value: Number(row[valueKey] || 0) }));
    const currentCountries = toItems(productData.countries, 'country', 'revenue_usd');
    return {
      revenue: {
        countries: topDrivers(currentCountries, toItems(previousProductData.countries, 'country', 'revenue_usd')),
        products: topDrivers(
          toItems(productData.products, 'product', 'revenue_usd'),
          toItems(previousProductData.products, 'product', 'revenue_usd'),
        ),
      },
      orders: {
        countries: topDrivers(
          toItems(productData.countries, 'country', 'units'),
          toItems(previousProductData.countries, 'country', 'units'),
        ),
      },
      concentration: currentCountries,
    };
  }, [productData, previousProductData]);
  const keyFindings = useMemo(() => buildKeyFindings({
    windowRows: businessRows,
    historyRows: allBusinessRows,
    range: activeDateRange,
    reportingToday,
    revenueDrivers: insightDrivers.revenue,
    orderDrivers: insightDrivers.orders,
    concentrationItems: insightDrivers.concentration,
  }), [businessRows, allBusinessRows, activeDateRange, reportingToday, insightDrivers]);
  const campaignAttribution = useMemo(() => buildCampaignAttribution(data, productData), [data, productData]);
  const productRows = productData.products || [];
  const adRows = useMemo(() => enrichAdsWithShopifySales(data.ads || [], productData.order_lines || []), [data.ads, productData.order_lines]);
  const deliveryComparison = baseData.delivery_comparison || {};
  const deliveryShopifyComparison = baseProductData.delivery_comparison || {};
  const adsetPerfById = useMemo(() => new Map((data.all_adsets || []).map((row) => [row.adset_id, row])), [data]);
  const countryRoasMetaByCode = useMemo(() => new Map((countryRoasData.countries || []).map((row) => [row.country_code, row])), [countryRoasData]);

  const filterProps = {
    selected,
    onSelected: setSelected,
    adSets: enriched.map((a) => ({ id: a.adset_id, name: a.adset_name })),
    statusFilter,
    onStatusFilter: setStatusFilter,
    statuses: Object.keys(statusLabels).map((s) => ({ value: s, label: statusLabels[s] })),
    query,
    onQuery: setQuery,
    range: activeDateRange,
    preset: datePreset,
    isDateOpen: dateMenuOpen,
    onToggleDate: () => setDateMenuOpen((open) => !open),
    customRange,
    onCustomChange: setCustomRange,
    onPreset: handleDatePreset,
    onApplyCustom: applyCustomDateRange,
    bounds: loadedBounds,
    sourceLabel,
    refreshText,
  };

  const sale = saleMonitor.sale;
  const saleItems = sale?.line_items || [];
  const livePurchases = saleMonitor.purchases || [];
  // Demo data is only for disconnected Shopify. A live day with zero orders
  // should stay live (empty map), not flip back to sample orders at midnight.
  const mapIsDemo = saleMonitor.status === 'not_configured';
  const mapPurchases = mapIsDemo ? DEMO_PURCHASES : livePurchases;
  const emailCampaignData = useMemo(() => {
    if (mapIsDemo) return buildEmailCampaignFromPurchases(DEMO_PURCHASES, { countryFlag });
    return buildEmailCampaignSummary(emailPanelProductData.order_lines || [], { countryFlag, timeZone: REPORTING_TIMEZONE });
  }, [mapIsDemo, emailPanelProductData.order_lines]);
  const emailPanelRangeText = panelScopeRangeLabel(emailPanelScope, launchDateRange, activeDateRange, datePreset, mapIsDemo);
  const behaviorPanelRangeText = behaviorPanelRangeLabel(
    behaviorPanelScope,
    launchDateRange,
    activeDateRange,
    datePreset,
    baseBehaviorData,
    reportingToday,
  );
  const monitorStatusText = saleMonitor.status === 'live'
    ? (livePurchases.length ? 'Live Shopify sales monitor' : 'Live Shopify sales monitor · no orders yet today')
    : saleMonitor.status === 'checking'
      ? 'Checking Shopify sales'
      : 'Sale monitor paused';
  const syncHealthLabel = !metaDataLoaded ? 'Loading' : metaFallbackActive ? 'Fallback' : metaMonitor.status === 'offline' ? 'Offline' : 'Live';
  const shopifyHealthLabel = !shopifyDataLoaded ? 'Loading' : shopifyFallbackActive ? 'Fallback' : 'Live';
  const healthTone = (h) => (h === 'Live' ? 'good' : h === 'Offline' ? 'bad' : 'warn');

  const dayRows = adapt.toDayRows(businessRows, reportingToday);
  // Performance trend is a multi-day view with its own 3D/7D/14D/All control, so it draws
  // from the full loaded history rather than the active date filter (which can be a
  // single day under the "Today" preset and would leave nothing to connect into a line).
  // Scope to the June 3 CBO launch onward — pre-launch Shopify-only days have no Meta
  // spend and make the revenue-vs-spend line unreadably spiky. Historical insights covers
  // the earlier Shopify-only period separately.
  // The current reporting day is omitted: it is still accumulating sales/spend.
  const monthProjection = useMemo(
    () => buildMonthProjection(allBusinessRows, { today: reportingToday, elapsedShare: elapsedReportingDayShare() }),
    [allBusinessRows, reportingToday],
  );
  // Record badges follow the selected date window (its end day) so they match the
  // numbers on the cards instead of always reflecting the live reporting day.
  const kpiRecordAsOfDay = activeDateRange?.until || reportingToday;
  const kpiRecords = useMemo(() => buildKpiRecordMap(allBusinessRows, kpiRecordAsOfDay), [allBusinessRows, kpiRecordAsOfDay]);
  // Funnel conversion (IC/ATC, Purchase/IC) is always measured since the campaign
  // launch, independent of the date picker, from per-campaign daily Meta funnel actions.
  const funnelData = useMemo(
    () => buildFunnelAnalytics(
      {
        metaRows: baseData.ad_country_daily || [],
        orderLines: baseProductData.order_lines || [],
      },
      { launchDate: CAMPAIGN_LAUNCH_DATE },
    ),
    [baseData, baseProductData],
  );
  const kpiProjection = (key) => (windowHasData ? buildKpiProjectionDisplay(monthProjection, key) : null);
  const kpiRecord = (key) => (windowHasData ? buildKpiRecordDisplay(kpiRecords, key) : null);
  const trendDayRows = adapt.toDayRows(allBusinessRows).filter(
    (r) => r.date && r.date !== reportingToday && r.date >= CAMPAIGN_LAUNCH_DATE,
  );
  const historicalDaily = useMemo(
    () => buildShopifyHistoricalDaily(baseProductData),
    [baseProductData],
  );
  const campaignTree = adapt.toCampaignTree(campaignAttribution);
  const salesLeader = adapt.toSalesLeader(dailySalesHighlights(productData.order_lines || [], activeDateRange));
  const benchmarks = adapt.toBenchmarks(overall, march, marchDelta, overallDelta);
  const productLeaders = adapt.toProductLeaders(productRows);
  const adLeaders = adapt.toAdLeaders(adRows);
  // The current reporting day has only part of its delivery recorded, so including it
  // ends the reach curve in a false cliff. Same exclusion rule as the performance trend.
  const deliveryRowsExcludingToday = deliveryTrendRows.filter((row) => row.date !== reportingToday);
  const deliveryDevelopingDay = deliveryTrendRows.length > deliveryRowsExcludingToday.length
    ? reportingToday
    : '';
  const deliveryShape = adapt.toDeliveryShape(deliveryRowsExcludingToday);
  const growth = adapt.toProductDevelopment(launchProductData);
  const decisions = adapt.toAdSetDecisions(filtered, adsetPerfById, statusLabels);
  const productDemand = adapt.toProductDemand(launchProductData, launchDateRange.since);
  const countrySales = adapt.toCountrySales(countryRoasProductData.countries || [], countryRoasMetaByCode);
  // Trailing-window country aggregates (Today / 3D / 7D / 14D) for the panel's range toggle.
  // Each window re-runs the exact same filter + adapt pipeline as the "All" view
  // above, just over a shorter trailing range — so no business logic is recomputed,
  // every figure stays calculation-identical to the launch-window view.
  const countrySalesWindows = useMemo(() => {
    const anchor = countryRoasDateRange.until || loadedBounds.common_until || loadedBounds.until || currentReportingDay();
    if (!anchor) return {};
    const build = (sinceDays) => {
      const win = clampDateRange({ since: shiftDate(anchor, sinceDays), until: anchor }, loadedBounds);
      const ws = filterShopifyByDateRange(baseProductData, win);
      const wm = filterMetaDataByDateRange(baseData, win);
      const metaByCode = new Map((wm.countries || []).map((row) => [row.country_code, row]));
      return adapt.toCountrySales(ws.countries || [], metaByCode);
    };
    return { Today: build(0), '3D': build(-2), '7D': build(-6), '14D': build(-13) };
  }, [baseProductData, baseData, loadedBounds, countryRoasDateRange.until]);
  // Mobile "Top movers" — today's leader as the hero, with the current week and
  // previous week as comparison windows (paid-ads only; email orders excluded).
  const topMovers = useMemo(() => {
    // Anchor on the last day in the window that actually has data. Anchoring on the
    // window's end date made every card read "No sale captured" whenever the range
    // ran past the latest data — including the launch preset, which ends today.
    const anchor = movesAnchorDay;
    const leadersFor = (win) => {
      const ws = filterShopifyByDateRange(baseProductData, win, { excludeEmail: true });
      const wm = filterMetaDataByDateRange(baseData, win);
      const metaByCode = new Map((wm.countries || []).map((row) => [row.country_code, row]));
      const countryLeaders = adapt.toCountrySales(ws.countries || [], metaByCode);
      const adRowsForWindow = enrichAdsWithShopifySales(wm.ads || [], ws.order_lines || []);
      return {
        product: pickTopProductByUnits(ws.products || []),
        ad: pickTopAdBySales(adRowsForWindow),
        country: pickTopCountryByUnits(countryLeaders),
      };
    };
    if (!anchor) return { anchor: '', today: {}, currentWeek: {}, prevWeek: {} };
    const todayWin = clampDateRange({ since: anchor, until: anchor }, loadedBounds);
    const currentWeekWin = reportingWeekToDate(anchor, loadedBounds);
    const prevWeekWin = previousWeekToDate(anchor, loadedBounds);
    return {
      anchor,
      today: leadersFor(todayWin),
      currentWeek: leadersFor(currentWeekWin),
      prevWeek: leadersFor(prevWeekWin),
    };
  }, [baseProductData, baseData, loadedBounds, movesAnchorDay]);
  const topMoverCards = useMemo(() => ([
    {
      kind: 'product',
      label: 'Top product',
      today: topMovers.today.product,
      currentWeek: topMovers.currentWeek.product,
      prevWeek: topMovers.prevWeek.product,
    },
    {
      kind: 'ad',
      label: 'Top ad / source',
      today: topMovers.today.ad,
      currentWeek: topMovers.currentWeek.ad,
      prevWeek: topMovers.prevWeek.ad,
    },
    {
      kind: 'country',
      label: 'Top country',
      today: topMovers.today.country,
      currentWeek: topMovers.currentWeek.country,
      prevWeek: topMovers.prevWeek.country,
    },
  ]), [topMovers]);
  const topMoverFocusLabel = movesAnchorDay === reportingToday
    ? 'Today'
    : movesAnchorDay || 'Selected range';

  const todayOrderMovers = useMemo(() => {
    const lines = baseProductData?.order_lines || [];
    const reportingToday = loadedBounds.today || currentReportingDay();
    if (!reportingToday) return null;
    const isTodayView = dayCount(activeDateRange) === 1 && activeDateRange.until === reportingToday;
    if (!isTodayView) return null;

    const prevDay = shiftDate(reportingToday, -1);
    const elapsedShare = elapsedReportingDayShare();
    const opts = {
      limit: 3,
      minMovePct: 40,
      elapsedShare,
      timeZone: REPORTING_TIMEZONE,
      countryFlag,
      cleanAdLabel,
      isTipLine,
    };
    const daggers = buildOrderMoverRankings(lines, reportingToday, prevDay, { ...opts, direction: 'down' });
    const rockets = buildOrderMoverRankings(lines, reportingToday, prevDay, { ...opts, direction: 'up' });
    if (!daggers && !rockets) return null;
    return { daggers, rockets, reportingToday, prevDay, sameTimePreviousDay: elapsedShare < 1 };
  }, [baseProductData, activeDateRange, loadedBounds]);

  const histPeriod = deliveryComparison.historical || {};
  const curPeriod = deliveryComparison.current || {};
  const histShopify = deliveryShopifyComparison.historical || {};
  const curShopify = deliveryShopifyComparison.current || {};
  const usaCurve = adapt.toUsaCurve(comparisonRows(histPeriod, histShopify), comparisonRows(curPeriod, curShopify));
  const usaComparison = {
    history: adapt.toUsaPhase(comparisonStats(histPeriod, histShopify), histPeriod.label || 'Testing_USA_ABO', 'history'),
    launch: adapt.toUsaPhase(comparisonStats(curPeriod, curShopify), curPeriod.label || 'USA launch', 'launch'),
  };
  const usaOk = Boolean(deliveryComparison.ok) && usaCurve.length > 0;

  const sectionEls = {
    ordersMap: (
      <OrdersMap
        purchases={mapPurchases}
        title="Live sales monitor"
        statusLabel={mapIsDemo ? 'Showing sample orders · waiting for live Shopify orders' : (saleMonitor.error || monitorStatusText)}
        checkedLabel={saleMonitor.checkedAt ? `Checked ${saleTime(saleMonitor.checkedAt)}` : (saleMonitor.error || undefined)}
        metaSyncText={refreshText}
        soundEnabled={saleSoundEnabled}
        onEnableSound={enableSaleSound}
        syncHealth={syncHealthLabel}
        syncHealthTone={healthTone(syncHealthLabel)}
        shopifyHealth={shopifyHealthLabel}
        shopifyHealthTone={healthTone(shopifyHealthLabel)}
      />
    ),
    keyFindings: (
      <KeyFindings
        verdict={keyFindings.verdict}
        findings={keyFindings.findings}
        rangeLabel={activeDateRange.since === activeDateRange.until
          ? activeDateRange.since
          : `${activeDateRange.since} → ${activeDateRange.until}`}
      />
    ),
    kpis: (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Business performance</p>
          <div className="inline-flex self-start rounded-full border border-border bg-surface-2 p-1 text-xs">
            {[['shopify', 'Shopify'], ['shopify_email', 'Shopify + Email']].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setBusinessRevenueScope(val)}
                aria-pressed={businessRevenueScope === val}
                className={`rounded-full px-3 py-1 font-medium transition-all ${businessRevenueScope === val ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        <KpiCard label="Shopify revenue" value={money.format(business.revenue_usd)} sub={`${business.units} units sold`} delta={businessDeltas.revenue.pct} deltaLabel={businessDeltas.revenue.label} series={adapt.sparkSeries(businessRows, 'revenue_usd', allBusinessRows)} accent="brand" projection={kpiProjection('revenue_usd')} record={kpiRecord('revenue_usd')} hasData={windowHasData} hasComparison={hasComparison(businessDeltas.revenue)} {...metricDefinition('revenue_usd')} />
        <KpiCard label="Sales" value={compact(business.orders)} sub={`${business.units} units sold`} delta={businessDeltas.sales.pct} deltaLabel={businessDeltas.sales.label} series={adapt.sparkSeries(businessRows, 'orders', allBusinessRows)} accent="violet" projection={kpiProjection('orders')} record={kpiRecord('orders')} hasData={windowHasData} hasComparison={hasComparison(businessDeltas.sales)} {...metricDefinition('orders')} />
        <KpiCard label="AOV" value={business.aov ? money.format(business.aov) : 'n/a'} delta={businessDeltas.aov.pct} deltaLabel={businessDeltas.aov.label} series={adapt.sparkSeries(businessRows, 'aov', allBusinessRows)} accent="blue" projection={kpiProjection('aov')} record={kpiRecord('aov')} hasData={windowHasData} hasComparison={hasComparison(businessDeltas.aov)} {...metricDefinition('aov')} />
        <KpiCard label="Meta spend" value={money.format(business.spend_usd)} delta={businessDeltas.spend.pct} deltaLabel={businessDeltas.spend.label} series={adapt.sparkSeries(businessRows, 'spend_usd', allBusinessRows)} accent="gold" positiveWhenUp={false} projection={kpiProjection('spend_usd')} record={kpiRecord('spend_usd')} hasData={windowHasData} hasComparison={hasComparison(businessDeltas.spend)} {...metricDefinition('spend_usd')} />
        <KpiCard label="CAC" value={business.orders ? money.format(business.cac) : 'n/a'} delta={businessDeltas.cac.pct} deltaLabel={businessDeltas.cac.label} series={adapt.sparkSeries(businessRows, 'cac', allBusinessRows)} accent="gold" positiveWhenUp={false} projection={kpiProjection('cac')} record={kpiRecord('cac')} hasData={windowHasData} hasComparison={hasComparison(businessDeltas.cac)} {...metricDefinition('cac')} />
        <KpiCard label="ROAS" value={business.roas ? `${business.roas.toFixed(2)}x` : 'n/a'} delta={businessDeltas.roas.pct} deltaLabel={businessDeltas.roas.label} series={adapt.sparkSeries(businessRows, 'roas', allBusinessRows)} accent="positive" projection={kpiProjection('roas')} record={kpiRecord('roas')} hasData={windowHasData} hasComparison={hasComparison(businessDeltas.roas)} {...metricDefinition('roas')} />
        </div>
      </section>
    ),
    orderDrop: todayOrderMovers?.daggers ? (
      <OrderDropRankings
        variant="daggers"
        day={todayOrderMovers.daggers.day}
        prevDay={todayOrderMovers.daggers.prevDay}
        currentOrders={todayOrderMovers.daggers.currentOrders}
        previousOrders={todayOrderMovers.daggers.previousOrders}
        orderDeltaPct={todayOrderMovers.daggers.orderDeltaPct}
        countries={todayOrderMovers.daggers.countries}
        ads={todayOrderMovers.daggers.ads}
        sameTimePreviousDay={todayOrderMovers.sameTimePreviousDay}
      />
    ) : null,
    orderLift: todayOrderMovers?.rockets ? (
      <OrderDropRankings
        variant="rockets"
        day={todayOrderMovers.rockets.day}
        prevDay={todayOrderMovers.rockets.prevDay}
        currentOrders={todayOrderMovers.rockets.currentOrders}
        previousOrders={todayOrderMovers.rockets.previousOrders}
        orderDeltaPct={todayOrderMovers.rockets.orderDeltaPct}
        countries={todayOrderMovers.rockets.countries}
        ads={todayOrderMovers.rockets.ads}
        sameTimePreviousDay={todayOrderMovers.sameTimePreviousDay}
      />
    ) : null,
    revenue: <RevenueChart rows={trendDayRows} />,
    salesBench: (
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-3">
        <div className="lg:col-span-2"><SalesLeaders leader={salesLeader} /></div>
        <Benchmarks data={benchmarks} />
      </div>
    ),
    tree: <CampaignRoasTree data={campaignTree} />,
    leaders: <LeadershipBoard products={productLeaders} ads={adLeaders} />,
    emailCampaign: (
      <EmailCampaign
        summary={emailCampaignData.summary}
        orders={emailCampaignData.orders}
        rangeLabel={emailPanelRangeText}
        scope={emailPanelScope}
        onScopeChange={setEmailPanelScope}
        isLive={!mapIsDemo}
      />
    ),
    edits: (
      <section className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
          <div>
            <p className="font-display text-sm font-semibold">Ad set edits in the launch window</p>
            <p className="text-xs text-muted-foreground">Budget changes are the priority marker</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-gold/12 px-3 py-1.5 text-xs font-medium text-gold">
            <span className="h-2 w-2 rounded-full bg-gold" />{budgetChangeCount} budget / bid edits
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-border" />{otherChangeCount} other edits
          </span>
        </div>
      </section>
    ),
    usa: usaOk ? <UsaComparison comparison={usaComparison} curve={usaCurve} /> : null,
    delivery: (
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
        <DailyDelivery data={deliveryShape} developingDay={deliveryDevelopingDay} />
        <DevelopingGrowth data={growth.data} lines={growth.lines} />
      </div>
    ),
    decision: <AdSetDecisionTable rows={decisions} />,
    product: <ProductDemand data={productDemand} />,
    country: <CountrySalesPanel countries={countrySales} windows={countrySalesWindows} />,
    mobileTops: <TopMovers cards={topMoverCards} focusLabel={topMoverFocusLabel} />,
    behavior: (
      <BehaviorAnalytics
        behavior={behaviorData}
        scope={behaviorPanelScope}
        onScopeChange={setBehaviorPanelScope}
        rangeLabel={behaviorPanelRangeText}
      />
    ),
    data: <DataTable rows={dayRows} />,
    historicalInsights: (
      <HistoricalInsights
        daily={historicalDaily}
        developingDay={reportingToday}
        timezone={REPORTING_TIMEZONE}
      />
    ),
    funnel: <FunnelAnalytics data={funnelData} />,
  };
  const dashboardGroups = [
    // "data" (Daily breakdown) belongs under the trend chart it drills into, not on
    // Behavior — it is business performance per day, not session behavior.
    { key: 'overview', label: 'Overview', icon: LayoutDashboard, ids: ['ordersMap', 'kpis', 'keyFindings', 'orderDrop', 'orderLift', 'revenue', 'data', 'mobileTops'] },
    { key: 'funnel', label: 'Funnel', icon: Filter, ids: ['funnel'] },
    { key: 'ads', label: 'Ads', icon: GitBranch, ids: ['tree', 'emailCampaign', 'leaders', 'edits', 'decision'] },
    { key: 'launch', label: 'Launch', icon: Rocket, ids: ['usa', 'delivery'] },
    { key: 'market', label: 'Market', icon: ShoppingBag, ids: ['salesBench', 'product', 'country'] },
    { key: 'historical', label: 'Historical insights', icon: BarChart3, ids: ['historicalInsights'] },
    { key: 'behavior', label: 'Behavior', icon: Activity, ids: ['behavior'] },
  ];
  const activeGroup = dashboardGroups.find((g) => g.key === activeTab) || dashboardGroups[0];

  return (
    <div className="flex min-h-screen text-foreground">
      <Sidebar {...filterProps} />
      <main className="min-w-0 flex-1 overflow-x-clip px-5 py-7 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl space-y-7">
          <MobileFilters {...filterProps} />

          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Commerce command center</p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                Sales &amp; Ads Performance
              </h1>
              <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                Live Shopify sales, Meta spend, and launch momentum in one command view · {dateRangeLabel(activeDateRange, datePreset, loadedBounds)}
              </p>
            </div>
            <div className="flex gap-3">
              <div className="panel px-5 py-3">
                <p className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">Total revenue</p>
                <p className="font-display text-xl font-semibold tracking-tight">{money.format(business.revenue_usd)}</p>
              </div>
              <div className="panel px-5 py-3">
                <p className="text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">Blended ROAS</p>
                <p className="font-display text-xl font-semibold tracking-tight text-positive">{business.roas ? `${business.roas.toFixed(2)}x` : 'n/a'}</p>
              </div>
            </div>
          </header>

          <nav className="sticky top-0 z-30 -mx-5 border-b border-border bg-background/85 px-5 py-2.5 backdrop-blur-md sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {dashboardGroups.map((g) => {
                const Icon = g.icon;
                const on = g.key === activeGroup.key;
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setActiveTab(g.key)}
                    aria-pressed={on}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${on ? 'bg-brand text-white shadow-sm' : 'bg-surface-2 text-muted-foreground hover:bg-surface-2/80'}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {g.label}
                  </button>
                );
              })}
            </div>
          </nav>
          <div className="space-y-7">
            {activeGroup.ids.map((id) => (
              <Fragment key={id}>{sectionEls[id]}</Fragment>
            ))}
          </div>

          <footer className="pb-6 pt-2 text-center text-xs text-muted-foreground">
            ShawQ Business Monitoring · Shopify revenue and Meta spend in {REPORTING_TIMEZONE}
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
