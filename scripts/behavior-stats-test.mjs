import {
  dwellBehaviorRollup,
  familyBaselineRates,
  journeyBehaviorRollup,
  normalizeBehaviorPath,
  rollupBehaviorFacts,
  scoreBehaviorRows,
  sortBehaviorProducts,
} from '../src/lib/behaviorStats.js';
import { benjaminiHochberg, proportionZTest } from '../src/lib/statsTests.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const path = normalizeBehaviorPath('https://shawq.co/collections/tops?utm_source=ig&utm_medium=paid');
assert(!path.includes('utm_source'), 'normalizeBehaviorPath should strip UTM params');
assert(path.startsWith('/collections/tops'), 'normalizeBehaviorPath should keep pathname');

const facts = [
  { step: 'checkout', family: 'Hoodie', exposed: 100, abandoned: 40, product: 'Hot Hoodie', product_id: '1' },
  { step: 'checkout', family: 'Hoodie', exposed: 80, abandoned: 16, product: 'Cool Hoodie', product_id: '2' },
  { step: 'checkout', family: 'T-Shirt', exposed: 20, abandoned: 2, product: 'Tee', product_id: '3' },
];

const baselines = familyBaselineRates(facts, 'checkout');
assert(baselines.familyRates.get('Hoodie') > baselines.siteRate / 2, 'Family baseline should compute');

const rolled = rollupBehaviorFacts(facts, 'checkout', 'product');
assert(rolled.rows.length === 3, 'Should roll up three products');
const hot = rolled.rows.find((row) => row.product_id === '1');
assert(hot && hot.baseline_label.includes('Hoodie'), 'Product row should use family baseline label');
assert(hot.p_value_adjusted != null || hot.p_value != null, 'Product row should include significance');

const high = scoreBehaviorRows([{ key: 'a', family: 'Hoodie', exposed: 120, abandoned: 40 }], { globalRate: 0.2, useFamilyBaseline: true, familyRates: new Map([['Hoodie', 0.2]]) })[0];
assert(high.confidence === 'High confidence' || high.confidence === 'Actionable', 'Significant high-n row should not be Watch');
assert(high.confidence_plain, 'Plain confidence label should exist');

const low = scoreBehaviorRows([{ key: 'b', family: 'Other', exposed: 5, abandoned: 2 }], { globalRate: 0.2 })[0];
assert(low.confidence === 'Insufficient data', 'Tiny samples should stay insufficient');

const sortedImpact = sortBehaviorProducts(rolled.rows, 'impact');
const sortedAnomaly = sortBehaviorProducts(rolled.rows, 'anomaly');
assert(sortedImpact[0].excess_abandons >= sortedImpact.at(-1).excess_abandons, 'Impact sort should prioritize excess abandons');
assert(Number.isFinite(sortedAnomaly[0].vs_site_pp), 'Anomaly sort should use vs baseline');

const dwell = dwellBehaviorRollup([
  { path: '/products/a', dwell_seconds: 40, purchased: false, session_hash: 's1' },
  { path: '/products/a', dwell_seconds: 45, purchased: false, session_hash: 's2' },
  { path: '/products/a', dwell_seconds: 50, purchased: false, session_hash: 's3' },
  { path: '/products/a', dwell_seconds: 55, purchased: false, session_hash: 's4' },
  { path: '/products/a', dwell_seconds: 60, purchased: false, session_hash: 's5' },
  { path: '/products/a', dwell_seconds: 10, purchased: true, session_hash: 's6' },
  { path: '/products/a', dwell_seconds: 12, purchased: true, session_hash: 's7' },
  { path: '/products/a', dwell_seconds: 14, purchased: true, session_hash: 's8' },
]);
assert(dwell.length === 1, 'Dwell rollup should produce one path');
assert(dwell[0].read === 'Friction watch' || dwell[0].read.includes('Friction'), 'Large dwell gap should flag friction when powered');

const journeys = journeyBehaviorRollup([
  { purchased: false, session_hash: 'a', path_sequence: ['/'] },
  { purchased: false, session_hash: 'b', path_sequence: ['/'] },
]);
assert(journeys.lift_reliable === false, 'Journey lift should be gated until cohort minimums are met');
assert(journeys.steps[0].lift == null, 'Lift should be null when underpowered');

const adjusted = benjaminiHochberg([0.01, 0.04, 0.03]);
assert(adjusted[0] <= 0.03, 'BH should adjust p-values upward');

const prop = proportionZTest(30, 100, 0.2, { tail: 'upper' });
assert(prop.pValue != null && prop.pValue < 0.05, 'proportionZTest should detect higher rate');

console.log('behavior stats tests passed');
