import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildCustomerSpendingPowerAnalysis } from '../src/lib/customerSpendingPower.js';
import { loadUsAcsReference } from './lib/us-acs-reference.mjs';

const envPaths = [process.env.ENV_FILE, path.resolve('.env')].filter(Boolean);
for (const envPath of envPaths) {
  if (!fs.existsSync(envPath)) continue;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.replace(/^export\s+/, '').split('=');
    if (!process.env[key]) process.env[key] = rest.join('=').replace(/^['"]|['"]$/g, '');
  }
}

const token = process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN;
const store = process.env.SHAWQ_SHOPIFY_STORE || process.env.SHOPIFY_STORE || 'f3e7e9-2.myshopify.com';
const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';
const outPath = path.resolve('public/data/shopify-products.json');
const reportingTimezone = process.env.SHAWQ_SHOPIFY_REPORTING_TIMEZONE
  || process.env.SHOPIFY_REPORTING_TIMEZONE
  || 'Europe/Istanbul';
const dataDir = process.env.DATA_DIR
  || (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'shawq-data')
    : path.resolve('data'));
const ACS_VINTAGE = process.env.SHAWQ_AFFLUENCE_ACS_VINTAGE || '2024';
const ACS_PUBLIC_URL = `https://www.census.gov/data/developers/data-sets/acs-5year/${ACS_VINTAGE}.html`;
const censusApiKey = process.env.SHAWQ_CENSUS_API_KEY || process.env.CENSUS_API_KEY || '';
const censusCachePath = path.join(dataDir, `customer-spending-power-us-acs-${ACS_VINTAGE}.json`);
const analysisCachePath = path.join(dataDir, 'customer-spending-power-analysis.json');
const refreshHoursRaw = Number(process.env.SHAWQ_SPENDING_POWER_REFRESH_HOURS || 24);
const analysisRefreshMs = Number.isFinite(refreshHoursRaw) && refreshHoursRaw > 0
  ? refreshHoursRaw * 60 * 60 * 1000
  : 24 * 60 * 60 * 1000;
const forceRefresh = process.env.SHAWQ_SPENDING_POWER_FORCE === 'true';
const customerHashSecret = process.env.SHAWQ_CUSTOMER_HASH_SECRET || token || '';

function dateInTimezone(date = new Date(), timeZone = reportingTimezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
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

async function shopMetadata() {
  const url = new URL(`https://${store}/admin/api/${apiVersion}/shop.json`);
  url.searchParams.set('fields', 'name,currency,created_at,iana_timezone,timezone');
  const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify shop metadata ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text).shop || {};
}

async function accessScopes() {
  const url = new URL(`https://${store}/admin/oauth/access_scopes.json`);
  try {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!res.ok) return null;
    const payload = await res.json();
    return new Set((payload.access_scopes || []).map((scope) => String(scope.handle || '')));
  } catch {
    return null;
  }
}

function addressFor(order = {}) {
  const shipping = order.shipping_address;
  const billing = order.billing_address;
  return shipping && (shipping.country_code || shipping.country || shipping.zip)
    ? shipping
    : (billing || shipping || {});
}

function normalizeUsPostal(value = '') {
  const match = String(value || '').trim().match(/^(\d{5})/);
  return match?.[1] || '';
}

function normalizePostal(value = '', countryCode = '') {
  return countryCode === 'US'
    ? normalizeUsPostal(value)
    : String(value || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 24);
}

function normalizeIdentityPart(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function guestAddressIdentity(address = {}) {
  return [
    address.country_code || address.country,
    address.province_code || address.province,
    address.city,
    address.zip,
    address.address1,
    address.address2,
  ].map(normalizeIdentityPart).filter(Boolean).join('|');
}

function customerKeyFor(order = {}, address = {}) {
  const shopifyId = String(order.customer?.id || '').trim();
  if (shopifyId) return { key: `shopify:${shopifyId}`, basis: 'shopify_customer' };
  const identity = guestAddressIdentity(address);
  if (!identity || !customerHashSecret) return { key: '', basis: 'unidentified' };
  const digest = crypto.createHmac('sha256', customerHashSecret).update(identity).digest('hex');
  return { key: `guest:${digest}`, basis: 'address_hmac' };
}

function orderRevenue(order = {}) {
  return Math.max(0, Number(order.current_total_price || order.total_price || 0));
}

async function getLifetimeOrders(since, until) {
  const rows = [];
  let url = new URL(`https://${store}/admin/api/${apiVersion}/orders.json`);
  url.searchParams.set('status', 'any');
  url.searchParams.set('limit', '250');
  url.searchParams.set('created_at_min', zonedDateTimeToUtcIso(since, reportingTimezone, false));
  url.searchParams.set('created_at_max', zonedDateTimeToUtcIso(until, reportingTimezone, true));
  url.searchParams.set('order', 'created_at asc');
  url.searchParams.set('fields', 'id,created_at,cancelled_at,financial_status,current_total_price,total_price,currency,presentment_currency,shipping_address,billing_address,customer');

  while (url) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Shopify lifetime orders ${res.status}: ${text.slice(0, 1000)}`);
    const payload = JSON.parse(text);
    rows.push(...(payload.orders || []));
    const link = res.headers.get('link') || '';
    const next = link.split(',').find((part) => part.includes('rel="next"'));
    url = next ? new URL(next.slice(next.indexOf('<') + 1, next.indexOf('>'))) : null;
  }
  return rows;
}

async function loadUsReference() {
  const result = await loadUsAcsReference({
    vintage: ACS_VINTAGE,
    cachePath: censusCachePath,
    apiKey: censusApiKey,
  });
  return result.rows;
}

function readAnalysisCache() {
  try {
    const cached = JSON.parse(fs.readFileSync(analysisCachePath, 'utf8'));
    return cached?.methodology?.name === 'Customer Spending Power' ? cached : null;
  } catch {
    return null;
  }
}

function cacheIsFresh(analysis) {
  const generatedAt = Date.parse(analysis?.generated_at || '');
  return Number.isFinite(generatedAt) && Date.now() - generatedAt < analysisRefreshMs;
}

function writeAnalysisCache(analysis) {
  fs.mkdirSync(path.dirname(analysisCachePath), { recursive: true });
  fs.writeFileSync(analysisCachePath, JSON.stringify(analysis, null, 2));
}

function attachAnalysis(analysis) {
  if (!fs.existsSync(outPath)) throw new Error(`Missing ${outPath}; run the Shopify fetch first.`);
  const current = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  current.customer_spending_power = analysis;
  fs.writeFileSync(outPath, JSON.stringify(current, null, 2));
}

function attachUnavailable(error, fallback = null) {
  if (!fs.existsSync(outPath)) return;
  try {
    const current = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    current.customer_spending_power = fallback
      ? {
          ...fallback,
          stale: true,
          refresh_error: error.message,
          methodology: {
            ...(fallback.methodology || {}),
            note: `${fallback.methodology?.note || ''} Latest refresh failed; showing the last durable analysis.`.trim(),
          },
        }
      : {
          status: 'unavailable',
          scope: 'lifetime',
          error: error.message,
          methodology: {
            name: 'Customer Spending Power',
            note: 'The base Shopify dashboard remains usable; spending-power enrichment will retry on the next Shopify refresh.',
          },
        };
    fs.writeFileSync(outPath, JSON.stringify(current, null, 2));
  } catch {}
}

async function main() {
  if (!token || !store) throw new Error('Missing SHAWQ_SHOPIFY_ACCESS_TOKEN or SHAWQ_SHOPIFY_STORE.');
  const shop = await shopMetadata();
  const cachedAnalysis = readAnalysisCache();
  if (!forceRefresh && cachedAnalysis && cacheIsFresh(cachedAnalysis)) {
    attachAnalysis(cachedAnalysis);
    console.log(`Customer spending power: reused durable lifetime analysis from ${cachedAnalysis.generated_at}.`);
    return;
  }

  const storeCreated = String(shop.created_at || '').slice(0, 10);
  const lifetimeSince = process.env.SHOPIFY_SPENDING_POWER_SINCE
    || process.env.SHOPIFY_LIFETIME_SINCE
    || storeCreated
    || '2010-01-01';
  const lifetimeUntil = process.env.SHOPIFY_SPENDING_POWER_UNTIL || dateInTimezone(new Date(), reportingTimezone);
  const scopes = await accessScopes();
  const hasReadAllOrders = scopes ? scopes.has('read_all_orders') : null;

  const rawOrders = await getLifetimeOrders(lifetimeSince, lifetimeUntil);
  const includeStatus = new Set(['paid', 'partially_paid', 'partially_refunded']);
  const included = rawOrders.filter((order) => !order.cancelled_at && includeStatus.has(order.financial_status));
  const analysisOrders = included.map((order) => {
    const address = addressFor(order);
    const countryCode = String(address.country_code || '').toUpperCase();
    const customer = customerKeyFor(order, address);
    return {
      order_id: String(order.id || ''),
      created_at: order.created_at || '',
      customer_id: customer.key,
      customer_key_basis: customer.basis,
      country_code: countryCode,
      postal_code: normalizePostal(address.zip, countryCode),
      revenue: orderRevenue(order),
    };
  });

  const hasUsPostal = analysisOrders.some((order) => order.country_code === 'US' && order.postal_code);
  const usReference = hasUsPostal ? await loadUsReference() : [];
  const analysis = buildCustomerSpendingPowerAnalysis({
    orders: analysisOrders,
    usReference,
    shopCurrency: shop.currency || 'USD',
    lifetimeSince,
    lifetimeUntil,
    source: {
      provider: 'U.S. Census Bureau',
      dataset: 'American Community Survey 5-year',
      vintage: ACS_VINTAGE,
      geography: 'ZIP Code Tabulation Area (ZCTA)',
      income_variable: 'B19013_001E — Median household income',
      household_variable: 'B11001_001E — Total households',
      url: ACS_PUBLIC_URL,
    },
  });
  analysis.generated_at = new Date().toISOString();
  const earliestPulledOrderAt = rawOrders
    .map((order) => order.created_at || '')
    .filter(Boolean)
    .sort()[0] || '';
  analysis.shop = {
    created_at: shop.created_at || '',
    lifetime_since_source: process.env.SHOPIFY_SPENDING_POWER_SINCE || process.env.SHOPIFY_LIFETIME_SINCE
      ? 'environment override'
      : storeCreated
        ? 'Shopify shop created_at'
        : 'fallback floor',
    requested_since: lifetimeSince,
    requested_until: lifetimeUntil,
    pulled_orders: rawOrders.length,
    included_orders: included.length,
    earliest_pulled_order_at: earliestPulledOrderAt,
    read_all_orders_scope: hasReadAllOrders,
    history_access: hasReadAllOrders === true
      ? 'full-history scope confirmed'
      : hasReadAllOrders === false
        ? 'read_all_orders scope not present; Shopify may restrict older orders'
        : 'access-scope check unavailable; lifetime request was still attempted',
  };
  writeAnalysisCache(analysis);
  attachAnalysis(analysis);
  console.log(`Customer spending power: ${analysis.coverage?.matched_customers || 0}/${analysis.coverage?.identified_customers || 0} identified customers matched; lifetime request since ${lifetimeSince}.`);
}

const staleFallback = readAnalysisCache();
main().catch((error) => {
  console.warn(`Customer spending power enrichment unavailable: ${error.message}`);
  attachUnavailable(error, staleFallback);
  // Do not take down the core Shopify refresh when an external enrichment source is unavailable.
  process.exitCode = 0;
});
