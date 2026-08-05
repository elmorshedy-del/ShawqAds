import { buildBehaviorActions } from '../src/lib/behaviorActions.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const behavior = {
  matrix: {
    checkout: {
      global: { exposed: 200, abandoned: 80, rate: 0.4 },
      products: [
        { product: 'Signature Hoodie', exposed: 60, abandoned: 42 },
        { product: 'Denim', exposed: 80, abandoned: 32 },
      ],
      countries: [
        { country: 'United States', country_code: 'US', exposed: 100, abandoned: 43 },
        { country: 'Canada', country_code: 'CA', exposed: 20, abandoned: 18 },
      ],
    },
  },
  dwell_pages: [{
    path: '/products/signature-hoodie',
    pattern: 'significant_non_buyer_longer',
    sessions: 45,
    non_purchaser_median_dwell_seconds: 80,
    purchaser_median_dwell_seconds: 35,
    confidence: 'Directional',
  }],
};

const actions = buildBehaviorActions(behavior);
const product = actions.find((action) => action.id === 'behavior-product');
assert(product?.title.includes('Signature Hoodie'), 'worst comparable product should be named');
assert(product?.stat.includes('42 of 60'), 'action should carry the supporting counts');
assert(product?.meaning.includes('site baseline'), 'action should explain what the comparison means');
assert(product?.action.includes('Replay recent sessions'), 'action should tell the operator exactly what to check');
assert(
  !actions.some((action) => action.title.includes('Canada')),
  'a country below the comparable-session floor must not drive an action',
);
assert(actions.some((action) => action.id === 'behavior-dwell'), 'supported dwell friction should become a plain-language check');

const quiet = buildBehaviorActions({
  matrix: {
    checkout: {
      global: { exposed: 100, abandoned: 40, rate: 0.4 },
      products: [{ product: 'Hoodie', exposed: 60, abandoned: 25 }],
      countries: [],
    },
  },
  extraction: { session_events: { sessions: 100 } },
});
assert(quiet.length === 1 && quiet[0].id === 'behavior-clear', 'small differences should produce a calm no-priority state');

console.log('behavior action checks passed');
