/**
 * Request-window planning for the Meta insights fetch.
 *
 * Meta refuses a request whose result set is too large, and reports it as an
 * opaque HTTP 500 carrying "Please reduce the amount of data you're asking for".
 * The dashboard's window runs from the campaign launch to today, so it grows by a
 * day every day: a request that was comfortable at launch eventually crosses the
 * ceiling, and from then on the whole refresh fails rather than just the oversized
 * part — a single bad call meant no Meta data at all for that run.
 *
 * Splitting a long window into slices keeps every individual request small no
 * matter how old the account gets. These helpers live apart from the fetch script
 * because that script is a top-level-await program that runs on import and needs
 * live credentials, so nothing inside it can be exercised in a test.
 */

export const DEFAULT_CHUNK_DAYS = 7;

export function shiftDay(date, days) {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Split an inclusive date range into consecutive slices of at most `days`.
 * The final slice is clamped to `end`, so the union is exactly the input range —
 * never a day short and never a day of overreach into the future.
 */
export function chunkDateRange(start, end, days = DEFAULT_CHUNK_DAYS) {
  if (!start || !end || start > end) return [];
  const size = Math.max(1, Math.floor(days) || 1);
  const chunks = [];
  let cursor = start;
  while (cursor && cursor <= end) {
    const chunkEnd = shiftDay(cursor, size - 1);
    if (!chunkEnd) break;
    chunks.push({ start: cursor, end: chunkEnd > end ? end : chunkEnd });
    cursor = shiftDay(cursor, size);
  }
  return chunks;
}

/**
 * Meta signals "too large" through the message rather than a distinct status, so
 * this has to match on text. Kept narrow on purpose: treating an unrelated 500 as
 * a size problem would send the fetch into a pointless splitting spiral instead of
 * surfacing the real failure.
 */
export function isResultTooLargeError(error) {
  return /reduce the amount of data|please reduce|too much data/i.test(String(error?.message || ''));
}

/** The next slice size to try after a rejection, or 0 when a single day already failed. */
export function nextChunkSize(currentDays) {
  const current = Math.max(1, Math.floor(currentDays) || 1);
  if (current <= 1) return 0;
  return Math.max(1, Math.floor(current / 2));
}
