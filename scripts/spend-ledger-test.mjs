import assert from 'node:assert';
import {
  dailyTotals,
  datesInRange,
  expandFact,
  frozenThrough,
  hydrateFacts,
  ledgerCoverage,
  mergeDimensions,
  mergeFacts,
  mergeFxRates,
  missingDates,
  parseFacts,
  serializeFacts,
  sortFacts,
  toFact,
  toFxEntry,
} from '../src/lib/spendLedger.js';

const row = (date, ad, country, spend, usd, tryv) => ({
  date,
  ad_id: ad,
  country_code: country,
  spend,
  currency: 'TRY',
  spend_usd: usd,
  spend_try: tryv,
  fx_to_usd: 0.0301,
  fx_to_try: 1,
  fx_rate_date: date,
});

// --- round trip -------------------------------------------------------------
const fact = toFact(row('2026-06-03', 'ad1', 'US', 412.499, 12.4166, 412.499));
assert(fact.d === '2026-06-03' && fact.a === 'ad1' && fact.c === 'US', 'fact keeps its identity');
assert(fact.s === 412.5 && fact.u === 12.42, 'money is rounded to cents to keep diffs stable');
assert(fact.fu === undefined, 'FX belongs to the day, not repeated on every fact row');
const back = expandFact(fact);
assert(back.spend_usd === 12.42 && back.spend_try === 412.5, 'a fact expands back to a readable row');

// Serializing must survive a round trip, and a corrupt line must not cost the file.
const facts = [
  toFact(row('2026-06-04', 'ad2', 'US', 100, 3, 100)),
  toFact(row('2026-06-03', 'ad1', 'US', 200, 6, 200)),
];
const text = serializeFacts(facts);
assert(parseFacts(text).length === 2, 'facts round trip through NDJSON');
assert(parseFacts(`${text}\n{ this is not json`).length === 2, 'one bad line must not discard the ledger');
assert(parseFacts('').length === 0, 'an empty ledger parses to nothing');

// Ordering is what keeps a day's append a contiguous git diff.
const sorted = sortFacts(facts);
assert(sorted[0].d === '2026-06-03', 'facts sort by date first');

// --- freeze line ------------------------------------------------------------
assert(frozenThrough('2026-06-30', 7) === '2026-06-23', 'the freeze line sits openDays behind today');
assert(frozenThrough('2026-03-01', 7) === '2026-02-22', 'the freeze line crosses month boundaries');
assert(datesInRange('2026-06-01', '2026-06-03').length === 3, 'ranges are inclusive');
assert(datesInRange('2026-06-03', '2026-06-01').length === 0, 'a reversed range yields nothing');

// --- the core question: what still needs fetching? --------------------------
const stored = [
  toFact(row('2026-06-01', 'ad1', 'US', 10, 1, 10)),
  toFact(row('2026-06-02', 'ad1', 'US', 10, 1, 10)),
];
const missing = missingDates(stored, {
  since: '2026-06-01', until: '2026-06-30', today: '2026-06-30', openDays: 7,
});
assert(!missing.includes('2026-06-01'), 'a frozen day already recorded is never refetched');
assert(missing.includes('2026-06-03'), 'a frozen day with no rows is a real backfill gap');
assert(missing.includes('2026-06-30'), 'today is always refetched');
assert(missing.includes('2026-06-24'), 'days inside the open window are always refetched');
assert(
  missingDates(stored, { since: '2026-06-01', until: '2026-06-02', today: '2026-06-30', openDays: 7 }).length === 0,
  'a fully recorded frozen range needs no requests at all',
);

// --- merge semantics --------------------------------------------------------
// An open day must be replaced wholesale, not appended to, or spend double-counts.
const existingOpen = [toFact(row('2026-06-28', 'ad1', 'US', 10, 1, 10))];
const refetched = [
  toFact(row('2026-06-28', 'ad1', 'US', 25, 2, 25)),
  toFact(row('2026-06-28', 'ad2', 'US', 5, 1, 5)),
];
const mergedOpen = mergeFacts(existingOpen, refetched, { today: '2026-06-30', openDays: 7 });
assert(mergedOpen.length === 2, 'refetching an open day replaces it rather than duplicating rows');
assert(
  dailyTotals(mergedOpen).find((r) => r.date === '2026-06-28').spend === 30,
  'the replaced open day totals the fresh numbers only',
);

// A frozen day must not be silently rewritten by a later fetch.
const frozenExisting = [toFact(row('2026-06-01', 'ad1', 'US', 10, 1, 10))];
const frozenIncoming = [toFact(row('2026-06-01', 'ad1', 'US', 999, 99, 999))];
const mergedFrozen = mergeFacts(frozenExisting, frozenIncoming, { today: '2026-06-30', openDays: 7 });
assert(mergedFrozen.length === 1 && mergedFrozen[0].s === 10, 'a closed day keeps the figure it already reported');

// ...but a frozen day that was never recorded is still fillable.
const gapFill = mergeFacts(
  [toFact(row('2026-06-02', 'ad1', 'US', 10, 1, 10))],
  [toFact(row('2026-06-01', 'ad1', 'US', 42, 4, 42))],
  { today: '2026-06-30', openDays: 7 },
);
assert(gapFill.length === 2, 'a missing frozen day can still be backfilled');
assert(gapFill[0].d === '2026-06-01', 'backfilled rows land in date order');

// Merging into an empty ledger is the first-run backfill.
assert(mergeFacts([], refetched, { today: '2026-06-30' }).length === 2, 'first backfill accepts everything');

// --- rollups ----------------------------------------------------------------
const dayFacts = [
  toFact(row('2026-06-03', 'ad1', 'US', 100, 3, 100)),
  toFact(row('2026-06-03', 'ad2', 'DE', 50, 1.5, 50)),
];
const fxTable = mergeFxRates({}, [row('2026-06-03', 'ad1', 'US', 100, 3, 100)], { today: '2026-06-30' });
const totals = dailyTotals(dayFacts, fxTable);
assert(totals.length === 1 && totals[0].spend === 150, 'daily totals sum across ads and countries');
assert(totals[0].spend_try === 150, 'the Turkish figure is summed from stored values, not recomputed');
assert(totals[0].fx_to_usd === 0.0301 && totals[0].currency === 'TRY', 'the day carries the rate that produced it');

// --- FX table ---------------------------------------------------------------
const fxEntry = toFxEntry({ ...row('2026-06-03', 'ad1', 'US', 1, 1, 1), fx_rate_date: '2026-06-02' });
assert(fxEntry.to_usd === 0.0301 && fxEntry.currency === 'TRY', 'an FX entry records the pair and rate');
assert(
  fxEntry.rate_date === '2026-06-02' && fxEntry.date === '2026-06-03',
  'a rate borrowed from another day must say so rather than imply same-day accuracy',
);
const fxFrozen = mergeFxRates(
  { '2026-06-01': { date: '2026-06-01', currency: 'TRY', to_usd: 0.03, to_try: 1, rate_date: '2026-06-01' } },
  [{ ...row('2026-06-01', 'ad1', 'US', 1, 1, 1), fx_to_usd: 0.99 }],
  { today: '2026-06-30', openDays: 7 },
);
assert(fxFrozen['2026-06-01'].to_usd === 0.03, "a closed day's rate is part of the figure already reported");
const fxOpen = mergeFxRates(
  { '2026-06-28': { date: '2026-06-28', currency: 'TRY', to_usd: 0.03, to_try: 1, rate_date: '2026-06-28' } },
  [{ ...row('2026-06-28', 'ad1', 'US', 1, 1, 1), fx_to_usd: 0.031 }],
  { today: '2026-06-30', openDays: 7 },
);
assert(fxOpen['2026-06-28'].to_usd === 0.031, 'an open day picks up a corrected rate');
assert(
  Object.keys(mergeFxRates({}, [{ date: '2026-06-05', fx_to_usd: 0 }], {})).length === 0,
  'a failed rate lookup must not be recorded as if it were real',
);

const coverage = ledgerCoverage(stored);
assert(coverage.since === '2026-06-01' && coverage.days === 2, 'coverage reports the stored span');
assert(ledgerCoverage([]).days === 0, 'an empty ledger reports no coverage');

// --- dimensions -------------------------------------------------------------
const dims = mergeDimensions({}, [
  { ad_id: 'ad1', ad_name: 'Skirt 2', adset_name: 'Skirts', campaign_name: 'USA_ABO', product_family: 'Skirts' },
]);
assert(dims.ad1.ad_name === 'Skirt 2', 'dimensions are stored per ad');
const keptDims = mergeDimensions(dims, [{ ad_id: 'ad1' }]);
assert(keptDims.ad1.ad_name === 'Skirt 2', 'a row missing names must not blank an existing dimension');

const hydrated = hydrateFacts([toFact(row('2026-06-03', 'ad1', 'US', 100, 3, 100))], dims);
assert(hydrated[0].ad_name === 'Skirt 2' && hydrated[0].spend_usd === 3, 'facts rejoin their dimensions');
assert(hydrated[0].ad_id === 'ad1', 'hydration must not lose the join key');

console.log('spend ledger checks passed');
