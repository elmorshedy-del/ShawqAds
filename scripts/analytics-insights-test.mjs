import {
  MIN_PCT_BASE,
  buildKeyFindings,
  concentration,
  detectAnomalies,
  median,
  pctChange,
  periodTotals,
  topDrivers,
} from '../src/lib/analyticsInsights.js';
import {
  assessDay,
  describeDay,
  formalNote,
  medianAbsoluteDeviation,
  percentile,
  summarizeBaseline,
} from '../src/lib/anomalyStats.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const DAY_MS = 86400000;
const SERIES_START = Date.UTC(2026, 5, 1); // 2026-06-01
const isoDay = (index) => new Date(SERIES_START + index * DAY_MS).toISOString().slice(0, 10);
const steadyDays = (count, value) => Array.from({ length: count }, () => value);
const dayRows = (values, key, extra = () => ({})) => values.map((value, index) => ({
  date: isoDay(index),
  [key]: value,
  ...extra(index),
}));

/* --- percentiles and baselines ------------------------------------------ */

assert(median([3, 1, 2]) === 2, 'median should sort before picking the middle');
assert(median([4, 1, 3, 2]) === 2.5, 'median should average the middle pair on even counts');
assert(median([]) === null, 'median of an empty series should be null');
assert(percentile([1, 2, 3, 4], 0.25) === 1.75, 'quartiles should interpolate between order statistics');
assert(percentile([], 0.5) === null, 'a percentile of nothing should be null');

// A short history cannot establish a normal, no matter how tidy it looks.
const shortBaseline = summarizeBaseline(steadyDays(6, 100));
assert(!shortBaseline.usable && shortBaseline.limitation === 'short-history',
  'fewer than ten measured days must not yield a normal');

// The exact shape that produced "typical day around $0": mostly idle, a few live days.
const intermittent = summarizeBaseline([...steadyDays(24, 0), 600, 955, 700, 800]);
assert(!intermittent.usable && intermittent.limitation === 'intermittent',
  'a mostly-idle series has no steady centre and must say so');
assert(intermittent.typical === 750,
  'the typical day must be computed from days that actually ran, not from the idle ones');

const healthy = summarizeBaseline([...steadyDays(10, 100), ...steadyDays(10, 200)]);
assert(healthy.usable, 'twenty active days with real spread should be usable');
assert(healthy.rarityFloor === 1 / 21,
  'the finest demonstrable rarity is 1-in-(n+1), and must be carried through');

/* --- the reported-sigma defect ------------------------------------------ */

// Replay of the real account: 24 uncovered days at $0, four live days, then $620.
// The old median+MAD band called this "typical day around $0 (usual range
// $0–$191). This is a 6.5σ move." Nothing may claim a sigma from this baseline.
const sigmaCase = assessDay(620, [...steadyDays(24, 0), 600, 955, 700, 800]);
assert(sigmaCase.limitation === 'intermittent', 'the reported-sigma baseline must be rejected as intermittent');
assert(!sigmaCase.unusual, 'a day cannot be called unusual against a baseline that has no normal');
assert(!('z' in sigmaCase) && !('sigma' in sigmaCase),
  'no sigma-like field may survive on an assessment');

const sigmaCopy = describeDay({
  assessment: sigmaCase,
  label: 'Meta spend',
  format: (value) => `$${Math.round(value)}`,
  date: '2026-08-07',
});
const sigmaText = `${sigmaCopy.headline} ${sigmaCopy.context}`;
assert(!/σ|sigma|standard deviation/i.test(sigmaText), 'published copy must never quote a sigma');
assert(!/around \$0|\$0–|\$0-/.test(sigmaText), 'copy must not present a manufactured $0 normal');
assert(/idle on 24 of the 28 days/.test(sigmaText), 'copy must state how much of the baseline was idle');
assert(/750/.test(sigmaText), 'copy must anchor on the typical day that actually ran');

// The reductio the old code allowed: an all-zero baseline yielded z = 600.
const allZeroBaseline = assessDay(600, steadyDays(28, 0));
assert(!allZeroBaseline.unusual, 'an all-idle baseline can never make a day unusual');

/* --- honest deviations still surface ------------------------------------ */

const realSpike = assessDay(6000, steadyDays(20, 1000));
assert(realSpike.unusual, 'a genuine 6x jump against a solid baseline must still be flagged');
assert(realSpike.exceedsAll, 'the spike is a new high and should be marked as one');
const spikeCopy = describeDay({ assessment: realSpike, label: 'Revenue', format: (v) => `$${Math.round(v)}`, date: '2026-06-07' });
assert(/highest in 20 days/.test(spikeCopy.headline), 'the headline should rank the day against measured history');
assert(/1-in-21/.test(spikeCopy.context), 'the claim must be capped at what 20 days can demonstrate');
assert(!/σ|sigma/i.test(`${spikeCopy.headline} ${spikeCopy.context}`), 'no sigma in the spike copy either');

/* --- the formal measure is additive, never load-bearing ------------------ */

// The plain sentence has to stand on its own; the formal line is for a reader
// who wants the statistic behind it.
const formal = formalNote(realSpike);
assert(/one-sided rank p/.test(formal), 'the formal note should carry the exact rank p');
assert(/n = 20/.test(formal), 'the formal note must state the baseline size the figures rest on');
assert(/^Formally:/.test(formal), 'the formal note should be visibly a restatement, not a new claim');
assert(!/σ/.test(spikeCopy.headline) && !/σ/.test(spikeCopy.context),
  'sigma belongs only in the formal line, never in the plain-language ones');

// A sigma has to be earned. A flat baseline has no scale, so none is quoted —
// this is the exact substitution that produced the original 6.5σ.
assert(medianAbsoluteDeviation(steadyDays(20, 500)) === null,
  'a flat series has no MAD, and none may be substituted');
const flatFormal = formalNote(assessDay(9000, steadyDays(20, 500)));
assert(!/σ/.test(flatFormal), 'no sigma may be quoted when the spread is flat');
assert(/spread too flat/.test(flatFormal), 'the formal note should say why the scale figure is missing');

// The rank p can never be finer than the baseline length allows.
const p20 = assessDay(9999, steadyDays(20, 500));
assert(Math.abs(p20.rankP - 1 / 21) < 1e-12, 'a new high against 20 days is exactly 1-in-21');

/* --- ratios cannot run away --------------------------------------------- */

// Every one of these was found by scripts/insight-stress-test.mjs, and each is
// the 6.5σ failure in a different costume: a denominator that vanishes, or a
// sign that stops meaning anything.
const tinyTypical = assessDay(600, steadyDays(20, 0.02));
assert(tinyTypical.multiple === 50 && tinyTypical.multipleCapped,
  'a fold-change against a near-zero typical day must be capped, not reported as 30000x');
const tinyCopy = describeDay({ assessment: tinyTypical, label: 'Revenue', format: (v) => `$${Math.round(v)}` });
assert(!/30000/.test(`${tinyCopy.headline} ${tinyCopy.context}`),
  'the capped multiple must not leak the raw ratio into copy');

assert(pctChange(600, -1000, { minBase: MIN_PCT_BASE.revenue_usd }) === null,
  'a percentage change from a negative base inverts its own direction and must be refused');
assert(pctChange(600, 0.01, { minBase: MIN_PCT_BASE.revenue_usd }) === null,
  'a percentage change off a sub-cent base describes the denominator, not the business');
assert(pctChange(600, 800, { minBase: MIN_PCT_BASE.revenue_usd }) === -25,
  'a percentage off a sound base is unaffected');

const refundPeriod = periodTotals([{ revenue_usd: -487, spend_usd: 1000, orders: 5, units: 5 }]);
assert(refundPeriod.roas === 0, 'a negative ROAS is meaningless and must be suppressed, not charted');
const creditPeriod = periodTotals([{ revenue_usd: 100, spend_usd: -50, orders: 2, units: 2 }]);
assert(creditPeriod.cac === 0, 'an ad-account credit must not read as a cheaper customer');
const denormalOrders = periodTotals([{ revenue_usd: 12, spend_usd: 1, orders: 5e-324, units: 1 }]);
assert(Number.isFinite(denormalOrders.aov) && denormalOrders.aov >= 0,
  'a denormal denominator must not overflow AOV to Infinity');

// Refund days are activity in the wrong direction, not absence of activity.
// Counting them as idle both loses a real day and skews the series toward a
// false "intermittent" verdict.
const withRefunds = summarizeBaseline([...steadyDays(14, 800), -500, -200, ...steadyDays(4, 750)]);
assert(withRefunds.idleDays === 0 && withRefunds.activeDays === 20,
  'negative days are measured activity, not idle days');
assert(withRefunds.usable, 'a series with a couple of refund days still has a usable normal');

/* --- anomaly detection -------------------------------------------------- */

const steadyThenSpike = dayRows([...steadyDays(20, 1000), 6000], 'revenue_usd');
const spikes = detectAnomalies(steadyThenSpike, 'revenue_usd');
assert(spikes.length === 1, 'exactly one day should be flagged');
assert(spikes[0].date === isoDay(20), 'the spike day should be flagged');
assert(spikes[0].direction === 'above', 'a spike is an above-normal anomaly');
assert(spikes[0].kind === 'deviation', 'a supported spike is a deviation, not a restart');

// No lookahead: the first days can never be judged, and a steady series is quiet.
const steady = detectAnomalies(dayRows(steadyDays(20, 1000), 'revenue_usd'), 'revenue_usd');
assert(steady.length === 0, 'a steady series should produce no anomalies');

const excluded = detectAnomalies(steadyThenSpike, 'revenue_usd', { excludeDates: [isoDay(20)] });
assert(excluded.length === 0, 'excluded dates (e.g. the developing day) must not be flagged');

/* --- coverage awareness ------------------------------------------------- */

// The real account shape: a long stretch Meta never reported (spend_usd falls
// back to 0), then ten genuine spending days, then the day under review.
const liveSpend = [400, 420, 450, 380, 470, 440, 410, 460, 430, 490];
const COVERAGE_GAP_DAYS = 24;
const gappedSpend = dayRows(
  [...steadyDays(COVERAGE_GAP_DAYS, 0), ...liveSpend, 620],
  'spend_usd',
  (index) => ({ meta_covered: index >= COVERAGE_GAP_DAYS }),
);

// Read as if the gap were real zeros, the series looks intermittent: the day
// under review is missed entirely, and the first *reported* day is misread as a
// restart. The coverage gap manufactures an event that never happened.
const gapBlind = detectAnomalies(gappedSpend, 'spend_usd');
assert(gapBlind.every((hit) => hit.date !== isoDay(COVERAGE_GAP_DAYS + liveSpend.length)),
  'uncovered zeros hide the day actually under review');
assert(gapBlind.some((hit) => hit.date === isoDay(COVERAGE_GAP_DAYS) && hit.kind === 'resumed'),
  'and instead manufacture a phantom restart on the first reported day');

// Read with coverage, the ten measured days form a usable baseline and the day
// is judged against them.
const gapAware = detectAnomalies(gappedSpend, 'spend_usd', { coverageKey: 'meta_covered' });
assert(gapAware.length === 1 && gapAware[0].date === isoDay(COVERAGE_GAP_DAYS + liveSpend.length),
  'with coverage applied the day is judged against the days Meta actually reported');
assert(gapAware[0].kind === 'deviation' && gapAware[0].assessment.usable,
  'ten reported days are a usable baseline');
assert(gapAware[0].assessment.typical === 435,
  'the typical day must come from the reported days only');

/* --- stopping and restarting ------------------------------------------- */

// Ten spending days, a fortnight switched off, then spend again. That is exactly
// two events, and a fourteen-day outage must not become fourteen findings.
const IDLE_STRETCH_DAYS = 14;
const stopStart = detectAnomalies(
  dayRows([...steadyDays(10, 400), ...steadyDays(IDLE_STRETCH_DAYS, 0), 620], 'spend_usd'),
  'spend_usd',
);
assert(stopStart.length === 2, 'an outage and a restart are two events, not one per idle day');

const [stopped, resumed] = stopStart;
assert(stopped.date === isoDay(10) && stopped.value === 0,
  'the first idle day is the one that reports delivery stopping');
assert(resumed.date === isoDay(10 + IDLE_STRETCH_DAYS) && resumed.kind === 'resumed',
  'spend restarting after an idle run should be reported as a restart, not a deviation');
assert(resumed.idleRun === IDLE_STRETCH_DAYS,
  'the restart should carry how long the series had been idle');

// Restart copy must describe the outage rather than invent a normal to deviate from.
const resumedCopy = describeDay({
  assessment: resumed.assessment,
  label: 'Meta spend',
  format: (value) => `$${Math.round(value)}`,
  date: resumed.date,
});
assert(/idle on 14 of the 24 days/.test(resumedCopy.context),
  'restart copy should state how much of the baseline was idle');
assert(!/σ|sigma/i.test(`${resumedCopy.headline} ${resumedCopy.context}`),
  'restart copy must not quote a sigma either');

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

const developing = buildKeyFindings({
  windowRows: [{ date: '2026-08-04', revenue_usd: 500, spend_usd: 200, orders: 5, units: 6 }],
  historyRows: history,
  range: { since: '2026-08-04', until: '2026-08-04' },
  reportingToday: '2026-08-04',
  comparisonRows: [{ date: '2026-08-03', revenue_usd: 400, spend_usd: 180, orders: 4, units: 5 }],
  comparisonLabel: 'vs same time previous day',
  revenueDrivers: {
    countries: [{ name: 'USA', change: 900, share: 100 }],
    products: [],
  },
});
assert(developing.hasComparison, 'a same-time comparison supplied by the KPI contract should be used');
assert(
  developing.findings.some((finding) => finding.headline.includes('vs same time previous day')),
  'findings and KPI cards must use the same comparison label',
);
assert(
  developing.findings.every((finding) => !finding.driver?.includes('USA added')),
  'full-day drivers must be suppressed on a same-time comparison',
);

const partialComparison = buildKeyFindings({
  windowRows,
  historyRows: history,
  range,
  comparisonRows: [history[16]],
  comparisonLabel: 'vs previous period',
});
assert(!partialComparison.hasComparison, 'a partial prior window must not be presented as comparable');

// An empty window must not invent findings.
const empty = buildKeyFindings({
  windowRows: [],
  historyRows: history,
  range: { since: '2026-08-01', until: '2026-08-01' },
});
assert(empty.verdict.tone === 'neutral', 'an empty window should read as neutral');
assert(empty.findings.length === 0, 'an empty window should produce no findings');

console.log('analytics insights tests passed');
