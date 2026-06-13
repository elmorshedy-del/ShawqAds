// End-to-end check for the email-channel feature.
//
// Boots the real server with a mocked Shopify Admin API that returns:
//   - a Denmark order tagged utm_medium=email (the "verification" order)
//   - a normal US paid order (paid ads / no email medium)
// then calls the real /api/shopify/latest-sale endpoint and asserts the
// Denmark order is labeled as an email campaign, carries channel=email, and is
// counted in the email_campaign summary (and that the US order is not).

const PORT = process.env.EMAIL_TEST_PORT || '5199';
process.env.PORT = PORT;
process.env.REFRESH_ON_START = 'false';
process.env.SHAWQ_SHOPIFY_STORE = 'mock-shop.myshopify.com';
process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN = 'mock-token';
process.env.SHOPIFY_API_VERSION = '2025-10';
process.env.SHAWQ_SHOPIFY_REPORTING_TIMEZONE = 'Europe/Istanbul';

const now = new Date().toISOString();

const denmarkEmailOrder = {
  id: 99001,
  name: '#DK-EMAIL',
  created_at: now,
  cancelled_at: null,
  financial_status: 'paid',
  current_total_price: '95.00',
  total_price: '95.00',
  currency: 'USD',
  presentment_currency: 'USD',
  line_items: [
    { title: 'ShawQ Signature Hoodie', quantity: 1, price: '95.00', product_id: 11, variant_id: 111 },
  ],
  shipping_address: { country_code: 'DK', country: 'Denmark', city: 'Copenhagen' },
  // How Klaviyo / Shopify Email typically stamps the landing URL.
  landing_site: '/products/signature-hoodie?utm_source=klaviyo&utm_medium=email&utm_campaign=spring_drop',
  referring_site: '',
  source_name: 'web',
  note_attributes: [],
  tags: '',
};

const usAdsOrder = {
  id: 99002,
  name: '#US-ADS',
  created_at: now,
  cancelled_at: null,
  financial_status: 'paid',
  current_total_price: '142.00',
  total_price: '142.00',
  currency: 'USD',
  presentment_currency: 'USD',
  line_items: [
    { title: 'ShawQ Signature Hoodie', quantity: 2, price: '71.00', product_id: 11, variant_id: 111 },
  ],
  shipping_address: { country_code: 'US', province_code: 'NY', country: 'United States', city: 'Brooklyn' },
  landing_site: '/products/signature-hoodie?utm_source=facebook&utm_medium=paid&utm_campaign=USA_CBO',
  referring_site: 'https://l.facebook.com/',
  source_name: 'web',
  note_attributes: [],
  tags: '',
};

const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input?.url || String(input));
  // Let our own calls to the local server through to the real implementation.
  if (url.includes('127.0.0.1') || url.includes('localhost')) return realFetch(input, init);
  // Mock the Shopify orders pull.
  if (url.includes('/admin/api/') && url.includes('orders.json')) {
    return new Response(JSON.stringify({ orders: [denmarkEmailOrder, usAdsOrder] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  // Anything else external (FX, meta, geocoders) → benign empty payload.
  return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
};

await import('../server.mjs');

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await realFetch(`http://127.0.0.1:${PORT}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not become healthy');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`\u274c FAIL: ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
  console.log(`\u2705 ${message}`);
}

try {
  await waitForHealth();
  const res = await realFetch(`http://127.0.0.1:${PORT}/api/shopify/latest-sale`);
  const payload = await res.json();

  console.log('\n--- email_campaign summary ---');
  console.log(JSON.stringify(payload.today_summary?.email_campaign, null, 2));

  const purchases = payload.purchases || [];
  const dk = purchases.find((p) => p.countryCode === 'DK');
  const us = purchases.find((p) => p.countryCode === 'US');

  console.log('\n--- Denmark purchase as seen by the live monitor ---');
  console.log(JSON.stringify(dk, null, 2));

  assert(dk, 'Denmark order shows up in the live monitor purchases');
  assert(dk.channel === 'email', "Denmark order is tagged channel='email'");
  assert(/^Email campaign/.test(dk.source || ''), `Denmark order source reads as an email campaign (got: "${dk.source}")`);
  assert((dk.source || '').includes('spring_drop'), 'Denmark order source carries the email campaign name');

  assert(us, 'US ads order still shows up');
  assert((us.channel || '') !== 'email', 'US ads order is NOT tagged as email');
  assert(!/^Email campaign/.test(us.source || ''), 'US ads order is NOT labeled as an email campaign');

  const ec = payload.today_summary?.email_campaign;
  assert(ec, 'today_summary includes an email_campaign block');
  assert(ec.orders === 1, `email_campaign counts exactly the 1 email order (got ${ec.orders})`);
  assert(ec.revenue_usd === 95, `email_campaign revenue is the email order total (got ${ec.revenue_usd})`);
  assert(
    (ec.campaigns || []).some((c) => c.name === 'spring_drop'),
    'email_campaign lists the spring_drop campaign',
  );

  // Email lines are excluded from the paid-ads aggregates: only the US (ads)
  // order should contribute to the channel-less product/country leaders.
  const lines = payload.today_summary?.order_lines || [];
  const emailLines = lines.filter((l) => l.channel === 'email');
  const adLines = lines.filter((l) => l.channel !== 'email');
  assert(emailLines.length >= 1 && emailLines.every((l) => l.order_id === '99001'), 'order_lines tag the email order with channel=email');
  assert(adLines.every((l) => l.order_id !== '99001'), 'paid-ads order_lines exclude the email order');

  console.log('\nAll email-channel assertions passed. The Denmark email order surfaces correctly.');
  process.exit(process.exitCode || 0);
} catch (error) {
  console.error('\nTest harness error:', error.message);
  process.exit(1);
}
