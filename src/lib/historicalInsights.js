const FLOOR_MONTH = '2026-02-01';
const WEEK_BUCKETS = [
  { key: 'W1', label: 'Days 1–7', dayRange: [1, 7] },
  { key: 'W2', label: 'Days 8–14', dayRange: [8, 14] },
  { key: 'W3', label: 'Days 15–21', dayRange: [15, 21] },
  { key: 'W4', label: 'Days 22–end', dayRange: [22, 31] },
];
const WEEKDAY_ORDER = [
  { weekday: 1, weekdayName: 'Monday', weekdayShort: 'Mon' },
  { weekday: 2, weekdayName: 'Tuesday', weekdayShort: 'Tue' },
  { weekday: 3, weekdayName: 'Wednesday', weekdayShort: 'Wed' },
  { weekday: 4, weekdayName: 'Thursday', weekdayShort: 'Thu' },
  { weekday: 5, weekdayName: 'Friday', weekdayShort: 'Fri' },
  { weekday: 6, weekdayName: 'Saturday', weekdayShort: 'Sat' },
  { weekday: 0, weekdayName: 'Sunday', weekdayShort: 'Sun' },
];

function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthKey(date) {
  return String(date || '').slice(0, 7);
}

function monthLabel(monthKeyStr) {
  const [y, m] = monthKeyStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1, 12));
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function dayOfMonth(date) {
  return Number(String(date || '').slice(8, 10));
}

function lastDayOfMonth(monthKeyStr) {
  const [y, m] = monthKeyStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const weekdayFormatters = new Map();

function weekdayInTimezone(date, timeZone) {
  let formatter = weekdayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone });
    weekdayFormatters.set(timeZone, formatter);
  }
  const name = formatter.format(new Date(`${date}T12:00:00Z`));
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[name] ?? 0;
}

function descriptiveStats(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  const n = nums.length;
  if (!n) {
    return { n: 0, total: 0, mean: null, median: null, stdDev: null, cv: null, min: null, max: null };
  }
  const total = nums.reduce((s, v) => s + v, 0);
  const mean = total / n;
  const sorted = [...nums].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const min = sorted[0];
  const max = sorted[n - 1];
  let stdDev = null;
  let cv = null;
  if (n >= 2) {
    const variance = nums.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
    stdDev = Math.sqrt(variance);
    cv = mean ? stdDev / mean : null;
  }
  return { n, total, mean, median, stdDev, cv, min, max };
}

function resolveOptions(options = {}) {
  return {
    developingDay: options.developingDay ?? null,
    excludeDevelopingDay: options.excludeDevelopingDay !== false,
    minDaysThreshold: options.minDaysThreshold ?? 3,
    minOccurrencesForInsight: options.minOccurrencesForInsight ?? 4,
    timeZone: options.timeZone || 'Europe/Istanbul',
    floorMonth: options.floorMonth || FLOOR_MONTH,
  };
}

function normalizeDailyRows(dailyRows = []) {
  return (dailyRows || [])
    .filter((row) => row?.date && row.date >= FLOOR_MONTH)
    .map((row) => ({
      date: row.date,
      orders: Number(row.orders || 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function lastCompleteDay(rows, developingDay, excludeDevelopingDay) {
  if (!rows.length) return '';
  const last = rows[rows.length - 1].date;
  if (excludeDevelopingDay && developingDay && last === developingDay) {
    return rows.length > 1 ? rows[rows.length - 2].date : '';
  }
  return last;
}

function completeMonthsBefore(anchorMonthKey, count) {
  const [y, m] = anchorMonthKey.split('-').map(Number);
  const months = [];
  let year = y;
  let month = m;
  for (let i = 0; i < count; i += 1) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    months.unshift(`${year}-${String(month).padStart(2, '0')}`);
  }
  return months;
}

function filterToScope(rows, scope, opts, lastComplete) {
  const floor = opts.floorMonth.slice(0, 7);
  const eligible = rows.filter((row) => row.date.slice(0, 7) >= floor && (!lastComplete || row.date <= lastComplete));
  if (!eligible.length) return [];

  const anchorMonth = lastComplete ? monthKey(lastComplete) : monthKey(eligible[eligible.length - 1].date);

  if (scope === 'last_month') {
    const [target] = completeMonthsBefore(anchorMonth, 1);
    return eligible.filter((row) => monthKey(row.date) === target);
  }
  if (scope === 'last_3_months') {
    const targets = new Set(completeMonthsBefore(anchorMonth, 3));
    return eligible.filter((row) => targets.has(monthKey(row.date)));
  }
  return eligible.filter((row) => row.date >= opts.floorMonth && (!lastComplete || row.date <= lastComplete));
}


function buildWeekBucketStats(rows, monthKeyStr, opts) {
  const lastDay = lastDayOfMonth(monthKeyStr);
  const buckets = {};
  for (const def of WEEK_BUCKETS) {
    const [start, endRaw] = def.dayRange;
    const end = def.key === 'W4' ? lastDay : endRaw;
    const bucketRows = rows.filter((row) => {
      const dom = dayOfMonth(row.date);
      return dom >= start && dom <= end;
    });
    const stats = descriptiveStats(bucketRows.map((r) => r.orders));
    buckets[def.key] = {
      bucket: def.key,
      label: def.key === 'W4' ? `Days 22–${lastDay}` : def.label,
      dayRange: [start, end],
      ...stats,
      hasSufficientData: stats.n >= opts.minDaysThreshold,
      wowVsPriorBucket: null,
    };
  }
  const keys = ['W1', 'W2', 'W3', 'W4'];
  keys.forEach((key, index) => {
    if (index === 0) return;
    const prev = buckets[keys[index - 1]];
    const cur = buckets[key];
    if (prev.mean && cur.mean != null && prev.mean !== 0) {
      cur.wowVsPriorBucket = (cur.mean - prev.mean) / prev.mean;
    }
  });
  return buckets;
}

function buildMonthlyTable(rows, opts, developingDay) {
  const byMonth = new Map();
  for (const row of rows) {
    const key = monthKey(row.date);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(row);
  }
  const currentMonth = developingDay ? monthKey(developingDay) : '';
  const table = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, monthRows]) => {
      const dayStats = descriptiveStats(monthRows.map((r) => r.orders));
      const peak = monthRows.reduce((best, row) => (row.orders > (best?.orders ?? -1) ? row : best), null);
      const monthLastDay = lastDayOfMonth(key);
      const isPartial = currentMonth === key && monthRows.length < monthLastDay;
      return {
        monthKey: key,
        monthLabel: monthLabel(key),
        isCurrentMonth: key === currentMonth,
        isPartial,
        daysWithData: monthRows.length,
        totalOrders: dayStats.total,
        avgDailyOrders: dayStats.mean,
        medianDailyOrders: dayStats.median,
        momChangePercent: null,
        weekBuckets: buildWeekBucketStats(monthRows, key, opts),
        peakDay: peak ? { date: peak.date, orders: peak.orders } : null,
      };
    });

  table.forEach((row, index) => {
    if (index === 0) return;
    const prev = table[index - 1];
    if (prev.daysWithData >= 14 && row.daysWithData >= 14 && prev.avgDailyOrders) {
      row.momChangePercent = ((row.avgDailyOrders - prev.avgDailyOrders) / prev.avgDailyOrders) * 100;
    }
  });
  return table;
}

function buildWeekdayTable(rows, opts) {
  const groups = Object.fromEntries(WEEKDAY_ORDER.map((d) => [d.weekday, []]));
  for (const row of rows) {
    const wd = weekdayInTimezone(row.date, opts.timeZone);
    groups[wd].push(row.orders);
  }
  const table = WEEKDAY_ORDER.map(({ weekday, weekdayName, weekdayShort }) => {
    const stats = descriptiveStats(groups[weekday] || []);
    return {
      weekday,
      weekdayName,
      weekdayShort,
      ...stats,
      deviationFromWeeklyMean: null,
      hasSufficientData: stats.n >= opts.minOccurrencesForInsight,
    };
  });
  const globalMean = table.reduce((s, row) => s + (row.mean || 0), 0) / Math.max(1, table.filter((r) => r.mean != null).length);
  table.forEach((row) => {
    if (row.mean != null && globalMean) {
      row.deviationFromWeeklyMean = ((row.mean - globalMean) / globalMean) * 100;
    }
  });
  return table;
}

function buildSummary(rows, allRows, lastComplete) {
  const stats = descriptiveStats(rows.map((r) => r.orders));
  const peak = rows.reduce((best, row) => (row.orders > (best?.orders ?? -1) ? row : best), null);
  const nonZero = rows.filter((r) => r.orders > 0);
  const lowest = nonZero.reduce((best, row) => (row.orders < (best?.orders ?? Infinity) ? row : best), null);
  const completeRows = allRows.filter((r) => !lastComplete || r.date <= lastComplete);
  const rollingPool = completeRows.slice(-28);
  const rolling28 = rollingPool.length ? descriptiveStats(rollingPool.map((r) => r.orders)).mean : null;
  const peakToTrough = stats.min && stats.max ? stats.max / stats.min : null;
  return {
    totalOrders: stats.total,
    avgDailyOrders: stats.mean,
    medianDailyOrders: stats.median,
    stdDev: stats.stdDev,
    cv: stats.cv,
    peakDay: peak ? { date: peak.date, orders: peak.orders } : null,
    lowestDay: lowest ? { date: lowest.date, orders: lowest.orders } : null,
    rolling28DayAvg: rolling28,
    peakToTroughRatio: peakToTrough,
  };
}

function confidenceFromPoints(n, min) {
  if (n < min) return null;
  if (n < min * 2) return 'low';
  if (n < min * 4) return 'medium';
  return 'high';
}

function buildInsights(weekdayTable, monthlyTable, summary, scope, opts) {
  const cards = [];
  const eligibleWeekdays = weekdayTable.filter((row) => row.hasSufficientData && row.mean != null);
  if (eligibleWeekdays.length) {
    const globalMean = eligibleWeekdays.reduce((s, r) => s + r.mean, 0) / eligibleWeekdays.length;
    const best = [...eligibleWeekdays].sort((a, b) => b.mean - a.mean)[0];
    const worst = [...eligibleWeekdays].sort((a, b) => a.mean - b.mean)[0];
    if (best) {
      cards.push({
        id: 'BEST_WEEKDAY',
        type: 'BEST_WEEKDAY',
        title: `${best.weekdayName} is your peak day`,
        body: `Averaging ${best.mean.toFixed(1)} orders/day — ${Math.abs(best.deviationFromWeeklyMean || 0).toFixed(0)}% above the weekly mean of ${globalMean.toFixed(1)}. Schedule email and paid social ahead of this day.`,
        primaryMetric: best.mean,
        primaryMetricLabel: 'avg orders/day',
        confidence: confidenceFromPoints(best.n, opts.minOccurrencesForInsight),
        dataPoints: best.n,
      });
    }
    if (worst && worst.weekday !== best?.weekday) {
      cards.push({
        id: 'WORST_WEEKDAY',
        type: 'WORST_WEEKDAY',
        title: `${worst.weekdayName} under-indexes`,
        body: `${worst.weekdayName} averages ${worst.mean.toFixed(1)} orders/day (${Math.abs(worst.deviationFromWeeklyMean || 0).toFixed(0)}% below weekly mean). Good window for tests or retargeting pushes.`,
        primaryMetric: worst.mean,
        primaryMetricLabel: 'avg orders/day',
        confidence: confidenceFromPoints(worst.n, opts.minOccurrencesForInsight),
        dataPoints: worst.n,
      });
    }
    const volatile = eligibleWeekdays.find((row) => row.cv != null && row.cv > 0.8);
    if (volatile) {
      cards.push({
        id: 'HIGH_VOLATILITY_WARNING',
        type: 'HIGH_VOLATILITY_WARNING',
        title: `${volatile.weekdayName} is unpredictable (CV ${(volatile.cv * 100).toFixed(0)}%)`,
        body: 'High day-to-day variance suggests campaign spikes rather than a stable baseline. Isolate promo days before planning against this weekday.',
        primaryMetric: volatile.cv,
        primaryMetricLabel: 'coefficient of variation',
        confidence: 'low',
        dataPoints: volatile.n,
      });
    }
  }

  const bucketScores = [];
  for (const month of monthlyTable) {
    for (const def of WEEK_BUCKETS) {
      const bucket = month.weekBuckets[def.key];
      if (bucket?.hasSufficientData && bucket.mean != null) {
        bucketScores.push({ ...bucket, monthKey: month.monthKey });
      }
    }
  }
  if (bucketScores.length) {
    const bestBucket = [...bucketScores].sort((a, b) => b.mean - a.mean)[0];
    const monthMean = monthlyTable.reduce((s, m) => s + (m.avgDailyOrders || 0), 0) / Math.max(1, monthlyTable.filter((m) => m.avgDailyOrders != null).length);
    if (bestBucket && monthMean) {
      cards.push({
        id: 'WEEK_OF_MONTH_PATTERN',
        type: 'WEEK_OF_MONTH_PATTERN',
        title: `${bestBucket.bucket} (${bestBucket.label}) leads within-month demand`,
        body: `Average ${bestBucket.mean.toFixed(1)} orders/day vs overall ${monthMean.toFixed(1)} (+${(((bestBucket.mean - monthMean) / monthMean) * 100).toFixed(0)}%). Plan launches and inventory before this week slot.`,
        primaryMetric: bestBucket.mean,
        primaryMetricLabel: 'avg orders/day',
        confidence: bucketScores.length >= 8 ? 'medium' : 'low',
        dataPoints: bucketScores.length,
      });
    }
  }

  const completeMonths = monthlyTable.filter((m) => m.daysWithData >= 14 && m.avgDailyOrders != null);
  if (completeMonths.length >= 2) {
    const first = completeMonths[0];
    const last = completeMonths[completeMonths.length - 1];
    const delta = ((last.avgDailyOrders - first.avgDailyOrders) / first.avgDailyOrders) * 100;
    const direction = delta > 5 ? 'Growing' : delta < -5 ? 'Declining' : 'Stable';
    cards.push({
      id: 'MOM_TREND',
      type: 'MOM_TREND',
      title: `${direction} Shopify order volume`,
      body: `${first.monthLabel} ${first.avgDailyOrders.toFixed(1)} → ${last.monthLabel} ${last.avgDailyOrders.toFixed(1)} avg daily orders (${delta > 0 ? '+' : ''}${delta.toFixed(0)}% across ${completeMonths.length} months).`,
      primaryMetric: delta,
      primaryMetricLabel: '% change',
      confidence: completeMonths.length >= 3 ? 'medium' : 'low',
      dataPoints: completeMonths.length,
    });
  }

  return cards.filter((c) => c.confidence);
}

function collectCaveats(rows, weekdayTable, monthlyTable, scope, opts, developingDay) {
  const caveats = [];
  if (opts.excludeDevelopingDay && developingDay) {
    caveats.push({
      id: 'DEVELOPING_DAY_EXCLUDED',
      severity: 'info',
      message: `Today (${developingDay}) is excluded from averages while the reporting day is still developing.`,
    });
  }
  if (weekdayTable.some((row) => row.n > 0 && row.n < 8)) {
    caveats.push({
      id: 'SMALL_SAMPLE_WEEKDAY',
      severity: 'warning',
      message: 'Weekday averages use fewer than 8 occurrences — treat differences under ~15% as noise.',
    });
  }
  if ((rows.reduce((s, r) => s + r.orders, 0) / Math.max(1, rows.length)) < 2) {
    caveats.push({
      id: 'LOW_TOTAL_VOLUME',
      severity: 'warning',
      message: 'At low daily volume, one large order can move bucket averages — median is often more stable than mean.',
    });
  }
  const partial = monthlyTable.find((m) => m.isPartial);
  if (partial) {
    caveats.push({
      id: 'PARTIAL_MONTH',
      severity: 'info',
      message: `${partial.monthLabel} is still in progress (${partial.daysWithData} days loaded).`,
    });
  }
  if (scope === 'last_month') {
    caveats.push({
      id: 'SINGLE_MONTH_SCOPE',
      severity: 'info',
      message: 'Last month scope shows one calendar month only — switch to Last 3 or All time for trend patterns.',
    });
  }
  return caveats;
}

function scopeLabel(scope, rows) {
  if (!rows.length) return 'No Shopify history loaded';
  const from = rows[0].date.slice(0, 7);
  const to = rows[rows.length - 1].date.slice(0, 7);
  if (scope === 'last_month') return `Last month (${monthLabel(from)})`;
  if (scope === 'last_3_months') return `Last 3 months (${monthLabel(from)} – ${monthLabel(to)})`;
  return `All time (${monthLabel(from)} – ${monthLabel(to)})`;
}

export function buildHistoricalInsights(dailyRows = [], scope = 'all_time', options = {}) {
  const opts = resolveOptions(options);
  const normalized = normalizeDailyRows(dailyRows);
  const developingDay = opts.developingDay;
  const lastComplete = lastCompleteDay(normalized, developingDay, opts.excludeDevelopingDay);
  let rows = filterToScope(normalized, scope, opts, lastComplete);
  if (opts.excludeDevelopingDay && developingDay) {
    rows = rows.filter((row) => row.date !== developingDay);
  }

  const monthlyTable = buildMonthlyTable(rows, opts, developingDay);
  const weekdayTable = buildWeekdayTable(rows, opts);
  const summary = buildSummary(rows, normalized, lastComplete);
  const insights = buildInsights(weekdayTable, monthlyTable, summary, scope, opts);
  const caveats = collectCaveats(rows, weekdayTable, monthlyTable, scope, opts, developingDay);

  return {
    scope,
    dateRange: {
      from: rows[0]?.date || '',
      to: rows[rows.length - 1]?.date || '',
      developingDay: developingDay || null,
      totalCalendarDays: rows.length,
      daysWithData: rows.length,
    },
    summary,
    monthlyTable,
    weekdayTable,
    insights,
    caveats,
    meta: {
      computedAt: new Date().toISOString(),
      scopeLabel: scopeLabel(scope, rows),
      excludedDevelopingDay: opts.excludeDevelopingDay,
      minDaysThreshold: opts.minDaysThreshold,
      minOccurrencesForInsight: opts.minOccurrencesForInsight,
      dataVersion: 'shopify_orders_v1',
      source: 'Shopify daily orders',
      floorMonth: opts.floorMonth,
    },
  };
}

export const HISTORICAL_SCOPES = [
  { key: 'last_month', label: 'Last month' },
  { key: 'last_3_months', label: 'Last 3' },
  { key: 'all_time', label: 'All time' },
];

export { WEEK_BUCKETS, WEEKDAY_ORDER, FLOOR_MONTH };
