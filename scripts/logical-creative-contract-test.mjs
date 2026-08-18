import assert from 'node:assert/strict';
import { canonicalCreativeName, logicalCreativeKey } from '../src/lib/logicalCreative.js';
import { normalizeDashboardPayload } from '../src/lib/dataContractNormalizer.js';

assert.equal(canonicalCreativeName('Quote VO - Copy'), 'Quote VO');
assert.equal(canonicalCreativeName('Quote VO - Copy 2'), 'Quote VO');
assert.equal(canonicalCreativeName('Quote VO (Copy)'), 'Quote VO');
assert.equal(canonicalCreativeName('Quote VO - Copy - Copy 3'), 'Quote VO');
assert.equal(logicalCreativeKey('  Quote   VO - Copy 2 '), logicalCreativeKey('Quote VO'));
assert.notEqual(logicalCreativeKey('Quote Voice - Copy'), logicalCreativeKey('Quote VO'));
assert.equal(canonicalCreativeName('Summer Copy'), 'Summer Copy');
assert.equal(canonicalCreativeName('Copywriting Hook'), 'Copywriting Hook');

const meta = normalizeDashboardPayload('/api/data/adset-radar.json', {
  ad_daily: [
    { ad_id: '1', ad_name: 'Quote VO', spend_usd: 20 },
    { ad_id: '2', ad_name: 'Quote VO - Copy 2', spend_usd: 30 },
  ],
  nested: { ad_name: 'Another Hook (Copy)' },
});
assert.equal(meta.ad_daily[0].ad_name, 'Quote VO');
assert.equal(meta.ad_daily[1].ad_name, 'Quote VO');
assert.equal(meta.ad_daily[0].ad_id, '1', 'real Meta IDs stay intact');
assert.equal(meta.ad_daily[1].ad_id, '2', 'copy remains traceable by its Meta ID');
assert.equal(meta.nested.ad_name, 'Another Hook');

const shopify = normalizeDashboardPayload('/api/data/shopify-products.json', {
  order_lines: [{
    product: 'Limited Copy',
    attribution: {
      ad_hint: 'Quote VO - Copy',
      match_hints: { ad_name: 'Quote VO (Copy 2)' },
      utm: { utm_content: 'Quote VO - Copy 3' },
    },
  }],
});
assert.equal(shopify.order_lines[0].product, 'Limited Copy', 'merchandising text must not be rewritten');
assert.equal(shopify.order_lines[0].attribution.ad_hint, 'Quote VO');
assert.equal(shopify.order_lines[0].attribution.match_hints.ad_name, 'Quote VO');
assert.equal(shopify.order_lines[0].attribution.utm.utm_content, 'Quote VO');

console.log('logical creative contract checks passed');
