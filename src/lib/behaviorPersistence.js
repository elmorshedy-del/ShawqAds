export function mergeRowSets(previousRows = [], nextRows = [], keyFn) {
  const map = new Map();
  for (const row of previousRows || []) {
    const key = keyFn(row);
    if (key) map.set(key, row);
  }
  for (const row of nextRows || []) {
    const key = keyFn(row);
    if (key) map.set(key, row);
  }
  return [...map.values()].sort((a, b) => String(a.date || a.date_start || '').localeCompare(String(b.date || b.date_start || '')));
}

export function pageFactKey(row = {}) {
  return `${row.date || ''}:${row.session_hash || ''}:${row.path || ''}`;
}

export function journeyRowKey(row = {}) {
  return `${row.date || ''}:${row.session_hash || ''}:${(row.path_sequence || []).join('>')}`;
}

export function behaviorFactKey(row = {}) {
  return [
    row.date || '',
    row.step || '',
    row.source || '',
    row.session_hash || '',
    row.product_id || row.variant_id || row.country_code || row.key || row.product || '',
  ].join(':');
}

export function metaDemographicKey(row = {}) {
  return [
    row.date || row.date_start || '',
    row.age || '',
    row.gender || '',
    row.ad_id || '',
    row.country_code || '',
  ].join(':');
}

export function pruneRowsByDate(rows = [], { since = '', until = '' } = {}) {
  return (rows || []).filter((row) => {
    const date = row.date || row.date_start || '';
    if (!date) return false;
    if (since && date < since) return false;
    if (until && date > until) return false;
    return true;
  });
}

export function mergeBehaviorSnapshot(previous, next, { since, until }) {
  if (!previous) return next;
  const merged = { ...next };

  // Cumulate API-backed rows across refreshes. New fetch wins on key collision for the same window.
  merged.facts = mergeRowSets(previous.facts, next.facts, behaviorFactKey)
    .filter((row) => !since || (row.date || '') >= since);
  merged.meta_demographics_rows = mergeRowSets(previous.meta_demographics_rows, next.meta_demographics_rows, metaDemographicKey)
    .filter((row) => !since || (row.date || row.date_start || '') >= since);
  merged.meta_payment_rows = mergeRowSets(
    previous.meta_payment_rows,
    next.meta_payment_rows,
    (row) => `${row.date || row.date_start || ''}:${row.ad_id || ''}:${row.country_code || ''}`,
  ).filter((row) => !since || (row.date || row.date_start || '') >= since);

  // Session-derived rows must cumulate across refreshes even when NDJSON shrinks or redeploys.
  merged.page_facts = mergeRowSets(previous.page_facts, next.page_facts, pageFactKey)
    .filter((row) => !since || (row.date || '') >= since);
  merged.journey_rows = mergeRowSets(previous.journey_rows, next.journey_rows, journeyRowKey)
    .filter((row) => !since || (row.date || '') >= since);

  const previousEventCount = Number(previous?.extraction?.session_events?.count || 0);
  const nextEventCount = Number(next?.extraction?.session_events?.count || 0);
  merged.extraction = {
    ...(next.extraction || {}),
    session_events: {
      ...(next.extraction?.session_events || {}),
      count: Math.max(previousEventCount, nextEventCount),
      preserved_from_snapshot: merged.page_facts.length > (next.page_facts?.length || 0),
    },
  };

  merged.period = {
    ...(next.period || {}),
    since: [previous?.period?.since, since].filter(Boolean).sort()[0] || since,
    until: [previous?.period?.until, until, latestDateFromRows(merged.facts)].filter(Boolean).sort().at(-1) || until,
  };

  return merged;
}

function latestDateFromRows(rows = []) {
  return (rows || [])
    .map((row) => row.date || row.date_start || '')
    .filter(Boolean)
    .sort()
    .at(-1) || '';
}
