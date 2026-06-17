import { mergeBehaviorSnapshot, mergeRowSets, pageFactKey } from '../src/lib/behaviorPersistence.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const day1 = { date: '2026-06-10', session_hash: 'abc', path: '/products/a', dwell_seconds: 12, purchased: false };
const day2 = { date: '2026-06-11', session_hash: 'def', path: '/products/b', dwell_seconds: 8, purchased: true };

const mergedPages = mergeRowSets([day1], [day2], pageFactKey);
assert(mergedPages.length === 2, 'mergeRowSets must keep distinct page_facts across days');

const previous = {
  period: { since: '2026-06-03', until: '2026-06-11' },
  facts: [{ date: '2026-06-10', step: 'checkout', source: 'shopify', exposed: 5, abandoned: 2 }],
  page_facts: [day1],
  journey_rows: [{ date: '2026-06-10', session_hash: 'abc', path_sequence: ['/'] }],
  extraction: { session_events: { count: 120 } },
};

const next = {
  period: { since: '2026-06-03', until: '2026-06-12' },
  facts: [{ date: '2026-06-12', step: 'checkout', source: 'shopify', exposed: 3, abandoned: 1 }],
  page_facts: [day2],
  journey_rows: [{ date: '2026-06-12', session_hash: 'def', path_sequence: ['/cart'] }],
  extraction: { session_events: { count: 40 } },
};

const snapshot = mergeBehaviorSnapshot(previous, next, { since: '2026-06-03', until: '2026-06-12' });
assert(snapshot.facts.length === 2, 'merged facts must cumulate prior days');
assert(snapshot.page_facts.length === 2, 'merged page_facts must cumulate prior days');
assert(snapshot.journey_rows.length === 2, 'merged journey_rows must cumulate prior days');
assert(snapshot.period.until === '2026-06-12', 'merged period.until must advance with new data');
assert(snapshot.extraction.session_events.count === 120, 'session event count must not shrink after merge');

const fetchScript = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../scripts/fetch-behavior-intelligence.mjs', import.meta.url), 'utf8'));
const server = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../server.mjs', import.meta.url), 'utf8'));
assert(fetchScript.includes('mergeBehaviorSnapshot'), 'fetch script must merge previous behavior snapshot');
assert(server.includes('behaviorNeedsRefresh'), 'server must refresh behavior when calendar day advances');

console.log('behavior persistence checks passed');
