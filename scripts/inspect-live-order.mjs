// Live channel inspector.
//
// Pulls today's paid Shopify orders straight from the Admin API and prints, for
// each order, the marketing attribution the dashboard sees: utm_medium, whether
// it classifies as the email channel, and the label the live monitor would show.
// Use it to confirm a real order (e.g. today's Denmark order) is detected as an
// email campaign.
//
//   SHAWQ_SHOPIFY_ACCESS_TOKEN=... SHAWQ_SHOPIFY_STORE=f3e7e9-2.myshopify.com \
//     SHOPIFY_API_VERSION=2025-10 node scripts/inspect-live-order.mjs
//
// Optional: FILTER_COUNTRY=DK to only print matching orders.

import fs from 'node:fs';
import path from 'node:path';
import { buildAttributionLite, attributionUtmMedium, isEmailAttribution, emailSourceLabel } from '../src/lib/orderChannel.mjs';

for (const envPath of [process.env.ENV_FILE, path.resolve('.env')].filter(Boolean)) {
  if (!fs.existsSync(envPath)) continue;
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = line.slice(eq + 1).trim();
  }
}

const store = process.env.SHAWQ_SHOPIFY_STORE || process.env.SHOPIFY_STORE || '';
const token = process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN || '';
const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';
const timezone = process.env.SHAWQ_SHOPIFY_REPORTING_TIMEZONE || process.env.SHOPIFY_REPORTING_TIMEZONE || 'Europe/Istanbul';
const filterCountry = (process.env.FILTER_COUNTRY || '').toUpperCase();

if (!store || !token) {
  console.error('Missing SHAWQ_SHOPIFY_STORE / SHAWQ_SHOPIFY_ACCESS_TOKEN. Set them (or add a .env) and retry.');
  process.exit(2);
}

function dateInTimezone(date, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function reportingDayBoundsIso(day, tz) {
  // Find UTC instants for local midnight start and next-midnight end of `day`.
  const probe = (hour) => {
    const guess = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);
    const local = dateInTimezone(guess, tz);
    return { guess, local };
  };
  // Offset is small; brute-force the offset by comparing local date at noon UTC.
  const noon = new Date(`${day}T12:00:00Z`);
  const offsetMin = (() => {
    const localStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).format(noon);
    const [h, m] = localStr.split(':').map(Number);
    return (h * 60 + m) - (12 * 60);
  })();
  const startUtc = new Date(`${day}T00:00:00Z`).getTime() - offsetMin * 60000;
  const endUtc = startUtc + 24 * 3600 * 1000;
  return { min: new Date(startUtc).toISOString(), max: new Date(endUtc).toISOString() };
}

const reportingDay = dateInTimezone(new Date(), timezone);
const { min, max } = reportingDayBoundsIso(reportingDay, timezone);

const url = new URL(`https://${store}/admin/api/${apiVersion}/orders.json`);
url.searchParams.set('status', 'any');
url.searchParams.set('limit', '250');
url.searchParams.set('created_at_min', min);
url.searchParams.set('created_at_max', max);
url.searchParams.set('order', 'created_at desc');
url.searchParams.set('fields', 'id,name,created_at,cancelled_at,financial_status,current_total_price,currency,shipping_address,billing_address,landing_site,landing_site_ref,referring_site,source_name,note_attributes');

const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
if (!res.ok) {
  console.error(`Shopify error ${res.status}: ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}
const { orders = [] } = await res.json();
const includeStatus = new Set(['paid', 'partially_paid', 'partially_refunded']);
const paid = orders.filter((o) => !o.cancelled_at && includeStatus.has(o.financial_status));

console.log(`Reporting day ${reportingDay} (${timezone}) — ${paid.length} paid order(s)\n`);

let emailCount = 0;
for (const order of paid) {
  const addr = order.shipping_address || order.billing_address || {};
  const country = (addr.country_code || '').toUpperCase();
  if (filterCountry && country !== filterCountry) continue;
  const attribution = buildAttributionLite(order);
  const medium = attributionUtmMedium(attribution) || '(none)';
  const isEmail = isEmailAttribution(attribution);
  if (isEmail) emailCount += 1;
  console.log(`${isEmail ? '📧' : '  '} ${order.name}  ${country || '??'} ${addr.city || ''}`.trimEnd());
  console.log(`     financial_status: ${order.financial_status}  total: ${order.current_total_price} ${order.currency}`);
  console.log(`     source_name: ${order.source_name || '(none)'}  utm_medium: ${medium}`);
  console.log(`     utm: ${JSON.stringify(attribution.utm)}`);
  console.log(`     landing_site: ${(order.landing_site || '').slice(0, 160)}`);
  console.log(`     => channel: ${isEmail ? 'email' : 'paid/other'}  monitor source: "${isEmail ? emailSourceLabel(attribution) : (order.source_name || '')}"`);
  console.log('');
}

console.log(`Email-channel orders detected${filterCountry ? ` for ${filterCountry}` : ''}: ${emailCount}`);
