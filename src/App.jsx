import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { BellRing, CalendarDays, RefreshCw, Search, Volume2, VolumeX } from 'lucide-react';
import { compact, money, pct, slug } from './lib/format.js';
import { buildCampaignAttribution } from './lib/campaignAttribution.js';
import { statusLabels, statusOrder } from './features/adset-radar/constants.js';
import { familyStyle } from './features/product-demand/constants.js';

const SALE_POLL_MS = 30000;

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

function aggregateRows(adsets) {
  const byDate = new Map();
  adsets.forEach((adset) => {
    adset.rows?.forEach((r) => {
      const cur = byDate.get(r.date) || { date: r.date, spend: 0, spend_usd: 0, impressions: 0, reach: 0 };
      cur.spend += Number(r.spend || 0);
      cur.spend_usd += Number(r.spend_usd ?? r.spend ?? 0);
      cur.impressions += Number(r.impressions || 0);
      cur.reach += Number(r.reach || 0);
      byDate.set(r.date, cur);
    });
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({
    ...r,
    frequency: r.reach ? r.impressions / r.reach : 0,
    cpm: r.impressions ? (r.spend_usd / r.impressions) * 1000 : 0,
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
function delta(cur, base) { return base ? ((cur - base) / base) * 100 : 0; }
function localKey(parts) { return parts.filter(Boolean).join('::'); }
function normalizedIdentity(value) { return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function adRollupKey(row) {
  return normalizedIdentity(row.ad_name) || row.ad_id || localKey([row.adset_id, row.ad_name]);
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
    is_common: hasCommon,
  };
}
function normalizeDateRange(range, bounds) {
  let since = range?.since || bounds?.since || '';
  let until = range?.until || bounds?.until || '';
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
function filterShopifyByDateRange(shopify, range) {
  const daily = filterRowsByDateRange(shopify?.daily || [], range);
  const lines = filterRowsByDateRange(shopify?.order_lines || [], range);
  if (!lines.length && !(shopify?.order_lines || []).length) {
    return {
      ...shopify,
      period: { ...(shopify?.period || {}), since: range.since, until: range.until },
      daily,
      cumulative: filterRowsByDateRange(shopify?.cumulative || [], range),
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
function shiftDate(date, days) {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function clampDateRange(range, bounds) {
  const normalized = normalizeDateRange(range, bounds);
  let since = normalized.since;
  let until = normalized.until;
  if (bounds?.since && since < bounds.since) since = bounds.since;
  if (bounds?.until && until > bounds.until) until = bounds.until;
  if (since && until && since > until) since = until;
  return { since, until };
}
function presetDateRange(preset, bounds) {
  const end = bounds?.until || '';
  if (!end) return { since: '', until: '' };
  if (preset === 'today') return clampDateRange({ since: end, until: end }, bounds);
  if (preset === 'yesterday') {
    const day = shiftDate(end, -1);
    return clampDateRange({ since: day, until: day }, bounds);
  }
  if (preset === 'last7') return clampDateRange({ since: shiftDate(end, -6), until: end }, bounds);
  if (preset === 'all' && bounds?.common_since && bounds?.common_until) {
    return clampDateRange({ since: bounds.common_since, until: bounds.common_until }, bounds);
  }
  return clampDateRange({ since: bounds?.since || end, until: end }, bounds);
}
function dateRangeLabel(range, preset) {
  if (!range?.since || !range?.until) return 'Choose dates';
  const prefix = preset === 'today' ? 'Today' : preset === 'yesterday' ? 'Yesterday' : preset === 'last7' ? 'Last week' : preset === 'all' ? 'Matched data' : 'Custom';
  return `${prefix}: ${range.since} - ${range.until}`;
}
function presetSubLabel(preset, bounds) {
  const range = presetDateRange(preset, bounds);
  if (!range.since) return 'No loaded dates yet';
  if (preset === 'custom') return 'Choose exact start and end';
  return range.since === range.until ? range.since : `${range.since} - ${range.until}`;
}
function shortLabel(value, max = 28) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function businessMetricConfig(active) {
  return {
    revenue: { key: 'revenue_usd', label: 'Shopify revenue', formatter: (v) => money.format(v), color: '#e02e92' },
    sales: { key: 'units', label: 'Items sold', formatter: (v) => compact(v), color: '#7f1d57' },
    aov: { key: 'aov', label: 'AOV', formatter: (v) => (v ? money.format(v) : 'n/a'), color: '#be2b78' },
    spend: { key: 'spend_usd', label: 'Meta spend', formatter: (v) => money.format(v), color: '#bf6b1f' },
    cac: { key: 'cac', label: 'CAC', formatter: (v) => (v ? money.format(v) : 'n/a'), color: '#9f1d63' },
    roas: { key: 'roas', label: 'ROAS', formatter: (v) => (v ? `${Number(v).toFixed(2)}x` : 'n/a'), color: '#0b766c' },
  }[active] || { key: 'revenue_usd', label: 'Shopify revenue', formatter: (v) => money.format(v), color: '#e02e92' };
}

function windowedRows(rows, windowKey) {
  if (windowKey === 'all') return rows;
  const count = Number(windowKey || 0);
  return count > 0 ? rows.slice(-count) : rows;
}

function fxAuditText(data) {
  const rates = data.fx_rates?.rates || [];
  if (!rates.length) return 'FX audit: no rate metadata in this dataset yet.';
  const usdRates = rates.filter((r) => r.fx_to_usd);
  const exact = usdRates.filter((r) => r.fx_to_usd_requested_date === r.fx_to_usd_rate_date).length;
  const fallback = Math.max(0, usdRates.length - exact);
  const latest = usdRates[usdRates.length - 1];
  return `FX audit: TRY→USD via ${data.fx_rates?.provider || 'Frankfurter'}; ${exact}/${usdRates.length} exact daily rates${fallback ? `, ${fallback} fallback` : ''}. Latest ${latest?.date || ''}: ${Number(latest?.fx_to_usd || 0).toFixed(5)} (${latest?.fx_to_usd_source || 'source unknown'}).`;
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
  if (!currentRows.length) return fallbackPeriodDelta(sorted, key);
  const days = dayCount(activeRange);
  const previousRange = { since: shiftDate(activeRange.since, -days), until: shiftDate(activeRange.until, -days) };
  const previousRows = filterRowsByDateRange(sorted, previousRange);
  if (previousRows.length) {
    return periodDeltaFromRows(currentRows, previousRows, key, days === 1 ? 'vs previous day' : 'vs previous period');
  }
  return fallbackPeriodDelta(currentRows, key);
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
  const current = {
    frequency: Number(last.frequency || avg(rows.slice(-3), 'frequency') || 0),
    cpm: Number(last.cpm_usd || last.cpm || avg(rows.slice(-3), 'cpm_usd') || avg(rows.slice(-3), 'cpm') || 0),
    reach: Number(last.reach || avg(rows.slice(-3), 'reach') || 0),
    impressions: Number(last.impressions || avg(rows.slice(-3), 'impressions') || 0),
    spend: Number(last.spend_usd || last.spend || avg(rows.slice(-3), 'spend_usd') || avg(rows.slice(-3), 'spend') || 0),
  };
  const histDelta = { frequency: delta(current.frequency, histFrequency), cpm: delta(current.cpm, histCpm), reach: delta(current.reach, histReach) };
  const marchDelta = { frequency: delta(current.frequency, march.frequency), cpm: delta(current.cpm, march.cpm), reach: delta(current.reach, march.reach) };
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

function trendOption(rows, march, changes) {
  const dates = rows.map((r) => r.date);
  const reach = rows.map((r) => Number(r.reach || 0));
  const maxReach = Math.max(...reach, march.reach || 0, 1);
  const showUsaBaseline = Boolean(march?.applies);
  return {
    color: ['#067c73', '#e09113', '#1d64d8', '#c81e2c'],
    tooltip: { trigger: 'axis', backgroundColor: '#111827', borderColor: '#111827', textStyle: { color: '#fff' }, formatter: (params) => {
      const i = params[0].dataIndex;
      const r = rows[i];
      const editsForDay = (changes || []).filter((c) => c.date === r.date);
      const orderedEdits = [...editsForDay].sort((a, b) => Number(Boolean(b.is_budget_change)) - Number(Boolean(a.is_budget_change)));
      const budgetCount = orderedEdits.filter((c) => c.is_budget_change).length;
      const edits = orderedEdits.length ? `${budgetCount ? `${budgetCount} BUDGET change${budgetCount === 1 ? '' : 's'} · ` : ''}${orderedEdits.length} total edit${orderedEdits.length === 1 ? '' : 's'}<br/>${orderedEdits.slice(0, 4).map((c) => `${c.is_budget_change ? 'BUDGET: ' : ''}${c.object_name || 'Ad set'}: ${c.label || c.event_type || 'changed'}`).join('<br/>')}` : '';
      return `<b>${r.date}</b><br/>Frequency: ${r.frequency.toFixed(2)}<br/>CPM: ${money.format(r.cpm)}<br/>Unique impressions / reach: ${compact(r.reach)}<br/>Spend: ${money.format(r.spend_usd ?? r.spend ?? 0)}${edits ? `<br/><span style="color:#ffb4b4">● ${edits}</span>` : ''}`;
    } },
    legend: { top: 0, right: 18, itemGap: 22, textStyle: { color: '#394150', fontWeight: 600 } },
    grid: { left: 48, right: 68, top: 48, bottom: 58 },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 18, borderColor: '#d8d4ca', fillerColor: '#0a766630' }],
    xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: '#d8d4ca' } }, axisLabel: { color: '#697386' } },
    yAxis: [{ type: 'value', name: 'Frequency / reach index', min: 0, axisLabel: { color: '#067c73' }, splitLine: { lineStyle: { color: '#ece7db', type: 'dashed' } } }, { type: 'value', name: 'CPM', axisLabel: { color: '#e09113', formatter: '${value}' }, splitLine: { show: false } }],
    series: [
      { name: 'Frequency', type: 'line', smooth: true, symbolSize: 6, data: rows.map((r) => Number(r.frequency || 0)), markLine: showUsaBaseline ? { silent: true, symbol: 'none', data: [{ yAxis: march.frequency, name: 'March freq' }], lineStyle: { color: '#067c73', type: 'dashed', opacity: 0.55 } } : undefined, markPoint: { data: groupedChangePointsForRows(rows, changes), label: { show: false }, tooltip: { formatter: (p) => `<b>${p.data.value}</b><br/>${(p.data.examples || []).join('<br/>')}` } } },
      { name: 'CPM', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 6, data: rows.map((r) => Number(r.cpm || 0)), markLine: showUsaBaseline ? { silent: true, symbol: 'none', data: [{ yAxis: march.cpm, name: 'March CPM' }], lineStyle: { color: '#e09113', type: 'dashed', opacity: 0.55 } } : undefined },
      { name: 'Unique impressions / reach index', type: 'line', smooth: true, symbolSize: 5, data: reach.map((v) => (v / maxReach) * 3), lineStyle: { width: 2 }, areaStyle: { opacity: 0.08 } },
    ],
  };
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

function businessTrendOption(rows, active) {
  const metric = businessMetricConfig(active);
  return {
    color: [metric.color],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#22121a',
      borderColor: '#22121a',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        const r = rows[params[0].dataIndex];
        return `<b>${r.date}</b><br/>${metric.label}: ${metric.formatter(Number(r[metric.key] || 0))}<br/>Revenue: ${money.format(r.revenue_usd)}<br/>Spend: ${money.format(r.spend_usd)}<br/>Items sold: ${r.units || 0}<br/>Orders: ${r.orders || 0}<br/>AOV: ${r.orders ? money.format(r.aov) : 'n/a'}<br/>CAC: ${r.orders ? money.format(r.cac) : 'n/a'}<br/>ROAS: ${r.roas ? r.roas.toFixed(2) : 'n/a'}x`;
      },
    },
    grid: { left: 54, right: 28, top: 20, bottom: 38 },
    xAxis: { type: 'category', data: rows.map((r) => r.date), axisLabel: { color: '#697386' }, axisLine: { lineStyle: { color: '#d8d4ca' } } },
    yAxis: { type: 'value', scale: true, axisLabel: { color: '#697386', formatter: (v) => active === 'roas' ? `${v}x` : active === 'cac' || active === 'aov' || active === 'spend' || active === 'revenue' ? `$${v}` : v }, splitLine: { lineStyle: { color: '#f0dce8', type: 'dashed' } } },
    series: [
      { name: metric.label, type: 'line', smooth: true, symbolSize: 7, data: rows.map((r) => Number(r[metric.key] || 0)), lineStyle: { width: 4 }, areaStyle: { opacity: 0.12 } },
    ],
  };
}

function BusinessMetricPanel({ rows, active, windowKey, setWindowKey, fxText }) {
  const metric = businessMetricConfig(active);
  const shown = windowedRows(rows, windowKey);
  const windows = [['3', '3D'], ['7', 'Week'], ['14', '2W'], ['30', 'Month'], ['all', 'All']];
  return <section className="metric-detail unfold-panel">
    <div className="metric-detail-copy">
      <b>{metric.label} trend</b>
      <span>Click a business card to unfold one clean smoothed line. Sales are Shopify sold units; AOV/CAC still use true order count.</span>
      <small>{fxText}</small>
      <div className="window-tabs">{windows.map(([key, label]) => <button type="button" key={key} className={windowKey === key ? 'active' : ''} onClick={() => setWindowKey(key)}>{label}</button>)}</div>
    </div>
    <div className="metric-detail-chart"><ReactECharts option={businessTrendOption(shown, active)} style={{ height: 260 }} /></div>
    <div className="table-wrap compact-table metric-detail-table"><table><thead><tr><th>Date</th><th>Revenue</th><th>Meta spend</th><th>Items sold</th><th>Orders</th><th>AOV</th><th>CAC</th><th>ROAS</th></tr></thead><tbody>{shown.map((r) => <tr key={r.date} className={`focus-${active}`}><td><b>{r.date}</b></td><td>{money.format(r.revenue_usd || 0)}</td><td>{money.format(r.spend_usd || 0)}</td><td>{r.units || 0}</td><td>{r.orders || 0}</td><td>{r.orders ? money.format(r.aov) : 'n/a'}</td><td>{r.orders ? money.format(r.cac) : 'n/a'}</td><td>{r.roas ? `${r.roas.toFixed(2)}x` : 'n/a'}</td></tr>)}</tbody></table></div>
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
    grid: { left: 168, right: 32, top: 20, bottom: 24 },
    xAxis: { type: 'value', name: 'Units sold', axisLabel: { color: '#697386' }, splitLine: { lineStyle: { color: '#ece7db', type: 'dashed' } } },
    yAxis: { type: 'category', data: rows.map((r) => shortLabel(r.product, 30)), axisLabel: { color: '#344054', fontWeight: 700, fontSize: 10, width: 150, overflow: 'truncate' } },
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
    grid: { left: 44, right: 56, top: 58, bottom: 92 },
    xAxis: { type: 'category', data: rows.map((r) => shortLabel(r.ad_name, 18)), axisLabel: { color: '#697386', rotate: 42, interval: 0 }, axisLine: { lineStyle: { color: '#d8d4ca' } } },
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
  return <section className="metric-card"><div className="metric-copy"><span>{title}</span><strong>{value}</strong><small>{sub}</small><em className={tone}>{deltaValue}</em></div><div className="spark"><ReactECharts option={sparkOption(rows, metric, color)} style={{ height: 72 }} /></div></section>;
}

function TrendBadge({ delta, tone }) {
  if (!delta) return null;
  const value = Number(delta.pct || 0);
  const up = value >= 0;
  const marker = value === 0 ? '→' : up ? '▲' : '▼';
  return <em className={`trend-badge ${tone || (up ? 'good' : 'bad')}`}><i>{marker}</i>{Math.abs(value).toFixed(1)}% <small>{delta.label}</small></em>;
}

function FinanceCard({ title, value, sub, tone = 'neutral', active, onClick, delta, deltaTone }) {
  return <button type="button" className={`finance-card ${tone} ${active ? 'active' : ''}`} onClick={onClick}><span>{title}</span><strong>{value}</strong><small>{sub}</small><TrendBadge delta={delta} tone={deltaTone} /></button>;
}

function SaleMonitor({ monitor, soundEnabled, onEnableSound }) {
  const sale = monitor.sale;
  const statusText = monitor.status === 'live' ? 'Live Shopify sales monitor' : monitor.status === 'checking' ? 'Checking Shopify sales' : 'Sale monitor paused';
  const items = sale?.line_items || [];
  const detail = sale ? `${sale.name} · ${saleMoney(sale)} · ${sale.item_count || 0} item${Number(sale.item_count || 0) === 1 ? '' : 's'}` : 'Waiting for the next paid order';
  const country = sale?.country?.code ? `${countryFlag(sale.country.code)} ${sale.country.name || sale.country.code}` : 'Country pending';
  const attribution = sale?.matched_ad?.ad_name || sale?.attribution_label || 'Unattributed in Shopify';
  return <section className={`sale-monitor ${monitor.fresh ? 'fresh' : ''}`}>
    <div className="sale-main">
      <span className={`sale-dot ${monitor.status === 'live' ? 'on' : ''}`} />
      <div>
        <b><BellRing size={15} />{monitor.fresh ? 'New Shopify sale' : statusText}</b>
        <small>{detail} · {country}</small>
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
  const presets = [
    ['today', 'Today', 'Latest loaded day'],
    ['yesterday', 'Yesterday', 'Previous loaded day'],
    ['last7', 'Last week', 'Rolling 7-day view'],
    ['all', 'Matched data', 'All days with Meta + Shopify'],
    ['custom', 'Date range', 'Exact start and end'],
  ];
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
        <label><span>Start</span><input type="date" min={bounds.since || undefined} max={bounds.until || undefined} value={customRange.since || ''} onInput={(event) => onCustomChange((current) => ({ ...current, since: event.currentTarget.value }))} onChange={(event) => onCustomChange((current) => ({ ...current, since: event.target.value }))} /></label>
        <label><span>End</span><input type="date" min={bounds.since || undefined} max={bounds.until || undefined} value={customRange.until || ''} onInput={(event) => onCustomChange((current) => ({ ...current, until: event.currentTarget.value }))} onChange={(event) => onCustomChange((current) => ({ ...current, until: event.target.value }))} /></label>
        <button type="button" className="apply-range" onClick={onApplyCustom}>Apply range</button>
      </div> : null}
      <p>
        Available: {bounds.since || 'n/a'} - {bounds.until || 'n/a'}
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
  { key: 'purchases', label: 'Sales' },
  { key: 'roas', label: 'ROAS' },
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
  const [adSort, setAdSort] = useState({ key: 'purchases', dir: 'desc' });
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
          <MetricChip label="Sales" value={a.purchases || 0} sortKey="purchases" sortState={adSort} onSort={toggleAdSort} />
          <MetricChip label="ROAS" value={`${Number(a.roas || 0).toFixed(2)}x`} tone={Number(a.roas || 0) >= 2 ? 'good' : 'warn'} sortKey="roas" sortState={adSort} onSort={toggleAdSort} />
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
  const [selected, setSelected] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [activeBusiness, setActiveBusiness] = useState('revenue');
  const [businessWindow, setBusinessWindow] = useState('all');
  const [datePreset, setDatePreset] = useState('today');
  const [dateRange, setDateRange] = useState({ since: '', until: '' });
  const [customRange, setCustomRange] = useState({ since: '', until: '' });
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [saleSoundEnabled, setSaleSoundEnabled] = useState(false);
  const [saleMonitor, setSaleMonitor] = useState({ status: 'checking', sale: null, checkedAt: null, fresh: false, error: '' });
  const saleAudioRef = useRef(null);
  const saleSoundEnabledRef = useRef(false);
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
    const played = await playSaleChime();
    setSaleSoundEnabled(Boolean(played));
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
        setSaleMonitor({ status: payload.configured === false ? 'not_configured' : 'live', sale, checkedAt: payload.checked_at || new Date().toISOString(), fresh: isNewSale, error: '' });
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

  const baseData = raw || fallbackData();
  const baseProductData = shopify || fallbackShopify();
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
  const data = useMemo(() => filterMetaDataByDateRange(baseData, activeDateRange), [baseData, activeDateRange]);
  const productData = useMemo(() => filterShopifyByDateRange(baseProductData, activeDateRange), [baseProductData, activeDateRange]);
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
  const selectedIds = new Set((chosen.length ? chosen : filtered).map((a) => a.adset_id));
  const selectedChanges = (data.adset_changes || []).filter((c) => selected === 'all' || selectedIds.has(c.adset_id));
  const budgetChangeCount = selectedChanges.filter((c) => c.is_budget_change).length;
  const otherChangeCount = selectedChanges.length - budgetChangeCount;
  const overall = trendRows[trendRows.length - 1] || {};
  const histRows = trendRows.slice(0, -1);
  const hist = { frequency: avg(histRows, 'frequency'), cpm: avg(histRows, 'cpm'), reach: avg(histRows, 'reach') };
  const overallDelta = { frequency: delta(overall.frequency, hist.frequency), cpm: delta(overall.cpm, hist.cpm), reach: delta(overall.reach, hist.reach) };
  const marchDelta = { frequency: delta(overall.frequency, march.frequency), cpm: delta(overall.cpm, march.cpm), reach: delta(overall.reach, march.reach) };
  const sourceLabel = data.source === 'sample-data' ? 'Sample fallback' : 'Meta API';
  const productSourceLabel = productData.source?.includes('sample') ? 'Sample Shopify' : 'Shopify';
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
    sales: businessPeriodDelta(allBusinessRows, 'units', activeDateRange),
    aov: businessPeriodDelta(allBusinessRows, 'aov', activeDateRange),
    spend: businessPeriodDelta(allBusinessRows, 'spend_usd', activeDateRange),
    cac: businessPeriodDelta(allBusinessRows, 'cac', activeDateRange),
    roas: businessPeriodDelta(allBusinessRows, 'roas', activeDateRange),
  }), [allBusinessRows, activeDateRange]);
  const campaignAttribution = useMemo(() => buildCampaignAttribution(data, productData), [data, productData]);
  const productRows = productData.products || [];
  const adRows = data.ads || [];
  const baselineCopy = march.applies ? 'March USA baseline shown because this frequency view is USA ad sets only.' : 'No March baseline on this view because it is not USA-only.';
  const fxText = fxAuditText(data);
  const adsetPerfById = useMemo(() => new Map((data.all_adsets || []).map((row) => [row.adset_id, row])), [data]);
  const countryMetaByCode = useMemo(() => new Map((data.countries || []).map((row) => [row.country_code, row])), [data]);

  return <main className="shell">
    <aside className="rail">
      <div className="brand"><img src="/assets/shawq-logo.png" alt="ShawQ" /><div><b>ShawQ</b><span>Business Monitoring</span></div></div>
      <div className="filter-block"><label>Date window</label><DateWindowControl range={activeDateRange} bounds={loadedBounds} preset={datePreset} isOpen={dateMenuOpen} customRange={customRange} onToggle={() => setDateMenuOpen((open) => !open)} onPreset={handleDatePreset} onCustomChange={setCustomRange} onApplyCustom={applyCustomDateRange} /></div>
      <div className="filter-block"><label>Campaign/ad set</label><select value={selected} onChange={(e) => setSelected(e.target.value)}><option value="all">All ad sets</option>{enriched.map((a) => <option key={a.adset_id} value={a.adset_id}>{a.adset_name}</option>)}</select></div>
      <div className="filter-block"><label>Status</label><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option>{Object.keys(statusLabels).map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></div>
      <div className="filter-block"><label>Search</label><div className="search"><Search size={15}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="ad set or campaign" /></div></div>
      <div className="method"><b>Baseline logic</b><p>Red dots mark ad set edits. Delivery compares against each ad set history. {baselineCopy} Product growth uses Shopify sold units by country and family.</p></div>
    </aside>

    <section className="content">
      <header className="topbar"><div className="headline-lockup"><img className="hero-logo" src="/assets/shawq-logo.png" alt="ShawQ" /><div><h1>ShawQ Business Monitoring</h1><p>Revenue, spend, CAC, ROAS, product demand, and delivery drift from the June 3 launch window.</p></div></div><div className="top-actions"><SaleMonitor monitor={saleMonitor} soundEnabled={saleSoundEnabled} onEnableSound={enableSaleSound} /><div className="refresh"><span>{sourceLabel}</span><small>Refreshed {data.generated_at ? new Date(data.generated_at).toLocaleString() : 'now'}</small><RefreshCw size={18}/></div></div></header>

      <section className="finance-cards top-finance">
        <FinanceCard title="Shopify revenue" value={money.format(business.revenue_usd)} sub={`${business.units} units sold`} tone={business.revenue_usd ? 'good' : 'neutral'} active={activeBusiness === 'revenue'} onClick={() => setActiveBusiness('revenue')} delta={businessDeltas.revenue} deltaTone={toneForDelta(businessDeltas.revenue.pct)} />
        <FinanceCard title="Sales" value={compact(business.units)} sub={`${business.orders} Shopify orders`} tone={business.units ? 'good' : 'neutral'} active={activeBusiness === 'sales'} onClick={() => setActiveBusiness('sales')} delta={businessDeltas.sales} deltaTone={toneForDelta(businessDeltas.sales.pct)} />
        <FinanceCard title="AOV" value={business.aov ? money.format(business.aov) : 'n/a'} sub="Shopify revenue / orders" tone={business.aov ? 'good' : 'neutral'} active={activeBusiness === 'aov'} onClick={() => setActiveBusiness('aov')} delta={businessDeltas.aov} deltaTone={toneForDelta(businessDeltas.aov.pct)} />
        <FinanceCard title="Meta spend" value={money.format(business.spend_usd)} sub="Full-account spend, converted daily" tone="warn" active={activeBusiness === 'spend'} onClick={() => setActiveBusiness('spend')} delta={businessDeltas.spend} deltaTone={toneForDelta(businessDeltas.roas.pct)} />
        <FinanceCard title="CAC" value={business.orders ? money.format(business.cac) : 'n/a'} sub="Full Meta spend / Shopify orders" tone={business.cac && business.cac < 45 ? 'good' : 'warn'} active={activeBusiness === 'cac'} onClick={() => setActiveBusiness('cac')} delta={businessDeltas.cac} deltaTone={toneForDelta(businessDeltas.cac.pct, false)} />
        <FinanceCard title="ROAS" value={business.roas ? `${business.roas.toFixed(2)}x` : 'n/a'} sub="Shopify revenue / full Meta spend" tone={business.roas >= 2 ? 'good' : business.roas >= 1 ? 'warn' : 'bad'} active={activeBusiness === 'roas'} onClick={() => setActiveBusiness('roas')} delta={businessDeltas.roas} deltaTone={toneForDelta(businessDeltas.roas.pct)} />
      </section>
      <BusinessMetricPanel rows={businessRows} active={activeBusiness} windowKey={businessWindow} setWindowKey={setBusinessWindow} fxText={fxText} />
      <DailySalesHighlights lines={productData.order_lines || []} range={activeDateRange} />

      <CampaignPerformanceTable attribution={campaignAttribution} />

      <section className="cards secondary-cards">
        <Card title="Frequency" value={(overall.frequency || 0).toFixed(2)} sub={march.applies ? `March ${Number(march.frequency || 0).toFixed(2)}` : 'No March baseline'} deltaValue={`${pct(overallDelta.frequency)} vs own history`} tone={overallDelta.frequency > 20 ? 'bad' : overallDelta.frequency > 8 ? 'warn' : 'good'} rows={trendRows} metric="frequency" color="#9a1b22" />
        <Card title="CPM" value={money.format(overall.cpm || 0)} sub={march.applies ? `March ${money.format(march.cpm || 0)}` : 'No March baseline'} deltaValue={`${pct(overallDelta.cpm)} vs own history`} tone={overallDelta.cpm > 25 ? 'bad' : overallDelta.cpm > 12 ? 'warn' : 'good'} rows={trendRows} metric="cpm" color="#c98834" />
        <Card title="Unique impressions / reach" value={compact(overall.reach || 0)} sub={march.applies ? `March ${compact(march.reach || 0)}` : 'No March baseline'} deltaValue={`${pct(overallDelta.reach)} vs own history`} tone={overallDelta.reach < -10 ? 'bad' : overallDelta.reach < -4 ? 'warn' : 'good'} rows={trendRows} metric="reach" color="#6f2a30" />
        {march.applies ? <section className="benchmark-card"><span>Vs March USA benchmark</span><div><b className={marchDelta.frequency > 20 ? 'bad' : 'warn'}>{pct(marchDelta.frequency)}</b><small>Frequency</small></div><div><b className={marchDelta.cpm > 20 ? 'bad' : 'warn'}>{pct(marchDelta.cpm)}</b><small>CPM</small></div><div><b className={marchDelta.reach < -8 ? 'bad' : 'good'}>{pct(marchDelta.reach)}</b><small>Reach</small></div></section> : <section className="benchmark-card muted-benchmark"><span>March baseline disabled</span><p>This chart is not a USA-only frequency view, so the USA March benchmark is intentionally hidden.</p></section>}
      </section>

      <section className="leadership-zone">
        <div className="panel-title product-title"><div><h2>Leadership tables</h2><p>Product sales come from Shopify. Ads leadership is one overall Meta rollup per ad across all countries; CTR is click-through/link CTR from Meta.</p></div><span>{adRows.length} ads</span></div>
        <LeadershipTables products={productRows} ads={adRows} />
      </section>

      <section className="change-strip">
        <div><b>Budget changes are the priority marker</b><span>Dark red dots = budget or bid edits. Red dots = other ad set edits.</span></div>
        <strong><i className="dot budget" /> {budgetChangeCount} budget / bid edits</strong>
        <strong><i className="dot normal" /> {otherChangeCount} other edits</strong>
      </section>

      <section className="workbench"><div className="chart-panel"><div className="panel-title"><h2>Daily delivery shape</h2><p>Dark red dots mark budget/bid changes. Dashed lines are March USA baselines.</p></div><ReactECharts option={trendOption(trendRows, march, selectedChanges)} style={{ height: 438 }} /></div><aside className="rank-panel"><div className="panel-title"><h2>Ad sets ranked</h2><p>Risk comes from rising frequency/CPM plus falling unique reach.</p></div>{filtered.slice(0, 9).map((a, i) => <div className={`rank-row ${slug(a.status)}`} key={a.adset_id}><strong>{i+1}</strong><div><b>{a.adset_name}</b><small>{a.campaign_name}</small></div><span>{statusLabels[a.status]}</span></div>)}</aside></section>

      <section className="table-panel"><div className="panel-title"><h2>Ad set decision table</h2><p>Use this before scaling: healthy delivery is rising unique reach, not just higher spend. ROAS is calculated from each ad set's own spend and purchase value.</p></div><div className="table-wrap"><table><thead><tr><th>Ad set</th><th>Campaign</th><th>Status</th><th>Sales</th><th>ROAS</th><th>Meta spend</th><th>Active days</th><th>Freq</th><th>CPM</th><th>Unique imp. / reach</th><th>Freq vs hist</th><th>CPM vs hist</th><th>Reach vs hist</th><th>Freq vs Mar</th><th>CPM vs Mar</th><th>Reach vs Mar</th><th>Action</th></tr></thead><tbody>{filtered.map((a) => { const perf = adsetPerfById.get(a.adset_id) || {}; return <tr key={a.adset_id}><td className="name-cell"><b>{a.adset_name}</b></td><td className="name-cell">{a.campaign_name}</td><td><span className={`pill ${slug(a.status)}`}>{statusLabels[a.status]}</span></td><td>{perf.purchases || 0}</td><td>{Number(perf.roas || 0).toFixed(2)}x</td><td>{money.format(perf.spend_usd || a.current.spend || 0)}</td><td>{a.activeDays}</td><td>{a.current.frequency.toFixed(2)}</td><td>{money.format(a.current.cpm)}</td><td>{compact(a.current.reach)}</td><td className={a.histDelta.frequency > 18 ? 'bad' : a.histDelta.frequency > 8 ? 'warn' : 'good'}>{pct(a.histDelta.frequency)}</td><td className={a.histDelta.cpm > 20 ? 'bad' : a.histDelta.cpm > 10 ? 'warn' : 'good'}>{pct(a.histDelta.cpm)}</td><td className={a.histDelta.reach < -10 ? 'bad' : 'good'}>{pct(a.histDelta.reach)}</td><td>{pct(a.marchDelta.frequency)}</td><td>{pct(a.marchDelta.cpm)}</td><td>{pct(a.marchDelta.reach)}</td><td className="name-cell"><b>{a.recommendation}</b></td></tr>; })}</tbody></table></div></section>

      <section className="product-zone">
        <div className="panel-title product-title"><div><h2>Product demand after launch</h2><p>{productSourceLabel} sold-unit view for {productData.period?.since} - {productData.period?.until}. Lines are cumulative monthly sold units by product family.</p></div><span>{(productData.families || []).reduce((a, f) => a + Number(f.units || 0), 0)} merch units</span></div>
        <ProductTotals families={productData.families || []} />
        <OverallProducts products={productData.products || []} />
        <section className="product-grid"><div className="growth-card"><div className="panel-title"><h2>Developing growth chart</h2><p>Each line is one product family. Similar apparel categories use different color + stroke + marker shapes to stay readable.</p></div><ReactECharts option={productGrowthOption(productData)} style={{ height: 390 }} /></div><div className="country-card country-roas-card"><div className="panel-title"><h2>Country sales + ROAS</h2><p>ROAS here is Shopify country revenue divided by Meta country spend. No Meta-only purchase value is used.</p></div><div className="country-list">{(productData.countries || []).map((c) => { const entries = Object.entries(c.mix || {}).sort((a,b)=>b[1]-a[1]); const metaCountry = countryMetaByCode.get(c.country_code); const countryRoas = shopifyCountryRoas(c, metaCountry); return <div className="country-row" key={c.country_code}><div className="country-head"><b><span className="flag">{countryFlag(c.country_code)}</span>{c.country}</b><span className="country-roas-number">{countryRoas.toFixed(2)}x ROAS</span></div><div className="country-metrics"><span>{c.units} units</span><span>{money.format(c.revenue_usd || 0)} Shopify</span><span>{money.format(metaCountry?.spend_usd || 0)} Meta spend</span><span>{c.unique_products} products</span></div><MixBars mix={c.mix} total={c.units} subtypes={c.subtypes || {}} /><div className="mix-labels">{entries.slice(0, 6).map(([f,u]) => <small key={f} title={mixTooltip(f, u, c.units, c.subtypes || {})}><i style={{ background: familyStyle[f]?.color || familyStyle.Other.color }} />{f} {c.units ? Math.round((u / c.units) * 100) : 0}%</small>)}</div></div>; })}</div></div></section>
      </section>
    </section>
  </main>;
}

export default App;
