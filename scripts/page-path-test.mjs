import assert from 'node:assert/strict';
import {
  buildPublicLocation,
  pickPublicLocality,
} from '../src/lib/orderLocality.js';
import {
  formatDwellSeconds,
  normalizePagePath,
  pagePathLabel,
} from '../src/lib/pagePath.js';
import { dwellPageInsight } from '../src/lib/dwellStats.js';

assert.equal(
  pickPublicLocality({ city: 'France', province: 'Grand Est', country_code: 'FR' }, 'FR'),
  'Grand Est',
  'country name in city field should fall back to province',
);
assert.equal(
  buildPublicLocation({ city: 'France', province: 'Grand Est', country_code: 'FR' }, 'FR'),
  'Grand Est, France',
);

assert.equal(
  pickPublicLocality({ city: 'Denmark', province: 'Capital Region of Denmark', country_code: 'DK' }, 'DK'),
  'Capital Region Of Denmark',
);
assert.equal(
  pickPublicLocality({ city: 'Copenhagen', country_code: 'DK' }, 'DK'),
  'Copenhagen',
);

assert.equal(
  normalizePagePath('/products/hoodie?utm_source=facebook&utm_campaign=USA_CBO&fbclid=abc'),
  '/products/hoodie',
);
assert.equal(
  pagePathLabel('/products/ghalabany-al-shawq-hoodie-unisex?utm_medium=paid'),
  'Ghalabany Al Shawq Hoodie Unisex',
);

assert.equal(formatDwellSeconds(45.678), '45.68s');
assert.equal(formatDwellSeconds(125), '2.1 min');

const insight = dwellPageInsight({
  path: '/products/test-hoodie',
  sessions: 14,
  non_purchaser_median_dwell_seconds: 95,
  non_purchaser_sessions: 8,
  purchaser_median_dwell_seconds: 40,
  purchaser_sessions: 6,
  p_value_adjusted: 0.02,
  significant: true,
  effect_size: 0.4,
  confidence: 'Actionable',
  pattern: 'significant_non_buyer_longer',
});
assert.match(insight.headline, /Non-buyers linger/i);
assert.match(insight.detail, /p=/i);
assert.doesNotMatch(insight.detail, /vs 0\.00/i);

console.log('page-path + locality tests: ok');
