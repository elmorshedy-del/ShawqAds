/* ----------------------------------------------------------------------------
 * insight-stress-test.mjs — adversarial testing for the insight core.
 *
 * The unit tests check that the panel says the right thing about the data we
 * have. This file checks that it cannot say an absurd thing about data we have
 * not seen yet.
 *
 * That distinction is the lesson of the 6.5σ bug. Nothing was broken in the
 * arithmetic: a denominator went to zero, a placeholder was substituted, and a
 * ratio ran away. The account simply had not yet produced the series that
 * exposed it. Every class of defect found there — a vanishing denominator, an
 * unbounded ratio, an absence read as a measurement — is reachable by other
 * routes, so the harness generates those routes on purpose.
 *
 * How it works
 * ------------
 * A seeded generator builds pathological daily series (all zero, mostly zero,
 * one spike, alternating sign, sub-cent values, values near Number.MAX_VALUE,
 * NaN and null holes) and runs the whole insight pipeline over them. Rather than
 * asserting specific outputs, it asserts INVARIANTS — properties that must hold
 * whatever the input:
 *
 *   1. Nothing published is NaN, Infinity, undefined or null.
 *   2. No ratio shown to a reader is unbounded.
 *   3. No claim of rarity is finer than the baseline length can support.
 *   4. A scale figure is either genuine or absent — never substituted.
 *   5. Money that cannot be interpreted (negative ROAS, negative CAC) is
 *      suppressed rather than charted.
 *   6. An unusable baseline can never produce an "unusual" verdict.
 *
 * Run with `npm run test:stress`. The seed is fixed, so a failure reproduces.
 * ------------------------------------------------------------------------- */

import {
  MIN_PCT_BASE,
  buildKeyFindings,
  concentration,
  detectAnomalies,
  pctChange,
  periodTotals,
  topDrivers,
} from '../src/lib/analyticsInsights.js';
import {
  ANOMALY_LIMITS,
  assessDay,
  describeDay,
  formalNote,
  medianAbsoluteDeviation,
  percentile,
  summarizeBaseline,
} from '../src/lib/anomalyStats.js';
import { intervalsSeparate, ratioCountInterval } from '../src/lib/statsTests.js';
import { buildAdsFindings, buildFunnelFindings, buildMarketFindings } from '../src/lib/tabInsights.js';

const ITERATIONS = Number(process.env.STRESS_ITERATIONS || 400);
const SEED = Number(process.env.STRESS_SEED || 0x5EED);

let checks = 0;
const failures = [];

function check(condition, message, context) {
  checks += 1;
  if (condition) return;
  failures.push(`${message}\n      context: ${JSON.stringify(context)?.slice(0, 400)}`);
}

/* --- deterministic randomness ------------------------------------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const pick = (list) => list[Math.floor(rand() * list.length) % list.length];
const between = (lo, hi) => lo + rand() * (hi - lo);

/* --- adversarial values -------------------------------------------------- */

/**
 * Values chosen to break ratios rather than to look realistic: sub-cent numbers
 * that explode a denominator, negatives from refunds and ad credits, and the
 * non-numbers that arrive when an upstream field is missing.
 */
const HOSTILE_SCALARS = [
  0, -0, 1e-9, 0.001, 0.01, -0.01, -1, -1000, 1e9, 1e15,
  Number.MAX_SAFE_INTEGER, Number.MIN_VALUE,
  NaN, Infinity, -Infinity, null, undefined, '', 'n/a', '12', [], {},
];

/** Series shapes that each defeat a different assumption about "normal". */
const SERIES_SHAPES = {
  allZero: (n) => Array.from({ length: n }, () => 0),
  mostlyZero: (n) => Array.from({ length: n }, (_, i) => (i % 7 === 0 ? between(100, 900) : 0)),
  flat: (n) => Array.from({ length: n }, () => 500),
  subCent: (n) => Array.from({ length: n }, () => between(0.001, 0.05)),
  steadyThenSpike: (n) => Array.from({ length: n }, (_, i) => (i === n - 1 ? 1e6 : between(900, 1100))),
  alternatingSign: (n) => Array.from({ length: n }, (_, i) => (i % 2 ? -between(100, 500) : between(100, 500))),
  huge: (n) => Array.from({ length: n }, () => between(1e12, 1e15)),
  hostile: (n) => Array.from({ length: n }, () => pick(HOSTILE_SCALARS)),
  realistic: (n) => Array.from({ length: n }, () => between(200, 1400)),
  singleValue: () => [between(1, 1000)],
  empty: () => [],
};
const SHAPE_NAMES = Object.keys(SERIES_SHAPES);

const isoDay = (i) => new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);

/* --- invariant helpers --------------------------------------------------- */

const BAD_TEXT = /\b(NaN|Infinity|undefined|null|\[object Object\])\b/;

/** Every number a caller might read must be a real number or an explicit null. */
function finiteOrNull(value) {
  return value === null || value === undefined || Number.isFinite(value);
}

/** Published copy must never leak a broken value or an un-rendered placeholder. */
function checkText(text, where, context) {
  if (text == null || text === '') return;
  check(typeof text === 'string', `${where}: copy must be a string`, context);
  check(!BAD_TEXT.test(text), `${where}: copy leaked a broken value → ${JSON.stringify(text)?.slice(0, 200)}`, context);
  check(!/ ?\$NaN|\$Infinity/.test(text), `${where}: copy leaked a broken money value`, context);
}

const money = (value) => `$${Math.round(Number(value) || 0)}`;

/* ========================================================================= *
 * 1. summarizeBaseline / assessDay / describeDay
 * ========================================================================= */

for (let i = 0; i < ITERATIONS; i += 1) {
  const shape = pick(SHAPE_NAMES);
  const n = Math.floor(between(0, 60));
  const series = SERIES_SHAPES[shape](n);
  const observed = pick([...HOSTILE_SCALARS, between(-5000, 5000), between(0, 1e7)]);
  const ctx = { shape, n, observed };

  const baseline = summarizeBaseline(series);
  check(Number.isInteger(baseline.measuredDays) && baseline.measuredDays >= 0,
    'baseline: measuredDays must be a whole count', ctx);
  check(baseline.activeDays + baseline.idleDays === baseline.measuredDays,
    'baseline: active and idle must partition the measured days', { ...ctx, baseline });
  check(finiteOrNull(baseline.typical), 'baseline: typical must be finite or null', { ...ctx, baseline });
  check(baseline.idleShare >= 0 && baseline.idleShare <= 1,
    'baseline: idle share must be a proportion', { ...ctx, baseline });
  check(baseline.rarityFloor > 0 && baseline.rarityFloor <= 1,
    'baseline: rarity floor must be a probability', { ...ctx, baseline });

  const mad = medianAbsoluteDeviation(series);
  check(mad === null || (Number.isFinite(mad) && mad > 0),
    'MAD: must be a positive number or null — never a substituted width', { ...ctx, mad });

  const a = assessDay(observed, series);
  check(typeof a.unusual === 'boolean', 'assess: unusual must be a boolean', ctx);
  check(!(a.unusual && !a.usable),
    'assess: an unusable baseline must never yield an unusual verdict', { ...ctx, a });
  check(finiteOrNull(a.multiple), 'assess: multiple must be finite or null', { ...ctx, multiple: a.multiple });
  check(a.multiple === null || a.multiple <= ANOMALY_LIMITS.MAX_REPORTED_MULTIPLE,
    'assess: multiple must be capped — an unbounded fold-change describes the denominator',
    { ...ctx, multiple: a.multiple });
  check(finiteOrNull(a.robustZ), 'assess: robustZ must be finite or null', { ...ctx, z: a.robustZ });
  check(finiteOrNull(a.rankP), 'assess: rankP must be finite or null', { ...ctx, p: a.rankP });
  if (a.rankP != null) {
    check(a.rankP > 0 && a.rankP <= 1, 'assess: rankP must be a probability', { ...ctx, p: a.rankP });
    // The central lesson of the 6.5σ defect, as an invariant: a finite baseline
    // cannot demonstrate rarity finer than 1-in-(n+1).
    check(a.rankP >= a.rarityFloor - 1e-12,
      'assess: rankP must never claim rarity finer than the baseline can resolve',
      { ...ctx, p: a.rankP, floor: a.rarityFloor });
  }
  // A scale figure must be earned. If there is no genuine spread there is no sigma.
  check(!(a.robustZ != null && mad === null),
    'assess: a robustZ must not exist without a genuine MAD', { ...ctx, z: a.robustZ, mad });

  const copy = describeDay({ assessment: a, label: 'Meta spend', format: money, date: isoDay(i) });
  checkText(copy.headline, 'describeDay.headline', ctx);
  checkText(copy.context, 'describeDay.context', ctx);
  checkText(copy.formal, 'describeDay.formal', ctx);
  check(typeof copy.headline === 'string' && copy.headline.trim().length > 0,
    'describeDay: headline must never be empty', ctx);
  check(!/σ/.test(copy.headline) && !/σ/.test(copy.context || ''),
    'describeDay: the plain-language lines must stay free of sigma', { ...ctx, copy });
  // The formal line is additive: the plain claim must stand without it.
  check(!/\bx the typical day\b/.test(copy.headline) || !/Infinity|NaN/.test(copy.headline),
    'describeDay: multiple text must not render a broken ratio', ctx);

  const formal = formalNote(a);
  checkText(formal, 'formalNote', ctx);
  if (formal) {
    check(!/NaN|Infinity/.test(formal), 'formalNote: must not publish a broken statistic', { ...ctx, formal });
  }
}

/* ========================================================================= *
 * 2. periodTotals / pctChange / concentration / topDrivers
 * ========================================================================= */

for (let i = 0; i < ITERATIONS; i += 1) {
  const rows = Array.from({ length: Math.floor(between(0, 20)) }, () => ({
    date: isoDay(Math.floor(between(0, 60))),
    revenue_usd: pick([...HOSTILE_SCALARS, between(-2000, 5000)]),
    spend_usd: pick([...HOSTILE_SCALARS, between(-2000, 3000)]),
    orders: pick([...HOSTILE_SCALARS, Math.floor(between(-5, 60))]),
    units: pick([...HOSTILE_SCALARS, Math.floor(between(0, 90))]),
  }));
  const t = periodTotals(rows);
  const ctx = { rowCount: rows.length, totals: t };

  for (const key of ['revenue_usd', 'spend_usd', 'orders', 'units', 'aov', 'cac', 'roas']) {
    check(Number.isFinite(t[key]), `periodTotals: ${key} must be finite`, ctx);
  }
  // Money that cannot be interpreted must be suppressed, not charted. A negative
  // ROAS is not a worse return and a negative CAC is not a cheaper customer.
  check(t.roas >= 0, 'periodTotals: ROAS must never be negative', ctx);
  check(t.cac >= 0, 'periodTotals: CAC must never be negative', ctx);
  check(t.aov >= 0 || t.revenue_usd < 0,
    'periodTotals: AOV may only be negative when revenue itself is', ctx);

  const prev = pick([...HOSTILE_SCALARS, between(-3000, 3000)]);
  const cur = pick([...HOSTILE_SCALARS, between(-3000, 3000)]);
  const pct = pctChange(cur, prev, { minBase: MIN_PCT_BASE.revenue_usd });
  check(finiteOrNull(pct), 'pctChange: must be finite or null', { cur, prev, pct });
  if (pct != null) {
    // Bounding the magnitude is deliberately NOT asserted. Once the base is
    // positive and above the floor, a large percentage is arithmetically correct
    // — it takes an absurd numerator, not a degenerate denominator, to produce
    // one. The invariants that matter are that the base is sound and the result
    // is a real number; capping the display of a genuine figure would be a
    // readability choice, not a correctness one.
    check(prev >= MIN_PCT_BASE.revenue_usd,
      'pctChange: a percentage must never be computed from a base below the floor', { cur, prev, pct });
  }

  const items = Array.from({ length: Math.floor(between(0, 8)) }, (_, k) => ({
    name: `m${k}`,
    value: pick([...HOSTILE_SCALARS, between(-500, 5000)]),
  }));
  const conc = concentration(items);
  if (conc) {
    check(Number.isFinite(conc.share) && conc.share >= 0 && conc.share <= 100,
      'concentration: share must be a percentage between 0 and 100', { items, conc });
    checkText(conc.name == null ? '' : String(conc.name), 'concentration.name', { items });
  }

  const drivers = topDrivers(items, items.slice(0, Math.floor(items.length / 2)));
  for (const d of drivers) {
    check(Number.isFinite(d.change), 'topDrivers: change must be finite', { d });
    check(Number.isFinite(d.share), 'topDrivers: share must be finite', { d });
  }
}

/* ========================================================================= *
 * 3. ratio intervals used to rank ad sets
 * ========================================================================= */

for (let i = 0; i < ITERATIONS; i += 1) {
  const ratio = pick([...HOSTILE_SCALARS, between(-10, 40)]);
  const orders = pick([...HOSTILE_SCALARS, Math.floor(between(-3, 400))]);
  const iv = ratioCountInterval(ratio, orders);
  if (iv) {
    check(Number.isFinite(iv.low) && Number.isFinite(iv.high),
      'ratioCountInterval: bounds must be finite', { ratio, orders, iv });
    check(iv.low <= iv.high, 'ratioCountInterval: low must not exceed high', { ratio, orders, iv });
    check(iv.low >= 0, 'ratioCountInterval: a count-driven ratio cannot go below zero', { ratio, orders, iv });
    // More evidence must never widen the interval.
    const more = ratioCountInterval(ratio, Math.max(1, Number(orders) || 1) * 4);
    if (more && ratio > 0) {
      check(more.relativeError <= iv.relativeError + 1e-12,
        'ratioCountInterval: four times the orders must not increase relative error',
        { ratio, orders, iv, more });
    }
  }
  check(intervalsSeparate(iv, iv) === false || iv === null,
    'intervalsSeparate: an interval can never be separate from itself', { iv });
}

/* ========================================================================= *
 * 4. the whole pipeline — buildKeyFindings and the per-tab builders
 * ========================================================================= */

for (let i = 0; i < ITERATIONS; i += 1) {
  const shape = pick(SHAPE_NAMES);
  const n = Math.floor(between(0, 50));
  const revenue = SERIES_SHAPES[shape](n);
  const spend = SERIES_SHAPES[pick(SHAPE_NAMES)](n);
  const rows = revenue.map((value, k) => ({
    date: isoDay(k),
    meta_covered: rand() > 0.4,
    revenue_usd: value,
    spend_usd: spend[k],
    orders: Math.floor(between(0, 30)),
    units: Math.floor(between(0, 40)),
  }));
  const splitAt = Math.floor(rows.length * 0.7);
  const windowRows = rows.slice(splitAt);
  const range = { since: rows[splitAt]?.date || isoDay(0), until: rows.at(-1)?.date || isoDay(0) };
  const ctx = { shape, n, rows: rows.length };

  const out = buildKeyFindings({
    windowRows,
    historyRows: rows,
    range,
    reportingToday: rows.at(-1)?.date || '',
    concentrationItems: [{ name: 'US', value: between(-500, 5000) }, { name: 'CA', value: between(0, 2000) }],
  });

  check(out && Array.isArray(out.findings), 'buildKeyFindings: must always return findings', ctx);
  checkText(out.verdict?.headline, 'verdict.headline', ctx);
  checkText(out.verdict?.detail, 'verdict.detail', ctx);
  check(typeof out.verdict?.headline === 'string' && out.verdict.headline.length > 0,
    'verdict: headline must never be empty', ctx);

  for (const f of out.findings) {
    checkText(f.headline, `finding[${f.id}].headline`, ctx);
    checkText(f.context, `finding[${f.id}].context`, ctx);
    checkText(f.formal, `finding[${f.id}].formal`, ctx);
    checkText(f.driver, `finding[${f.id}].driver`, ctx);
    checkText(f.action, `finding[${f.id}].action`, ctx);
    check(typeof f.headline === 'string' && f.headline.trim().length > 0,
      `finding[${f.id}]: headline must never be empty`, ctx);
    check(Number.isFinite(f.priority), `finding[${f.id}]: priority must be finite for ranking`, { ...ctx, p: f.priority });
    check(!/σ/.test(f.context || ''), `finding[${f.id}]: sigma must stay out of the plain context line`, ctx);
  }

  // Anomaly detection over the same hostile rows.
  for (const key of ['revenue_usd', 'spend_usd']) {
    for (const hit of detectAnomalies(rows, key, { coverageKey: 'meta_covered' })) {
      check(Number.isFinite(hit.value), 'detectAnomalies: hit value must be finite', { key, hit: hit.date });
      check(Number.isFinite(hit.materiality), 'detectAnomalies: materiality must be finite for ranking', { key, hit: hit.date });
      check(hit.kind === 'deviation' || hit.kind === 'resumed', 'detectAnomalies: unknown hit kind', { hit });
      check(!(hit.kind === 'deviation' && !hit.assessment.usable),
        'detectAnomalies: a deviation requires a usable baseline', { key, hit: hit.date });
    }
  }
}

/* ========================================================================= *
 * 5. per-tab builders under hostile rows
 * ========================================================================= */

for (let i = 0; i < ITERATIONS; i += 1) {
  const adSets = Array.from({ length: Math.floor(between(0, 10)) }, (_, k) => ({
    adSet: `set-${k}`,
    campaign: `camp-${k % 3}`,
    status: pick(['Healthy', 'Fatigue risk', 'expensive reach', '', null]),
    roas: pick([...HOSTILE_SCALARS, between(-2, 30)]),
    spend: pick([...HOSTILE_SCALARS, between(-100, 5000)]),
    sales: pick([...HOSTILE_SCALARS, Math.floor(between(-2, 80))]),
    freq: pick([...HOSTILE_SCALARS, between(0, 8)]),
    cpm: pick([...HOSTILE_SCALARS, between(0, 90)]),
    cpmVsMar: pick([...HOSTILE_SCALARS, between(-90, 300)]),
  }));
  const campaigns = Array.from({ length: Math.floor(between(0, 6)) }, (_, k) => ({
    name: `camp-${k}`,
    flag: pick(['clean', 'warning', 'inferred']),
    spend: pick([...HOSTILE_SCALARS, between(-100, 9000)]),
    shopifyRoas: pick([...HOSTILE_SCALARS, between(-2, 20)]),
  }));
  const countries = Array.from({ length: Math.floor(between(0, 8)) }, (_, k) => ({
    country: `C${k}`,
    roas: pick([...HOSTILE_SCALARS, between(-2, 20)]),
    orders: pick([...HOSTILE_SCALARS, Math.floor(between(-2, 90))]),
    units: Math.floor(between(0, 90)),
    revenue: pick([...HOSTILE_SCALARS, between(-500, 20000)]),
    spend: pick([...HOSTILE_SCALARS, between(-100, 6000)]),
  }));
  const delivery = Array.from({ length: Math.floor(between(0, 30)) }, () => ({
    reach: pick([...HOSTILE_SCALARS, between(0, 90000)]),
    frequency: pick([...HOSTILE_SCALARS, between(0, 9)]),
    cpm: pick([...HOSTILE_SCALARS, between(0, 60)]),
    spend: pick([...HOSTILE_SCALARS, between(0, 4000)]),
  }));

  const funnel = {
    hasData: true,
    icAtc: {
      summary: {
        currentIndex: pick([...HOSTILE_SCALARS, between(0, 300)]),
        launchIndex: pick([...HOSTILE_SCALARS, between(0, 300)]),
        deltaSinceLaunch: pick([...HOSTILE_SCALARS, between(-200, 200)]),
        currentRaw: pick([...HOSTILE_SCALARS, between(0, 100)]),
        baseRate: pick([...HOSTILE_SCALARS, between(0, 100)]),
      },
      campaigns: [
        { id: 'a', name: 'A', totalDen: pick([...HOSTILE_SCALARS, between(0, 5000)]) },
        { id: 'b', name: 'B', totalDen: pick([...HOSTILE_SCALARS, between(0, 5000)]) },
      ],
      points: [{ date: isoDay(0), a: pick([...HOSTILE_SCALARS, between(0, 300)]), b: pick([...HOSTILE_SCALARS, between(0, 300)]) }],
    },
    purchaseIc: {
      summary: { currentIndex: between(0, 200), launchIndex: 100, deltaSinceLaunch: between(-50, 50) },
      campaigns: [], points: [],
    },
  };

  const groups = [
    ['buildAdsFindings', buildAdsFindings({ adSets, campaigns })],
    ['buildMarketFindings', buildMarketFindings({ countries })],
    ['buildFunnelFindings', buildFunnelFindings(funnel)],
    ['buildLaunchFindings', (await import('../src/lib/tabInsights.js')).buildLaunchFindings({ delivery })],
  ];
  for (const [name, findings] of groups) {
    check(Array.isArray(findings), `${name}: must always return an array`, { i });
    for (const f of findings) {
      checkText(f.headline, `${name}[${f.id}].headline`, { i });
      checkText(f.context, `${name}[${f.id}].context`, { i });
      checkText(f.driver, `${name}[${f.id}].driver`, { i });
      checkText(f.action, `${name}[${f.id}].action`, { i });
      check(typeof f.headline === 'string' && f.headline.trim().length > 0,
        `${name}[${f.id}]: headline must never be empty`, { i });
    }
  }
}

/* --- report -------------------------------------------------------------- */

if (failures.length) {
  const unique = [...new Set(failures)];
  console.error(`\ninsight stress test FAILED — ${failures.length} violations across ${checks} checks`);
  console.error(`(${unique.length} distinct)\n`);
  for (const f of unique.slice(0, 25)) console.error(`  ✗ ${f}\n`);
  if (unique.length > 25) console.error(`  ... and ${unique.length - 25} more distinct violations`);
  process.exit(1);
}

console.log(`insight stress test: ok — ${checks} invariant checks over ${ITERATIONS} iterations per stage (seed ${SEED})`);
