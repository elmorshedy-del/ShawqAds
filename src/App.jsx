import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Activity, BarChart3, BellRing, CalendarDays, GitBranch, LayoutDashboard, RefreshCw, Rocket, Search, ShoppingBag, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { compact, money, pct, slug } from './lib/format.js';
import { buildCampaignAttribution } from './lib/campaignAttribution.js';
import {
  buildKpiProjectionDisplay,
  buildKpiRecordDisplay,
  buildKpiRecordMap,
  buildMonthProjection,
} from './lib/businessKpiInsights.js';
import { buildShopifyHistoricalDaily } from './lib/historicalInsights.js';
import {
  dwellBehaviorRollup,
  journeyBehaviorRollup,
  rollupBehaviorFacts,
  scoreBehaviorRows,
  sortBehaviorProducts,
} from './lib/behaviorStats.js';
import { statusLabels, statusOrder } from './features/adset-radar/constants.js';
import { familyStyle } from './features/product-demand/constants.js';
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
import { buildOrderDropRankings } from './lib/orderDropRankings.js';
import { buildEmailCampaignSummary, buildEmailCampaignFromPurchases } from './lib/emailCampaignSummary.js';
import { HistoricalInsights } from './components/dashboard/HistoricalInsights';

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

async function fetchLatestSale() {
  const res = await fetch('/api/shopify/latest-sale', { cache: 'no-store' });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(payload.error || `Shopify sale monitor ${res.status}`);
  return payload;
}

async function fetchLiveMeta() {
  const res = await fetch('/api/meta/live-spend', { cache: 'no-store' });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
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
function movingAverage(values = [], window = 3) {
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = values.slice(start, index + 1).filter((value) => Number.isFinite(Number(value)));
    return slice.length ? slice.reduce((a, b) => a + Number(b || 0), 0) / slice.length : 0;
  });
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
  const addMeta = (date) => { if (date) metaDates.add(date); };
  const addShopify = (date) => { if (date) shopifyDates.add(date); };
  addMeta(meta?.analysis_window?.since); addMeta(meta?.analysis_window?.until);
  addShopify(shopify?.period?.since); addShopify(shopify?.period?.until);
  (meta?.adsets || []).forEach((adset) => (adset.rows || []).forEach((row) => addMeta(row.date)));
  (meta?.ad_country_daily || []).forEach((row) => addMeta(row.date));
  (meta?.account_daily_metrics || []).forEach((row) => addMeta(row.date));
  (shopify?.daily || []).forEach((row) => addShopify(row.date));
  (shopify?.order_lines || []).forEach((row) => addShopify(row.date));
  const metaRange = rangeFromDateSet(metaDates);
  const shopifyRange = rangeFromDateSet(shopifyDates);
  const unionRange = rangeFromDateSet(new Set([...metaDates, ...shopifyDates]));
  const today = currentReportingDay();
  const calendarRange = rangeFromDateSet(new Set([...unionRange.dates, today]));
  const commonSince = [metaRange.since, shopifyRange.since].filter(Boolean).sort().at(-1) || unionRange.since;
  const commonUntil = [metaRange.until, shopifyRange.until].filter(Boolean).sort()[0] || unionRange.until;
  const hasCommon = Boolean(commonSince && commonUntil && commonSince <= commonUntil);
  const commonDates = unionRange.dates.filter((date) => date >= commonSince && date <= commonUntil);
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
  const hasWindowableAdRows = Boolean(meta?.ad_country_daily?.length);
  const adsets = (meta?.adsets || [])
    .map((adset) => ({ ...adset, rows: filterRowsByDateRange(adset.rows || [], range) }))
    .filter((adset) => adset.rows.length);
  const ads = adRows.length ? aggregateMetaRows(adRows, adRollupKey, (row) => ({
    campaign_id: '',
    campaign_name: '',
    adset_id: '',
    adset_name: '',
    ad_id: adRollupKey(row),
    ad_name: row.ad_name,
    product_family: row.product_family,
    product_subtype: row.product_subtype,
  })) : (hasWindowableAdRows ? [] : (meta?.ads || []));
  const allAdsets = adRows.length ? aggregateMetaRows(adRows, (row) => row.adset_id || localKey([row.campaign_id, row.adset_name]), (row) => ({
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
  const fxRates = meta?.fx_rates?.rates ? { ...meta.fx_rates, rates: filterRowsByDateRange(meta.fx_rates.rates, range) } : meta?.fx_rates;
  return {
    ...meta,
    analysis_window: { ...(meta?.analysis_window || {}), since: range.since, until: range.until },
    adsets,
    ads,
    all_adsets: allAdsets,
    countries,
    account_daily_metrics: accountDaily,
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
function presetDateRange(preset, bounds) {
  const end = bounds?.today || currentReportingDay();
  if (!end) return { since: '', until: '' };
  if (preset === 'today') return clampDateRange({ since: end, until: end }, bounds);
  if (preset === 'yesterday') {
    const day = shiftDate(end, -1);
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
  if (preset === 'launch') return `Since launch · ${range.since} – ${range.until}`;
  if (range.since === range.until) {
    if (preset === 'today') return 'Today';
    if (preset === 'yesterday') return 'Yesterday';
    return range.since;
  }
  return `${range.since} – ${range.until}`;
}
function dateRangeLabel(range, preset) {
  if (!range?.since || !range?.until) return 'Choose dates';
  const prefix = datePresets.find((p) => p.value === preset)?.label || 'Custom';
  return `${prefix}: ${range.since} - ${range.until}`;
}
function presetSubLabel(preset, bounds) {
  const range = presetDateRange(preset, bounds);
  if (!range.since) return 'No loaded dates yet';
  if (preset === 'custom') return 'Choose exact start and end';
  return range.since === range.until ? range.since : `${range.since} - ${range.until}`;
}
function wrapChartLabel(value, maxLineLength = 18) {
  const text = String(value || '').trim();
  if (!text) return '';
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (word.length > maxLineLength) {
      if (line) {
        lines.push(line);
        line = '';
      }
      for (let i = 0; i < word.length; i += maxLineLength) lines.push(word.slice(i, i + maxLineLength));
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLineLength) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}
function countryFlag(code) {
  const cc = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '•';
  return [...cc].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join('');
}
function saleMoney(sale) {
  const currency = sale?.currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(sale?.total_price || 0));
  } catch {
    return money.format(Number(sale?.total_price || 0));
  }
}
function saleTime(value) {
  if (!value) return 'No timestamp';
  return new Date(value).toLocaleString([], { timeZone: REPORTING_TIMEZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

function businessMetricConfig(active) {
  return {
    revenue: { key: 'revenue_usd', label: 'Shopify revenue', formatter: (v) => money.format(v), color: '#e02e92' },
    sales: { key: 'orders', label: 'Shopify orders', formatter: (v) => compact(v), color: '#7f1d57' },
    aov: { key: 'aov', label: 'AOV', formatter: (v) => (v ? money.format(v) : 'n/a'), color: '#be2b78' },
    spend: { key: 'spend_usd', label: 'Meta spend', formatter: (v) => money.format(v), color: '#bf6b1f' },
    cac: { key: 'cac', label: 'CAC', formatter: (v) => (v ? money.format(v) : 'n/a'), color: '#9f1d63' },
    roas: { key: 'roas', label: 'ROAS', formatter: (v) => (v ? `${Number(v).toFixed(2)}x` : 'n/a'), color: '#0b766c' },
  }[active] || { key: 'revenue_usd', label: 'Shopify revenue', formatter: (v) => money.format(v), color: '#e02e92' };
}

const BUSINESS_WINDOW_OPTIONS = [['3', '3D'], ['7', 'Week'], ['14', '2W'], ['30', 'Month'], ['all', 'All']];

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
  const currentRows = filterRowsByDateRange(sorted, activeRange);
  if (!currentRows.length) return emptyPeriodDelta(key, 'no current data');
  const days = dayCount(activeRange);
  const previousRange = { since: shiftDate(activeRange.since, -days), until: shiftDate(activeRange.until, -days) };
  const previousRows = filterRowsByDateRange(sorted, previousRange);
  if (previousRows.length) {
    const isDevelopingDay = days === 1 && activeRange.since === activeRange.until && activeRange.until === currentReportingDay();
    const comparisonRows = isDevelopingDay ? scaleBusinessRows(previousRows, elapsedReportingDayShare()) : previousRows;
    return periodDeltaFromRows(currentRows, comparisonRows, key, isDevelopingDay ? 'vs same time previous day' : days === 1 ? 'vs previous day' : 'vs previous period');
  }
  return periodDeltaFromRows(currentRows, [], key, 'no prior period');
}

function toneForDelta(value, higherIsGood = true) {
  const n = Number(value || 0);
  if (!n) return 'neutral';
  return higherIsGood ? (n > 0 ? 'good' : 'bad') : (n < 0 ? 'good' : 'bad');
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

function groupedChangePointsForRows(rows, changes) {
  if (!changes?.length) return [];
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const grouped = new Map();
  changes.forEach((change) => {
    if (!byDate.has(change.date)) return;
    const list = grouped.get(change.date) || [];
    list.push(change);
    grouped.set(change.date, list);
  });
  return [...grouped.entries()].map(([date, list]) => {
    const r = byDate.get(date);
    const budgetCount = list.filter((c) => c.is_budget_change).length;
    const ordered = [...list].sort((a, b) => Number(Boolean(b.is_budget_change)) - Number(Boolean(a.is_budget_change)));
    const examples = ordered.slice(0, 4).map((c) => `${c.is_budget_change ? 'BUDGET: ' : ''}${c.object_name || 'Ad set'}: ${c.label || c.event_type || 'changed'}`);
    return {
      coord: [date, r.frequency],
      value: budgetCount ? `${budgetCount} budget change${budgetCount === 1 ? '' : 's'} · ${list.length} total edit${list.length === 1 ? '' : 's'}` : `${list.length} ad set change${list.length === 1 ? '' : 's'}`,
      changes: list,
      examples,
      budgetCount,
      itemStyle: { color: budgetCount ? '#a40013' : '#c81e2c', borderColor: '#fff', borderWidth: 2 },
      symbolSize: budgetCount ? Math.min(24, 14 + Math.sqrt(budgetCount) * 4) : Math.min(16, 9 + Math.sqrt(list.length) * 2),
    };
  });
}

function sparkOption(rows, metric, color) {
  return { animation: false, grid: { left: 0, right: 0, top: 4, bottom: 0 }, xAxis: { type: 'category', show: false, data: rows.map((r) => r.date) }, yAxis: { type: 'value', show: false, scale: true }, series: [{ type: 'line', data: rows.map((r) => Number(r[metric] || 0)), smooth: true, symbol: 'none', lineStyle: { color, width: 2 }, areaStyle: { color: `${color}22` } }] };
}

function trendOption(rows, march, changes, shopifyDaily = []) {
  const latestShopifyDate = [...(shopifyDaily || []).map((row) => row.date).filter(Boolean)].sort().at(-1) || '';
  const chartRows = attachShopifySales(rows, shopifyDaily, { completedUntil: latestShopifyDate });
  const dates = chartRows.map((r) => r.date);
  const reachPerDollarValues = chartRows.map((r) => reachPerDollar(r));
  const maxReachPerDollar = Math.max(...reachPerDollarValues, reachPerDollar(march), 1);
  const maxSales = Math.max(...chartRows.map((r) => Number(r.shopify_sales || 0)), 1);
  const showUsaBaseline = Boolean(march?.applies);
  const marchReachPerDollar = reachPerDollar(march);
  return {
    animation: false,
    color: ['#067c73', '#e09113', '#d63f8c', '#1d64d8', '#c81e2c'],
    tooltip: { trigger: 'axis', backgroundColor: '#111827', borderColor: '#111827', textStyle: { color: '#fff' }, formatter: (params) => {
      const i = params[0].dataIndex;
      const r = chartRows[i];
      const editsForDay = (changes || []).filter((c) => c.date === r.date);
      const orderedEdits = [...editsForDay].sort((a, b) => Number(Boolean(b.is_budget_change)) - Number(Boolean(a.is_budget_change)));
      const budgetCount = orderedEdits.filter((c) => c.is_budget_change).length;
      const edits = orderedEdits.length ? `${budgetCount ? `${budgetCount} BUDGET change${budgetCount === 1 ? '' : 's'} · ` : ''}${orderedEdits.length} total edit${orderedEdits.length === 1 ? '' : 's'}<br/>${orderedEdits.slice(0, 4).map((c) => `${c.is_budget_change ? 'BUDGET: ' : ''}${c.object_name || 'Ad set'}: ${c.label || c.event_type || 'changed'}`).join('<br/>')}` : '';
      return `<b>${r.date}</b><br/>Frequency: ${Number(r.frequency || 0).toFixed(2)}<br/>CPM: ${money.format(r.cpm_usd ?? r.cpm ?? 0)}<br/>Shopify sales: ${compact(r.shopify_sales || 0)}<br/>Unique reach / $: ${reachPerDollar(r).toFixed(1)}<br/>Unique reach: ${compact(r.reach || 0)}<br/>Spend: ${money.format(r.spend_usd ?? r.spend ?? 0)}${edits ? `<br/><span style="color:#ffb4b4">● ${edits}</span>` : ''}`;
    } },
    legend: { top: 0, right: 18, itemGap: 22, textStyle: { color: '#394150', fontWeight: 600 } },
    grid: { left: 48, right: 148, top: 48, bottom: 58 },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 18, borderColor: '#d8d4ca', fillerColor: '#0a766630' }],
    xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: '#d8d4ca' } }, axisLabel: { color: '#697386' } },
    yAxis: [
      { type: 'value', name: 'Frequency', min: 0, axisLabel: { color: '#067c73' }, splitLine: { lineStyle: { color: '#ece7db', type: 'dashed' } } },
      { type: 'value', name: 'CPM', axisLabel: { color: '#e09113', formatter: '${value}' }, splitLine: { show: false } },
      { type: 'value', name: 'Sales', min: 0, max: Math.max(3, Math.ceil(maxSales * 1.3)), offset: 48, axisLabel: { color: '#d63f8c' }, splitLine: { show: false } },
      { type: 'value', name: 'Reach / $', min: 0, max: Math.ceil(maxReachPerDollar * 1.2), offset: 96, axisLabel: { color: '#1d64d8' }, splitLine: { show: false } },
    ],
    series: [
      { name: 'Frequency', type: 'line', smooth: true, symbolSize: 6, data: chartRows.map((r) => Number(r.frequency || 0)), markLine: showUsaBaseline ? { silent: true, symbol: 'none', data: [{ yAxis: march.frequency, name: 'March freq' }], lineStyle: { color: '#067c73', type: 'dashed', opacity: 0.55 } } : undefined, markPoint: { data: groupedChangePointsForRows(chartRows, changes), label: { show: false }, tooltip: { formatter: (p) => `<b>${p.data.value}</b><br/>${(p.data.examples || []).join('<br/>')}` } } },
      { name: 'CPM', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 6, data: chartRows.map((r) => Number(r.cpm_usd ?? r.cpm ?? 0)), markLine: showUsaBaseline ? { silent: true, symbol: 'none', data: [{ yAxis: march.cpm, name: 'March CPM' }], lineStyle: { color: '#e09113', type: 'dashed', opacity: 0.55 } } : undefined },
      { name: 'Shopify sales', type: 'line', yAxisIndex: 2, smooth: true, symbolSize: 7, data: chartRows.map((r) => Number(r.shopify_sales || 0)), lineStyle: { width: 3 }, areaStyle: { opacity: 0.06 } },
      { name: 'Unique reach / $', type: 'line', yAxisIndex: 3, smooth: true, symbolSize: 5, data: reachPerDollarValues, lineStyle: { width: 2 }, areaStyle: { opacity: 0.08 }, markLine: showUsaBaseline && marchReachPerDollar ? { silent: true, symbol: 'none', data: [{ yAxis: marchReachPerDollar, name: 'March reach/$' }], lineStyle: { color: '#1d64d8', type: 'dashed', opacity: 0.55 } } : undefined },
    ],
  };
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

function deliveryComparisonOption(comparison = {}, shopifyComparison = {}) {
  const historical = comparison.historical || {};
  const current = comparison.current || {};
  const periods = [
    { key: 'historical', label: historical.label || 'Historical USA_ABO', legend: 'Old', lineType: 'dashed', rows: comparisonRows(historical, shopifyComparison.historical || {}) },
    { key: 'current', label: current.label || 'June USA launch', legend: 'June', lineType: 'solid', rows: comparisonRows(current, shopifyComparison.current || {}) },
  ];
  const maxDays = Math.max(...periods.map((period) => period.rows.length), 1);
  const dayLabels = Array.from({ length: maxDays }, (_, i) => `Day ${i + 1}`);
  const allRows = periods.flatMap((period) => period.rows);
  const maxReachPerDollar = Math.max(...allRows.map((r) => reachPerDollar(r)), 1);
  const maxSales = Math.max(...allRows.map((r) => Number(r.shopify_sales || 0)), 1);
  const metricValue = (row, metric) => {
    if (metric === 'frequency') return Number(row.frequency || 0);
    if (metric === 'cpm') return Number(row.cpm_usd ?? row.cpm ?? 0);
    if (metric === 'sales') return Number(row.shopify_sales || 0);
    if (metric === 'reach_per_dollar') return reachPerDollar(row);
    return 0;
  };
  const makeSeries = (period, metric, label, yAxisIndex = 0) => {
    const rawValues = period.rows.map((row) => metricValue(row, metric));
    const smoothedValues = period.key === 'historical' && metric === 'sales' ? movingAverage(rawValues, 3) : rawValues;
    const metricLabel = period.key === 'historical' && metric === 'sales' ? 'Shopify sales (3d avg)' : label;
    const legendLabel = metric === 'sales'
      ? (period.key === 'historical' ? 'Sales 3d' : 'Sales')
      : metric === 'reach_per_dollar'
        ? 'Reach/$'
        : label;
    return {
      name: `${period.legend} ${legendLabel}`,
      type: 'line',
      smooth: true,
      yAxisIndex,
      symbolSize: metric === 'sales' ? 7 : 5,
      data: period.rows.map((row, index) => ({ value: smoothedValues[index], actual: rawValues[index], raw: row, day: index + 1, period: period.label, metricLabel, metric, smoothed: smoothedValues[index] !== rawValues[index] })),
      lineStyle: { width: metric === 'sales' ? 3.2 : 2.2, type: period.lineType, opacity: period.key === 'historical' ? 0.74 : 1 },
      itemStyle: { opacity: period.key === 'historical' ? 0.74 : 1 },
      emphasis: { focus: 'series' },
    };
  };
  return {
    animation: false,
    color: periods.flatMap(() => ['#0b766c', '#c98834', '#d63f8c', '#2f65d9']),
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#211018',
      borderColor: '#211018',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        const groups = new Map();
        params.filter((p) => p.data?.raw).forEach((p) => {
          const key = p.data.period;
          const row = p.data.raw;
          if (!groups.has(key)) groups.set(key, { row, lines: [] });
          const metric = p.data.metric;
          let value = metric === 'cpm' ? money.format(p.value) : metric === 'reach_per_dollar' ? Number(p.value || 0).toFixed(1) : metric === 'frequency' ? Number(p.value || 0).toFixed(2) : Number(p.value || 0).toFixed(p.data.smoothed ? 1 : 0);
          if (metric === 'sales' && p.data.smoothed) value = `${value} (actual ${compact(p.data.actual || 0)})`;
          groups.get(key).lines.push(`${p.marker}${p.data.metricLabel}: ${value}`);
        });
        return [...groups.entries()].map(([label, group]) => `<b>${label} · ${group.row.date}</b><br/>${group.lines.join('<br/>')}<br/>Spend: ${money.format(group.row.spend_usd || 0)}<br/>Unique reach: ${compact(group.row.reach || 0)}<br/>Shopify revenue: ${money.format(group.row.shopify_revenue_usd || 0)}<br/>Sales source: ${group.row.shopify_sales_source || 'Shopify orders'}`).join('<br/><br/>');
      },
    },
    legend: { top: 0, left: 0, right: 0, type: 'plain', itemGap: 14, textStyle: { color: '#5f4a56', fontWeight: 850, fontSize: 11 }, pageIconColor: '#d63f8c' },
    grid: { left: 48, right: 148, top: 64, bottom: 42 },
    xAxis: { type: 'category', data: dayLabels, axisLine: { lineStyle: { color: '#efd4e3' } }, axisLabel: { color: '#7b6672', fontWeight: 800 } },
    yAxis: [
      { type: 'value', name: 'Frequency', min: 0, axisLabel: { color: '#0b766c' }, splitLine: { lineStyle: { color: '#f4e4ee', type: 'dashed' } } },
      { type: 'value', name: 'CPM', axisLabel: { color: '#c98834', formatter: '${value}' }, splitLine: { show: false } },
      { type: 'value', name: 'Sales', min: 0, max: Math.max(3, Math.ceil(maxSales * 1.35)), offset: 52, axisLabel: { color: '#d63f8c' }, splitLine: { show: false } },
      { type: 'value', name: 'Reach / $', min: 0, max: Math.ceil(maxReachPerDollar * 1.2), offset: 104, axisLabel: { color: '#2f65d9' }, splitLine: { show: false } },
    ],
    series: periods.flatMap((period) => [
      makeSeries(period, 'frequency', 'Frequency'),
      makeSeries(period, 'cpm', 'CPM', 1),
      makeSeries(period, 'sales', 'Shopify sales', 2),
      makeSeries(period, 'reach_per_dollar', 'Unique reach / $', 3),
    ]),
  };
}

function DeliveryComparisonPanel({ comparison, shopifyComparison }) {
  const ok = Boolean(comparison?.ok);
  const historical = comparison?.historical || {};
  const current = comparison?.current || {};
  const historicalShopify = shopifyComparison?.historical || {};
  const currentShopify = shopifyComparison?.current || {};
  const historicalStats = comparisonStats(historical, historicalShopify);
  const currentStats = comparisonStats(current, currentShopify);
  const shopifyOk = Boolean(shopifyComparison?.ok);
  const usesCountryFallback = [...comparisonRows(historical, historicalShopify), ...comparisonRows(current, currentShopify)]
    .some((row) => row.shopify_sales_source === 'US country orders fallback');
  return <section className="comparison-panel chart-panel">
    <div className="panel-title comparison-title">
      <div>
        <h2>USA_ABO history vs June USA launch</h2>
        <p>Dashed lines show Testing_USA_ABO from February until it ended. Solid lines show the USA launch from June 06 onward. Sales are Shopify-derived orders; delivery is Meta reach, frequency, CPM, and spend.</p>
      </div>
      <span>{comparison?.country_code || 'US'} comparison</span>
    </div>
    {ok ? <>
      <div className="comparison-summary">
        {[{ label: historical.label || 'Testing_USA_ABO', period: historical.period, stats: historicalStats, type: 'historical' }, { label: current.label || 'USA_CBO launch', period: current.period, stats: currentStats, type: 'current' }].map((item) => <article key={item.type} className={item.type}>
          <b>{item.label}</b>
          <small>{item.stats.since || item.period?.since || 'n/a'} - {item.stats.until || item.period?.until || 'n/a'} · {item.stats.days || 0} completed days</small>
          <div>
            <span><strong>{compact(item.stats.sales)}</strong><em>Shopify sales</em></span>
            <span><strong>{money.format(item.stats.spend)}</strong><em>spend</em></span>
            <span><strong>{item.stats.avgFrequency.toFixed(2)}</strong><em>avg freq</em></span>
            <span><strong>{money.format(item.stats.avgCpm)}</strong><em>avg CPM</em></span>
            <span><strong>{item.stats.avgReachPerDollar.toFixed(1)}</strong><em>reach / $</em></span>
          </div>
        </article>)}
      </div>
      {usesCountryFallback ? <div className="unresolved-note"><b>Shopify sales fallback is active.</b><span>Where campaign UTM is missing, the comparison uses completed US Shopify country orders for the US launch period instead of Meta purchases.</span></div> : null}
      {!shopifyOk ? <div className="unresolved-note warn-note"><b>Shopify campaign sales were not available for this comparison.</b><span>The chart still shows Meta delivery, but Shopify sales will stay at zero until Shopify comparison rows are generated.</span></div> : null}
      <ReactECharts option={deliveryComparisonOption(comparison, shopifyComparison)} style={{ height: 430 }} />
    </> : <div className="behavior-empty compact">
      <b>USA comparison is not available yet</b>
      <span>{comparison?.error || 'The Meta comparison fetch did not return rows for the historical/current campaign pair.'}</span>
    </div>}
  </section>;
}

function productGrowthOption(shopify) {
  const rows = shopify.cumulative || [];
  const families = (shopify.families || []).map((f) => f.family).filter((f) => rows.some((r) => Number(r[f] || 0) > 0));
  return {
    color: families.map((f) => familyStyle[f]?.color || familyStyle.Other.color),
    tooltip: { trigger: 'axis', backgroundColor: '#111827', borderColor: '#111827', textStyle: { color: '#fff' } },
    legend: { top: 0, type: 'scroll', textStyle: { color: '#394150', fontWeight: 700 } },
    grid: { left: 42, right: 24, top: 54, bottom: 36 },
    xAxis: { type: 'category', data: rows.map((r) => r.date), axisLabel: { color: '#697386' }, axisLine: { lineStyle: { color: '#d8d4ca' } } },
    yAxis: { type: 'value', name: 'Cumulative units', axisLabel: { color: '#697386' }, splitLine: { lineStyle: { color: '#ece7db', type: 'dashed' } } },
    series: families.map((family) => {
      const style = familyStyle[family] || familyStyle.Other;
      return { name: family, type: 'line', smooth: true, data: rows.map((r) => Number(r[family] || 0)), symbol: style.symbol, symbolSize: 7, lineStyle: { width: family === 'Skirts' ? 4 : 3, type: style.dash, color: style.color }, itemStyle: { color: style.color }, emphasis: { focus: 'series' } };
    }),
  };
}

function countrySalesRoasOption(shopifyCountries = [], metaCountries = []) {
  const metaByCode = new Map((metaCountries || []).map((country) => [country.country_code, country]));
  const rows = (shopifyCountries || []).slice(0, 14).map((country) => ({
    ...country,
    meta: metaByCode.get(country.country_code) || {},
  })).map((country) => ({ ...country, shopify_roas: shopifyCountryRoas(country, country.meta) }));
  return {
    color: ['#e02e92', '#0b766c'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#22121a',
      borderColor: '#22121a',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        const row = rows[params[0].dataIndex];
        return `<b>${countryFlag(row.country_code)} ${row.country}</b><br/>Shopify units: ${row.units || 0}<br/>Shopify revenue: ${money.format(row.revenue_usd || 0)}<br/>Meta spend: ${money.format(row.meta.spend_usd || 0)}<br/>Shopify ROAS: ${Number(row.shopify_roas || 0).toFixed(2)}x`;
      },
    },
    grid: { left: 42, right: 52, top: 26, bottom: 42 },
    xAxis: { type: 'category', data: rows.map((row) => `${countryFlag(row.country_code)} ${row.country_code}`), axisLabel: { color: '#6d5a66', fontWeight: 800 }, axisLine: { lineStyle: { color: '#f0dce8' } } },
    yAxis: [
      { type: 'value', name: 'Units', axisLabel: { color: '#6d5a66' }, splitLine: { lineStyle: { color: '#f5e4ee', type: 'dashed' } } },
      { type: 'value', name: 'ROAS', axisLabel: { color: '#0b766c', formatter: '{value}x' }, splitLine: { show: false } },
    ],
    series: [
      { name: 'Shopify units', type: 'bar', data: rows.map((row) => Number(row.units || 0)), barMaxWidth: 20, itemStyle: { borderRadius: [8, 8, 0, 0] } },
      { name: 'Shopify ROAS', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 7, data: rows.map((row) => Number(row.shopify_roas || 0)), lineStyle: { width: 3 }, label: { show: true, color: '#0b766c', fontWeight: 900, formatter: (p) => `${Number(p.value || 0).toFixed(1)}x` } },
    ],
  };
}

function shopifyCountryRoas(country, metaCountry) {
  const spend = Number(metaCountry?.spend_usd || 0);
  return spend ? Number(country?.revenue_usd || 0) / spend : 0;
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

function businessSeriesData(rows, metric) {
  return (rows || []).map((row) => (row ? Number(row[metric.key] || 0) : null));
}

function businessAxisLabel(value, active) {
  const n = Number(value || 0);
  if (active === 'roas') return `${Number(n.toFixed(1))}x`;
  if (active === 'sales') return compact(n);
  if (['cac', 'aov', 'spend', 'revenue'].includes(active)) {
    if (Math.abs(n) >= 1000) return `$${Number((n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1))}k`;
    return `$${Math.round(n)}`;
  }
  return compact(n);
}

function businessTrendOption(rows, active, reportingDay = currentReportingDay()) {
  const metric = businessMetricConfig(active);
  const trendRows = businessTrendPresentationRows(rows, reportingDay);
  const chartRows = trendRows.rows;
  const xLabelStep = Math.max(1, Math.ceil(chartRows.length / 6));
  return {
    color: [metric.color],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#22121a',
      borderColor: '#22121a',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        const r = chartRows[params?.[0]?.dataIndex] || {};
        const developing = r.is_developing ? '<br/><span style="color:#ffd27a">Developing today</span>' : '';
        return `<b>${r.date || ''}</b>${developing}<br/>${metric.label}: ${metric.formatter(Number(r[metric.key] || 0))}<br/>Revenue: ${money.format(r.revenue_usd)}<br/>Spend: ${money.format(r.spend_usd)}<br/>Items sold: ${r.units || 0}<br/>Orders: ${r.orders || 0}<br/>AOV: ${r.orders ? money.format(r.aov) : 'n/a'}<br/>CAC: ${r.orders ? money.format(r.cac) : 'n/a'}<br/>ROAS: ${r.roas ? r.roas.toFixed(2) : 'n/a'}x`;
      },
    },
    grid: { left: 62, right: 30, top: 22, bottom: 46 },
    xAxis: {
      type: 'category',
      data: chartRows.map((r) => r.date),
      axisTick: { show: false },
      axisLabel: {
        color: '#697386',
        hideOverlap: true,
        interval: (index) => index === chartRows.length - 1 || index % xLabelStep === 0,
        margin: 12,
        formatter: (value) => String(value || '').slice(5),
      },
      axisLine: { lineStyle: { color: '#d8d4ca' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      splitNumber: 4,
      axisTick: { show: false },
      axisLabel: {
        color: '#697386',
        margin: 12,
        formatter: (value) => businessAxisLabel(value, active),
      },
      splitLine: { lineStyle: { color: '#f0dce8', type: 'dashed' } },
    },
    series: [
      { name: metric.label, type: 'line', smooth: true, symbolSize: 7, connectNulls: false, data: businessSeriesData(trendRows.solidRows, metric), lineStyle: { width: 4 }, areaStyle: { opacity: 0.12 } },
      trendRows.hasDeveloping ? { name: 'Developing today', type: 'line', smooth: true, symbolSize: 9, connectNulls: false, data: businessSeriesData(trendRows.developingRows, metric), lineStyle: { width: 3, type: 'dashed', opacity: 0.95 }, itemStyle: { color: metric.color, borderColor: '#fff', borderWidth: 2 }, z: 3 } : null,
    ].filter(Boolean),
  };
}

function BusinessMetricPanel({ rows, active, windowKey, setWindowKey }) {
  const metric = businessMetricConfig(active);
  const reportingDay = currentReportingDay();
  const shown = markDevelopingBusinessRows(businessWindowRows(rows, windowKey), reportingDay);
  return <section className="metric-detail unfold-panel">
    <div className="metric-detail-copy">
      <b>{metric.label} trend</b>
      <div className="window-tabs">{BUSINESS_WINDOW_OPTIONS.map(([key, label]) => <button type="button" key={key} className={windowKey === key ? 'active' : ''} onClick={() => setWindowKey(key)}>{label}</button>)}</div>
    </div>
    <div className="metric-detail-chart"><ReactECharts option={businessTrendOption(shown, active, reportingDay)} style={{ height: 260 }} /></div>
    <div className="table-wrap compact-table metric-detail-table"><table><thead><tr><th>Date</th><th>Revenue</th><th>Meta spend</th><th>Items sold</th><th>Orders</th><th>AOV</th><th>CAC</th><th>ROAS</th></tr></thead><tbody>{shown.map((r) => <tr key={r.date} className={`focus-${active} ${r.is_developing ? 'developing-row' : ''}`}><td><b>{r.date}</b>{r.is_developing ? <> <span className="pill warming developing-chip" title={`Current ${REPORTING_TIMEZONE} reporting day is still accumulating`}>Developing today</span></> : null}</td><td>{money.format(r.revenue_usd || 0)}</td><td>{money.format(r.spend_usd || 0)}</td><td>{r.units || 0}</td><td>{r.orders || 0}</td><td>{r.orders ? money.format(r.aov) : 'n/a'}</td><td>{r.orders ? money.format(r.cac) : 'n/a'}</td><td>{r.roas ? `${r.roas.toFixed(2)}x` : 'n/a'}</td></tr>)}</tbody></table></div>
  </section>;
}

function productLeadershipOption(products) {
  const rows = [...(products || []).slice(0, 14)].reverse();
  return {
    color: ['#d63f8c'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#111827',
      borderColor: '#111827',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        const r = rows[params[0].dataIndex];
        return `<b>${r.product}</b><br/>Family: ${r.family || 'Unknown'}<br/>Units sold: ${r.units || 0}<br/>Revenue: ${money.format(r.revenue_usd || 0)}`;
      },
    },
    grid: { left: 240, right: 32, top: 20, bottom: 24 },
    xAxis: { type: 'value', name: 'Units sold', axisLabel: { color: '#697386' }, splitLine: { lineStyle: { color: '#ece7db', type: 'dashed' } } },
    yAxis: { type: 'category', data: rows.map((r) => r.product || 'Unknown product'), axisLabel: { color: '#344054', fontWeight: 700, fontSize: 10, lineHeight: 13, width: 220, overflow: 'break', formatter: (value) => wrapChartLabel(value, 24) } },
    series: [{ name: 'Sales units', type: 'bar', data: rows.map((r) => Number(r.units || 0)), barMaxWidth: 16, itemStyle: { borderRadius: [0, 8, 8, 0] }, label: { show: true, position: 'right', formatter: '{c}' } }],
  };
}

function adLeadershipOption(ads) {
  const rows = (ads || []).slice(0, 12);
  return {
    color: ['#0b766c', '#d63f8c', '#5146d9', '#1d64d8', '#c68a00'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#111827',
      borderColor: '#111827',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        const r = rows[params[0].dataIndex];
        return `<b>${r.ad_name}</b><br/>Product: ${r.product_family || 'unknown_product'}<br/>Click-through CTR: ${Number(r.ctr || 0).toFixed(2)}%<br/>Add to cart: ${r.add_to_cart || 0}<br/>Initiated checkout: ${r.checkout_initiated || 0}<br/>Sales / purchases: ${r.purchases || 0}<br/>ROAS: ${Number(r.roas || 0).toFixed(2)}x<br/>Spend: ${money.format(r.spend_usd || 0)}<br/>Purchase value: ${money.format(r.purchase_value_usd || 0)}`;
      },
    },
    legend: { top: 0, type: 'scroll', textStyle: { color: '#394150', fontWeight: 800 } },
    grid: { left: 44, right: 56, top: 58, bottom: 142 },
    xAxis: { type: 'category', data: rows.map((r) => r.ad_name || 'Unknown ad'), axisLabel: { color: '#697386', rotate: 34, interval: 0, lineHeight: 12, width: 96, overflow: 'break', formatter: (value) => wrapChartLabel(value, 13) }, axisLine: { lineStyle: { color: '#d8d4ca' } } },
    yAxis: [
      { type: 'value', name: 'Funnel counts', axisLabel: { color: '#697386' }, splitLine: { lineStyle: { color: '#ece7db', type: 'dashed' } } },
      { type: 'value', name: 'CTR / ROAS', axisLabel: { color: '#1d64d8' }, splitLine: { show: false } },
    ],
    series: [
      { name: 'Sales', type: 'bar', data: rows.map((r) => Number(r.purchases || 0)), barMaxWidth: 14, itemStyle: { borderRadius: [5, 5, 0, 0] } },
      { name: 'Add to cart', type: 'bar', data: rows.map((r) => Number(r.add_to_cart || 0)), barMaxWidth: 14, itemStyle: { borderRadius: [5, 5, 0, 0] } },
      { name: 'IC', type: 'bar', data: rows.map((r) => Number(r.checkout_initiated || 0)), barMaxWidth: 14, itemStyle: { borderRadius: [5, 5, 0, 0] } },
      { name: 'Click-through CTR', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 6, data: rows.map((r) => Number(r.ctr || 0)) },
      { name: 'ROAS', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 6, data: rows.map((r) => Number(r.roas || 0)) },
    ],
  };
}

function Card({ title, value, sub, deltaValue, tone, rows, metric, color }) {
  const hasSparkData = (rows || []).some((row) => Number(row?.[metric] || 0) > 0);
  return <section className="metric-card"><div className="metric-copy"><span>{title}</span><strong>{value}</strong><small>{sub}</small><em className={tone}>{deltaValue}</em></div>{hasSparkData ? <div className="spark"><ReactECharts option={sparkOption(rows, metric, color)} style={{ height: 72 }} /></div> : <div className="spark spark-empty" aria-hidden="true" />}</section>;
}

function TrendBadge({ delta, tone }) {
  if (!delta) return null;
  const value = Number(delta.pct || 0);
  const up = value >= 0;
  const marker = value === 0 ? '→' : up ? '▲' : '▼';
  return <em className={`trend-badge ${tone || (up ? 'good' : 'bad')}`}><i>{marker}</i>{Math.abs(value).toFixed(1)}% <small>{delta.label}</small></em>;
}

function FinanceCard({ title, value, sub, tone = 'neutral', active, onClick, delta, deltaTone, sparkRows = [], sparkMetric, sparkColor = '#d63f8c' }) {
  const chartRows = (sparkRows || []).slice(-12);
  const hasCurrentValue = Number(delta?.current || 0) > 0;
  return <button type="button" className={`finance-card ${tone} ${active ? 'active' : ''}`} onClick={onClick}>
    <div className="finance-card-head">
      <span>{title}</span>
      <TrendBadge delta={delta} tone={deltaTone} />
    </div>
    <strong>{value}</strong>
    <small>{sub}</small>
    {sparkMetric && chartRows.length && hasCurrentValue ? <div className="finance-spark" aria-hidden="true"><ReactECharts option={sparkOption(chartRows, sparkMetric, sparkColor)} style={{ height: 48 }} /></div> : <div className="finance-spark finance-spark-empty" aria-hidden="true" />}
  </button>;
}

function DataFallbackNotice({ metaFallback, shopifyFallback }) {
  if (!metaFallback && !shopifyFallback) return null;
  const sources = [metaFallback ? 'Meta delivery data' : null, shopifyFallback ? 'Shopify commerce data' : null].filter(Boolean).join(' and ');
  return <div className="data-fallback-notice"><b>Sample fallback active</b><span>{sources} did not load from the live export/API, so commerce totals should not be treated as final until the source reconnects.</span></div>;
}

function SaleMonitor({ monitor, soundEnabled, onEnableSound }) {
  const sale = monitor.sale;
  const statusText = monitor.status === 'live' ? 'Live Shopify sales monitor' : monitor.status === 'checking' ? 'Checking Shopify sales' : 'Sale monitor paused';
  const items = sale?.line_items || [];
  const detail = sale ? `${sale.name} · ${saleMoney(sale)} · ${sale.item_count || 0} item${Number(sale.item_count || 0) === 1 ? '' : 's'}` : 'Waiting for the next paid order';
  const orderTime = sale?.created_at ? saleTime(sale.created_at) : '';
  const country = sale?.country?.code ? `${countryFlag(sale.country.code)} ${sale.country.name || sale.country.code}` : 'Country pending';
  const attribution = sale?.matched_ad?.ad_name || sale?.attribution_label || 'Unattributed in Shopify';
  return <section className={`sale-monitor ${monitor.fresh ? 'fresh' : ''}`}>
    <div className="sale-main">
      <span className={`sale-dot ${monitor.status === 'live' ? 'on' : ''}`} />
      <div>
        <b><BellRing size={15} />{monitor.fresh ? 'New Shopify sale' : statusText}</b>
        <small className="sale-summary-line">{detail} · {country}</small>
        {orderTime ? <span className="sale-order-time"><CalendarDays size={13} />Order time <strong>{orderTime}</strong></span> : null}
        {items.length ? <div className="sale-items">{items.map((item) => <em key={`${item.title}-${item.quantity}`}>{item.quantity}x {item.title}</em>)}</div> : sale?.product_title ? <em>{sale.product_title}</em> : null}
        {sale ? <strong className="sale-source">Ad/source: {attribution}</strong> : null}
      </div>
    </div>
    <div className="sale-actions">
      <small>{monitor.checkedAt ? `Checked ${saleTime(monitor.checkedAt)}` : monitor.error || 'Starting monitor'}</small>
      <button type="button" className={soundEnabled ? 'sound-on' : ''} onClick={onEnableSound}>{soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}{soundEnabled ? 'Sound on' : 'Enable sound'}</button>
    </div>
  </section>;
}

function DateWindowControl({ range, bounds, preset, isOpen, customRange, onToggle, onPreset, onCustomChange, onApplyCustom }) {
  const presets = datePresets.map((p) => [p.value, p.label, p.description]);
  return <div className={`date-control ${isOpen ? 'open' : ''}`}>
    <button type="button" className="date-trigger" onClick={onToggle} aria-expanded={isOpen}>
      <CalendarDays size={16} />
      <span>{dateRangeLabel(range, preset)}</span>
      <i>{isOpen ? '−' : '+'}</i>
    </button>
    {isOpen ? <div className="date-menu">
      {presets.map(([key, label, helper]) => <button type="button" key={key} className={preset === key ? 'active' : ''} onClick={() => onPreset(key)}>
        <b>{label}</b>
        <span>{helper}</span>
        <small>{key === 'custom' ? presetSubLabel('custom', bounds) : presetSubLabel(key, bounds)}</small>
      </button>)}
      {preset === 'custom' ? <div className="custom-range">
        <label><span>Start</span><input type="date" min={bounds.calendar_since || bounds.since || undefined} max={bounds.calendar_until || bounds.until || undefined} value={customRange.since || ''} onInput={(event) => onCustomChange((current) => ({ ...current, since: event.currentTarget.value }))} onChange={(event) => onCustomChange((current) => ({ ...current, since: event.target.value }))} /></label>
        <label><span>End</span><input type="date" min={bounds.calendar_since || bounds.since || undefined} max={bounds.calendar_until || bounds.until || undefined} value={customRange.until || ''} onInput={(event) => onCustomChange((current) => ({ ...current, until: event.currentTarget.value }))} onChange={(event) => onCustomChange((current) => ({ ...current, until: event.target.value }))} /></label>
        <button type="button" className="apply-range" onClick={onApplyCustom}>Apply range</button>
      </div> : null}
      <p>
        Calendar: {bounds.calendar_since || bounds.since || 'n/a'} - {bounds.calendar_until || bounds.until || 'n/a'}
        {bounds.reporting_timezone ? ` · Today uses ${bounds.reporting_timezone}` : ''}
        {bounds.since ? ` · Loaded: ${bounds.since} - ${bounds.until}` : ''}
        {bounds.common_since ? ` · Matched Meta+Shopify: ${bounds.common_since} - ${bounds.common_until}` : ''}
        {bounds.meta_until ? ` · Meta latest ${bounds.meta_until}` : ''}
        {bounds.shopify_until ? ` · Shopify latest ${bounds.shopify_until}` : ''}
      </p>
    </div> : null}
  </div>;
}

function CoverageStrip({ coverage }) {
  const items = [
    ['All ad sets', coverage?.all_adsets || 0],
    ['USA ad sets', coverage?.usa_adsets || 0],
    ['Ads', coverage?.ads || 0],
    ['Countries', coverage?.countries || 0],
    ['Adset-country rows', coverage?.adset_country_daily_rows || 0],
    ['Ad-country rows', coverage?.ad_country_daily_rows || 0],
  ];
  return <section className="coverage-strip">{items.map(([label, value]) => <div key={label}><span>{label}</span><b>{compact(value)}</b></div>)}</section>;
}

function mixTooltip(family, units, total, subtypes = {}) {
  const familyShare = total ? Math.round((units / total) * 100) : 0;
  const subtypeEntries = Object.entries(subtypes[family] || {}).sort((a, b) => b[1] - a[1]);
  const subtypeText = subtypeEntries.length
    ? subtypeEntries.map(([subtype, count]) => `${subtype}: ${count} (${Math.round((count / units) * 100)}% of ${family}, ${Math.round((count / total) * 100)}% of country)`).join('\n')
    : 'No subtype split available';
  return `${family}: ${units} units (${familyShare}% of country)\n${subtypeText}`;
}

function MixBars({ mix, total, subtypes }) {
  const entries = Object.entries(mix || {}).sort((a, b) => b[1] - a[1]);
  return <div className="mix-bars">{entries.map(([family, units]) => <span key={family} style={{ width: `${Math.max(4, total ? (units / total) * 100 : 0)}%`, background: familyStyle[family]?.color || familyStyle.Other.color }} title={mixTooltip(family, units, total, subtypes)} />)}</div>;
}

function ProductTotals({ families }) {
  return <div className="product-totals">{families.map((f) => <div key={f.family} className="product-chip"><i style={{ background: familyStyle[f.family]?.color || familyStyle.Other.color }} /><span>{f.family}</span><b>{f.units}</b></div>)}</div>;
}

function OverallProducts({ products }) {
  return <div className="overall-products"><div><b>Total products sold overall</b><span>Actual Shopify product names, not families</span></div><div className="overall-product-list">{(products || []).slice(0, 9).map((p) => <small key={p.product}><span>{p.product}</span><b>{p.units}</b></small>)}</div></div>;
}

function TipSummary({ tips }) {
  const count = Number(tips?.people || tips?.orders || 0);
  const total = Number(tips?.total_usd || 0);
  if (!count && !total) return <small className="tip-summary">Tips: none recorded in this launch window</small>;
  return <small className="tip-summary">Tips: {compact(count)} {count === 1 ? 'person' : 'people'} · {money.format(total)} total</small>;
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

function rateLabel(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value || 0) * 100)}%` : 'n/a';
}

function confidenceSlug(value = '') {
  return slug(value || 'Insufficient data');
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

function filterBehaviorByDateRange(behavior, range) {
  const facts = filterRowsByDateRange(behavior?.facts || [], range);
  const demographicRows = filterRowsByDateRange(behavior?.meta_demographics_rows || [], range);
  const pageFacts = filterRowsByDateRange(behavior?.page_facts || [], range);
  const journeyRows = filterRowsByDateRange(behavior?.journey_rows || [], range);
  const checkoutProducts = rollupBehaviorFacts(facts, 'checkout', 'product', { countryName: countryNameFromCode });
  const checkoutCountries = rollupBehaviorFacts(facts, 'checkout', 'country', { countryName: countryNameFromCode });
  const paymentProducts = rollupBehaviorFacts(facts, 'submit_payment', 'product', { countryName: countryNameFromCode });
  const paymentCountries = rollupBehaviorFacts(facts, 'submit_payment', 'country', { countryName: countryNameFromCode });
  const demographics = demographicsBehaviorRollup(demographicRows);
  const filteredSessions = new Set(journeyRows.map((row) => row.session_hash).filter(Boolean));
  const sessionEventsBase = behavior?.extraction?.session_events || {};
  return {
    ...behavior,
    period: { ...(behavior?.period || {}), since: range.since, until: range.until },
    extraction: {
      ...(behavior?.extraction || {}),
      session_events: {
        ...sessionEventsBase,
        count: pageFacts.length,
        sessions: filteredSessions.size || journeyRows.length,
        ok: pageFacts.length > 0 || journeyRows.length > 0,
      },
    },
    matrix: {
      checkout: { global: checkoutProducts.global, products: checkoutProducts.rows, countries: checkoutCountries.rows, gender: demographics.checkout },
      submit_payment: { global: paymentProducts.global, products: paymentProducts.rows, countries: paymentCountries.rows, gender: demographics.submit_payment },
    },
    dwell_pages: dwellBehaviorRollup(pageFacts),
    journeys: journeyBehaviorRollup(journeyRows),
  };
}

function nextSort(current, key) {
  return { key, dir: current?.key === key && current?.dir === 'desc' ? 'asc' : 'desc' };
}

function sortRowsBy(rows, sort, labelFn = () => '') {
  const key = sort?.key || 'spend_usd';
  const dir = sort?.dir === 'asc' ? 1 : -1;
  return [...(rows || [])].sort((a, b) => {
    const deltaValue = Number(a[key] || 0) - Number(b[key] || 0);
    if (deltaValue) return deltaValue * dir;
    return String(labelFn(a) || '').localeCompare(String(labelFn(b) || ''));
  });
}

function sortStatus(sort, options) {
  const option = options.find((item) => item.key === sort?.key);
  return `${option?.label || sort?.key || 'Metric'} ${sort?.dir === 'asc' ? 'ascending' : 'descending'}`;
}

function SortControlStrip({ label, options, sortState, onSort }) {
  return <div className="sort-control-strip">
    <span>{label}</span>
    {options.map((option) => {
      const active = sortState?.key === option.key;
      return <button type="button" key={option.key} className={active ? 'active' : ''} onClick={() => onSort(option.key)}>
        {option.label}
        <i>{active ? (sortState.dir === 'asc' ? '↑' : '↓') : '↕'}</i>
      </button>;
    })}
  </div>;
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

function DailySalesHighlights({ lines, range }) {
  const rows = useMemo(() => dailySalesHighlights(lines, range), [lines, range]);
  const hasTies = rows.some((row) => row.productTieCount > 1 || row.adTieCount > 1);
  return <section className="daily-highlights">
    <div className="panel-title">
      <h2>Daily sales leaders</h2>
      <p>Top Shopify product and top Shopify-captured ad/source for each selected day.</p>
    </div>
    <div className={`daily-leader-board ${hasTies ? 'has-ties' : ''}`}>
      <article className="daily-leader-panel top-product-panel">
        <div className="daily-leader-heading"><span>Top product</span><small>By sold units</small></div>
        <div className="daily-date-stack">
          {rows.map((row) => <div className="daily-date-row" key={`product-${row.date}`}>
            <b>{row.date}</b>
            <div className="daily-winner-stack">
              {row.products?.length ? row.products.map((product) => <div className="daily-product daily-winner-row" key={product.product}>
                {product.image_url ? <img src={product.image_url} alt="" /> : <span className="thumb-fallback">{product.family?.slice(0, 1) || 'S'}</span>}
                <div>
                  <strong>{product.product}</strong>
                  <small>{product.units} unit{product.units === 1 ? '' : 's'} sold · {money.format(product.revenue_usd || 0)}{row.productTieCount > 1 ? ' · tied winner' : ''}</small>
                </div>
              </div>) : <div className="daily-product empty daily-winner-row"><span className="thumb-fallback">0</span><div><strong>No Shopify sale</strong><small>No paid order lines that day</small></div></div>}
            </div>
          </div>)}
        </div>
      </article>
      <article className="daily-leader-panel top-ad-panel">
        <div className="daily-leader-heading"><span>Top ad</span><small>By Shopify-captured sales</small></div>
        <div className="daily-date-stack">
          {rows.map((row) => <div className="daily-date-row" key={`ad-${row.date}`}>
            <b>{row.date}</b>
            <div className="daily-winner-stack">
              {row.ads?.length ? row.ads.map((ad) => <div className="daily-ad-winner daily-winner-row" key={ad.ad}>
                <strong>{ad.ad}</strong>
                <small>{ad.order_count} sale{ad.order_count === 1 ? '' : 's'} · {money.format(ad.revenue_usd || 0)}{row.adTieCount > 1 ? ' · tied winner' : ''}</small>
              </div>) : <div className="daily-ad-winner empty daily-winner-row">
                <strong>No ad captured in Shopify</strong>
                <small>Additional details did not identify an ad</small>
              </div>}
            </div>
          </div>)}
        </div>
      </article>
    </div>
  </section>;
}

function ExtractionStatus({ behavior }) {
  const items = [
    ['Checkout abandon', behavior?.extraction?.abandoned_checkouts],
    ['Payment abandon', behavior?.extraction?.meta_payment],
    ['Gender slice', behavior?.extraction?.meta_demographics],
    ['Session pixel', behavior?.extraction?.session_events],
  ];
  return <div className="behavior-status-strip">
    {items.map(([label, status]) => {
      const ok = Boolean(status?.ok);
      return <span key={label} className={ok ? 'ready' : 'building'} title={status?.error || status?.note || ''}>
        <i>{ok ? '●' : '○'}</i>
        <b>{label}</b>
        <small>{ok ? `${compact(status?.count || status?.sessions || 0)} rows` : 'extracting path ready'}</small>
      </span>;
    })}
  </div>;
}

function BehaviorStepCell({ row, label, global }) {
  if (!row || !Number(row.exposed || 0)) return <div className="behavior-step-cell empty"><b>{label}</b><strong>n/a</strong><small>No events reached this step yet</small></div>;
  return <div className={`behavior-step-cell ${confidenceSlug(row.confidence)}`}>
    <b>{label}</b>
    <strong>{row.abandoned}/{row.exposed}</strong>
    <small>{rateLabel(row.shrunk_rate)} shrunk abandon rate · site {rateLabel(global?.rate || 0)}</small>
    <div className="behavior-mini-facts">
      <span>{Number(row.vs_site_pp || 0) >= 0 ? '+' : ''}{Number(row.vs_site_pp || 0).toFixed(1)}pp vs site</span>
      <span>{Number(row.excess_abandons || 0).toFixed(1)} excess</span>
    </div>
    <em>{row.confidence}</em>
  </div>;
}

function BehaviorProductMatrix({ behavior }) {
  const checkoutRows = behavior?.matrix?.checkout?.products || [];
  const paymentRows = behavior?.matrix?.submit_payment?.products || [];
  const checkoutByKey = new Map(checkoutRows.map((row) => [row.key, row]));
  const paymentByKey = new Map(paymentRows.map((row) => [row.key, row]));
  const keys = [...new Set([...checkoutByKey.keys(), ...paymentByKey.keys()])];
  const rows = keys.map((key) => {
    const checkout = checkoutByKey.get(key);
    const payment = paymentByKey.get(key);
    const main = checkout || payment || {};
    return { key, main, checkout, payment, score: Number(checkout?.excess_abandons || 0) + Number(payment?.excess_abandons || 0) };
  }).filter(({ checkout, payment }) => Number(checkout?.abandoned || 0) > 0 || Number(payment?.abandoned || 0) > 0)
    .sort((a, b) => b.score - a.score || Number(b.main.exposed || 0) - Number(a.main.exposed || 0)).slice(0, 6);
  return <div className="behavior-matrix">
    {rows.length ? rows.map(({ key, main, checkout, payment }) => <article className="behavior-product-row" key={key}>
      <div className="behavior-product-cell">
        {main.image_url ? <img src={main.image_url} alt="" /> : <span className="thumb-fallback">{(main.family || 'S').slice(0, 1)}</span>}
        <div>
          <b>{main.product || 'Unknown product'}</b>
          <small>{main.family || 'Other'} · {main.subtype || 'Unknown'}</small>
        </div>
      </div>
      <BehaviorStepCell row={checkout} label="Checkout" global={behavior?.matrix?.checkout?.global} />
      <BehaviorStepCell row={payment} label="Submit payment" global={behavior?.matrix?.submit_payment?.global} />
      <div className="behavior-annotation-strip">
        {(checkout?.countries || payment?.countries || []).slice(0, 3).map((country) => <span className="behavior-chip" key={country.country_code}>{countryFlag(country.country_code)} {country.country_code || 'UNK'} {country.abandoned}/{country.exposed}</span>)}
        {!(checkout?.countries || payment?.countries || []).length ? <span className="behavior-chip muted">No country split yet</span> : null}
      </div>
    </article>) : <div className="behavior-empty">
      <b>No abandonment rows in this date window yet</b>
      <span>Checkout abandonments come from Shopify abandoned checkouts. Submit-payment rows come from Meta AddPaymentInfo now, with exact session-level rows added when the customer-events pixel sends `payment_info_submitted`.</span>
    </div>}
  </div>;
}

function BehaviorSegmentPanel({ title, rows, type }) {
  const visibleRows = (rows || []).filter((row) => Number(row.exposed || 0) > 0 && Number(row.abandoned || 0) > 0).slice(0, 5);
  return <article className="behavior-segment-panel">
    <div className="behavior-panel-head"><h3>{title}</h3><small>Rate + denominator, not raw count</small></div>
    <div className="behavior-segment-list">
      {visibleRows.map((row) => <div className="behavior-segment-row" key={`${type}-${row.key || row.segment || row.country_code}`}>
        <b>{type === 'country' ? <><span className="flag">{countryFlag(row.country_code)}</span>{row.country || row.country_code || 'Unknown'}</> : row.segment || row.gender || 'Unknown'}</b>
        <span>{row.abandoned}/{row.exposed}</span>
        <small>{rateLabel(row.shrunk_rate)} · {row.confidence}</small>
      </div>)}
      {!visibleRows.length ? <div className="behavior-empty compact"><b>No actionable segment rows yet</b><span>Rows with zero abandonments are hidden until they become useful.</span></div> : null}
    </div>
  </article>;
}

function DwellPagesPanel({ pages }) {
  const visiblePages = (pages || []).filter((page) => Number(page.sessions || 0) > 0 && Number(page.non_purchaser_median_dwell_seconds || page.median_dwell_seconds || 0) > 0).slice(0, 6);
  return <article className="behavior-panel">
    <div className="behavior-panel-head"><h3>Pages with dwell</h3><small>High dwell + exit can mean friction</small></div>
    <div className="behavior-dwell-grid">
      {visiblePages.map((page) => {
        const width = Math.min(100, Math.max(8, Number(page.non_purchaser_median_dwell_seconds || page.median_dwell_seconds || 0) / 6));
        return <div className="dwell-page-card" key={page.path}>
          <b>{page.path}</b>
          <span>{Math.round(page.non_purchaser_median_dwell_seconds || page.median_dwell_seconds || 0)}s non-purchaser dwell</span>
          <div className="dwell-meter"><i style={{ width: `${width}%` }} /></div>
          <small>{page.sessions} sessions · {page.read || 'Neutral'}</small>
        </div>;
      })}
      {!visiblePages.length ? <div className="behavior-empty compact"><b>No dwell rows yet</b><span>The session pixel will calculate dwell once page-view sessions are populated.</span></div> : null}
    </div>
  </article>;
}

function JourneyComparisonPanel({ journeys }) {
  const steps = journeys?.steps || [];
  return <article className="behavior-panel journey-panel">
    <div className="behavior-panel-head"><h3>Purchaser vs non-purchaser journey</h3><small>Shared page sequence and divergence</small></div>
    <div className="journey-compare">
      <div className="journey-column">
        <b>Purchasers common path</b>
        {steps.filter((row) => row.purchasers > 0).slice(0, 5).map((row) => <div className="journey-step" key={`p-${row.step}-${row.path}`}>
          <span>{row.step}</span><strong>{row.path}</strong><small>{Math.round(row.purchaser_support * 100)}% support · lift {Number(row.lift || 0).toFixed(1)}x</small>
        </div>)}
        {!steps.some((row) => row.purchasers > 0) ? <div className="behavior-empty compact"><b>No purchaser path yet</b><span>Waiting for session path + checkout_completed events.</span></div> : null}
      </div>
      <div className="journey-column">
        <b>Non-purchasers common path</b>
        {steps.filter((row) => row.non_purchasers > 0).slice(0, 5).map((row) => <div className="journey-step" key={`n-${row.step}-${row.path}`}>
          <span>{row.step}</span><strong>{row.path}</strong><small>{Math.round(row.non_purchaser_support * 100)}% support · {row.non_purchasers} sessions</small>
        </div>)}
        {!steps.some((row) => row.non_purchasers > 0) ? <div className="behavior-empty compact"><b>No non-purchaser path yet</b><span>Waiting for page_viewed events from sessions that do not purchase.</span></div> : null}
      </div>
    </div>
  </article>;
}

function BehaviorAnalyticsModule({ behavior, collapsed = false }) {
  const [open, setOpen] = useState(!collapsed);
  const checkoutCountries = behavior?.matrix?.checkout?.countries || [];
  const paymentCountries = behavior?.matrix?.submit_payment?.countries || [];
  const checkoutGender = behavior?.matrix?.checkout?.gender || [];
  const paymentGender = behavior?.matrix?.submit_payment?.gender || [];
  return <section className="behavior-zone behavior-dev-zone">
    <article className={`behavior-dev-details ${open ? 'is-open' : ''}`}>
      <button type="button" className="behavior-dev-summary" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <div>
          <span>Still in development</span>
          <b>Session intelligence, abandonment, and journeys</b>
          <small>Collapsed by default so unfinished behavior data stays out of the main operating view.</small>
        </div>
        <em>{behavior?.period?.since} - {behavior?.period?.until}</em>
      </button>
      {open ? <div className="behavior-dev-body">
        <div className="panel-title product-title">
          <div>
            <h2>Behavior friction matrix</h2>
            <p>Checkout abandonment comes from Shopify abandoned checkouts + paid checkout exposures. Submit-payment uses Meta AddPaymentInfo now; dwell and page journeys use first-party session events.</p>
          </div>
          <span>{behavior?.period?.since} - {behavior?.period?.until}</span>
        </div>
        <ExtractionStatus behavior={behavior} />
        <BehaviorProductMatrix behavior={behavior} />
        <div className="behavior-overview-grid">
          <BehaviorSegmentPanel title="Checkout countries" rows={checkoutCountries} type="country" />
          <BehaviorSegmentPanel title="Submit-payment countries" rows={paymentCountries} type="country" />
          <BehaviorSegmentPanel title="Checkout age / gender" rows={checkoutGender} type="gender" />
          <BehaviorSegmentPanel title="Payment age / gender" rows={paymentGender} type="gender" />
        </div>
        <div className="behavior-lower-grid">
          <DwellPagesPanel pages={behavior?.dwell_pages || []} />
          <JourneyComparisonPanel journeys={behavior?.journeys || {}} />
        </div>
      </div> : null}
    </article>
  </section>;
}

function MetricChip({ label, value, sub = '', tone = '', sortKey = '', sortState, onSort }) {
  const sortable = Boolean(sortKey && onSort);
  const active = sortable && sortState?.key === sortKey;
  const className = `metric-chip ${tone} ${sortable ? 'sortable' : ''} ${active ? 'active' : ''}`;
  const content = <>
    <small>{label}{sortable ? <i>{active ? (sortState.dir === 'asc' ? '↑' : '↓') : '↕'}</i> : null}</small>
    <b>{value}</b>
    {sub ? <em>{sub}</em> : null}
  </>;
  if (sortable) return <button type="button" className={className} onClick={() => onSort(sortKey)}>{content}</button>;
  return <span className={className}>{content}</span>;
}

const PRODUCT_SORT_OPTIONS = [
  { key: 'units', label: 'Units' },
  { key: 'revenue_usd', label: 'Revenue' },
];

const AD_SORT_OPTIONS = [
  { key: 'shopify_sales', label: 'Sales' },
  { key: 'shopify_roas', label: 'ROAS' },
  { key: 'ctr', label: 'CTR' },
  { key: 'add_to_cart', label: 'ATC' },
  { key: 'checkout_initiated', label: 'IC' },
  { key: 'spend_usd', label: 'Spend' },
];

const CAMPAIGN_SORT_OPTIONS = [
  { key: 'spend_usd', label: 'Spend' },
  { key: 'ctr', label: 'CTR' },
  { key: 'add_to_cart', label: 'ATC' },
  { key: 'checkout_initiated', label: 'IC' },
  { key: 'meta_sales', label: 'Meta sales' },
  { key: 'true_shopify_sales', label: 'Shopify' },
  { key: 'inferred_shopify_sales', label: 'Mapped sales' },
  { key: 'meta_roas', label: 'Meta ROAS' },
  { key: 'true_roas', label: 'Shopify ROAS' },
  { key: 'inferred_roas', label: 'Mapped ROAS' },
];

function LeadershipTables({ products, ads }) {
  const [productSort, setProductSort] = useState({ key: 'units', dir: 'desc' });
  const [adSort, setAdSort] = useState({ key: 'shopify_sales', dir: 'desc' });
  const productRows = useMemo(() => sortRowsBy(products, productSort, (row) => row.product), [products, productSort]);
  const adRows = useMemo(() => sortRowsBy(ads, adSort, (row) => row.ad_name), [ads, adSort]);
  const toggleProductSort = (key) => setProductSort((current) => nextSort(current, key));
  const toggleAdSort = (key) => setAdSort((current) => nextSort(current, key));
  return <section className="leadership-tables card-leadership">
    <div className="mini-table leadership-card-panel">
      <div className="leader-panel-head"><h3>Product sales</h3><small>{sortStatus(productSort, PRODUCT_SORT_OPTIONS)}</small></div>
      <SortControlStrip label="Sort products" options={PRODUCT_SORT_OPTIONS} sortState={productSort} onSort={toggleProductSort} />
      <div className="leadership-card-list">{productRows.slice(0, 12).map((p) => <article className="leader-card product-leader-card" key={p.product}>
        {p.image_url ? <img src={p.image_url} alt="" /> : <span className="thumb-fallback">{(p.family || 'S').slice(0, 1)}</span>}
        <div className="leader-copy">
          <b>{p.product}</b>
          <small>{p.family || 'Unknown'} · {p.subtype || 'Unknown'}</small>
        </div>
        <div className="leader-metrics">
          <MetricChip label="Units" value={p.units || 0} sortKey="units" sortState={productSort} onSort={toggleProductSort} />
          <MetricChip label="Revenue" value={money.format(p.revenue_usd || 0)} tone="good" sortKey="revenue_usd" sortState={productSort} onSort={toggleProductSort} />
        </div>
      </article>)}</div>
    </div>
    <div className="mini-table leadership-card-panel">
      <div className="leader-panel-head"><h3>Ads leadership</h3><small>{sortStatus(adSort, AD_SORT_OPTIONS)}</small></div>
      <SortControlStrip label="Sort ads" options={AD_SORT_OPTIONS} sortState={adSort} onSort={toggleAdSort} />
      <div className="leadership-card-list">{adRows.slice(0, 12).map((a) => <article className="leader-card ad-leader-card" key={a.ad_id || a.ad_name}>
        <div className="leader-copy">
          <b>{a.ad_name}</b>
          <small>{a.product_family || 'unknown_product'} · {a.product_subtype || 'Unknown'}{a.campaign_count ? ` · ${a.campaign_count} campaign${a.campaign_count === 1 ? '' : 's'}` : ''}</small>
        </div>
        <div className="leader-metrics ad-leader-metrics">
          <MetricChip label="Sales" value={a.shopify_sales || 0} sub="Shopify" sortKey="shopify_sales" sortState={adSort} onSort={toggleAdSort} />
          <MetricChip label="ROAS" value={`${Number(a.shopify_roas || 0).toFixed(2)}x`} sub="Shopify" tone={Number(a.shopify_roas || 0) >= 2 ? 'good' : 'warn'} sortKey="shopify_roas" sortState={adSort} onSort={toggleAdSort} />
          <MetricChip label="CTR" value={`${Number(a.ctr || 0).toFixed(2)}%`} sortKey="ctr" sortState={adSort} onSort={toggleAdSort} />
          <MetricChip label="ATC" value={a.add_to_cart || 0} sortKey="add_to_cart" sortState={adSort} onSort={toggleAdSort} />
          <MetricChip label="IC" value={a.checkout_initiated || 0} sortKey="checkout_initiated" sortState={adSort} onSort={toggleAdSort} />
          <MetricChip label="Spend" value={money.format(a.spend_usd || 0)} sortKey="spend_usd" sortState={adSort} onSort={toggleAdSort} />
        </div>
      </article>)}</div>
    </div>
  </section>;
}

function roasText(value) {
  return Number(value || 0) ? `${Number(value || 0).toFixed(2)}x` : '0.00x';
}

function MappingBadge({ row }) {
  if (row.has_sales_gap) return <span className="danger-chip">Meta &gt; Shopify by {row.meta_sales_over_shopify_sales}</span>;
  if (row.has_best_fit_inference) return <span className="bestfit-chip">{row.inferred_warning_sales} best-fit inferred</span>;
  if (row.has_inferred_sales) return <span className="inferred-chip">{row.shopify_product_inferred_sales} inferred</span>;
  if (row.unresolved_sales) return <span className="unresolved-chip">{row.unresolved_sales} unresolved</span>;
  return <span className="resolved-chip">clean</span>;
}

function CampaignStatsGrid({ row, sortState, onSort }) {
  return <div className="campaign-stats-grid">
    <MetricChip label="Spend" value={money.format(row.spend_usd || 0)} sortKey="spend_usd" sortState={sortState} onSort={onSort} />
    <MetricChip label="CTR" value={`${Number(row.ctr || 0).toFixed(2)}%`} sortKey="ctr" sortState={sortState} onSort={onSort} />
    <MetricChip label="ATC" value={row.add_to_cart || 0} sortKey="add_to_cart" sortState={sortState} onSort={onSort} />
    <MetricChip label="IC" value={row.checkout_initiated || 0} sortKey="checkout_initiated" sortState={sortState} onSort={onSort} />
    <MetricChip label="Meta sales" value={row.meta_sales || 0} sub="Meta" sortKey="meta_sales" sortState={sortState} onSort={onSort} />
    <MetricChip label="Shopify" value={row.true_shopify_sales || 0} sub="direct/country" sortKey="true_shopify_sales" sortState={sortState} onSort={onSort} />
    <MetricChip label="Mapped sales" value={row.inferred_shopify_sales || 0} sub="after inference" tone={row.has_inferred_sales ? 'inferred' : ''} sortKey="inferred_shopify_sales" sortState={sortState} onSort={onSort} />
    <MetricChip label="Meta ROAS" value={roasText(row.meta_roas)} sortKey="meta_roas" sortState={sortState} onSort={onSort} />
    <MetricChip label="Shopify ROAS" value={roasText(row.true_roas)} tone={row.true_roas >= row.meta_roas ? 'good' : 'warn'} sortKey="true_roas" sortState={sortState} onSort={onSort} />
    <MetricChip label="Mapped ROAS" value={roasText(row.inferred_roas)} tone={row.inferred_roas >= row.true_roas ? 'good' : 'warn'} sortKey="inferred_roas" sortState={sortState} onSort={onSort} />
  </div>;
}

function CampaignNodeCard({ row, level, isOpen, onToggle, sortState, onSort, children }) {
  const isLeaf = level === 'ad';
  const label = level === 'campaign' ? 'Campaign' : level === 'adset' ? 'Ad set' : 'Ad';
  const title = level === 'campaign' ? row.campaign_name : level === 'adset' ? row.adset_name : row.ad_name;
  const context = level === 'ad' ? `${row.product_family || 'unknown'} / ${row.product_subtype || 'unknown'}` : row.campaign_name;
  return <article className={`campaign-node-card ${level}`}>
    <div className="campaign-node-head">
      <div className="campaign-node-title">
        {!isLeaf ? <button type="button" className="tree-toggle" onClick={onToggle}>{isOpen ? '−' : '+'}</button> : <span className="ad-dot" />}
        <div>
          <span className="level-pill">{label}</span>
          <b>{title}</b>
          {context && context !== title ? <small>{context}</small> : null}
        </div>
      </div>
      <MappingBadge row={row} />
    </div>
    {row.inference_notes?.length ? <div className="campaign-notes">{row.inference_notes.slice(0, 2).map((note) => <small key={note}>{note}</small>)}</div> : null}
    <CampaignStatsGrid row={row} sortState={sortState} onSort={onSort} />
    {children ? <div className="campaign-children">{children}</div> : null}
  </article>;
}

function CampaignPerformanceTable({ attribution }) {
  const sourceCampaigns = attribution?.campaigns || [];
  const [treeSort, setTreeSort] = useState({ key: 'spend_usd', dir: 'desc' });
  const campaigns = useMemo(() => sortRowsBy(sourceCampaigns, treeSort, (row) => row.campaign_name), [sourceCampaigns, treeSort]);
  const [openCampaigns, setOpenCampaigns] = useState(() => new Set(campaigns.slice(0, 3).map((c) => c.campaign_id || c.campaign_name)));
  const [openAdsets, setOpenAdsets] = useState(new Set());
  const toggleTreeSort = (key) => setTreeSort((current) => nextSort(current, key));
  useEffect(() => {
    if (!campaigns.length) return;
    setOpenCampaigns((current) => current.size ? current : new Set(campaigns.slice(0, 3).map((c) => c.campaign_id || c.campaign_name)));
    setOpenAdsets((current) => {
      if (current.size) return current;
      const next = new Set();
      campaigns.slice(0, 2).forEach((campaign) => {
        (campaign.adsets || []).slice(0, 1).forEach((adset) => next.add(adset.adset_id || `${campaign.campaign_id || campaign.campaign_name}-${adset.adset_name}`));
      });
      return next;
    });
  }, [campaigns]);
  function toggle(setter, key) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  return <section className="campaign-tree-panel">
    <div className="panel-title product-title"><div><h2>Campaign Shopify ROAS tree</h2><p>Campaign ROAS uses Meta spend as denominator and Shopify order-line revenue as numerator. Product/country matches flow into inferred ROAS and stay labeled as inferred instead of direct.</p></div><span>{campaigns.length} campaigns</span></div>
    <div className="campaign-rules">
      <small><b>CTR:</b> click-through/link CTR, not CTR all.</small>
      <small><b>Shopify ROAS:</b> Shopify revenue assigned directly or by country campaign ownership.</small>
      <small><b>Mapped ROAS:</b> Shopify ROAS plus product/country inferred ad assignment.</small>
    </div>
    <SortControlStrip label={`Sort tree · ${sortStatus(treeSort, CAMPAIGN_SORT_OPTIONS)}`} options={CAMPAIGN_SORT_OPTIONS} sortState={treeSort} onSort={toggleTreeSort} />
    <div className="campaign-card-tree">{campaigns.map((campaign) => {
      const cKey = campaign.campaign_id || campaign.campaign_name;
      const cOpen = openCampaigns.has(cKey);
      return <CampaignNodeCard key={cKey} row={campaign} level="campaign" isOpen={cOpen} onToggle={() => toggle(setOpenCampaigns, cKey)} sortState={treeSort} onSort={toggleTreeSort}>
        {cOpen ? sortRowsBy(campaign.adsets || [], treeSort, (row) => row.adset_name).map((adset) => {
          const aKey = adset.adset_id || `${cKey}-${adset.adset_name}`;
          const aOpen = openAdsets.has(aKey);
          return <CampaignNodeCard key={aKey} row={adset} level="adset" isOpen={aOpen} onToggle={() => toggle(setOpenAdsets, aKey)} sortState={treeSort} onSort={toggleTreeSort}>
            {aOpen ? sortRowsBy(adset.ads || [], treeSort, (row) => row.ad_name).map((ad) => <CampaignNodeCard key={ad.ad_id || `${aKey}-${ad.ad_name}`} row={ad} level="ad" sortState={treeSort} onSort={toggleTreeSort} />) : null}
          </CampaignNodeCard>;
        }) : null}
      </CampaignNodeCard>;
    })}</div>
    {attribution?.sales_gaps?.length ? <div className="unresolved-note danger-note"><b>{attribution.sales_gaps.length} rows where Meta sales exceed Shopify-mapped sales.</b><span>This is a mapping/extraction warning; expand the row before trusting mapped ROAS.</span></div> : null}
    {attribution?.unresolved?.length ? <div className="unresolved-note"><b>{attribution.unresolved.length} Shopify order line has no matching Meta ad candidate.</b><span>It remains inside campaign Shopify ROAS when country ownership is clear, but it cannot be placed into an ad/ad set until a product-to-ad candidate exists.</span></div> : null}
  </section>;
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
  const [dateRange, setDateRange] = useState({ since: '', until: '' });
  const [customRange, setCustomRange] = useState({ since: '', until: '' });
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [saleSoundEnabled, setSaleSoundEnabled] = useState(true);
  const [saleMonitor, setSaleMonitor] = useState({ status: 'checking', sale: null, checkedAt: null, fresh: false, error: '', todaySummary: null, purchases: [] });
  const [metaMonitor, setMetaMonitor] = useState({ status: 'checking', live: null, checkedAt: null, error: '' });
  const [activeTab, setActiveTab] = useState('overview');
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
  const behaviorData = useMemo(() => filterBehaviorByDateRange(baseBehaviorData, launchDateRange), [baseBehaviorData, launchDateRange]);
  const launchScopeLabel = useMemo(
    () => emailPanelRangeLabel(launchDateRange, 'launch', saleMonitor.status === 'not_configured'),
    [launchDateRange, saleMonitor.status],
  );
  function handleDatePreset(nextPreset) {
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
    const accountRows = data.account_daily_metrics?.length ? data.account_daily_metrics : accountDailyFromAdRows(data.ad_country_daily || []);
    return accountRows.length ? accountRows : (data.daily_metrics || aggregateRows(data.adsets || []));
  }, [data]);
  const allLoadedDateRange = useMemo(() => ({ since: loadedBounds.since, until: loadedBounds.until }), [loadedBounds.since, loadedBounds.until]);
  const allLoadedData = useMemo(() => filterMetaDataByDateRange(baseData, allLoadedDateRange), [baseData, allLoadedDateRange]);
  const allLoadedProductData = useMemo(() => filterShopifyByDateRange(baseProductData, allLoadedDateRange), [baseProductData, allLoadedDateRange]);
  const allLoadedAccountDaily = useMemo(() => {
    const accountRows = allLoadedData.account_daily_metrics?.length ? allLoadedData.account_daily_metrics : accountDailyFromAdRows(allLoadedData.ad_country_daily || []);
    return accountRows.length ? accountRows : (allLoadedData.daily_metrics || aggregateRows(allLoadedData.adsets || []));
  }, [allLoadedData]);
  const businessRows = useMemo(() => mergeBusinessRows(accountDaily, productData.daily || []), [accountDaily, productData]);
  const allBusinessRows = useMemo(() => mergeBusinessRows(allLoadedAccountDaily, allLoadedProductData.daily || []), [allLoadedAccountDaily, allLoadedProductData]);
  const business = businessStats(businessRows);
  const businessDeltas = useMemo(() => ({
    revenue: businessPeriodDelta(allBusinessRows, 'revenue_usd', activeDateRange),
    sales: businessPeriodDelta(allBusinessRows, 'orders', activeDateRange),
    aov: businessPeriodDelta(allBusinessRows, 'aov', activeDateRange),
    spend: businessPeriodDelta(allBusinessRows, 'spend_usd', activeDateRange),
    cac: businessPeriodDelta(allBusinessRows, 'cac', activeDateRange),
    roas: businessPeriodDelta(allBusinessRows, 'roas', activeDateRange),
  }), [allBusinessRows, activeDateRange]);
  const campaignAttribution = useMemo(() => buildCampaignAttribution(data, productData), [data, productData]);
  const productRows = productData.products || [];
  const adRows = useMemo(() => enrichAdsWithShopifySales(data.ads || [], productData.order_lines || []), [data.ads, productData.order_lines]);
  const deliveryComparison = baseData.delivery_comparison || {};
  const deliveryShopifyComparison = baseProductData.delivery_comparison || {};
  const adsetPerfById = useMemo(() => new Map((data.all_adsets || []).map((row) => [row.adset_id, row])), [data]);
  const launchCountryMetaByCode = useMemo(() => new Map((launchData.countries || []).map((row) => [row.country_code, row])), [launchData]);

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
    return buildEmailCampaignSummary(launchProductData.order_lines || [], { countryFlag, timeZone: REPORTING_TIMEZONE });
  }, [mapIsDemo, launchProductData.order_lines]);
  const monitorStatusText = saleMonitor.status === 'live'
    ? (livePurchases.length ? 'Live Shopify sales monitor' : 'Live Shopify sales monitor · no orders yet today')
    : saleMonitor.status === 'checking'
      ? 'Checking Shopify sales'
      : 'Sale monitor paused';
  const syncHealthLabel = !metaDataLoaded ? 'Loading' : metaFallbackActive ? 'Fallback' : metaMonitor.status === 'offline' ? 'Offline' : 'Live';
  const shopifyHealthLabel = !shopifyDataLoaded ? 'Loading' : shopifyFallbackActive ? 'Fallback' : 'Live';
  const healthTone = (h) => (h === 'Live' ? 'good' : h === 'Offline' ? 'bad' : 'warn');

  const dayRows = adapt.toDayRows(businessRows);
  // Performance trend is a multi-day view with its own 3D/7D/14D/All control, so it draws
  // from the full loaded history rather than the active date filter (which can be a
  // single day under the "Today" preset and would leave nothing to connect into a line).
  // Scope to the June 3 CBO launch onward — pre-launch Shopify-only days have no Meta
  // spend and make the revenue-vs-spend line unreadably spiky. Historical insights covers
  // the earlier Shopify-only period separately.
  // The current reporting day is omitted: it is still accumulating sales/spend.
  const reportingToday = loadedBounds.today || currentReportingDay();
  const monthProjection = useMemo(
    () => buildMonthProjection(allBusinessRows, { today: reportingToday, elapsedShare: elapsedReportingDayShare() }),
    [allBusinessRows, reportingToday],
  );
  const kpiRecords = useMemo(() => buildKpiRecordMap(allBusinessRows, reportingToday), [allBusinessRows, reportingToday]);
  const kpiProjection = (key) => buildKpiProjectionDisplay(monthProjection, key);
  const kpiRecord = (key) => buildKpiRecordDisplay(kpiRecords, key);
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
  const deliveryShape = adapt.toDeliveryShape(deliveryTrendRows);
  const growth = adapt.toProductDevelopment(launchProductData);
  const decisions = adapt.toAdSetDecisions(filtered, adsetPerfById, statusLabels);
  const productDemand = adapt.toProductDemand(launchProductData, launchDateRange.since);
  const countrySales = adapt.toCountrySales(launchProductData.countries || [], launchCountryMetaByCode);
  // Trailing-window country aggregates (3D/7D/14D) for the panel's range toggle.
  // Each window re-runs the exact same filter + adapt pipeline as the "All" view
  // above, just over a shorter trailing range — so no business logic is recomputed,
  // every figure stays calculation-identical to the launch-window view.
  const countrySalesWindows = useMemo(() => {
    const anchor = loadedBounds.until || loadedBounds.calendar_until || currentReportingDay();
    if (!anchor) return {};
    const build = (sinceDays) => {
      const win = clampDateRange({ since: shiftDate(anchor, sinceDays), until: anchor }, loadedBounds);
      const ws = filterShopifyByDateRange(baseProductData, win);
      const wm = filterMetaDataByDateRange(baseData, win);
      const metaByCode = new Map((wm.countries || []).map((row) => [row.country_code, row]));
      return adapt.toCountrySales(ws.countries || [], metaByCode);
    };
    return { '3D': build(-2), '7D': build(-6), '14D': build(-13) };
  }, [baseProductData, baseData, loadedBounds]);
  // Mobile "Top movers" — today's leader as the hero, with the current week and
  // previous week as comparison windows (paid-ads only; email orders excluded).
  const topMovers = useMemo(() => {
    const anchor = loadedBounds.until || loadedBounds.calendar_until || currentReportingDay();
    const leadersFor = (win) => {
      const ws = filterShopifyByDateRange(baseProductData, win, { excludeEmail: true });
      const wm = filterMetaDataByDateRange(baseData, win);
      const metaByCode = new Map((wm.countries || []).map((row) => [row.country_code, row]));
      const adRowsForWindow = enrichAdsWithShopifySales(wm.ads || [], ws.order_lines || []);
      return {
        product: adapt.toProductLeaders(ws.products || [])[0] || null,
        ad: adapt.toAdLeaders(adRowsForWindow)[0] || null,
        country: adapt.toCountrySales(ws.countries || [], metaByCode)[0] || null,
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
  }, [baseProductData, baseData, loadedBounds]);
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

  const orderDropRankings = useMemo(() => {
    const lines = baseProductData?.order_lines || [];
    const opts = { limit: 3, minDropPct: 40, countryFlag, cleanAdLabel, isTipLine };
    const reportingToday = loadedBounds.today || currentReportingDay();
    if (!reportingToday) return null;

    // After the Istanbul day rolls over, explain the day that just ended (yesterday).
    const endedDay = shiftDate(reportingToday, -1);
    const rollover = buildOrderDropRankings(lines, endedDay, shiftDate(endedDay, -1), opts);
    if (rollover) return { ...rollover, context: 'ended-day' };

    // Fallback: user picked another single down day in the date filter.
    if (dayCount(activeDateRange) !== 1) return null;
    const day = activeDateRange.until;
    if (!day || day === endedDay) return null;
    const selected = buildOrderDropRankings(lines, day, shiftDate(day, -1), opts);
    return selected ? { ...selected, context: 'selected-day' } : null;
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
    kpis: (
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        <KpiCard label="Shopify revenue" value={money.format(business.revenue_usd)} sub={`${business.units} units sold`} delta={businessDeltas.revenue.pct} series={adapt.sparkSeries(businessRows, 'revenue_usd', allBusinessRows)} accent="brand" projection={kpiProjection('revenue_usd')} record={kpiRecord('revenue_usd')} />
        <KpiCard label="Sales" value={compact(business.orders)} sub={`${business.units} units sold`} delta={businessDeltas.sales.pct} series={adapt.sparkSeries(businessRows, 'orders', allBusinessRows)} accent="violet" projection={kpiProjection('orders')} record={kpiRecord('orders')} />
        <KpiCard label="AOV" value={business.aov ? money.format(business.aov) : 'n/a'} delta={businessDeltas.aov.pct} series={adapt.sparkSeries(businessRows, 'aov', allBusinessRows)} accent="blue" projection={kpiProjection('aov')} record={kpiRecord('aov')} />
        <KpiCard label="Meta spend" value={money.format(business.spend_usd)} delta={businessDeltas.spend.pct} series={adapt.sparkSeries(businessRows, 'spend_usd', allBusinessRows)} accent="gold" positiveWhenUp={false} projection={kpiProjection('spend_usd')} record={kpiRecord('spend_usd')} />
        <KpiCard label="CAC" value={business.orders ? money.format(business.cac) : 'n/a'} delta={businessDeltas.cac.pct} series={adapt.sparkSeries(businessRows, 'cac', allBusinessRows)} accent="gold" positiveWhenUp={false} projection={kpiProjection('cac')} record={kpiRecord('cac')} />
        <KpiCard label="ROAS" value={business.roas ? `${business.roas.toFixed(2)}x` : 'n/a'} delta={businessDeltas.roas.pct} series={adapt.sparkSeries(businessRows, 'roas', allBusinessRows)} accent="positive" projection={kpiProjection('roas')} record={kpiRecord('roas')} />
      </section>
    ),
    orderDrop: orderDropRankings ? (
      <OrderDropRankings
        day={orderDropRankings.day}
        prevDay={orderDropRankings.prevDay}
        currentOrders={orderDropRankings.currentOrders}
        previousOrders={orderDropRankings.previousOrders}
        orderDeltaPct={orderDropRankings.orderDeltaPct}
        countries={orderDropRankings.countries}
        ads={orderDropRankings.ads}
        context={orderDropRankings.context}
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
        rangeLabel={launchScopeLabel}
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
        <DailyDelivery data={deliveryShape} />
        <DevelopingGrowth data={growth.data} lines={growth.lines} />
      </div>
    ),
    decision: <AdSetDecisionTable rows={decisions} />,
    product: <ProductDemand data={productDemand} />,
    country: <CountrySalesPanel countries={countrySales} windows={countrySalesWindows} />,
    mobileTops: <TopMovers cards={topMoverCards} />,
    behavior: <BehaviorAnalytics behavior={behaviorData} scopeLabel={launchScopeLabel} />,
    data: <DataTable rows={dayRows} />,
    historicalInsights: (
      <HistoricalInsights
        daily={historicalDaily}
        developingDay={reportingToday}
        timezone={REPORTING_TIMEZONE}
      />
    ),
  };
  const dashboardGroups = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard, ids: ['ordersMap', 'kpis', 'orderDrop', 'revenue', 'mobileTops'] },
    { key: 'ads', label: 'Ads', icon: GitBranch, ids: ['tree', 'emailCampaign', 'leaders', 'edits', 'decision'] },
    { key: 'launch', label: 'Launch', icon: Rocket, ids: ['usa', 'delivery'] },
    { key: 'market', label: 'Market', icon: ShoppingBag, ids: ['salesBench', 'product', 'country'] },
    { key: 'historical', label: 'Historical insights', icon: BarChart3, ids: ['historicalInsights'] },
    { key: 'behavior', label: 'Behavior', icon: Activity, ids: ['behavior', 'data'] },
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
                Live Shopify sales, Meta spend, and launch momentum in one command view · {dateRangeLabel(activeDateRange, datePreset)}
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
