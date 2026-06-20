import { buildEmailDailyIndex, applyRevenueScope } from '../src/lib/revenueScope.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const orderLines = [
  // Order E1 on 06-03 has two email lines -> must dedupe to ONE email order.
  { date: '2026-06-03', channel: 'email', order_id: 'E1', line_revenue_usd: 40, quantity: 1 },
  { date: '2026-06-03', channel: 'email', order_id: 'E1', line_revenue_usd: 10, quantity: 1 },
  // Non-email line on 06-03 must be ignored by the email index.
  { date: '2026-06-03', channel: 'ads', order_id: 'A1', line_revenue_usd: 100, quantity: 2 },
  { date: '2026-06-04', channel: 'email', order_id: 'E2', line_revenue_usd: 30, quantity: 3 },
];
const idx = buildEmailDailyIndex(orderLines);
assert(idx.get('2026-06-03').revenue_usd === 50, `06-03 email revenue expected 50, got ${idx.get('2026-06-03').revenue_usd}`);
assert(idx.get('2026-06-03').orders === 1, `06-03 email orders expected 1 (E1 deduped), got ${idx.get('2026-06-03').orders}`);
assert(idx.get('2026-06-03').units === 2, `06-03 email units expected 2, got ${idx.get('2026-06-03').units}`);
assert(!idx.has('2026-06-05'), 'no email on 06-05');

const daily = [
  { date: '2026-06-03', revenue_usd: 200, orders: 5, units: 8 },
  { date: '2026-06-04', revenue_usd: 100, orders: 3, units: 4 },
  { date: '2026-06-05', revenue_usd: 60, orders: 2, units: 2 },
];

// Shopify + Email = unchanged totals.
const withEmail = applyRevenueScope(daily, 'shopify_email', idx);
assert(withEmail[0].revenue_usd === 200 && withEmail[0].orders === 5, 'shopify_email must leave totals unchanged');

// Shopify = totals minus email contribution.
const exEmail = applyRevenueScope(daily, 'shopify', idx);
assert(exEmail[0].revenue_usd === 150 && exEmail[0].orders === 4 && exEmail[0].units === 6,
  `06-03 ex-email expected {150,4,6}, got ${JSON.stringify([exEmail[0].revenue_usd, exEmail[0].orders, exEmail[0].units])}`);
assert(exEmail[1].revenue_usd === 70 && exEmail[1].orders === 2 && exEmail[1].units === 1,
  `06-04 ex-email expected {70,2,1}, got ${JSON.stringify([exEmail[1].revenue_usd, exEmail[1].orders, exEmail[1].units])}`);
assert(exEmail[2].revenue_usd === 60 && exEmail[2].orders === 2, '06-05 (no email) unchanged under shopify scope');

// Floor at 0 when email exceeds the daily total (data mismatch safety).
const tiny = applyRevenueScope([{ date: '2026-06-03', revenue_usd: 20, orders: 0, units: 0 }], 'shopify', idx);
assert(tiny[0].revenue_usd === 0 && tiny[0].orders === 0, 'subtraction must floor at 0');

// Empty email index -> shopify scope is a no-op.
const noEmail = applyRevenueScope(daily, 'shopify', new Map());
assert(noEmail[0].revenue_usd === 200, 'empty email index leaves shopify scope unchanged');

console.log('revenue scope checks passed');
