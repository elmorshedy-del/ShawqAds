import fs from 'node:fs';
import path from 'node:path';
import { buildCustomerSpendingPowerAnalysis } from '../src/lib/customerSpendingPower.js';

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
const ACS_URL = `https://api.census.gov/data/${ACS_VINTAGE}/acs/acs5?get=NAME,B19013_001E,B11001_001E&for=zip%20code%20tabulation%20area:*`;
const censusCachePath = path.join(dataDir, `customer-spending-power-us-acs-${ACS_VINTAGE}.json`);

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
  try {
    const cached = JSON.parse(fs.readFileSync(censusCachePath, 'utf8'));
    if (cached?.vintage === ACS_VINTAGE && Array.isArray(cached.rows) && cached.rows.length) return cached.rows;
  } catch {}

  const res = await fetch(ACS_URL, { headers: { accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Census ACS ${res.status}: ${text.slice(0, 500)}`);
  const raw = JSON.parse(text);
  const [headers, ...rows] = raw;
  const idxIncome = headers.indexOf('B19013_001E');
  const idxHouseholds = headers.indexOf('B11001_001E');
  const idxZip = headers.indexOf('zip code tabulation area');
  const parsed = rows.map((row) => ({
    postal_code: String(row[idxZip] || ''),
    area_income_usd: Number(row[idxIncome]),
    households: Number(row[idxHouseholds]),
  })).filter((row) => row.postal_code && row.area_income_usd > 0 && row.households > 0);

  fs.mkdirSync(path.dirname(censusCachePath), { recursive: true });
  fs.writeFileSync(censusCachePath, JSON.stringify({
    provider: 'U.S. Census Bureau',
    dataset: 'American Community Survey 5-year',
    vintage: ACS_VINTAGE,
    fetched_at: new Date().toISOString(),
    rows: parsed,
  }));
  return parsed;
}

function attachAnalysis(analysis) {
  if (!fs.existsSync(outPath)) throw new Error(`Missing ${outPath}; run the Shopify fetch first.`);
  const current = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  current.customer_spending_power = analysis;
  fs.writeFileSync(outPath, JSON.stringify(current, null, 2));
}

function attachUnavailable(error) {
  if (!fs.existsSync(outPath)) return;
  try {
    const current = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    current.customer_spending_power = {
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
  const storeCreated = String(shop.created_at || '').slice(0, 10);
  const lifetimeSince = process.env.SHOPIFY_SPENDING_POWER_SINCE
    || process.env.SHOPIFY_LIFETIME_SINCE
    || storeCreated
    || '2010-01-01';
  const lifetimeUntil = process.env.SHOPIFY_SPENDING_POWER_UNTIL || dateInTimezone(new Date(), reportingTimezone);

  const rawOrders = await getLifetimeOrders(lifetimeSince, lifetimeUntil);
  const includeStatus = new Set(['paid', 'partially_paid', 'partially_refunded']);
  const included = rawOrders.filter((order) => !order.cancelled_at && includeStatus.has(order.financial_status));
  const analysisOrders = included.map((order) => {
    const address = addressFor(order);
    const countryCode = String(address.country_code || '').toUpperCase();
    return {
      order_id: String(order.id || ''),
      created_at: order.created_at || '',
      customer_id: String(order.customer?.id || ''),
      country_code: countryCode,
      postal_code: countryCode === 'US' ? normalizeUsPostal(address.zip) : '',
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
      url: ACS_URL,
    },
  });
  analysis.generated_at = new Date().toISOString();
  analysis.shop = {
    created_at: shop.created_at || '',
    lifetime_since_source: process.env.SHOPIFY_SPENDING_POWER_SINCE || process.env.SHOPIFY_LIFETIME_SINCE
      ? 'environment override'
      : storeCreated
        ? 'Shopify shop created_at'
        : 'fallback floor',
    pulled_orders: rawOrders.length,
    included_orders: included.length,
  };
  attachAnalysis(analysis);
  console.log(`Customer spending power: ${analysis.coverage?.matched_customers || 0}/${analysis.coverage?.identified_customers || 0} identified customers matched; lifetime since ${lifetimeSince}.`);
}

main().catch((error) => {
  console.warn(`Customer spending power enrichment unavailable: ${error.message}`);
  attachUnavailable(error);
  // Do not take down the core Shopify refresh when an external enrichment source is unavailable.
  process.exitCode = 0;
});
