const REPORTING_TIMEZONE = 'Europe/Istanbul';

export function dateInTimezone(date = new Date(), timeZone = REPORTING_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function currentReportingDay(timeZone = REPORTING_TIMEZONE) {
  return dateInTimezone(new Date(), timeZone);
}

export function isDevelopingReportingDayRange(range, reportingToday = currentReportingDay()) {
  return Boolean(
    range?.since
    && range?.until
    && range.since === range.until
    && range.until === reportingToday,
  );
}

export function latestDateFromRows(rows = [], dateKeys = ['date', 'date_start']) {
  const dates = [];
  for (const row of rows || []) {
    for (const key of dateKeys) {
      if (row?.[key]) dates.push(String(row[key]));
    }
  }
  return dates.sort().at(-1) || '';
}

export function behaviorCachedUntil(behavior) {
  const rowUntil = latestDateFromRows([
    ...(behavior?.facts || []),
    ...(behavior?.meta_demographics_rows || []),
    ...(behavior?.page_facts || []),
    ...(behavior?.journey_rows || []),
  ]);
  return [behavior?.period?.until, rowUntil].filter(Boolean).sort().at(-1) || '';
}

export function behaviorHasReportingDayData(behavior, day) {
  if (!day) return false;
  const collections = ['facts', 'meta_demographics_rows', 'page_facts', 'journey_rows'];
  return collections.some((key) => (behavior?.[key] || []).some((row) => (row.date || row.date_start) === day));
}

export function behaviorCoverageMeta(behavior, range, reportingToday = currentReportingDay()) {
  const cachedUntil = behaviorCachedUntil(behavior);
  const developingDay = isDevelopingReportingDayRange(range, reportingToday)
    && !behaviorHasReportingDayData(behavior, reportingToday);
  const cacheLagsCalendar = Boolean(
    cachedUntil
    && range?.until
    && range.until > cachedUntil
    && reportingToday === range.until,
  );
  return {
    developing_day: developingDay,
    cached_until: cachedUntil,
    reporting_today: reportingToday,
    requested_until: range?.until || '',
    cache_lags_calendar: cacheLagsCalendar,
  };
}

export function emptyBehaviorGlobal() {
  return { exposed: 0, abandoned: 0, rate: null };
}
