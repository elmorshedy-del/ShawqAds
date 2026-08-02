import {
  averageRoas,
  breakEvenSpend,
  buildSpendResponseFindings,
  coefficientOfVariation,
  fitResponseCurve,
  marginalRoas,
  marketSaturation,
  predictedRevenue,
  responseCurve,
} from '../src/lib/spendResponse.js';
import { buildBudgetPacing, buildPacingFindings, daysInMonth } from '../src/lib/budgetPacing.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const byId = (list, id) => list.find((f) => f.id === id);

/* ================= spend response ======================================= */

/* --- refusal cases: the model must decline rather than invent ----------- */

assert(!fitResponseCurve([]).ok, 'no data cannot be fitted');
assert(fitResponseCurve([]).reason.includes('at least'), 'refusal explains the minimum');

// Flat spend: the curve is mathematically unidentifiable no matter how many days.
const flat = [];
for (let i = 0; i < 20; i += 1) flat.push({ date: `d${i}`, spend: 500, revenue: 1400 + (i % 3) });
const flatFit = fitResponseCurve(flat);
assert(!flatFit.ok, 'constant spend cannot identify a response curve');
assert(flatFit.reason.includes('barely varied'), 'refusal names the reason as lack of variation');

// Pure noise must not pass the fit-quality gate. Checked as a false-positive rate
// across many trials rather than a single sample, because one lucky draw proves
// nothing — with ten points a spurious fit is entirely possible.
function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let falsePositives = 0;
for (let trial = 0; trial < 200; trial += 1) {
  const rand = mulberry32(trial * 7919 + 13);
  const noise = [];
  for (let i = 0; i < 10; i += 1) {
    noise.push({ date: `d${i}`, spend: 100 + rand() * 900, revenue: 200 + rand() * 1800 });
  }
  if (fitResponseCurve(noise).ok) falsePositives += 1;
}
assert(
  falsePositives === 0,
  `unrelated spend/revenue must not produce a curve; got ${falsePositives}/200 false positives`,
);

/* --- recovery of a known curve ----------------------------------------- */

const VMAX = 10000;
const K = 2000;
const clean = [];
for (let i = 1; i <= 14; i += 1) {
  const spend = i * 120;
  clean.push({ date: `d${i}`, spend, revenue: (VMAX * spend) / (K + spend) });
}
const fit = fitResponseCurve(clean);
assert(fit.ok, 'a clean Michaelis-Menten series should fit');
assert(fit.r2 > 0.99, `noiseless data should fit almost exactly, got R2 ${fit.r2}`);
assert(Math.abs(fit.vmax - VMAX) / VMAX < 0.1, `Vmax should be recovered, got ${fit.vmax}`);
assert(Math.abs(fit.k - K) / K < 0.1, `K should be recovered, got ${fit.k}`);

/* --- the mathematical relationships the UI depends on ------------------- */

const exact = { vmax: VMAX, k: K, maxSpend: 1680, meanSpend: 900, n: 14, ok: true };
assert(close(predictedRevenue(2000, exact), 5000), 'at S = K revenue is half the ceiling');
assert(close(averageRoas(2000, exact), 2.5), 'average ROAS = Vmax/(K+S)');
assert(close(marginalRoas(2000, exact), 1.25), 'marginal ROAS = Vmax*K/(K+S)^2');
// Diminishing returns: marginal is strictly below average, always.
for (const spend of [100, 500, 2000, 8000]) {
  assert(
    marginalRoas(spend, exact) < averageRoas(spend, exact),
    `marginal must sit below average at ${spend}`,
  );
}
// Both decline monotonically as spend rises.
assert(marginalRoas(4000, exact) < marginalRoas(1000, exact), 'marginal return falls as spend rises');

const be = breakEvenSpend(exact);
assert(close(marginalRoas(be, exact), 1, 1e-6), 'break-even spend is where marginal return is exactly 1x');
assert(close(be, Math.sqrt(VMAX * K) - K, 1e-6), 'break-even matches the closed form');
// A ceiling below the half-saturation point never repays even the first dollar.
assert(breakEvenSpend({ vmax: 100, k: 5000 }) === null, 'an unreachable break-even returns null');

const curve = responseCurve(exact, { maxSpend: 3360, steps: 20 });
assert(curve.length === 21, 'the curve is sampled inclusively');
assert(curve.some((p) => p.extrapolated) && curve.some((p) => !p.extrapolated), 'the curve marks the tested/untested boundary');
assert(
  curve.filter((p) => !p.extrapolated).every((p) => p.spend <= exact.maxSpend),
  'nothing inside the tested range may exceed the highest observed spend',
);

/* --- per-market non-parametric signal ----------------------------------- */

const saturation = marketSaturation({
  // Spends more, earns proportionally less on the heavy days.
  Saturating: [
    { spend: 10, revenue: 40 }, { spend: 12, revenue: 48 }, { spend: 11, revenue: 44 },
    { spend: 100, revenue: 120 }, { spend: 110, revenue: 130 }, { spend: 105, revenue: 126 },
  ],
  // Holds its ROAS as spend rises.
  Scaling: [
    { spend: 10, revenue: 20 }, { spend: 12, revenue: 24 }, { spend: 11, revenue: 22 },
    { spend: 100, revenue: 300 }, { spend: 110, revenue: 330 }, { spend: 105, revenue: 315 },
  ],
  TooFew: [{ spend: 10, revenue: 20 }, { spend: 20, revenue: 40 }],
});
const sat = saturation.find((s) => s.market === 'Saturating');
const scal = saturation.find((s) => s.market === 'Scaling');
assert(sat && sat.deltaPct < -50, 'a saturating market shows a large ROAS drop on heavy days');
assert(scal && scal.deltaPct >= 50, 'a scaling market shows ROAS holding or improving');
assert(close(scal.lowRoas, 2) && close(scal.highRoas, 3), 'pooled ROAS is computed per side, not averaged per day');
assert(!saturation.some((s) => s.market === 'TooFew'), 'markets without enough days on both sides are skipped');

/* --- findings ----------------------------------------------------------- */

assert(buildSpendResponseFindings({ ok: false }).length === 0, 'a failed fit produces no findings');

const headroom = buildSpendResponseFindings(exact, saturation, { currentSpend: 500 });
const marginalFinding = byId(headroom, 'response-marginal');
assert(marginalFinding, 'a marginal-return finding is always produced for a good fit');
assert(marginalFinding.action.includes('Room to scale'), 'below break-even should read as headroom');
assert(!byId(headroom, 'response-oversaturated'), 'below break-even is not over-saturated');

const over = buildSpendResponseFindings(exact, [], { currentSpend: be + 5000 });
assert(byId(over, 'response-oversaturated'), 'spending past break-even must be called out');
assert(byId(over, 'response-marginal').tone === 'negative', 'a sub-1x next dollar is a negative finding');
assert(byId(headroom, 'response-market-saturating'), 'a degrading market is reported');
assert(byId(headroom, 'response-market-scaling'), 'a resilient market is reported');

assert(close(coefficientOfVariation([10, 10, 10]), 0), 'a constant series has zero variation');
assert(coefficientOfVariation([10, 20, 30]) > 0.3, 'a spread series has real variation');

/* ================= budget pacing ======================================== */

assert(daysInMonth('2026-02-10') === 28, 'February 2026 has 28 days');
assert(daysInMonth('2026-06-10') === 30, 'June has 30 days');
assert(buildBudgetPacing([], { today: '' }) === null, 'pacing needs a reporting day');

const june = [];
for (let d = 1; d <= 9; d += 1) {
  june.push({ date: `2026-06-0${d}`, spend_usd: 100 });
}
june.push({ date: '2026-06-10', spend_usd: 50 });
// Also include a prior month, which must be ignored entirely.
june.push({ date: '2026-05-20', spend_usd: 99999 });

const pacing = buildBudgetPacing(june, { budget: 3000, today: '2026-06-10', elapsedShare: 0.5 });
assert(pacing.spentToDate === 950, 'only the current month counts toward spend');
assert(pacing.todaySpend === 50, 'today is separated from completed days');
assert(close(pacing.dailyRate, 100), 'run rate uses completed days only, not the half-finished day');
assert(close(pacing.elapsedDays, 9.5), 'today counts only for the part that has elapsed');
assert(close(pacing.remainingDays, 20.5), 'remaining days account for the partial day');
assert(close(pacing.projected, 950 + 20.5 * 100), 'projection extends the run rate over remaining days');
// 950/3000 spent against 9.5/30 elapsed is 19/60 on both sides — exactly even pace.
assert(close(pacing.paceIndex, 1, 1e-9), `pace index should be exactly 1, got ${pacing.paceIndex}`);
assert(pacing.status === 'on_track', 'within 10% of even pace is on track');

const hot = buildBudgetPacing(june, { budget: 1500, today: '2026-06-10', elapsedShare: 0.5 });
assert(hot.status === 'hot', 'a small budget against this spend is running hot');
assert(hot.projectedVsBudget > 0, 'an overshoot is a positive variance');
assert(hot.daysOfRunway < hot.remainingDays, 'runway falls short of the month');
const hotFindings = buildPacingFindings(hot);
assert(byId(hotFindings, 'pacing-hot'), 'running hot is reported');
assert(byId(hotFindings, 'pacing-runway'), 'running out before month end is reported');

const cold = buildBudgetPacing(june, { budget: 9000, today: '2026-06-10', elapsedShare: 0.5 });
assert(cold.status === 'cold', 'a large budget against this spend is underspending');
assert(byId(buildPacingFindings(cold), 'pacing-cold'), 'underspending is reported');

const unset = buildBudgetPacing(june, { budget: 0, today: '2026-06-10', elapsedShare: 0.5 });
assert(!unset.configured, 'no budget means not configured');
assert(unset.paceIndex === null, 'pace cannot be computed without a budget');
assert(buildPacingFindings(unset).length === 0, 'no budget produces no pacing findings');
assert(unset.projected > 0, 'projection still works without a budget');

console.log('spend response + budget pacing tests passed');
