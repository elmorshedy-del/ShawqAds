// Pull Shopify orders from 2026-01-01 -> now, flattened for analysis.
// Writes to ./data (gitignored). Does NOT touch public/data/*.json.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOKEN = process.env.SHOPIFY || process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN;
const STORE = process.env.SHAWQ_SHOPIFY_STORE || 'f3e7e9-2.myshopify.com';
const V = process.env.SHOPIFY_API_VERSION || '2025-10';
const OUT = process.argv[2]
  || process.env.ANALYSIS_DATA_DIR && `${process.env.ANALYSIS_DATA_DIR}/shopify-orders.json`
  || fileURLToPath(new URL('./data/shopify-orders.json', import.meta.url));
const SINCE = process.env.PULL_SINCE || '2026-01-01';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPage(url, attempt = 0) {
  const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': TOKEN, Accept: 'application/json' } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 6) {
      const wait = Number(res.headers.get('retry-after') || 0) * 1000 || Math.min(30000, 2000 * 2 ** attempt);
      console.error(`  retry ${attempt + 1} in ${wait}ms (${res.status})`);
      await sleep(wait);
      return getPage(url, attempt + 1);
    }
  }
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const link = res.headers.get('link') || '';
  const next = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1] || null;
  return { json: await res.json(), next };
}

const params = new URLSearchParams({
  status: 'any',
  created_at_min: `${SINCE}T00:00:00+03:00`,
  limit: '250',
  fields: [
    'id', 'name', 'created_at', 'processed_at', 'cancelled_at', 'currency',
    'current_total_price', 'total_price', 'subtotal_price', 'total_discounts',
    'total_price_set', 'current_total_price_set', 'total_shipping_price_set',
    'financial_status', 'fulfillment_status', 'test', 'confirmed',
    'shipping_address', 'billing_address', 'customer', 'line_items',
    'source_name', 'landing_site', 'referring_site', 'note_attributes',
    'refunds', 'tags', 'discount_codes', 'payment_gateway_names',
  ].join(','),
});

let url = `https://${STORE}/admin/api/${V}/orders.json?${params}`;
const orders = [];
let page = 0;
while (url) {
  const { json, next } = await getPage(url);
  orders.push(...(json.orders || []));
  page += 1;
  console.error(`  page ${page}: +${json.orders?.length || 0} (total ${orders.length})`);
  url = next;
  if (url) await sleep(600);
  if (page > 200) break;
}

const flat = orders.map((o) => {
  const ship = o.shipping_address || o.billing_address || {};
  const cust = o.customer || {};
  const custAddr = cust.default_address || {};
  const na = Object.fromEntries((o.note_attributes || []).map((n) => [n.name, n.value]));
  const refunded = (o.refunds || []).reduce((s, r) => s
    + (r.transactions || []).reduce((t, tx) => t + (Number(tx.amount) || 0), 0), 0);
  return {
    id: String(o.id),
    name: o.name,
    created_at: o.created_at,
    cancelled_at: o.cancelled_at || null,
    test: !!o.test,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    currency: o.currency,
    total_price: Number(o.total_price) || 0,
    total_price_usd: Number(o.total_price_set?.presentment_money?.amount ?? o.total_price) || 0,
    shop_total_usd: Number(o.total_price_set?.shop_money?.amount ?? o.total_price) || 0,
    subtotal: Number(o.subtotal_price) || 0,
    discounts: Number(o.total_discounts) || 0,
    shipping: Number(o.total_shipping_price_set?.shop_money?.amount) || 0,
    refunded,
    country_code: ship.country_code || custAddr.country_code || null,
    province: ship.province_code || ship.province || null,
    city: ship.city || null,
    source_name: o.source_name || null,
    landing_site: o.landing_site || null,
    referring_site: o.referring_site || null,
    utm_source: na.utm_source || na.utm_source_last || na.utm_source_first || null,
    utm_medium: na.utm_medium || na.utm_medium_last || na.utm_medium_first || null,
    utm_campaign: na.utm_campaign || na.utm_campaign_last || na.utm_campaign_first || null,
    utm_content: na.utm_content || na.utm_content_last || na.utm_content_first || null,
    discount_codes: (o.discount_codes || []).map((d) => d.code),
    gateways: o.payment_gateway_names || [],
    customer_orders_count: Number(cust.orders_count) || null,
    units: (o.line_items || []).reduce((s, li) => s + (Number(li.quantity) || 0), 0),
    line_items: (o.line_items || []).map((li) => ({
      product_id: String(li.product_id || ''),
      title: li.title,
      variant: li.variant_title || null,
      sku: li.sku || null,
      qty: Number(li.quantity) || 0,
      price: Number(li.price) || 0,
    })),
  };
});

fs.writeFileSync(OUT, JSON.stringify({
  pulled_at: new Date().toISOString(),
  store: STORE, since: SINCE,
  count: flat.length,
  orders: flat,
}, null, 0));
console.error(`\nWrote ${OUT}: ${flat.length} orders`);
