import {
  buildShopifyHistoricalDaily,
  buildHistoricalInsights,
  FLOOR_MONTH,
} from '../src/lib/historicalInsights.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const shopifyDaily = buildShopifyHistoricalDaily({
  source: 'Shopify',
  daily: [
    { date: '2026-02-01', orders: 3, revenue_usd: 100 },
    { date: '2026-01-31', orders: 99, revenue_usd: 9000 },
  ],
});
assert(shopifyDaily.length === 1 && shopifyDaily[0].date === '2026-02-01', 'Historical daily must floor at February and ignore pre-floor rows');
assert(buildShopifyHistoricalDaily({ source: 'sample-shopify', daily: [{ date: '2026-03-01', orders: 1 }] }).length === 0, 'Sample Shopify fallback must not feed historical tab');
assert(buildShopifyHistoricalDaily({ source: 'Meta', daily: [{ date: '2026-03-01', orders: 1 }] }).length === 0, 'Meta payloads must not feed historical tab');

const insights = buildHistoricalInsights(shopifyDaily, 'all_time');
assert(insights.meta.source === 'Shopify daily orders', 'Insights meta must label Shopify source');
assert(insights.summary.totalOrders === 3, 'Historical insights must sum Shopify daily orders');

console.log(`historical insights checks passed (${FLOOR_MONTH}+ Shopify only)`);
