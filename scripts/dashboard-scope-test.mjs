import { rollingMatchedRange, sourceCoverageBounds } from '../src/lib/dashboardScope.js';
import { behaviorCachedUntil } from '../src/lib/reportingBounds.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const meta = {
  analysis_window: { since: '2026-06-03', until: '2026-08-04' },
  account_daily_metrics: [
    { date: '2026-08-01', spend_usd: 100 },
    { date: '2026-08-02', spend_usd: 120 },
  ],
};
const shopify = {
  period: { since: '2026-02-01', until: '2026-08-04' },
  daily: [
    { date: '2026-08-01', revenue_usd: 300 },
    { date: '2026-08-02', revenue_usd: 320 },
    { date: '2026-08-03', revenue_usd: 280 },
    { date: '2026-08-04', revenue_usd: 90 },
  ],
};

const staleMeta = sourceCoverageBounds(meta, shopify, '2026-08-04');
assert(staleMeta.meta_until === '2026-08-02', 'Meta coverage must come from returned rows');
assert(staleMeta.shopify_until === '2026-08-04', 'Shopify row coverage should reach today');
assert(staleMeta.latest_common_data_day === '2026-08-02', 'Blended coverage must stop at the earlier source');
assert(staleMeta.latest_any_data_day === '2026-08-04', 'Latest-any coverage should remain available for diagnostics');
assert(staleMeta.has_today_data === false, 'One current source is not enough for a current blended metric');
assert(staleMeta.lagging_source === 'Meta', 'The stale source should be named');
const staleWeek = rollingMatchedRange({
  today: '2026-08-04',
  latest_data_day: staleMeta.latest_common_data_day,
  common_until: staleMeta.common_until,
  has_today_data: staleMeta.has_today_data,
}, 7);
assert(
  staleWeek.since === '2026-07-27' && staleWeek.until === '2026-08-02',
  'Last week must end on the latest matched day when either source is stale',
);

const currentMeta = {
  ...meta,
  account_daily_metrics: [
    ...meta.account_daily_metrics,
    { date: '2026-08-04', spend_usd: 80 },
  ],
};
const current = sourceCoverageBounds(currentMeta, shopify, '2026-08-04');
assert(current.has_today_data === true, 'Both sources current should enable today');
assert(current.latest_common_data_day === '2026-08-04', 'Matched coverage should reach today');
assert(current.lagging_source === '', 'Equal coverage must not name a lagging source');
const currentWeek = rollingMatchedRange({
  today: '2026-08-04',
  latest_data_day: current.latest_common_data_day,
  common_until: current.common_until,
  has_today_data: current.has_today_data,
}, 7);
assert(
  currentWeek.since === '2026-07-29' && currentWeek.until === '2026-08-04',
  'Last week should end on today when both sources are current',
);

const behavior = {
  period: { since: '2026-06-03', until: '2026-08-04' },
  facts: [{ date: '2026-06-12' }],
  meta_demographics_rows: [{ date_start: '2026-06-11' }],
};
assert(
  behaviorCachedUntil(behavior) === '2026-06-12',
  'Behavior coverage must use returned rows instead of a newer requested period',
);

console.log('dashboard scope checks passed');
