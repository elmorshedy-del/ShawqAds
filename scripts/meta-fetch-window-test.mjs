import assert from 'node:assert';
import {
  DEFAULT_CHUNK_DAYS,
  chunkDateRange,
  isResultTooLargeError,
  nextChunkSize,
  shiftDay,
} from '../src/lib/metaFetchWindow.js';

// --- day arithmetic ---------------------------------------------------------
assert(shiftDay('2026-06-03', 1) === '2026-06-04', 'shifts forward a day');
assert(shiftDay('2026-06-30', 1) === '2026-07-01', 'crosses a month boundary');
assert(shiftDay('2026-12-31', 1) === '2027-01-01', 'crosses a year boundary');
assert(shiftDay('2026-03-01', -1) === '2026-02-28', 'shifts backward across a month');
assert(shiftDay('', 1) === '' && shiftDay('not-a-date', 1) === '', 'bad input yields nothing rather than NaN dates');

// --- slicing ----------------------------------------------------------------
// The union of the slices must be exactly the requested range. A slice short and
// a day of spend silently vanishes; a slice long and we ask Meta for the future.
function assertExactCover(start, end, days) {
  const chunks = chunkDateRange(start, end, days);
  assert(chunks.length > 0, `expected slices for ${start}..${end}`);
  assert(chunks[0].start === start, `first slice must start at ${start}`);
  assert(chunks[chunks.length - 1].end === end, `last slice must end at ${end}, got ${chunks[chunks.length - 1].end}`);
  for (let i = 1; i < chunks.length; i += 1) {
    assert(
      chunks[i].start === shiftDay(chunks[i - 1].end, 1),
      `slices must be consecutive with no gap or overlap near ${chunks[i].start}`,
    );
  }
  for (const chunk of chunks) {
    assert(chunk.start <= chunk.end, 'a slice must not be inverted');
  }
  return chunks;
}

assertExactCover('2026-06-01', '2026-06-30', 7);
assertExactCover('2026-06-01', '2026-06-07', 7);   // exactly one full slice
assertExactCover('2026-06-01', '2026-06-08', 7);   // remainder of one day
assertExactCover('2026-06-01', '2026-06-01', 7);   // single day
assertExactCover('2026-12-20', '2027-01-10', 7);   // across a year boundary
assertExactCover('2026-02-20', '2026-03-05', 5);   // across a month boundary
assertExactCover('2026-06-01', '2026-06-30', 1);   // day-at-a-time

const week = chunkDateRange('2026-06-01', '2026-06-14', 7);
assert(week.length === 2, 'a 14-day range splits into two 7-day slices');
assert(week[0].start === '2026-06-01' && week[0].end === '2026-06-07', 'slice boundaries are inclusive');

// The real regression: the production window that grew until Meta rejected it.
// It must now arrive as many small requests rather than one oversized one.
const launchToToday = assertExactCover('2026-06-03', '2026-08-08', DEFAULT_CHUNK_DAYS);
assert(launchToToday.length >= 9, 'the launch-to-today window must be split, not sent whole');
for (const chunk of launchToToday) {
  const span = (Date.parse(`${chunk.end}T00:00:00Z`) - Date.parse(`${chunk.start}T00:00:00Z`)) / 86400000;
  assert(span < DEFAULT_CHUNK_DAYS, `every slice must stay under the chunk size, got ${span + 1} days`);
}

// Degenerate input must produce no requests rather than an infinite loop.
assert(chunkDateRange('2026-06-10', '2026-06-01', 7).length === 0, 'a reversed range yields no slices');
assert(chunkDateRange('', '2026-06-01', 7).length === 0, 'a missing start yields no slices');
assert(chunkDateRange('2026-06-01', '2026-06-10', 0).length === 10, 'a zero chunk size falls back to one day, not a hang');
assert(chunkDateRange('2026-06-01', '2026-06-10', -5).length === 10, 'a negative chunk size cannot invert the walk');

// --- classifying the failure ------------------------------------------------
// This is the exact message Meta returned in production.
assert(
  isResultTooLargeError(new Error('Meta API 500: {"error":{"code":1,"message":"Please reduce the amount of data you\'re asking for, then retry your request"}}')),
  'the production rejection must be recognised as a size problem',
);
assert(isResultTooLargeError(new Error('too much data requested')), 'wording variants are recognised');
// Narrow on purpose: mistaking a real fault for a size problem would send the
// fetch into a pointless splitting spiral instead of surfacing the actual error.
assert(!isResultTooLargeError(new Error('Meta API 190: invalid access token')), 'an auth failure is not a size problem');
assert(!isResultTooLargeError(new Error('Meta API 500: internal error')), 'a bare 500 is not assumed to be a size problem');
assert(!isResultTooLargeError(undefined) && !isResultTooLargeError(null), 'missing errors are handled');

// --- backing off -------------------------------------------------------------
assert(nextChunkSize(7) === 3, 'a rejected slice roughly halves');
assert(nextChunkSize(3) === 1, 'halving bottoms out at a single day');
assert(nextChunkSize(1) === 0, 'a single day cannot be split further, so retrying must stop');
assert(nextChunkSize(0) === 0, 'degenerate sizes terminate rather than loop');

// Halving must actually terminate.
let size = 64;
let steps = 0;
while (size > 0 && steps < 100) { size = nextChunkSize(size); steps += 1; }
assert(size === 0 && steps < 10, 'the backoff sequence terminates quickly');

console.log('meta fetch window checks passed');
