import {
  buildCampaignPacing,
  buildCampaignPacingFindings,
  expectedIntradayShare,
  mergeLivePacing,
} from '../src/lib/campaignPacing.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const hourly = [];
for (const date of ['2026-08-01', '2026-08-02', '2026-08-03']) {
  hourly.push(
    { target_id: 'campaign:1', date, hour: 0, spend_usd: 10 },
    { target_id: 'campaign:1', date, hour: 11, spend_usd: 40 },
    { target_id: 'campaign:1', date, hour: 23, spend_usd: 50 },
  );
}
const learned = expectedIntradayShare(hourly, 11);
assert(learned.source === 'historical', 'three complete days should produce a learned delivery curve');
assert(Math.abs(learned.share - 0.5) < 1e-9, 'historical share through hour 11 should be 50%');

const sparse = expectedIntradayShare(hourly.slice(0, 3), 11);
assert(sparse.source === 'linear', 'an undersampled curve must fall back to clock progress');
assert(Math.abs(sparse.share - 0.5) < 1e-9, 'linear fallback through hour 11 should be 50%');

const pacing = {
  generated_at: '2026-08-04T12:00:00Z',
  timezone: 'Europe/Istanbul',
  currency: 'USD',
  coverage_since: '2026-08-01',
  targets: [
    {
      id: 'campaign:1',
      level: 'campaign',
      campaign_id: '1',
      name: 'USA CBO',
      budget_type: 'daily',
      budget_usd: 100,
      status: 'ACTIVE',
      effective_status: 'ACTIVE',
    },
    {
      id: 'adset:2',
      level: 'adset',
      campaign_id: '2',
      adset_id: '2',
      name: 'Retargeting',
      budget_type: 'daily',
      budget_usd: 50,
      status: 'PAUSED',
      effective_status: 'PAUSED',
    },
    {
      id: 'campaign:3',
      level: 'campaign',
      campaign_id: '3',
      name: 'Launch flight',
      budget_type: 'lifetime',
      budget_usd: 1000,
      start_time: '2026-08-01T00:00:00+0300',
      stop_time: '2026-08-10T23:59:59+0300',
      status: 'ACTIVE',
      effective_status: 'ACTIVE',
    },
  ],
  daily: [
    { target_id: 'campaign:1', date: '2026-08-04', spend_usd: 75 },
    { target_id: 'campaign:3', date: '2026-08-01', spend_usd: 100 },
    { target_id: 'campaign:3', date: '2026-08-02', spend_usd: 100 },
    { target_id: 'campaign:3', date: '2026-08-03', spend_usd: 100 },
    { target_id: 'campaign:3', date: '2026-08-04', spend_usd: 100 },
  ],
  hourly,
};

const model = buildCampaignPacing(pacing, { today: '2026-08-04', hour: 11 });
const daily = model.rows.find((row) => row.id === 'campaign:1');
assert(daily.status === 'over', '75 spent against 50 expected should be over pace');
assert(daily.projected === 150, 'intraday projection should use the learned delivery share');
const paused = model.rows.find((row) => row.id === 'adset:2');
assert(paused.status === 'paused', 'paused targets must not produce pacing alarms');
const flight = model.rows.find((row) => row.id === 'campaign:3');
assert(flight.status === 'on_track', '40% of lifetime budget after 40% of flight should be on track');
assert(buildCampaignPacingFindings(model).some((finding) => finding.headline.includes('ahead of pace')), 'overpace should produce a review finding');

const merged = mergeLivePacing(pacing, {
  date: '2026-08-04',
  checked_at: '2026-08-04T15:00:00Z',
  pacing_adset_daily: [
    { campaign_id: '1', adset_id: 'a', spend_usd: 30 },
    { campaign_id: '1', adset_id: 'b', spend_usd: 50 },
    { campaign_id: '2', adset_id: '2', spend_usd: 0 },
  ],
});
const mergedCampaign = merged.daily.find((row) => row.target_id === 'campaign:1' && row.date === '2026-08-04');
assert(mergedCampaign.spend_usd === 80, 'live ad-set spend should roll up to the campaign budget owner');
assert(
  merged.daily.filter((row) => row.target_id === 'campaign:1' && row.date === '2026-08-04').length === 1,
  'live spend must replace rather than duplicate the cached current day',
);

console.log('campaign pacing checks passed');
