import { buildFunnelAnalytics } from '../src/lib/funnelAnalytics.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const near = (a, b, eps = 0.05) => a != null && Math.abs(a - b) <= eps;

const metaRows = [
  // pre-launch row must be excluded
  { date: '2026-06-02', campaign_id: 'A', campaign_name: 'Scaling_US', country_code: 'US', spend_usd: 9, add_to_cart: 999, checkout_initiated: 999, purchases: 999 },
  // Meta purchases are deliberately huge (99/day) to prove Purchase/IC ignores Meta purchases.
  { date: '2026-06-03', campaign_id: 'A', campaign_name: 'Scaling_US', country_code: 'US', spend_usd: 50, add_to_cart: 10, checkout_initiated: 12, purchases: 99 },
  { date: '2026-06-04', campaign_id: 'A', campaign_name: 'Scaling_US', country_code: 'US', spend_usd: 50, add_to_cart: 10, checkout_initiated: 7, purchases: 99 },
  { date: '2026-06-05', campaign_id: 'A', campaign_name: 'Scaling_US', country_code: 'US', spend_usd: 50, add_to_cart: 20, checkout_initiated: 10, purchases: 99 },
];
const shopifyDaily = [
  { date: '2026-06-02', orders: 50 },
  { date: '2026-06-03', orders: 3 },
  { date: '2026-06-04', orders: 2 },
  { date: '2026-06-05', orders: 5 },
];
const orderLines = [
  // Same order O1, two lines -> must dedupe to ONE order for campaign A on 06-04 (direct hint).
  { date: '2026-06-04', order_id: 'O1', country_code: 'US', product: 'x', attribution: { match_hints: { campaign_id: 'A' } } },
  { date: '2026-06-04', order_id: 'O1', country_code: 'US', product: 'y', attribution: { match_hints: { campaign_id: 'A' } } },
  // No hint -> country-dominant fallback (US -> A) on 06-05.
  { date: '2026-06-05', order_id: 'O2', country_code: 'US', product: 'z', attribution: {} },
];

const data = buildFunnelAnalytics({ metaRows, shopifyDaily, orderLines }, { window: 7, minDenominator: 2, kappa: 0 });

assert(data.hasData === true, 'hasData should be true');
assert(JSON.stringify(data.dates) === JSON.stringify(['2026-06-03', '2026-06-04', '2026-06-05']),
  `pre-launch must be excluded, got ${JSON.stringify(data.dates)}`);

// IC/ATC: raw >100% preserved, but grounded to an index (base = pooled 29/40 = 72.5%).
const ic = data.icAtc;
assert(ic.summary.baseRate === 72.5, `IC/ATC base rate expected 72.5, got ${ic.summary.baseRate}`);
assert(ic.points[0].account__raw === 120, `IC/ATC day0 raw expected 120% (the >100 artifact), got ${ic.points[0].account__raw}`);
assert(ic.points[0].account === 165.5, `IC/ATC day0 index expected 165.5, got ${ic.points[0].account}`);
assert(ic.points[2].account === 100, `IC/ATC day2 index should equal base (100), got ${ic.points[2].account}`);
assert(ic.summary.currentIndex === 100 && ic.summary.deltaVsBase === 0,
  `IC/ATC summary wrong: ${JSON.stringify(ic.summary)}`);

// Purchase/IC: numerator is SHOPIFY orders (10 total), not Meta purchases (297 total).
const pic = data.purchaseIc;
assert(pic.summary.baseRate === 34.5, `Purchase/IC base must be Shopify-based ~34.5%, got ${pic.summary.baseRate} (Meta would be ~1024%)`);
assert(pic.points[0].account === 72.5 && pic.points[0].account__raw === 25,
  `Purchase/IC day0 expected index 72.5 / raw 25, got ${JSON.stringify([pic.points[0].account, pic.points[0].account__raw])}`);

// Per-campaign attributed orders: O1 (deduped to 1) + O2 (country fallback) = 2 orders for A by day2.
assert(pic.campaigns.some((c) => c.id === 'A'), 'Purchase/IC should include campaign A');
assert(pic.points[2].A === 20, `Campaign A Purchase/IC day2 index expected 20 (2 deduped orders / cumulative IC, indexed); got ${pic.points[2].A}`);

// Empirical-Bayes shrinkage: a large kappa pulls the day0 index from 165.5 toward the base (100).
const shrunk = buildFunnelAnalytics({ metaRows, shopifyDaily, orderLines }, { window: 7, minDenominator: 2, kappa: 100 });
const s0 = shrunk.icAtc.points[0].account;
assert(s0 > 100 && s0 < 165.5, `Shrinkage should pull day0 index toward 100 (between 100 and 165.5), got ${s0}`);

// Divide-by-zero safety.
const empty = buildFunnelAnalytics({ metaRows: [{ date: '2026-06-03', campaign_id: 'X', add_to_cart: 0, checkout_initiated: 0 }], shopifyDaily: [], orderLines: [] }, { window: 7 });
assert(empty.hasData === false, 'all-zero meta should report hasData false');
assert(empty.icAtc.points[0].account == null, 'all-zero day index should be null, not NaN');

console.log('funnel analytics checks passed');
