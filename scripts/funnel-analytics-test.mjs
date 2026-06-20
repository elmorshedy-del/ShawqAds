import { buildFunnelAnalytics } from '../src/lib/funnelAnalytics.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const A = { campaign_id: 'A', campaign_name: 'Scaling_US_ASC' };
const B = { campaign_id: 'B', campaign_name: 'Tiny_Test' };

const rows = [
  // Pre-launch row must be excluded entirely.
  { date: '2026-06-02', ...A, add_to_cart: 100, checkout_initiated: 100, purchases: 100 },
  { date: '2026-06-03', ...A, add_to_cart: 10, checkout_initiated: 5, purchases: 2 },
  { date: '2026-06-03', ...B, add_to_cart: 2, checkout_initiated: 1, purchases: 0 },
  { date: '2026-06-04', ...A, add_to_cart: 10, checkout_initiated: 7, purchases: 3 },
  { date: '2026-06-04', ...B, add_to_cart: 1, checkout_initiated: 0, purchases: 0 },
  { date: '2026-06-05', ...A, add_to_cart: 20, checkout_initiated: 10, purchases: 5 },
];

const data = buildFunnelAnalytics(rows, { window: 7, minDenominator: 5 });

assert(data.hasData === true, 'hasData should be true');
assert(JSON.stringify(data.dates) === JSON.stringify(['2026-06-03', '2026-06-04', '2026-06-05']),
  `pre-launch date must be excluded, got ${JSON.stringify(data.dates)}`);

// IC/ATC account = volume-weighted, trailing. Day totals ATC 12/11/20, IC 6/7/10.
const ic = data.icAtc;
assert(ic.points[0].account === 50, `IC/ATC day0 expected 50, got ${ic.points[0].account}`);
assert(ic.points[1].account === 56.5, `IC/ATC day1 expected 56.5, got ${ic.points[1].account}`);
assert(ic.points[2].account === 53.5, `IC/ATC day2 expected 53.5, got ${ic.points[2].account}`);
assert(ic.summary.cumulative === 53.5, `IC/ATC cumulative expected 53.5, got ${ic.summary.cumulative}`);
assert(ic.summary.current === 53.5 && ic.summary.launch === 50 && ic.summary.deltaPp === 3.5,
  `IC/ATC summary wrong: ${JSON.stringify(ic.summary)}`);

// Low-volume campaign B (ATC total 3 < 5) must be filtered out; only A remains.
assert(ic.campaigns.length === 1 && ic.campaigns[0].id === 'A',
  `IC/ATC should keep only campaign A, got ${JSON.stringify(ic.campaigns)}`);
assert(ic.points[2].A === 55, `Campaign A IC/ATC day2 expected 55, got ${ic.points[2].A}`);

// Purchase/IC account. Day totals IC 6/7/10, purchases 2/3/5.
const pic = data.purchaseIc;
assert(pic.points[0].account === 33.3, `Purchase/IC day0 expected 33.3, got ${pic.points[0].account}`);
assert(pic.summary.current === 43.5 && pic.summary.launch === 33.3,
  `Purchase/IC summary wrong: ${JSON.stringify(pic.summary)}`);

// Divide-by-zero: a single all-zero day yields no data and null rate, not NaN/Infinity.
const empty = buildFunnelAnalytics(
  [{ date: '2026-06-03', campaign_id: 'X', campaign_name: 'X', add_to_cart: 0, checkout_initiated: 0, purchases: 0 }],
  { window: 7, minDenominator: 5 },
);
assert(empty.hasData === false, 'all-zero day should report hasData false');
assert(empty.icAtc.points[0].account === null, 'all-zero day IC/ATC should be null, not NaN');

console.log('funnel analytics checks passed');
