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
assert(insights.statistics?.alpha === 0.05, 'Statistics block must expose alpha');
assert(insights.statistics?.tests?.weekdayOverall === 'kruskal-wallis', 'Statistics must document weekday overall test');

function makeDaily(startMonth, days, pattern) {
  const rows = [];
  for (let day = 1; day <= days; day += 1) {
    const date = `2026-${String(startMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    rows.push({ date, orders: pattern(day, date) });
  }
  return rows;
}

const weekdayPatternDaily = [
  ...makeDaily(2, 28, (day) => (day % 7 === 1 ? 20 : 4)),
  ...makeDaily(3, 31, (day) => (day % 7 === 1 ? 22 : 5)),
  ...makeDaily(4, 30, (day) => (day % 7 === 1 ? 21 : 4)),
];
const weekdayInsights = buildHistoricalInsights(weekdayPatternDaily, 'all_time', { developingDay: null, excludeDevelopingDay: false });
assert(weekdayInsights.statistics?.weekdayEffect?.pValue != null, 'Weekday effect must compute a p-value');
assert(weekdayInsights.weekdayTable.some((row) => row.pValueLabel), 'Weekday rows must expose adjusted p-value labels');
assert(weekdayInsights.insights.some((card) => card.pValueLabel), 'Insight cards must expose p-values');
assert(weekdayInsights.monthlyTable.some((row) => row.momPValueLabel), 'Monthly table must expose MoM p-values');

console.log(`historical insights checks passed (${FLOOR_MONTH}+ Shopify only, with p-values)`);
