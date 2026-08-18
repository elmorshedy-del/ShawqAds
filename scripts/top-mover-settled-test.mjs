import assert from 'node:assert/strict';
import { normalizeDashboardPayload } from '../src/lib/dataContractNormalizer.js';
import { buildSettledTopMovers, settledTopMoverWindows } from '../src/lib/topMoverData.js';

const mondayBounds = { since: '2026-06-03', until: '2026-08-17' };
const monday = settledTopMoverWindows('2026-08-17', mondayBounds);
assert.deepEqual(monday.hero, { since: '2026-08-16', until: '2026-08-16' });
assert.equal(monday.thisWeek, null, 'Monday must not manufacture a one-day current-week comparison from the live day');
assert.deepEqual(monday.lastWeek, { since: '2026-08-10', until: '2026-08-16' }, 'last week is the full completed Monday-Sunday week');

const thursday = settledTopMoverWindows('2026-08-20', { since: '2026-06-03', until: '2026-08-20' });
assert.deepEqual(thursday.thisWeek, { since: '2026-08-17', until: '2026-08-19' }, 'current week excludes the ongoing reporting day');

const meta = normalizeDashboardPayload('/api/data/adset-radar.json', {
  account_daily_metrics: [
    { date: '2026-08-10', spend_usd: 30 },
    { date: '2026-08-11', spend_usd: 30 },
    { date: '2026-08-12', spend_usd: 30 },
    { date: '2026-08-13', spend_usd: 30 },
    { date: '2026-08-14', spend_usd: 30 },
    { date: '2026-08-15', spend_usd: 30 },
    { date: '2026-08-16', spend_usd: 30 },
    { date: '2026-08-17', spend_usd: 2 },
  ],
  ad_daily: [
    { date: '2026-08-16', ad_id: 'a1', ad_name: 'Quote VO', spend_usd: 20, product_family: 'Tops' },
    { date: '2026-08-16', ad_id: 'a2', ad_name: 'Quote VO - Copy 2', spend_usd: 30, product_family: 'Tops' },
    { date: '2026-08-17', ad_id: 'a3', ad_name: 'Quote VO - Copy', spend_usd: 0.5, product_family: 'Tops' },
  ],
  ad_country_daily: [
    { date: '2026-08-16', country_code: 'US', ad_name: 'Quote VO', spend_usd: 50 },
    { date: '2026-08-17', country_code: 'US', ad_name: 'Quote VO - Copy', spend_usd: 0.5 },
  ],
});
const shopify = normalizeDashboardPayload('/api/data/shopify-products.json', {
  daily: [
    { date: '2026-08-10', orders: 1, revenue_usd: 80 },
    { date: '2026-08-11', orders: 1, revenue_usd: 80 },
    { date: '2026-08-12', orders: 1, revenue_usd: 80 },
    { date: '2026-08-13', orders: 1, revenue_usd: 80 },
    { date: '2026-08-14', orders: 1, revenue_usd: 80 },
    { date: '2026-08-15', orders: 1, revenue_usd: 80 },
    { date: '2026-08-16', orders: 2, revenue_usd: 200 },
    { date: '2026-08-17', orders: 1, revenue_usd: 100 },
  ],
  order_lines: [
    { date: '2026-08-16', order_id: 'o1', quantity: 1, line_revenue_usd: 100, product: 'Tee', family: 'Tops', country_code: 'US', country: 'United States', attribution: { match_hints: { ad_name: 'Quote VO' } } },
    { date: '2026-08-16', order_id: 'o2', quantity: 1, line_revenue_usd: 100, product: 'Tee', family: 'Tops', country_code: 'US', country: 'United States', attribution: { match_hints: { ad_name: 'Quote VO - Copy 2' } } },
    { date: '2026-08-17', order_id: 'o3', quantity: 1, line_revenue_usd: 100, product: 'Tee', family: 'Tops', country_code: 'US', country: 'United States', attribution: { match_hints: { ad_name: 'Quote VO - Copy' } } },
  ],
});

const model = buildSettledTopMovers(meta, shopify, '2026-08-17');
assert.equal(model.hero.ad.name, 'Quote VO');
assert.equal(model.hero.ad.sales, 2, 'original + Copy orders merge into one logical creative');
assert.equal(model.hero.ad.spend, 50, 'copy spend is summed before ROAS is computed');
assert.equal(model.hero.ad.roas, 4, 'ROAS is recomputed from merged revenue / merged spend');
assert.equal(model.hero.country.roas, 4, 'country hero uses the completed-day spend denominator');
assert.equal(model.thisWeek.ad, null, 'live Monday data is not allowed into the settled current-week card');
assert.equal(model.lastWeek.ad.sales, 2, 'full prior week remains available for context');

console.log('settled Top Movers checks passed');
