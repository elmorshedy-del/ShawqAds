import { buildFunnelAnalytics } from '../src/lib/funnelAnalytics.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const metaRows = [
  // pre-launch row must be excluded
  { date: '2026-06-02', campaign_id: 'A', campaign_name: 'Scaling_US', country_code: 'US', spend_usd: 9, add_to_cart: 999, checkout_initiated: 999, purchases: 999 },
  // Meta purchases are deliberately huge (99/day) to prove Purchase/IC ignores Meta purchases.
  { date: '2026-06-03', campaign_id: 'A', campaign_name: 'Scaling_US', country_code: 'US', spend_usd: 50, add_to_cart: 10, checkout_initiated: 12, purchases: 99 },
  { date: '2026-06-04', campaign_id: 'A', campaign_name: 'Scaling_US', country_code: 'US', spend_usd: 50, add_to_cart: 10, checkout_initiated: 7, purchases: 99 },
  { date: '2026-06-05', campaign_id: 'A', campaign_name: 'Scaling_US', country_code: 'US', spend_usd: 50, add_to_cart: 20, checkout_initiated: 10, purchases: 99 },
];
// Purchases come ONLY from Shopify order_lines that Meta attributes to a campaign.
const orderLines = [
  // Same order O1, two lines -> dedupe to ONE attributed order for A on 06-04 (direct hint).
  { date: '2026-06-04', order_id: 'O1', country_code: 'US', product: 'x', attribution: { match_hints: { campaign_id: 'A' } } },
  { date: '2026-06-04', order_id: 'O1', country_code: 'US', product: 'y', attribution: { match_hints: { campaign_id: 'A' } } },
  // No hint -> country-dominant fallback (US -> A) on 06-05.
  { date: '2026-06-05', order_id: 'O2', country_code: 'US', product: 'z', attribution: {} },
];

const data = buildFunnelAnalytics({ metaRows, orderLines }, { window: 7, minDenominator: 2, kappa: 0 });

assert(data.hasData === true, 'hasData should be true');
assert(JSON.stringify(data.dates) === JSON.stringify(['2026-06-03', '2026-06-04', '2026-06-05']),
  `pre-launch must be excluded, got ${JSON.stringify(data.dates)}`);

// IC/ATC: raw >100% preserved, but grounded to an index (base = pooled 29/40 = 72.5%).
const ic = data.icAtc;
assert(ic.summary.baseRate === 72.5, `IC/ATC base rate expected 72.5, got ${ic.summary.baseRate}`);
assert(ic.points[0].account__raw === 120, `IC/ATC day0 raw expected 120% (the >100 artifact), got ${ic.points[0].account__raw}`);
assert(ic.points[0].account === 165.5, `IC/ATC day0 index expected 165.5, got ${ic.points[0].account}`);
assert(ic.points[2].account === 100, `IC/ATC day2 index should equal base (100), got ${ic.points[2].account}`);
assert(ic.summary.currentIndex === 100 && ic.summary.deltaVsBase === 0, `IC/ATC summary wrong: ${JSON.stringify(ic.summary)}`);

// Purchase/IC numerator = ONLY ad-attributed Shopify orders (2 total: O1 deduped + O2 fallback).
// Base = 2/29 = 6.9% — proving it is NOT all Shopify orders and NOT Meta purchases.
const pic = data.purchaseIc;
assert(pic.summary.baseRate === 6.9, `Purchase/IC base must be ad-attributed (~6.9%), got ${pic.summary.baseRate}`);
assert(pic.points[0].account === 0 && pic.points[0].account__raw === 0, `Purchase/IC day0 expected 0, got ${pic.points[0].account}`);
// O1's two lines must dedupe to ONE order on 06-04 -> cumulative 1 order / 19 IC -> index 76.3.
assert(pic.points[1].account === 76.3, `Purchase/IC day1 index expected 76.3 (O1 deduped to 1 order); got ${pic.points[1].account}`);
// O2 attributed via country fallback -> cumulative 2 orders = base -> index 100.
assert(pic.points[2].account === 100, `Purchase/IC day2 index expected 100 (O2 country-fallback attributed); got ${pic.points[2].account}`);
assert(pic.campaigns.some((c) => c.id === 'A'), 'Purchase/IC should include campaign A');

// Empirical-Bayes shrinkage: a large kappa pulls the day0 index from 165.5 toward base (100).
const shrunk = buildFunnelAnalytics({ metaRows, orderLines }, { window: 7, minDenominator: 2, kappa: 100 });
const s0 = shrunk.icAtc.points[0].account;
assert(s0 > 100 && s0 < 165.5, `Shrinkage should pull day0 index toward 100, got ${s0}`);

// Divide-by-zero safety.
const empty = buildFunnelAnalytics({ metaRows: [{ date: '2026-06-03', campaign_id: 'X', add_to_cart: 0, checkout_initiated: 0 }], orderLines: [] }, { window: 7 });
assert(empty.hasData === false, 'all-zero meta should report hasData false');
assert(empty.icAtc.points[0].account == null, 'all-zero day index should be null, not NaN');

console.log('funnel analytics checks passed');
