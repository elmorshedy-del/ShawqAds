/**
 * Durable spend ledger.
 *
 * Meta spend used to be re-downloaded in full on every server boot: the whole
 * window from BACKFILL_START_DATE to today, at ad x country x day, plus a fixed
 * March baseline. The window grows a day at a time, so it eventually crossed
 * Meta's response ceiling and the fetch started dying with "Please reduce the
 * amount of data you're asking for" — taking the day's data with it.
 *
 * The fix is to treat spend as an append-only ledger instead of a query result.
 * A completed day never changes, so it is fetched once, converted once, and
 * frozen. Only recent days (still open to Meta's attribution revisions) and today
 * are re-fetched. That keeps each run's request small no matter how long the
 * account has been running.
 *
 * Two files, deliberately:
 *
 *   facts      — one lean row per (date, ad, country). Money only.
 *   dimensions — names and taxonomy per ad, written once.
 *
 * Keeping names out of the fact rows is what makes this viable in git: rows go
 * from ~1.1KB to ~82 bytes, so a day costs ~14KB instead of ~195KB. Facts are
 * also emitted in a stable sort order, so a day's append shows up as a clean
 * block of added lines rather than a rewrite of the file.
 *
 * FX is stored, not just applied. Each row carries the rates used and the date
 * they came from, so a historical figure can be audited and can never silently
 * move because a rate provider fell back to "latest" on a later run.
 */

// Days this recent are still open: Meta keeps revising attribution after the
// fact, so freezing them immediately would lock in numbers that are still moving.
export const DEFAULT_OPEN_DAYS = 7;

const FACT_VERSION = 1;

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Money is rounded to cents. Full float precision is noise that churns git diffs. */
function money(value) {
  return Math.round(num(value) * 100) / 100;
}

/** Rates need more precision than money — TRY/USD moves in small fractions. */
function rate(value) {
  return Math.round(num(value) * 1e8) / 1e8;
}

export function factKey(row) {
  return `${row.date}|${row.ad_id || ''}|${row.country_code || ''}`;
}

/**
 * Reduce a fetched insight row to the money-only shape stored on disk. Short
 * field names are used because they repeat on every line; the mapping is
 * centralised here and in `expandFact` so nothing else deals in abbreviations.
 */
export function toFact(row) {
  return {
    v: FACT_VERSION,
    d: row.date,
    a: String(row.ad_id || ''),
    c: String(row.country_code || ''),
    s: money(row.spend),
    u: money(row.spend_usd),
    t: money(row.spend_try),
  };
}

export function expandFact(fact) {
  return {
    date: fact.d,
    ad_id: fact.a,
    country_code: fact.c,
    spend: num(fact.s),
    spend_usd: num(fact.u),
    spend_try: num(fact.t),
  };
}

/**
 * FX belongs to a day, not to a row. Recording it per fact repeated one rate
 * across every ad and country on that date — needless bytes, and worse, it let
 * rows on the same day disagree about the rate that produced them. One entry per
 * date keeps the conversion auditable and provably consistent.
 *
 * `rate_date` is kept distinct from the date it was applied to: providers fall
 * back to the latest rate when a historical one is unavailable, and a stored
 * figure should say so rather than quietly implying same-day accuracy.
 */
export function toFxEntry(row) {
  return {
    date: row.date,
    currency: String(row.currency || '').toUpperCase(),
    to_usd: rate(row.fx_to_usd),
    to_try: rate(row.fx_to_try),
    rate_date: row.fx_rate_date || row.date,
    provider: row.fx_provider || '',
  };
}

export function mergeFxRates(existing = {}, rows = [], { today, openDays = DEFAULT_OPEN_DAYS } = {}) {
  const frozen = today ? frozenThrough(today, openDays) : '';
  const out = { ...existing };
  for (const row of rows) {
    const entry = toFxEntry(row);
    if (!entry.date || !(entry.to_usd > 0)) continue;
    // A closed day's rate is part of the figure already reported. Only fill gaps.
    if (frozen && entry.date <= frozen && out[entry.date]) continue;
    out[entry.date] = entry;
  }
  return out;
}

/** Stable ordering keeps a day's append contiguous, so git diffs stay small. */
export function sortFacts(facts) {
  return [...facts].sort((a, b) => (
    String(a.d).localeCompare(String(b.d))
    || String(a.a).localeCompare(String(b.a))
    || String(a.c).localeCompare(String(b.c))
  ));
}

export function serializeFacts(facts) {
  return sortFacts(facts).map((f) => JSON.stringify(f)).join('\n');
}

export function parseFacts(text) {
  if (!text) return [];
  const out = [];
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.d) out.push(parsed);
    } catch {
      // A single corrupt line must not cost us the whole ledger. Skipping it
      // loses one row; throwing would lose every day ever recorded.
    }
  }
  return out;
}

/**
 * The last day that is closed to revision. Days at or before this are frozen and
 * never re-fetched; later days stay open.
 */
export function frozenThrough(today, openDays = DEFAULT_OPEN_DAYS) {
  if (!today) return '';
  const d = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - Math.max(0, openDays));
  return d.toISOString().slice(0, 10);
}

export function datesInRange(since, until) {
  if (!since || !until || since > until) return [];
  const out = [];
  const cursor = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return [];
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * The whole point of the ledger: given what is already stored, which days still
 * need to be asked of Meta?
 *
 * A frozen day is only fetched if it was never recorded (a genuine backfill gap).
 * Everything after the freeze line is always refetched, because it can still move.
 */
export function missingDates(facts, { since, until, today, openDays = DEFAULT_OPEN_DAYS }) {
  const all = datesInRange(since, until);
  if (!all.length) return [];
  const frozen = frozenThrough(today || until, openDays);
  const recorded = new Set(facts.map((f) => f.d));
  return all.filter((date) => (date > frozen ? true : !recorded.has(date)));
}

/**
 * Merge freshly fetched rows over the stored ledger.
 *
 * Incoming rows win for any day they cover, so a refetched open day fully
 * replaces its previous version rather than double-counting. Frozen days are
 * protected: once a day is closed, a later fetch cannot silently rewrite the
 * history it already reported, which is what makes stored figures trustworthy.
 */
export function mergeFacts(existing, incoming, { today, openDays = DEFAULT_OPEN_DAYS } = {}) {
  const frozen = today ? frozenThrough(today, openDays) : '';
  const existingByKey = new Map(existing.map((f) => [factKey(expandFact(f)), f]));

  // Which days is this batch authoritative for? Only days it actually covers.
  const replacedDays = new Set();
  for (const fact of incoming) {
    if (frozen && fact.d <= frozen && existingByKey.size) {
      // Day already closed. Accept it only to fill a gap, never to overwrite.
      const hasDay = existing.some((f) => f.d === fact.d);
      if (hasDay) continue;
    }
    replacedDays.add(fact.d);
  }

  const merged = [];
  for (const fact of existing) {
    if (replacedDays.has(fact.d)) continue;
    merged.push(fact);
  }
  for (const fact of incoming) {
    if (!replacedDays.has(fact.d)) continue;
    merged.push(fact);
  }
  return sortFacts(merged);
}

/** Roll the ledger up to one row per day — the headline spend series. */
export function dailyTotals(facts, fxRates = {}) {
  const byDate = new Map();
  for (const fact of facts) {
    const cur = byDate.get(fact.d) || { date: fact.d, spend: 0, spend_usd: 0, spend_try: 0 };
    cur.spend += num(fact.s);
    cur.spend_usd += num(fact.u);
    cur.spend_try += num(fact.t);
    byDate.set(fact.d, cur);
  }
  return [...byDate.values()]
    .map((row) => {
      const fx = fxRates[row.date];
      return {
        ...row,
        spend: money(row.spend),
        spend_usd: money(row.spend_usd),
        spend_try: money(row.spend_try),
        currency: fx?.currency || '',
        fx_to_usd: fx ? num(fx.to_usd) : 0,
        fx_to_try: fx ? num(fx.to_try) : 0,
        fx_rate_date: fx?.rate_date || '',
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function ledgerCoverage(facts) {
  if (!facts.length) return { since: '', until: '', days: 0, rows: 0 };
  const dates = [...new Set(facts.map((f) => f.d))].sort();
  return {
    since: dates[0],
    until: dates[dates.length - 1],
    days: dates.length,
    rows: facts.length,
  };
}

/** Dimensions change rarely, so they are stored once per ad rather than per row. */
export function mergeDimensions(existing = {}, rows = []) {
  const out = { ...existing };
  for (const row of rows) {
    const id = String(row.ad_id || '');
    if (!id) continue;
    out[id] = {
      ad_name: row.ad_name || out[id]?.ad_name || '',
      adset_id: row.adset_id || out[id]?.adset_id || '',
      adset_name: row.adset_name || out[id]?.adset_name || '',
      campaign_id: row.campaign_id || out[id]?.campaign_id || '',
      campaign_name: row.campaign_name || out[id]?.campaign_name || '',
      product_family: row.product_family || out[id]?.product_family || '',
      product_subtype: row.product_subtype || out[id]?.product_subtype || '',
    };
  }
  return out;
}

/** Rejoin lean facts with their dimensions for consumers that need names. */
export function hydrateFacts(facts, dimensions = {}) {
  return facts.map((fact) => {
    const base = expandFact(fact);
    const dim = dimensions[base.ad_id] || {};
    return { ...base, ...dim, ad_id: base.ad_id };
  });
}
