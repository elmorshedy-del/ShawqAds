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
assert(current.has_today_data === true, 'A small no-delivery gap must not hide a current Meta day');
assert(current.latest_common_data_day === '2026-08-04', 'Matched coverage should reach today');
assert(current.lagging_source === '', 'Equal coverage must not name a lagging source');
assert(current.coverage_gap === false, 'A one-day Meta gap is allowed');
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

// Regression: the static Meta snapshot can be months old while /api/meta/live-spend
// injects one fresh row for today. That must not make the missing intervening spend
// look like a continuous window, or weekly Shopify revenue gets divided by one day's
// Meta spend and produces huge fake ROAS values.
const bridgedMeta = {
  account_daily_metrics: [
    { date: '2026-06-10', spend_usd: 90 },
    { date: '2026-06-11', spend_usd: 95 },
    { date: '2026-06-12', spend_usd: 105 },
    { date: '2026-08-15', spend_usd: 40, live_today: true },
  ],
};
const currentShopify = {
  daily: [
    { date: '2026-06-10', revenue_usd: 200 },
    { date: '2026-06-11', revenue_usd: 220 },
    { date: '2026-06-12', revenue_usd: 210 },
    { date: '2026-08-10', revenue_usd: 180 },
    { date: '2026-08-11', revenue_usd: 160 },
    { date: '2026-08-12', revenue_usd: 190 },
    { date: '2026-08-13', revenue_usd: 170 },
    { date: '2026-08-14', revenue_usd: 205 },
    { date: '2026-08-15', revenue_usd: 188 },
  ],
};
const bridged = sourceCoverageBounds(bridgedMeta, currentShopify, '2026-08-15');
assert(bridged.coverage_gap === true, 'A months-long Meta bridge must be detected');
assert(bridged.coverage_gap_source === 'Meta', 'The denominator gap must identify Meta');
assert(bridged.coverage_gap_after === '2026-06-12', 'The gap must start after the last trusted Meta date');
assert(bridged.coverage_gap_before === '2026-08-15', 'The isolated live Meta row must be the far side of the gap');
assert(bridged.meta_latest_row_date === '2026-08-15', 'Diagnostics should retain the raw latest Meta row');
assert(bridged.meta_until === '2026-06-12', 'Trusted Meta coverage must stop before the large gap');
assert(bridged.latest_common_data_day === '2026-06-12', 'Blended ROAS coverage must not bridge the missing Meta spend');
assert(bridged.has_today_data === false, 'An isolated live Meta row is not enough to make a multi-day window current');
assert(bridged.lagging_source === 'Meta', 'Meta must be named as the lagging source across the bridge');

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
