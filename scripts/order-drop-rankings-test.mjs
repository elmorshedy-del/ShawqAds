import {
  buildOrderMoverRankings,
  filterOrderLinesToSameElapsedWindow,
} from '../src/lib/orderDropRankings.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const lines = [
  { order_id: '1', date: '2026-06-16', created_at: '2026-06-16T08:00:00+03:00', country_code: 'US', country: 'United States', ad_name: 'Ad A' },
  { order_id: '2', date: '2026-06-16', created_at: '2026-06-16T09:00:00+03:00', country_code: 'AE', country: 'UAE', ad_name: 'Ad B' },
  { order_id: '3', date: '2026-06-15', created_at: '2026-06-15T08:00:00+03:00', country_code: 'US', country: 'United States', ad_name: 'Ad A' },
  { order_id: '4', date: '2026-06-15', created_at: '2026-06-15T09:00:00+03:00', country_code: 'US', country: 'United States', ad_name: 'Ad A' },
  { order_id: '5', date: '2026-06-15', created_at: '2026-06-15T10:00:00+03:00', country_code: 'US', country: 'United States', ad_name: 'Ad A' },
  { order_id: '6', date: '2026-06-15', created_at: '2026-06-15T11:00:00+03:00', country_code: 'US', country: 'United States', ad_name: 'Ad A' },
  { order_id: '7', date: '2026-06-15', created_at: '2026-06-15T12:00:00+03:00', country_code: 'US', country: 'United States', ad_name: 'Ad A' },
  { order_id: '8', date: '2026-06-15', created_at: '2026-06-15T20:00:00+03:00', country_code: 'AE', country: 'UAE', ad_name: 'Ad B' },
];

const windowed = filterOrderLinesToSameElapsedWindow(lines, '2026-06-15', 0.5, 'Europe/Istanbul');
assert(windowed.length === 5, `Expected 5 same-window orders on prior day through noon, got ${windowed.length}`);

const fair = buildOrderMoverRankings(
  [
    { order_id: '1', date: '2026-06-16', created_at: '2026-06-16T08:00:00+03:00', country_code: 'US', country: 'United States', ad_name: 'Ad A' },
    { order_id: '2', date: '2026-06-16', created_at: '2026-06-16T09:00:00+03:00', country_code: 'US', country: 'United States', ad_name: 'Ad A' },
    { order_id: '3', date: '2026-06-15', created_at: '2026-06-15T08:00:00+03:00', country_code: 'US', country: 'United States', ad_name: 'Ad A' },
    { order_id: '4', date: '2026-06-15', created_at: '2026-06-15T09:00:00+03:00', country_code: 'US', country: 'United States', ad_name: 'Ad A' },
    { order_id: '8', date: '2026-06-15', created_at: '2026-06-15T20:00:00+03:00', country_code: 'AE', country: 'UAE', ad_name: 'Ad B' },
  ],
  '2026-06-16',
  '2026-06-15',
  {
    direction: 'down',
    minMovePct: 40,
    elapsedShare: 0.5,
    timeZone: 'Europe/Istanbul',
    cleanAdLabel: (line) => line.ad_name || '',
  },
);
assert(!fair, 'Same-window tie should not produce daggers at day start');

const daggers = buildOrderMoverRankings(
  [
    { order_id: 'a', date: '2026-06-16', country_code: 'US', country: 'United States', ad_name: 'Ad A' },
    ...Array.from({ length: 10 }, (_, i) => ({
      order_id: `p-${i}`,
      date: '2026-06-15',
      created_at: `2026-06-15T0${Math.min(i, 9)}:00:00+03:00`,
      country_code: 'US',
      country: 'United States',
      ad_name: 'Ad A',
    })),
  ],
  '2026-06-16',
  '2026-06-15',
  {
    direction: 'down',
    minMovePct: 40,
    elapsedShare: 0.5,
    timeZone: 'Europe/Istanbul',
    cleanAdLabel: (line) => line.ad_name || '',
  },
);
assert(daggers?.direction === 'down', 'Expected daggers when today trails same-window yesterday');

const rockets = buildOrderMoverRankings(
  [
    ...Array.from({ length: 8 }, (_, i) => ({
      order_id: `t-${i}`,
      date: '2026-06-16',
      created_at: `2026-06-16T0${Math.min(i, 9)}:00:00+03:00`,
      country_code: 'AE',
      country: 'UAE',
      ad_name: 'Ad B',
    })),
    { order_id: 'y', date: '2026-06-15', created_at: '2026-06-15T08:00:00+03:00', country_code: 'AE', country: 'UAE', ad_name: 'Ad B' },
  ],
  '2026-06-16',
  '2026-06-15',
  {
    direction: 'up',
    minMovePct: 40,
    elapsedShare: 0.5,
    timeZone: 'Europe/Istanbul',
    cleanAdLabel: (line) => line.ad_name || '',
  },
);
assert(rockets?.direction === 'up', 'Expected rockets when today beats same-window yesterday');

console.log('order drop / mover rankings checks passed');
