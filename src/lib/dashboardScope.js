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

  const metaRange = dateRange(metaDates);
  const shopifyRange = dateRange(shopifyDates);
  const commonSince = [metaRange.since, shopifyRange.since].filter(Boolean).sort().at(-1) || '';
  const commonUntil = [metaRange.until, shopifyRange.until].filter(Boolean).sort()[0] || '';
  const hasCommon = Boolean(commonSince && commonUntil && commonSince <= commonUntil);
  const latestAny = [metaRange.until, shopifyRange.until].filter(Boolean).sort().at(-1) || '';
  const hasTodayData = Boolean(
    reportingToday
    && metaRange.until >= reportingToday
    && shopifyRange.until >= reportingToday,
  );

  let laggingSource = '';
  if (metaRange.until && shopifyRange.until && metaRange.until !== shopifyRange.until) {
    laggingSource = metaRange.until < shopifyRange.until ? 'Meta' : 'Shopify';
  } else if (!metaRange.until && shopifyRange.until) {
    laggingSource = 'Meta';
  } else if (metaRange.until && !shopifyRange.until) {
    laggingSource = 'Shopify';
  }

  return {
    meta_since: metaRange.since,
    meta_until: metaRange.until,
    shopify_since: shopifyRange.since,
    shopify_until: shopifyRange.until,
    common_since: hasCommon ? commonSince : '',
    common_until: hasCommon ? commonUntil : '',
    latest_common_data_day: hasCommon ? commonUntil : '',
    latest_any_data_day: latestAny,
    has_common_data: hasCommon,
    has_today_data: hasTodayData,
    lagging_source: laggingSource,
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
