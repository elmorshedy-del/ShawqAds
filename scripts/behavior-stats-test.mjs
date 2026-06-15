import {
  dwellBehaviorRollup,
  journeyBehaviorRollup,
  normalizeBehaviorPath,
  scoreBehaviorRows,
} from '../src/lib/behaviorStats.js';
import { proportionZTest } from '../src/lib/statsTests.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const path = normalizeBehaviorPath('https://shawq.co/collections/tops?utm_source=ig&utm_medium=paid');
assert(!path.includes('utm_source'), 'normalizeBehaviorPath should strip UTM params');
assert(path.startsWith('/collections/tops'), 'normalizeBehaviorPath should keep pathname');

const high = scoreBehaviorRows([{ key: 'a', exposed: 120, abandoned: 40 }], { globalRate: 0.2 })[0];
assert(high.p_value != null && high.p_value < 0.05, 'High abandonment segment should be significant');
assert(high.confidence === 'High confidence' || high.confidence === 'Actionable', 'Significant high-n row should not be Watch');

const low = scoreBehaviorRows([{ key: 'b', exposed: 5, abandoned: 2 }], { globalRate: 0.2 })[0];
assert(low.confidence === 'Insufficient data', 'Tiny samples should stay insufficient');

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

const prop = proportionZTest(30, 100, 0.2, { tail: 'upper' });
assert(prop.pValue != null && prop.pValue < 0.05, 'proportionZTest should detect higher rate');

console.log('behavior stats tests passed');
