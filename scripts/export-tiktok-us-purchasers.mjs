import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const envPaths = [process.env.ENV_FILE, path.resolve('.env')].filter(Boolean);
for (const envPath of envPaths) {
  if (!fs.existsSync(envPath)) continue;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.replace(/^export\s+/, '').split('=');
    if (!process.env[key]) process.env[key] = rest.join('=').replace(/^["']|["']$/g, '');
  }
}

const token = process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN;
const store = process.env.SHAWQ_SHOPIFY_STORE || process.env.SHOPIFY_STORE;
const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';
const targetCount = Number(process.env.TIKTOK_SEED_LIMIT || 1000);
const outputDir = process.env.OUTPUT_DIR || path.join(os.homedir(), 'Downloads');
const includeStatuses = new Set(['paid', 'partially_paid', 'partially_refunded']);

if (!token || !store) {
  console.error('Missing Shopify token/store env.');
  process.exit(1);
}

function sha256(value) {
  const text = String(value || '').trim();
  return text ? crypto.createHash('sha256').update(text).digest('hex') : '';
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value, countryCode = 'US') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return `+${digits}`;
  if (countryCode === 'US') {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  }
  return `+${digits}`;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function orderCountry(order = {}) {
  const address = order.shipping_address || order.billing_address || {};
  return String(address.country_code || address.country || '').trim().toUpperCase();
}

function bestEmails(order = {}) {
  return [...new Set([
    order.email,
    order.contact_email,
    order.customer?.email,
  ].map(normalizeEmail).filter(Boolean))].slice(0, 3);
}

function bestPhones(order = {}) {
  const country = orderCountry(order) || 'US';
  return [
    order.phone,
    order.customer?.phone,
    order.shipping_address?.phone,
    order.billing_address?.phone,
    order.customer?.default_address?.phone,
    ...(order.customer?.addresses || []).map((address) => address?.phone),
  ].map((phone) => normalizePhone(phone, country)).filter(Boolean);
}

function purchaserKey(emails, phones, order = {}) {
  if (emails[0]) return `email:${emails[0]}`;
  if (phones[0]) return `phone:${phones[0]}`;
  if (order.customer?.id) return `customer:${order.customer.id}`;
  return '';
}

async function fetchOrders() {
  const rows = [];
  let url = new URL(`https://${store}/admin/api/${apiVersion}/orders.json`);
  url.searchParams.set('status', 'any');
  url.searchParams.set('limit', '250');
  url.searchParams.set('order', 'created_at desc');
  url.searchParams.set('fields', [
    'id',
    'name',
    'created_at',
    'cancelled_at',
    'financial_status',
    'current_total_price',
    'total_price',
    'currency',
    'email',
    'contact_email',
    'phone',
    'customer',
    'shipping_address',
    'billing_address',
  ].join(','));

  while (url) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${text.slice(0, 1000)}`);
    const data = JSON.parse(text);
    rows.push(...(data.orders || []));
    const link = res.headers.get('link') || '';
    const next = link.split(',').find((part) => part.includes('rel="next"'));
    url = next ? new URL(next.slice(next.indexOf('<') + 1, next.indexOf('>'))) : null;
    if (rows.length > 20000 && targetCount <= 1000) break;
  }
  return rows;
}

const orders = await fetchOrders();
const purchasers = new Map();

for (const order of orders) {
  if (order.cancelled_at || !includeStatuses.has(order.financial_status)) continue;
  if (orderCountry(order) !== 'US') continue;
  const emails = bestEmails(order);
  const phones = [...new Set(bestPhones(order))].slice(0, 3);
  if (!emails.length && !phones.length) continue;
  const key = purchaserKey(emails, phones, order);
  if (!key) continue;
  const existing = purchasers.get(key) || {
    emails: [],
    phones: [],
    orders: 0,
    revenue: 0,
    latest_order_at: '',
  };
  existing.emails = [...new Set([...existing.emails, ...emails])].slice(0, 3);
  existing.phones = [...new Set([...existing.phones, ...phones])].slice(0, 3);
  existing.orders += 1;
  existing.revenue += Number(order.current_total_price || order.total_price || 0);
  existing.latest_order_at = [existing.latest_order_at, order.created_at || ''].filter(Boolean).sort().at(-1) || '';
  purchasers.set(key, existing);
}

const selected = [...purchasers.values()]
  .sort((a, b) => b.revenue - a.revenue || String(b.latest_order_at).localeCompare(String(a.latest_order_at)))
  .slice(0, targetCount);

const csvRows = [
  ['email', 'email', 'email', 'phone', 'phone', 'phone', 'maid'],
  ...selected.map((person) => {
    const emailHashes = (person.emails || []).map((email) => sha256(normalizeEmail(email)));
    const phoneHashes = person.phones.map(sha256);
    return [
      emailHashes[0] || '',
      emailHashes[1] || '',
      emailHashes[2] || '',
      phoneHashes[0] || '',
      phoneHashes[1] || '',
      phoneHashes[2] || '',
      '',
    ];
  }),
];

const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
const csvPath = path.join(outputDir, `shawq_tiktok_us_purchasers_seed_${selected.length}_${timestamp}.csv`);
const summaryPath = csvPath.replace(/\.csv$/, '_summary.json');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(csvPath, `${csvRows.map((row) => row.map(csvEscape).join(',')).join('\n')}\n`);
fs.writeFileSync(summaryPath, JSON.stringify({
  generated_at: new Date().toISOString(),
  source: 'Shopify Admin Orders API',
  store,
  requested_rows: targetCount,
  exported_rows: selected.length,
  total_orders_scanned: orders.length,
  unique_us_purchasers_with_identifiers: purchasers.size,
  rows_with_email: selected.filter((person) => person.emails?.length).length,
  rows_with_phone: selected.filter((person) => person.phones?.length).length,
  email_slots_filled: selected.reduce((total, person) => total + Math.min(3, person.emails?.length || 0), 0),
  phone_slots_filled: selected.reduce((total, person) => total + Math.min(3, person.phones?.length || 0), 0),
  selection: 'Top US purchasers by total paid order revenue, tie-broken by most recent order',
  privacy: 'CSV contains SHA-256 hashed email/phone identifiers only; no raw PII.',
  csv_path: csvPath,
}, null, 2));

console.log(JSON.stringify({
  csv_path: csvPath,
  summary_path: summaryPath,
  exported_rows: selected.length,
  total_orders_scanned: orders.length,
  unique_us_purchasers_with_identifiers: purchasers.size,
}, null, 2));
