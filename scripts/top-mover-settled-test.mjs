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
    { date: '2026-08-16', campaign_id: 'c-us', campaign_name: 'US Campaign', ad_id: 'a1', ad_name: 'Quote VO', spend_usd: 20, product_family: 'Tops' },
    { date: '2026-08-16', campaign_id: 'c-us', campaign_name: 'US Campaign', ad_id: 'a2', ad_name: 'Quote VO - Copy 2', spend_usd: 30, product_family: 'Tops' },
    { date: '2026-08-17', campaign_id: 'c-us', campaign_name: 'US Campaign', ad_id: 'a3', ad_name: 'Quote VO - Copy', spend_usd: 0.5, product_family: 'Tops' },
  ],
  ad_country_daily: [
    { date: '2026-08-16', country_code: 'US', campaign_id: 'c-us', campaign_name: 'US Campaign', ad_name: 'Quote VO', spend_usd: 50 },
    { date: '2026-08-17', country_code: 'US', campaign_id: 'c-us', campaign_name: 'US Campaign', ad_name: 'Quote VO - Copy', spend_usd: 0.5 },
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
    { date: '2026-08-16', orders: 5, revenue_usd: 4700 },
    { date: '2026-08-17', orders: 1, revenue_usd: 100 },
  ],
  order_lines: [
    { date: '2026-08-16', order_id: 'o1', quantity: 1, line_revenue_usd: 100, product: 'Tee', family: 'Tops', country_code: 'US', country: 'United States', attribution: { match_hints: { ad_name: 'Quote VO' } } },
    { date: '2026-08-16', order_id: 'o2', quantity: 1, line_revenue_usd: 100, product: 'Tee', family: 'Tops', country_code: 'US', country: 'United States', attribution: { match_hints: { ad_name: 'Quote VO - Copy 2' } } },
    // This is an attribution/source label, not a Meta creative. Even with much
    // higher revenue it must never become Top Ad. It can still count at country
    // level because the US has one dominant paid campaign in the same window.
    { date: '2026-08-16', order_id: 'o-source', quantity: 1, line_revenue_usd: 1000, product: 'Tee', family: 'Tops', country_code: 'US', country: 'United States', attribution: { utm: { utm_content: 'link_in_bio' } } },
    // Shopify-only countries must not masquerade as paid Top Country. Before the
    // regression fix Sweden won this card by units despite having no Meta spend,
    // campaign, pacing row or conversion attribution.
    { date: '2026-08-16', order_id: 'o-se', quantity: 4, line_revenue_usd: 2000, product: 'Tee', family: 'Tops', country_code: 'SE', country: 'Sweden', attribution: {} },
    { date: '2026-08-16', order_id: 'o-ch', quantity: 3, line_revenue_usd: 1500, product: 'Tee', family: 'Tops', country_code: 'CH', country: 'Switzerland', attribution: {} },
    { date: '2026-08-17', order_id: 'o3', quantity: 1, line_revenue_usd: 100, product: 'Tee', family: 'Tops', country_code: 'US', country: 'United States', attribution: { match_hints: { ad_name: 'Quote VO - Copy' } } },
  ],
});

const model = buildSettledTopMovers(meta, shopify, '2026-08-17');
assert.equal(model.hero.ad.name, 'Quote VO');
assert.equal(model.hero.ad.sales, 2, 'original + Copy orders merge into one logical creative');
assert.equal(model.hero.ad.spend, 50, 'copy spend is summed before ROAS is computed');
assert.equal(model.hero.ad.roas, 4, 'ROAS is recomputed from merged revenue / merged spend');
assert.notEqual(model.hero.ad.name, 'link_in_bio', 'source/UTM labels are not eligible Top Ads');
assert.equal(model.hero.country.country, 'United States', 'Shopify-only Sweden/Switzerland sales cannot become paid Top Country');
assert.equal(model.hero.country.spend, 50, 'paid Top Country spend comes from the same-window Meta country rows');
assert.equal(model.hero.country.roas, 24, 'country hero uses attributed paid-order revenue over the completed-day country spend');
assert.equal(model.thisWeek.ad, null, 'live Monday data is not allowed into the settled current-week card');
assert.equal(model.lastWeek.ad.sales, 2, 'full prior week remains available for context');

console.log('settled Top Movers checks passed');
