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
const since = process.env.SHOPIFY_SINCE || process.env.SINCE || process.env.BACKFILL_START_DATE || '2026-06-03';
const until = process.env.SHOPIFY_UNTIL || process.env.UNTIL || new Date().toISOString().slice(0, 10);
if (!token || !store) {
  console.error('Missing SHAWQ_SHOPIFY_ACCESS_TOKEN or SHAWQ_SHOPIFY_STORE.');
  process.exit(1);
}

const startIso = `${since}T00:00:00+03:00`;
const endIso = `${until}T23:59:59+03:00`;
const fields = 'id,name,created_at,cancelled_at,financial_status,current_total_price,total_price,currency,presentment_currency,shipping_address,billing_address,line_items,refunds,landing_site,landing_site_ref,referring_site,source_name,source_identifier,note_attributes,tags';

async function getOrders() {
  const rows = [];
  let url = new URL(`https://${store}/admin/api/${apiVersion}/orders.json`);
  url.searchParams.set('status', 'any');
  url.searchParams.set('limit', '250');
  url.searchParams.set('created_at_min', startIso);
  url.searchParams.set('created_at_max', endIso);
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
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
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

const orders = await getOrders();
const includeStatus = new Set(['paid', 'partially_paid', 'partially_refunded']);
const included = orders.filter((o) => !o.cancelled_at && includeStatus.has(o.financial_status));
const refunded = new Map();
for (const o of included) {
  for (const ref of o.refunds || []) {
    for (const rli of ref.refund_line_items || []) {
      if (rli.line_item_id) refunded.set(`${o.id}:${rli.line_item_id}`, (refunded.get(`${o.id}:${rli.line_item_id}`) || 0) + Number(rli.quantity || 0));
    }
  }
}

const familyTotals = new Map();
const countryRows = new Map();
const productTotals = new Map();
const cumulativeByDayFamily = new Map();
const dailyByDate = new Map();
const orderLines = [];
const allDates = [];
for (let d = new Date(`${since}T00:00:00Z`); d <= new Date(`${until}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) allDates.push(d.toISOString().slice(0, 10));
for (const date of allDates) {
  cumulativeByDayFamily.set(date, {});
  dailyByDate.set(date, { date, revenue_usd: 0, orders: 0, units: 0 });
}

for (const order of included) {
  const orderDate = dayFor(order);
  const dailyOrder = dailyByDate.get(orderDate) || { date: orderDate, revenue_usd: 0, orders: 0, units: 0 };
  dailyOrder.orders += 1;
  dailyOrder.revenue_usd += Number(order.current_total_price || order.total_price || 0);
  dailyByDate.set(orderDate, dailyOrder);
  const c = countryFor(order);
  const attribution = attributionFor(order);
  if (!countryRows.has(c.code)) countryRows.set(c.code, { country_code: c.code, country: c.name, units: 0, unique_products_set: new Set(), mix: {}, subtypes: {} });
  const cRow = countryRows.get(c.code);
  for (const li of order.line_items || []) {
    const { family, subtype } = taxonomyFor(li.title);
    if (!family) continue;
    const qty = Number(li.quantity || 0);
    const refundQty = refunded.get(`${order.id}:${li.id}`) || 0;
    const net = Math.max(0, qty - refundQty);
    if (!net) continue;
    const date = orderDate;
    const dailyUnit = dailyByDate.get(date) || { date, revenue_usd: 0, orders: 0, units: 0 };
    dailyUnit.units += net;
    dailyByDate.set(date, dailyUnit);
    const lineRevenue = Number(li.price || 0) * net;
    orderLines.push({
      order_id: String(order.id || ''),
      order_name: order.name || '',
      date: orderDate,
      created_at: order.created_at || '',
      country_code: c.code,
      country: c.name,
      product: li.title || '',
      quantity: net,
      line_revenue_usd: lineRevenue,
      family,
      subtype,
      attribution,
    });
    const familyRow = familyTotals.get(family) || { family, units: 0, revenue_usd: 0 };
    familyRow.units += net;
    familyRow.revenue_usd += lineRevenue;
    familyTotals.set(family, familyRow);
    const productRow = productTotals.get(li.title) || { product: li.title, units: 0, revenue_usd: 0, family, subtype };
    productRow.units += net;
    productRow.revenue_usd += lineRevenue;
    productTotals.set(li.title, productRow);
    cRow.units += net;
    cRow.unique_products_set.add(li.title);
    cRow.mix[family] = (cRow.mix[family] || 0) + net;
    cRow.subtypes[family] = cRow.subtypes[family] || {};
    cRow.subtypes[family][subtype || family] = (cRow.subtypes[family][subtype || family] || 0) + net;
    const day = cumulativeByDayFamily.get(date) || {};
    day[family] = (day[family] || 0) + net;
    cumulativeByDayFamily.set(date, day);
  }
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
const out = { source: 'Shopify', generated_at: new Date().toISOString(), period: { since, until, timezone: 'Europe/Istanbul', currency: 'USD' }, orders: { pulled: orders.length, included: included.length }, daily, families, products, countries, cumulative, order_lines: orderLines };
const outPath = path.resolve('public/data/shopify-products.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${families.reduce((a, f) => a + f.units, 0)} merch units to ${outPath}`);
console.log(`Countries: ${countries.length}; families: ${families.map((f) => `${f.family}=${f.units}`).join(', ')}`);
