import {
  buildAdsFindings,
  buildFunnelFindings,
  buildLaunchFindings,
  buildMarketFindings,
} from '../src/lib/tabInsights.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const byId = (findings, id) => findings.find((f) => f.id === id);

/* --- empty inputs must never manufacture a conclusion ------------------- */

assert(buildFunnelFindings(null).length === 0, 'funnel: null input yields no findings');
assert(buildFunnelFindings({ hasData: false }).length === 0, 'funnel: no data yields no findings');
assert(buildAdsFindings({}).length === 0, 'ads: empty input yields no findings');
assert(buildMarketFindings({}).length === 0, 'market: empty input yields no findings');
assert(buildLaunchFindings({}).length === 0, 'launch: empty input yields no findings');

/* --- funnel ------------------------------------------------------------- */

const funnel = {
  hasData: true,
  icAtc: {
    summary: { currentIndex: 78, launchIndex: 100, deltaSinceLaunch: -22, currentRaw: 62, baseRate: 80 },
    campaigns: [
      { id: 'a', name: 'USA_CBO', totalDen: 900 },
      { id: 'b', name: 'UK_CBO', totalDen: 420 },
    ],
    points: [{ date: '2026-06-10', a: 120, b: 60 }],
  },
  purchaseIc: {
    summary: { currentIndex: 104, launchIndex: 100, deltaSinceLaunch: 4, currentRaw: 18, baseRate: 18 },
    campaigns: [],
    points: [],
  },
};
const funnelFindings = buildFunnelFindings(funnel);
const bottleneck = byId(funnelFindings, 'funnel-bottleneck');
assert(bottleneck, 'funnel: a bottleneck finding should be produced');
assert(bottleneck.headline.includes('Checkout start rate'), 'funnel: the weaker step should be named');
assert(bottleneck.tone === 'negative', 'funnel: a step below baseline is negative');
const trend = byId(funnelFindings, 'funnel-trend-icAtc');
assert(trend && trend.headline.includes('degraded'), 'funnel: a 22-point drop should read as degraded');
// The purchase step only moved 4 points, which is inside the noise floor.
assert(!byId(funnelFindings, 'funnel-trend-purchaseIc'), 'funnel: sub-5-point moves should not be reported');
const spread = byId(funnelFindings, 'funnel-spread-icAtc');
assert(spread && spread.headline.includes('60'), 'funnel: campaign spread should be reported');
assert(spread.context.includes('900') && spread.context.includes('420'),
  'funnel: the traffic behind each end of the gap must be shown');
assert(/2 campaign lines/.test(spread.context),
  'funnel: the reader must be told how many lines the widest gap was picked from');

// The same 60-point gap on a thin campaign line is not evidence of anything.
const thinSpread = buildFunnelFindings({
  hasData: true,
  icAtc: {
    summary: { currentIndex: 78, launchIndex: 100, deltaSinceLaunch: -22, currentRaw: 62, baseRate: 80 },
    campaigns: [
      { id: 'a', name: 'USA_CBO', totalDen: 900 },
      { id: 'b', name: 'Tiny_Test', totalDen: 12 },
    ],
    points: [{ date: '2026-06-10', a: 120, b: 60 }],
  },
  purchaseIc: { summary: { currentIndex: 100, launchIndex: 100, deltaSinceLaunch: 0 }, campaigns: [], points: [] },
});
assert(!byId(thinSpread, 'funnel-spread-icAtc'),
  'funnel: a campaign line with almost no traffic must not anchor a spread finding');

// A balanced funnel should not invent a bottleneck.
const balanced = buildFunnelFindings({
  hasData: true,
  icAtc: { summary: { currentIndex: 100, launchIndex: 100, deltaSinceLaunch: 0 }, campaigns: [], points: [] },
  purchaseIc: { summary: { currentIndex: 102, launchIndex: 100, deltaSinceLaunch: 2 }, campaigns: [], points: [] },
});
assert(balanced.length === 0, 'funnel: a balanced, flat funnel produces no findings');

/* --- ads ---------------------------------------------------------------- */

const adsFindings = buildAdsFindings({
  adSets: [
    { adSet: 'Winner', status: 'Healthy', roas: 4.2, spend: 900, sales: 12, freq: 1.1, cpm: 12, cpmVsMar: 2 },
    { adSet: 'Loser', status: 'Fatigue risk', roas: 0.6, spend: 700, sales: 5, freq: 2.4, cpm: 22, cpmVsMar: 40 },
    // Below the spend floor: must not be picked as best or worst.
    { adSet: 'Tiny', status: 'Healthy', roas: 19, spend: 12, sales: 1, freq: 1, cpm: 8, cpmVsMar: 0 },
  ],
  campaigns: [
    { name: 'USA_CBO', flag: 'warning', spend: 1600, shopifyRoas: 1.4 },
    { name: 'UK_CBO', flag: 'clean', spend: 200, shopifyRoas: 3 },
    { name: 'AU_CBO', flag: 'clean', spend: 100, shopifyRoas: 2 },
  ],
});
const adSpread = byId(adsFindings, 'ads-spread');
assert(adSpread, 'ads: a spread finding should be produced');
assert(adSpread.headline.includes('Loser') && adSpread.headline.includes('Winner'), 'ads: both ends should be named');
assert(!adSpread.headline.includes('Tiny'), 'ads: below-floor spend must not be crowned best');
assert(adSpread.action.includes('Investigate'), 'ads: a sub-1x ad set should trigger investigation, not a causal cut command');
assert(/12 sales/.test(adSpread.context) && /5/.test(adSpread.context),
  'ads: the sales count behind each ROAS must be shown');
assert(/do not overlap/.test(adSpread.context),
  'ads: the claim rests on non-overlapping ranges and should say so');

// Two ad sets a hair apart on a handful of sales each are not separable, and
// must not be dressed up as a winner and a loser.
const thinAds = buildAdsFindings({
  adSets: [
    { adSet: 'A', status: 'Healthy', roas: 2.4, spend: 400, sales: 4 },
    { adSet: 'B', status: 'Healthy', roas: 1.9, spend: 400, sales: 3 },
    { adSet: 'C', status: 'Healthy', roas: 2.1, spend: 400, sales: 4 },
  ],
  campaigns: [],
});
assert(!byId(thinAds, 'ads-spread'),
  'ads: overlapping ROAS ranges must not produce a best-vs-worst verdict');
const unresolved = byId(thinAds, 'ads-spread-unresolved');
assert(unresolved && unresolved.tone === 'neutral',
  'ads: "cannot tell them apart yet" is itself a finding, not silence');
assert(/could still swap order/.test(unresolved.context),
  'ads: the unresolved note should say why the ranking is not safe to act on');

const fatigue = byId(adsFindings, 'ads-fatigue');
assert(fatigue && fatigue.headline.includes('1 ad set'), 'ads: fatigue should be counted');
const attribution = byId(adsFindings, 'ads-attribution');
assert(attribution && attribution.tone === 'watch', 'ads: a Meta/Shopify gap is a trust caveat, not a result');
const concentration = byId(adsFindings, 'ads-concentration');
assert(concentration && concentration.headline.includes('84%'), 'ads: spend concentration should be reported');
assert(concentration.action.includes('hard look'), 'ads: a big-spend, low-ROAS campaign should be flagged');

/* --- market ------------------------------------------------------------- */

const marketFindings = buildMarketFindings({
  countries: [
    { country: 'United States', roas: 3.8, orders: 40, units: 82, revenue: 9000, spend: 2400 },
    { country: 'Singapore', roas: 0.8, orders: 8, units: 12, revenue: 400, spend: 500 },
    { country: 'Switzerland', roas: 0.5, orders: 1, units: 1, revenue: 60, spend: 120 },
    { country: 'Norway', roas: 0, orders: 0, units: 0, revenue: 0, spend: 300 },
    { country: 'Oman', roas: 4, orders: 2, units: 3, revenue: 200, spend: 50 },
    { country: 'Qatar', roas: 4.8, orders: 2, units: 4, revenue: 240, spend: 50 },
  ],
});
const best = byId(marketFindings, 'market-best');
assert(best && best.headline.includes('United States'), 'market: strongest comparable market should be named');
const worst = byId(marketFindings, 'market-worst');
assert(worst && worst.headline.includes('Singapore'), 'market: weakest comparable market should be named');
// Switzerland has a worse ROAS but only 1 unit — it must not drive the recommendation.
assert(!worst.headline.includes('Switzerland'), 'market: low-sample markets must not be crowned worst');
const dead = byId(marketFindings, 'market-dead');
assert(dead && dead.headline.includes('1 market'), 'market: spend with no revenue should be flagged');
assert(dead.context.includes('Norway'), 'market: the largest dead-spend market should be named');
assert(marketFindings.length <= 4, 'market: findings are capped so the panel stays readable');
// The low-sample caveat is informational and is correctly the first thing dropped when
// actionable findings fill the panel. It surfaces when there is room for it.
const quietMarket = buildMarketFindings({
  countries: [
    { country: 'United States', roas: 2.5, orders: 20, units: 40, revenue: 1000, spend: 400 },
    { country: 'Canada', roas: 2.4, orders: 18, units: 38, revenue: 950, spend: 400 },
    { country: 'Oman', roas: 4, orders: 2, units: 3, revenue: 200, spend: 50 },
    { country: 'Qatar', roas: 4.8, orders: 2, units: 4, revenue: 240, spend: 50 },
    { country: 'Switzerland', roas: 0.5, orders: 1, units: 1, revenue: 60, spend: 120 },
  ],
});
const lowSample = byId(quietMarket, 'market-lowsample');
assert(lowSample && lowSample.headline.includes('3 markets'), 'market: low-sample markets should be counted');
assert(lowSample.tone === 'neutral', 'market: the low-sample note is a caveat, not a verdict');

/* --- launch ------------------------------------------------------------- */

const saturating = [];
for (let i = 0; i < 9; i += 1) {
  saturating.push({ date: `06-0${i + 1}`, reach: 10000 - i * 700, frequency: 1 + i * 0.06, cpm: 10, spend: 100 });
}
const launchFindings = buildLaunchFindings({
  delivery: saturating,
  phases: {
    history: { name: 'Testing_USA_ABO', reachPerDollar: 81.2, cpm: 11.18, days: 49 },
    launch: { name: 'USA_CBO launch', reachPerDollar: 69.3, cpm: 12.8, days: 6 },
  },
});
const efficiency = byId(launchFindings, 'launch-efficiency');
assert(efficiency, 'launch: an efficiency comparison should be produced');
assert(efficiency.headline.includes('less'), 'launch: lower reach/$ should read as less efficient');
assert(efficiency.tone === 'watch', 'launch: a 15% shortfall is a watch, not a failure');
const saturation = byId(launchFindings, 'launch-saturation');
assert(saturation, 'launch: falling reach with rising frequency is the saturation signal');
assert(saturation.action.includes('Broaden targeting'), 'launch: saturation should recommend broadening');

// Growing reach with flat frequency is headroom, not saturation.
const healthy = [];
for (let i = 0; i < 9; i += 1) {
  healthy.push({ date: `06-0${i + 1}`, reach: 8000 + i * 600, frequency: 1.1, cpm: 10, spend: 100 });
}
const healthyFindings = buildLaunchFindings({ delivery: healthy });
assert(byId(healthyFindings, 'launch-headroom'), 'launch: growing reach at flat frequency is headroom');
assert(!byId(healthyFindings, 'launch-saturation'), 'launch: healthy delivery must not be called saturation');

console.log('tab insights tests passed');
