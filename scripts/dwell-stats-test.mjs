import assert from 'node:assert/strict';
import { benjaminiHochberg } from '../src/lib/statsTests.js';
import { dwellPageInsight, rollupDwellPages } from '../src/lib/dwellStats.js';

assert.deepEqual(benjaminiHochberg([0.01, 0.04, 0.03]).map((p) => Number(p?.toFixed(3))), [0.03, 0.04, 0.04]);

const pageFacts = [];
for (let i = 0; i < 8; i += 1) {
  pageFacts.push({
    path: '/products/test-hoodie?utm_source=meta',
    dwell_seconds: 40 + i,
    purchased: false,
    session_hash: `nb-${i}`,
  });
}
for (let i = 0; i < 6; i += 1) {
  pageFacts.push({
    path: '/products/test-hoodie?utm_campaign=spring',
    dwell_seconds: 20 + i,
    purchased: true,
    session_hash: `b-${i}`,
  });
}

const rows = rollupDwellPages(pageFacts);
assert.equal(rows.length, 1);
assert.equal(rows[0].path, '/products/test-hoodie');
assert.equal(rows[0].purchaser_sessions, 6);
assert.equal(rows[0].non_purchaser_sessions, 8);
assert.ok(rows[0].p_value_raw != null);

const noBuyerInsight = dwellPageInsight({
  path: '/products/new-drop',
  non_purchaser_median_dwell_seconds: 55,
  non_purchaser_sessions: 7,
  purchaser_sessions: 0,
  confidence: 'Insufficient',
  pattern: 'non_buyer_only',
});
assert.match(noBuyerInsight.detail, /No buyer sessions/i);
assert.doesNotMatch(noBuyerInsight.detail, /vs 0\.00/i);

console.log('dwell-stats-test: ok');
