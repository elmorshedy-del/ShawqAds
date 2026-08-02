import {
  buildKeyFindings,
  concentration,
  detectAnomalies,
  median,
  medianAbsoluteDeviation,
  pctChange,
  periodTotals,
  robustBand,
  robustZScore,
  topDrivers,
} from '../src/lib/analyticsInsights.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/* --- robust statistics -------------------------------------------------- */

assert(median([3, 1, 2]) === 2, 'median should sort before picking the middle');
assert(median([4, 1, 3, 2]) === 2.5, 'median should average the middle pair on even counts');
assert(median([]) === null, 'median of an empty series should be null');

const spread = medianAbsoluteDeviation([10, 12, 14, 20]);
assert(spread > 0, 'MAD should be positive on a dispersed series');
assert(medianAbsoluteDeviation([5]) === null, 'MAD needs at least two points');
// MAD is genuinely zero once more than half the values are identical — common on
// small integer series like daily order counts. robustBand has to compensate.
assert(medianAbsoluteDeviation([10, 10, 10, 20]) === 0, 'MAD is zero when the majority of values tie');

const flatBand = robustBand([100, 100, 100, 100, 100]);
assert(flatBand && flatBand.spread > 0, 'a flat series must still produce a usable band width');
assert(robustBand([1, 2]) === null, 'a band needs at least three points');

const band = robustBand([100, 110, 90, 105, 95]);
assert(band.median === 100, 'band median should be the series median');
assert(band.low < band.median && band.high > band.median, 'band should straddle the median');
assert(robustZScore(band.median, band) === 0, 'the median scores zero');
assert(robustZScore(0, null) === 0, 'a missing band should not throw');

// A mean-based band would be dragged by the outlier; the median-based one is not.
const withOutlier = robustBand([100, 102, 98, 101, 99, 5000]);
assert(Math.abs(withOutlier.median - 100) < 3, 'one huge day must not move the centre of the band');

/* --- anomaly detection -------------------------------------------------- */

const steadyThenSpike = [
  { date: '2026-06-01', revenue_usd: 1000 },
  { date: '2026-06-02', revenue_usd: 1050 },
  { date: '2026-06-03', revenue_usd: 980 },
  { date: '2026-06-04', revenue_usd: 1020 },
  { date: '2026-06-05', revenue_usd: 1010 },
  { date: '2026-06-06', revenue_usd: 990 },
  { date: '2026-06-07', revenue_usd: 6000 },
];
const spikes = detectAnomalies(steadyThenSpike, 'revenue_usd');
assert(spikes.length === 1, 'exactly one day should be flagged');
assert(spikes[0].date === '2026-06-07', 'the spike day should be flagged');
assert(spikes[0].direction === 'above', 'a spike is an above-normal anomaly');
assert(spikes[0].expected > 900 && spikes[0].expected < 1100, 'expected value should be the prior normal');

// No lookahead: the first days can never be judged, and a steady series is quiet.
const steady = detectAnomalies(steadyThenSpike.slice(0, 6), 'revenue_usd');
assert(steady.length === 0, 'a steady series should produce no anomalies');

const excluded = detectAnomalies(steadyThenSpike, 'revenue_usd', { excludeDates: ['2026-06-07'] });
assert(excluded.length === 0, 'excluded dates (e.g. the developing day) must not be flagged');

/* --- period totals ------------------------------------------------------ */

const totals = periodTotals([
  { date: '2026-06-01', revenue_usd: 1000, spend_usd: 500, orders: 10, units: 12 },
  { date: '2026-06-02', revenue_usd: 3000, spend_usd: 500, orders: 20, units: 25 },
]);
assert(totals.revenue_usd === 4000 && totals.spend_usd === 1000, 'totals should sum the series');
assert(totals.roas === 4, 'ROAS must be total revenue over total spend');
assert(totals.aov === 4000 / 30, 'AOV must be total revenue over total orders');
assert(totals.cac === 1000 / 30, 'CAC must be total spend over total orders');
// Averaging the daily ROAS values (2x and 6x) would give 4x here by coincidence,
// so check a case where the two methods genuinely disagree.
const weighted = periodTotals([
  { date: '2026-06-01', revenue_usd: 30, spend_usd: 10, orders: 1 },
  { date: '2026-06-02', revenue_usd: 1000, spend_usd: 1000, orders: 10 },
]);
assert(Math.abs(weighted.roas - 1.0198) < 0.001, 'ROAS must be spend-weighted, not a mean of daily ratios');

assert(pctChange(110, 100) === 10, 'pctChange should report a 10% rise');
assert(pctChange(100, 0) === null, 'pctChange against zero should be null, not Infinity');

/* --- drivers ------------------------------------------------------------ */

const drivers = topDrivers(
  [{ name: 'USA', value: 800 }, { name: 'Canada', value: 300 }, { name: 'Spain', value: 50 }],
  [{ name: 'USA', value: 400 }, { name: 'Canada', value: 350 }],
);
assert(drivers[0].name === 'USA', 'the biggest absolute mover should rank first');
assert(drivers[0].change === 400, 'change should be current minus previous');
assert(drivers.some((row) => row.name === 'Canada' && row.change === -50), 'decliners should be included');
assert(drivers.some((row) => row.name === 'Spain' && row.previous === 0), 'new entrants should be included');

const conc = concentration([{ name: 'USA', value: 700 }, { name: 'Canada', value: 300 }]);
assert(conc.name === 'USA' && Math.abs(conc.share - 70) < 0.001, 'concentration should report the top share');
assert(concentration([]) === null, 'concentration of nothing should be null');

/* --- key findings ------------------------------------------------------- */

const history = [];
for (let day = 1; day <= 20; day += 1) {
  history.push({
    date: `2026-06-${String(day).padStart(2, '0')}`,
    revenue_usd: 1000,
    spend_usd: 400,
    orders: 10,
    units: 12,
  });
}
// Final three days: spend up hard, revenue flat — efficiency should be called out.
for (const day of [18, 19, 20]) {
  const row = history[day - 1];
  row.spend_usd = 900;
}

const range = { since: '2026-06-18', until: '2026-06-20' };
const windowRows = history.filter((row) => row.date >= range.since && row.date <= range.until);
const result = buildKeyFindings({ windowRows, historyRows: history, range });

assert(result.hasComparison, 'a prior window of equal length should be found');
assert(result.previousTotals.days === 3, 'the comparison window should match the selected length');
assert(result.findings.length > 0, 'findings should be produced');
const efficiency = result.findings.find((finding) => finding.id === 'efficiency');
assert(efficiency, 'an efficiency finding should be present when there is spend');
assert(
  efficiency.driver.includes('not paying back'),
  'spend rising faster than revenue should be named as the driver',
);
assert(result.verdict.headline.length > 0, 'a verdict headline should be produced');
assert(result.verdict.detail.includes('ROAS'), 'the verdict should summarise blended ROAS');

// An empty window must not invent findings.
const empty = buildKeyFindings({
  windowRows: [],
  historyRows: history,
  range: { since: '2026-08-01', until: '2026-08-01' },
});
assert(empty.verdict.tone === 'neutral', 'an empty window should read as neutral');
assert(empty.findings.length === 0, 'an empty window should produce no findings');

console.log('analytics insights tests passed');
