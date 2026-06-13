import fs from 'node:fs';
import path from 'node:path';
import { productTaxonomyForName } from '../src/lib/productMapping.js';

const envPaths = [
  process.env.ENV_FILE,
  path.resolve('.env'),
].filter(Boolean);
for (const envPath of envPaths) {
  if (!fs.existsSync(envPath)) continue;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [k, ...rest] = line.replace(/^export\s+/, '').split('=');
    if (!process.env[k]) process.env[k] = rest.join('=').replace(/^['"]|['"]$/g, '');
  }
}

const token = process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN;
const store = process.env.SHAWQ_SHOPIFY_STORE || process.env.SHOPIFY_STORE || 'f3e7e9-2.myshopify.com';
const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';
const requestedSince = process.env.SHOPIFY_SINCE || process.env.SINCE || process.env.BACKFILL_START_DATE || '2026-06-03';
const requestedUntil = process.env.SHOPIFY_UNTIL || process.env.UNTIL || '';
if (!token || !store) {
  console.error('Missing SHAWQ_SHOPIFY_ACCESS_TOKEN or SHAWQ_SHOPIFY_STORE.');
  process.exit(1);
}

const fields = 'id,name,created_at,cancelled_at,financial_status,current_total_price,total_price,total_tip_received,current_total_tip_received,currency,presentment_currency,shipping_address,billing_address,line_items,refunds,landing_site,landing_site_ref,referring_site,source_name,source_identifier,note_attributes,tags';

function dateInTimezone(date = new Date(), timeZone = 'UTC') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function zonedDateTimeToUtcIso(date, timeZone, endOfDay = false) {
  const [year, month, day] = String(date || '').split('-').map(Number);
  const hour = endOfDay ? 23 : 0;
  const minute = endOfDay ? 59 : 0;
  const second = endOfDay ? 59 : 0;
  const millisecond = endOfDay ? 999 : 0;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter
    .formatToParts(new Date(utcGuess))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, millisecond);
  return new Date(utcGuess - (zonedAsUtc - utcGuess)).toISOString();
}

async function getShopMetadata() {
  const url = new URL(`https://${store}/admin/api/${apiVersion}/shop.json`);
  url.searchParams.set('fields', 'name,currency,iana_timezone,timezone');
  try {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    const text = await res.text();
    if (!res.ok) throw new Error(text.slice(0, 400));
    return JSON.parse(text).shop || {};
  } catch (error) {
    console.warn(`Could not fetch Shopify shop metadata: ${error.message}`);
    return { currency: 'USD', iana_timezone: 'Europe/Istanbul' };
  }
}

async function getProductImages(productIds = []) {
  const out = new Map();
  for (const productId of productIds) {
    const url = new URL(`https://${store}/admin/api/${apiVersion}/products/${productId}.json`);
    url.searchParams.set('fields', 'id,title,handle,image');
    try {
      const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
      const text = await res.text();
      if (!res.ok) continue;
      const product = JSON.parse(text).product || {};
      out.set(String(productId), {
        product_id: String(productId),
        title: product.title || '',
        handle: product.handle || '',
        image_url: product.image?.src || '',
      });
    } catch {}
  }
  return out;
}

const shopMetadata = await getShopMetadata();
const reportingTimezone = process.env.SHAWQ_SHOPIFY_REPORTING_TIMEZONE
  || process.env.SHOPIFY_REPORTING_TIMEZONE
  || shopMetadata.iana_timezone
  || 'Europe/Istanbul';
const since = requestedSince;
const currentReportingDay = dateInTimezone(new Date(), reportingTimezone);
const latestCompletedDay = shiftDate(currentReportingDay, -1);
const until = requestedUntil || currentReportingDay;
const startIso = zonedDateTimeToUtcIso(since, reportingTimezone, false);
const endIso = zonedDateTimeToUtcIso(until, reportingTimezone, true);

async function getOrdersBetween(startDate = since, endDate = until) {
  const rows = [];
  let url = new URL(`https://${store}/admin/api/${apiVersion}/orders.json`);
  url.searchParams.set('status', 'any');
  url.searchParams.set('limit', '250');
  url.searchParams.set('created_at_min', zonedDateTimeToUtcIso(startDate, reportingTimezone, false));
  url.searchParams.set('created_at_max', zonedDateTimeToUtcIso(endDate, reportingTimezone, true));
  url.searchParams.set('order', 'created_at asc');
  url.searchParams.set('fields', fields);
  while (url) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${text.slice(0, 1000)}`);
    const data = JSON.parse(text);
    rows.push(...(data.orders || []));
    const link = res.headers.get('link') || '';
    const next = link.split(',').find((part) => part.includes('rel="next"'));
    url = next ? new URL(next.slice(next.indexOf('<') + 1, next.indexOf('>'))) : null;
  }
  return rows;
}

async function getOrders() {
  return getOrdersBetween(since, until);
}

function taxonomyFor(title) {
  const taxonomy = productTaxonomyForName(title);
  if (!taxonomy.family) return taxonomy;
  if (taxonomy.family === 'unknown_product') return { family: 'Other', subtype: 'Other' };
  return taxonomy;
}
function countryFor(order) {
  const a = order.shipping_address || order.billing_address || {};
  return { code: a.country_code || a.country || 'UNKNOWN', name: a.country || a.country_code || 'Unknown' };
}
function dayFor(order) {
  const d = new Date(order.created_at || Date.now());
  return dateInTimezone(d, reportingTimezone);
}

function orderTipAmount(order = {}) {
  return Math.max(
    0,
    Number(order.total_tip_received || 0),
    Number(order.current_total_tip_received || 0),
  );
}

function queryParamsFromMaybeUrl(value = '') {
  const text = String(value || '');
  const query = text.includes('?') ? text.slice(text.indexOf('?') + 1) : text;
  const params = new URLSearchParams(query);
  return Object.fromEntries([...params.entries()].filter(([key]) => /^(utm_|campaign_|campaign$|ad_|ad$|adset_|adset$|placement|creative|attributes\[(ad|ad-id|campaign|campaign-id|adset|adset-id)\])/i.test(key)));
}

function compactObject(obj = {}) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && String(value) !== ''));
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || '';
}

function publicNoteAttributes(noteAttributes = {}) {
  const allowed = /^(utm_(source|medium|campaign|content|term)(_(first|last))?|campaign(_name|_id)?|adset(_name|_id)?|ad_set_name|ad(_name|_id)?|source|medium|content|term|placement|creative|channel)$/i;
  return Object.fromEntries(Object.entries(noteAttributes).filter(([key]) => allowed.test(key)));
}

function pathOnly(value = '') {
  return String(value || '').split('?')[0].slice(0, 220);
}

function hostOnly(value = '') {
  try {
    return value ? new URL(value, 'https://shawq.co').hostname : '';
  } catch {
    return '';
  }
}

function attributionFor(order) {
  const noteAttributes = {};
  for (const attr of order.note_attributes || []) if (attr?.name) noteAttributes[attr.name] = attr.value;
  const lowerNote = Object.fromEntries(Object.entries(noteAttributes).map(([key, value]) => [key.toLowerCase(), value]));
  const landingParams = queryParamsFromMaybeUrl(order.landing_site || order.landing_site_ref || '');
  const referrerParams = queryParamsFromMaybeUrl(order.referring_site || '');
  const noteLandingLast = queryParamsFromMaybeUrl(lowerNote.landing_page_last || lowerNote.landing_page || '');
  const noteLandingFirst = queryParamsFromMaybeUrl(lowerNote.landing_page_first || '');
  const params = compactObject({
    ...noteLandingFirst,
    ...landingParams,
    ...referrerParams,
    ...noteLandingLast,
  });
  const campaignHint = firstPresent(
    lowerNote.utm_campaign_last,
    params.utm_campaign,
    lowerNote.utm_campaign,
    lowerNote.campaign_name,
    lowerNote.campaign,
    params.campaign_id,
    params.campaign
  );
  const adsetHint = firstPresent(
    lowerNote.utm_term_last,
    params.utm_term,
    lowerNote.utm_term,
    lowerNote.adset_name,
    lowerNote.ad_set_name,
    lowerNote.adset,
    params.adset_id,
    params.adset,
    params['attributes[adset-id]']
  );
  const adHint = firstPresent(
    lowerNote.utm_content_last,
    params.utm_content,
    lowerNote.utm_content,
    lowerNote.ad_name,
    lowerNote.ad_id,
    lowerNote.ad,
    params.ad_id,
    params.ad,
    params['attributes[ad-id]']
  );
  return {
    source_name: order.source_name || '',
    landing_path: pathOnly(order.landing_site || order.landing_site_ref || ''),
    referrer_host: hostOnly(order.referring_site || ''),
    utm: params,
    note_attributes: publicNoteAttributes(noteAttributes),
    campaign_hint: campaignHint,
    adset_hint: adsetHint,
    ad_hint: adHint,
    match_hints: {
      campaign_id: params.campaign_id || lowerNote.campaign_id || '',
      adset_id: params.adset_id || lowerNote.adset_id || '',
      ad_id: params.ad_id || lowerNote.ad_id || '',
      campaign_name: campaignHint,
      adset_name: adsetHint,
      ad_name: adHint,
    },
  };
}

function lowerKeyLookup(obj = {}, ...keys) {
  const lower = {};
  for (const [key, value] of Object.entries(obj || {})) lower[key.toLowerCase()] = value;
  for (const key of keys) {
    const value = lower[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
  }
  return '';
}

// utm_medium=email marks an email-marketing order (Klaviyo, Shopify Email, …),
// tagged so the dashboard can split it out of the paid-ads "top movers" view.
function isEmailAttribution(attribution = {}) {
  const medium = String(
    lowerKeyLookup(attribution.utm || {}, 'utm_medium', 'utm_medium_last', 'utm_medium_first', 'medium')
      || lowerKeyLookup(attribution.note_attributes || {}, 'utm_medium', 'utm_medium_last', 'utm_medium_first', 'medium'),
  ).trim().toLowerCase();
  return medium === 'email';
}

const orders = await getOrders();
const includeStatus = new Set(['paid', 'partially_paid', 'partially_refunded']);
const included = orders.filter((o) => !o.cancelled_at && includeStatus.has(o.financial_status));
const productIds = [...new Set(included.flatMap((order) => (order.line_items || [])
  .map((line) => String(line.product_id || ''))
  .filter(Boolean)))];
const productImages = await getProductImages(productIds);
const refunded = new Map();
for (const o of included) {
  for (const ref of o.refunds || []) {
    for (const rli of ref.refund_line_items || []) {
      if (rli.line_item_id) refunded.set(`${o.id}:${rli.line_item_id}`, (refunded.get(`${o.id}:${rli.line_item_id}`) || 0) + Number(rli.quantity || 0));
    }
  }
}

function refundQuantityForLine(order, lineItemId) {
  let total = 0;
  for (const ref of order.refunds || []) {
    for (const rli of ref.refund_line_items || []) {
      if (String(rli.line_item_id || '') === String(lineItemId || '')) total += Number(rli.quantity || 0);
    }
  }
  return total;
}

function normalizeMatchText(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function campaignMatches(attribution, patterns = []) {
  const fields = [
    attribution?.campaign_hint,
    attribution?.match_hints?.campaign_name,
    attribution?.utm?.utm_campaign,
    attribution?.note_attributes?.utm_campaign,
    attribution?.note_attributes?.utm_campaign_first,
    attribution?.note_attributes?.utm_campaign_last,
    attribution?.note_attributes?.campaign,
    attribution?.note_attributes?.campaign_name,
  ].map(normalizeMatchText).filter(Boolean);
  const needles = patterns.map(normalizeMatchText).filter(Boolean);
  return needles.some((needle) => fields.some((field) => field === needle || field.includes(needle) || needle.includes(field)));
}

function emptyComparisonDay(date) {
  return {
    date,
    orders: 0,
    units: 0,
    revenue_usd: 0,
    matched_orders: 0,
    country_orders: 0,
    country_units: 0,
    country_revenue_usd: 0,
    unmatched_country_orders: 0,
  };
}

async function shopifyComparisonPeriod(config) {
  const windowUntil = config.completed_until || config.requested_until || until;
  const dates = [];
  for (let d = new Date(`${config.requested_since}T00:00:00Z`); d <= new Date(`${windowUntil}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  const byDate = new Map(dates.map((date) => [date, emptyComparisonDay(date)]));
  const rows = await getOrdersBetween(config.requested_since, windowUntil);
  const includedRows = rows.filter((o) => !o.cancelled_at && includeStatus.has(o.financial_status));
  for (const order of includedRows) {
    const orderDate = dayFor(order);
    if (!byDate.has(orderDate)) continue;
    const country = countryFor(order);
    if (config.country_code && country.code !== config.country_code) continue;
    const day = byDate.get(orderDate);
    const orderRevenue = Number(order.current_total_price || order.total_price || 0);
    const orderUnits = (order.line_items || []).reduce((total, li) => {
      const qty = Number(li.quantity || 0);
      const refundQty = refundQuantityForLine(order, li.id);
      return total + Math.max(0, qty - refundQty);
    }, 0);
    day.country_orders += 1;
    day.country_units += orderUnits;
    day.country_revenue_usd += orderRevenue;
    const attribution = attributionFor(order);
    if (!campaignMatches(attribution, config.campaign_patterns || [])) {
      day.unmatched_country_orders += 1;
      continue;
    }
    day.orders += 1;
    day.matched_orders += 1;
    day.revenue_usd += orderRevenue;
    day.units += orderUnits;
  }
  const outputRows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    ...config,
    requested_until: config.requested_until || windowUntil,
    completed_until: windowUntil,
    rows: outputRows,
    totals: {
      orders: outputRows.reduce((a, row) => a + Number(row.orders || 0), 0),
      units: outputRows.reduce((a, row) => a + Number(row.units || 0), 0),
      revenue_usd: outputRows.reduce((a, row) => a + Number(row.revenue_usd || 0), 0),
      country_orders: outputRows.reduce((a, row) => a + Number(row.country_orders || 0), 0),
      country_units: outputRows.reduce((a, row) => a + Number(row.country_units || 0), 0),
      country_revenue_usd: outputRows.reduce((a, row) => a + Number(row.country_revenue_usd || 0), 0),
      unmatched_country_orders: outputRows.reduce((a, row) => a + Number(row.unmatched_country_orders || 0), 0),
    },
  };
}

async function buildShopifyDeliveryComparison() {
  const currentComparisonUntil = requestedUntil && requestedUntil < currentReportingDay ? requestedUntil : latestCompletedDay;
  const configs = {
    historical: {
      label: 'Testing_USA_ABO',
      country_code: 'US',
      country: 'United States',
      requested_since: '2026-02-23',
      requested_until: '2026-04-12',
      completed_until: '2026-04-12',
      campaign_patterns: ['Testing_USA_ABO', 'Testing USA ABO'],
    },
    current: {
      label: 'USA_CBO launch',
      country_code: 'US',
      country: 'United States',
      requested_since: process.env.USA_LAUNCH_START || '2026-06-06',
      requested_until: until,
      completed_until: currentComparisonUntil,
      campaign_patterns: ['USA_CBO', 'USA CBO'],
    },
  };
  try {
    const [historical, current] = await Promise.all([
      shopifyComparisonPeriod(configs.historical),
      shopifyComparisonPeriod(configs.current),
    ]);
    return {
      ok: true,
      source: 'Shopify',
      metric_note: 'Sales are Shopify paid orders matched to US country and campaign UTM/name. Current campaign rows stop at the latest completed Shopify reporting day.',
      country_code: 'US',
      country: 'United States',
      historical,
      current,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      source: 'Shopify',
      country_code: 'US',
      country: 'United States',
      historical: { ...configs.historical, rows: [], totals: {} },
      current: { ...configs.current, rows: [], totals: {} },
    };
  }
}

const familyTotals = new Map();
const countryRows = new Map();
const productTotals = new Map();
const cumulativeByDayFamily = new Map();
const dailyByDate = new Map();
const orderLines = [];
const tipOrders = new Set();
const tipsByDate = new Map();
const allDates = [];
for (let d = new Date(`${since}T00:00:00Z`); d <= new Date(`${until}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) allDates.push(d.toISOString().slice(0, 10));
for (const date of allDates) {
  cumulativeByDayFamily.set(date, {});
  dailyByDate.set(date, { date, revenue_usd: 0, orders: 0, units: 0 });
}

for (const order of included) {
  const orderDate = dayFor(order);
  const orderRevenue = Number(order.current_total_price || order.total_price || 0);
  const orderTip = orderTipAmount(order);
  const merchandiseRevenue = Math.max(0, orderRevenue - orderTip);
  if (orderTip > 0) {
    tipOrders.add(String(order.id || order.name || `${orderDate}:${orderTip}`));
    const tipRow = tipsByDate.get(orderDate) || { date: orderDate, orders: 0, total_usd: 0 };
    tipRow.orders += 1;
    tipRow.total_usd += orderTip;
    tipsByDate.set(orderDate, tipRow);
  }
  const dailyOrder = dailyByDate.get(orderDate) || { date: orderDate, revenue_usd: 0, orders: 0, units: 0 };
  dailyOrder.orders += 1;
  dailyOrder.revenue_usd += orderRevenue;
  dailyByDate.set(orderDate, dailyOrder);
  const c = countryFor(order);
  const attribution = attributionFor(order);
  const orderChannel = isEmailAttribution(attribution) ? 'email' : '';
  if (!countryRows.has(c.code)) countryRows.set(c.code, { country_code: c.code, country: c.name, units: 0, revenue_usd: 0, unique_products_set: new Set(), mix: {}, subtypes: {} });
  const cRow = countryRows.get(c.code);
  const lineEntries = [];
  for (const li of order.line_items || []) {
    const { family, subtype } = taxonomyFor(li.title);
    if (!family) continue;
    const qty = Number(li.quantity || 0);
    const refundQty = refunded.get(`${order.id}:${li.id}`) || 0;
    const net = Math.max(0, qty - refundQty);
    if (!net) continue;
    const lineSubtotal = Number(li.price || 0) * net;
    const imageMeta = productImages.get(String(li.product_id || '')) || {};
    lineEntries.push({ li, family, subtype, net, lineSubtotal, imageMeta });
  }
  const merchandiseSubtotal = lineEntries.reduce((total, entry) => total + entry.lineSubtotal, 0);
  lineEntries.forEach((entry, index) => {
    const { li, family, subtype, net, lineSubtotal, imageMeta } = entry;
    const date = orderDate;
    const dailyUnit = dailyByDate.get(date) || { date, revenue_usd: 0, orders: 0, units: 0 };
    dailyUnit.units += net;
    dailyByDate.set(date, dailyUnit);
    const lineRevenue = merchandiseSubtotal
      ? merchandiseRevenue * (lineSubtotal / merchandiseSubtotal)
      : merchandiseRevenue / Math.max(1, lineEntries.length);
    orderLines.push({
      order_id: String(order.id || ''),
      order_name: order.name || '',
      date: orderDate,
      created_at: order.created_at || '',
      country_code: c.code,
      country: c.name,
      product: li.title || '',
      product_id: String(li.product_id || ''),
      variant_id: String(li.variant_id || ''),
      image_url: imageMeta.image_url || '',
      quantity: net,
      line_item_subtotal_usd: lineSubtotal,
      order_revenue_usd: orderRevenue,
      line_revenue_usd: lineRevenue,
      family,
      subtype,
      attribution,
      channel: orderChannel,
    });
    const familyRow = familyTotals.get(family) || { family, units: 0, revenue_usd: 0 };
    familyRow.units += net;
    familyRow.revenue_usd += lineRevenue;
    familyTotals.set(family, familyRow);
    const productRow = productTotals.get(li.title) || { product: li.title, units: 0, revenue_usd: 0, family, subtype, image_url: imageMeta.image_url || '' };
    if (!productRow.image_url && imageMeta.image_url) productRow.image_url = imageMeta.image_url;
    productRow.units += net;
    productRow.revenue_usd += lineRevenue;
    productTotals.set(li.title, productRow);
    cRow.units += net;
    cRow.revenue_usd += lineRevenue;
    cRow.unique_products_set.add(li.title);
    cRow.mix[family] = (cRow.mix[family] || 0) + net;
    cRow.subtypes[family] = cRow.subtypes[family] || {};
    cRow.subtypes[family][subtype || family] = (cRow.subtypes[family][subtype || family] || 0) + net;
    const day = cumulativeByDayFamily.get(date) || {};
    day[family] = (day[family] || 0) + net;
    cumulativeByDayFamily.set(date, day);
  });
}

const families = [...familyTotals.values()].sort((a, b) => b.units - a.units);
const familyNames = families.map((f) => f.family);
let running = Object.fromEntries(familyNames.map((f) => [f, 0]));
const cumulative = allDates.map((date) => {
  const day = cumulativeByDayFamily.get(date) || {};
  running = { ...running };
  for (const family of familyNames) running[family] += Number(day[family] || 0);
  return { date, ...running };
});
const countries = [...countryRows.values()].map((r) => ({ ...r, unique_products: r.unique_products_set.size, unique_products_set: undefined })).sort((a, b) => b.units - a.units);
const products = [...productTotals.values()].sort((a, b) => b.units - a.units);
const daily = [...dailyByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
const tipRows = [...tipsByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
const deliveryComparison = await buildShopifyDeliveryComparison();
const out = {
  source: 'Shopify',
  generated_at: new Date().toISOString(),
  period: {
    since,
    until,
    completed_until: until < currentReportingDay ? until : latestCompletedDay,
    current_reporting_day: currentReportingDay,
    includes_developing_day: until >= currentReportingDay,
    timezone: reportingTimezone,
    shop_timezone: shopMetadata.iana_timezone || '',
    shop_timezone_label: shopMetadata.timezone || '',
    currency: shopMetadata.currency || 'USD',
    api_window: { created_at_min: startIso, created_at_max: endIso },
  },
  orders: { pulled: orders.length, included: included.length },
  tips: {
    orders: tipOrders.size,
    people: tipOrders.size,
    total_usd: tipRows.reduce((total, row) => total + Number(row.total_usd || 0), 0),
    by_date: tipRows,
  },
  daily,
  families,
  products,
  countries,
  cumulative,
  order_lines: orderLines,
  delivery_comparison: deliveryComparison,
};
const outPath = path.resolve('public/data/shopify-products.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${families.reduce((a, f) => a + f.units, 0)} merch units to ${outPath}`);
console.log(`Countries: ${countries.length}; families: ${families.map((f) => `${f.family}=${f.units}`).join(', ')}`);
