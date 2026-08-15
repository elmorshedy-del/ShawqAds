const dateRange = (dates) => {
  const sorted = [...dates].filter(Boolean).sort();
  return {
    since: sorted[0] || '',
    until: sorted.at(-1) || '',
    dates: sorted,
  };
};

const addDate = (set, value) => {
  if (value) set.add(String(value));
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TRUSTED_META_GAP_DAYS = 3;

function missingCalendarDays(before, after) {
  const a = Date.parse(`${before}T00:00:00Z`);
  const b = Date.parse(`${after}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.max(0, Math.round((b - a) / DAY_MS) - 1);
}

/**
 * A fresh live-today Meta row must not make a months-old historical snapshot look
 * continuously current. That exact shape makes week/month Shopify revenue divide
 * by only today's Meta spend and publishes impossible ROAS multiples.
 *
 * We only call a gap suspicious when Shopify has actual row-backed activity inside
 * it. Small Meta gaps are tolerated because a truly zero-delivery day may have no
 * insights row at all.
 */
function trustedMetaRange(metaDates, shopifyDates) {
  const range = dateRange(metaDates);
  const shopify = [...shopifyDates].filter(Boolean).sort();
  let trustedUntil = range.until;
  let gap = null;

  for (let i = 1; i < range.dates.length; i += 1) {
    const before = range.dates[i - 1];
    const after = range.dates[i];
    const missingDays = missingCalendarDays(before, after);
    if (missingDays <= MAX_TRUSTED_META_GAP_DAYS) continue;
    const shopifyInsideGap = shopify.some((date) => date > before && date < after);
    if (!shopifyInsideGap) continue;
    trustedUntil = before;
    gap = {
      source: 'Meta',
      after: before,
      before: after,
      missing_days: missingDays,
    };
    break;
  }

  return { ...range, trusted_until: trustedUntil, gap };
}

/**
 * Row-backed source coverage for metrics that combine Meta spend with Shopify
 * outcomes. Requested API windows are intentionally ignored: a request through
 * today does not mean both sources returned a row for today.
 */
export function sourceCoverageBounds(meta = {}, shopify = {}, reportingToday = '') {
  const metaDates = new Set();
  const shopifyDates = new Set();

  for (const adset of meta.adsets || []) {
    for (const row of adset.rows || []) addDate(metaDates, row?.date || row?.date_start);
  }
  for (const key of ['ad_daily', 'ad_country_daily', 'account_daily_metrics', 'daily_metrics']) {
    for (const row of meta[key] || []) addDate(metaDates, row?.date || row?.date_start);
  }
  for (const key of ['daily', 'order_lines']) {
    for (const row of shopify[key] || []) addDate(shopifyDates, row?.date || row?.date_start);
  }

  const metaRange = trustedMetaRange(metaDates, shopifyDates);
  const shopifyRange = dateRange(shopifyDates);
  const metaTrustedUntil = metaRange.trusted_until || '';
  const commonSince = [metaRange.since, shopifyRange.since].filter(Boolean).sort().at(-1) || '';
  const commonUntil = [metaTrustedUntil, shopifyRange.until].filter(Boolean).sort()[0] || '';
  const hasCommon = Boolean(commonSince && commonUntil && commonSince <= commonUntil);
  const latestAny = [metaRange.until, shopifyRange.until].filter(Boolean).sort().at(-1) || '';
  const hasTodayData = Boolean(
    reportingToday
    && metaTrustedUntil >= reportingToday
    && shopifyRange.until >= reportingToday,
  );

  let laggingSource = '';
  if (metaTrustedUntil && shopifyRange.until && metaTrustedUntil !== shopifyRange.until) {
    laggingSource = metaTrustedUntil < shopifyRange.until ? 'Meta' : 'Shopify';
  } else if (!metaTrustedUntil && shopifyRange.until) {
    laggingSource = 'Meta';
  } else if (metaTrustedUntil && !shopifyRange.until) {
    laggingSource = 'Shopify';
  }

  return {
    meta_since: metaRange.since,
    // meta_until is intentionally the last *trusted continuous* date. The raw
    // latest row remains available separately for sync diagnostics.
    meta_until: metaTrustedUntil,
    meta_latest_row_date: metaRange.until,
    shopify_since: shopifyRange.since,
    shopify_until: shopifyRange.until,
    common_since: hasCommon ? commonSince : '',
    common_until: hasCommon ? commonUntil : '',
    latest_common_data_day: hasCommon ? commonUntil : '',
    latest_any_data_day: latestAny,
    has_common_data: hasCommon,
    has_today_data: hasTodayData,
    lagging_source: laggingSource,
    coverage_gap: Boolean(metaRange.gap),
    coverage_gap_source: metaRange.gap?.source || '',
    coverage_gap_after: metaRange.gap?.after || '',
    coverage_gap_before: metaRange.gap?.before || '',
    coverage_gap_missing_days: Number(metaRange.gap?.missing_days || 0),
  };
}

function shiftDate(date, days) {
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/**
 * Rolling presets end on today only when both sources are current. Otherwise
 * they end on the latest row-backed matched day, so "Last week" never opens an
 * empty future window while the dashboard is waiting on a stale source.
 */
export function rollingMatchedRange(bounds = {}, days = 7) {
  const calendarEnd = bounds.today || '';
  const matchedEnd = bounds.latest_data_day || bounds.common_until || '';
  const until = bounds.has_today_data ? calendarEnd : matchedEnd || calendarEnd;
  return {
    since: shiftDate(until, -(Math.max(1, Number(days) || 1) - 1)),
    until,
  };
}
