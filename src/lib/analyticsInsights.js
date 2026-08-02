/* ----------------------------------------------------------------------------
 * analyticsInsights.js — turns the merged daily business rows into directional
 * findings: what moved, whether it is normal, what drove it, and what to do.
 *
 * Everything here is pure and derives from rows already computed in App.jsx
 * (date, revenue_usd, spend_usd, orders, units, aov, cac, roas). No fetching,
 * no re-derivation of business logic.
 *
 * Statistical choices, and why:
 *  - Median + MAD instead of mean + stdev. Daily ecommerce series are short and
 *    spiky; one launch day or one outage day would drag a mean-based band far
 *    enough to hide every real anomaly.
 *  - MAD is scaled by 1.4826 so the band is comparable to a normal-distribution
 *    sigma, which keeps the "unusual" threshold interpretable.
 *  - Ratio metrics (ROAS, CAC, AOV) are recomputed from summed numerators and
 *    denominators, never averaged across days. Averaging daily ROAS weights a
 *    $30 day the same as a $3,000 day and reliably overstates weak periods.
 * ------------------------------------------------------------------------- */

const MAD_TO_SIGMA = 1.4826;

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function median(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median absolute deviation, scaled to be sigma-comparable. */
export function medianAbsoluteDeviation(values = [], center = null) {
  const finite = values.map(Number).filter(Number.isFinite);
  if (finite.length < 2) return null;
  const mid = center == null ? median(finite) : center;
  if (mid == null) return null;
  const deviations = finite.map((value) => Math.abs(value - mid));
  const rawMad = median(deviations);
  return rawMad == null ? null : rawMad * MAD_TO_SIGMA;
}

/**
 * Expected operating range for a daily series.
 * `k` is in sigma-equivalents: 2 covers roughly the middle 95% of a well-behaved
 * series, which is the band we call "normal" in the UI.
 */
export function robustBand(values = [], k = 2) {
  const finite = values.map(Number).filter(Number.isFinite);
  if (finite.length < 3) return null;
  const mid = median(finite);
  const spread = medianAbsoluteDeviation(finite, mid);
  if (mid == null || spread == null) return null;
  // A perfectly flat stretch yields MAD 0, which would flag every later wobble as
  // infinitely unusual. Fall back to a 10% band so the range stays meaningful.
  const width = spread > 0 ? spread : Math.abs(mid) * 0.1;
  return {
    median: mid,
    spread: width,
    low: mid - k * width,
    high: mid + k * width,
    n: finite.length,
  };
}

/** Robust z-score: how many sigma-equivalents a value sits from the median. */
export function robustZScore(value, band) {
  if (!band || !band.spread) return 0;
  return (num(value) - band.median) / band.spread;
}

/**
 * Flags days in `rows` that sit outside the robust band built from the days
 * before them. Uses an expanding window so a day is only ever judged against
 * history that preceded it — no lookahead.
 */
export function detectAnomalies(rows = [], key, { minHistory = 5, threshold = 2.5, excludeDates = [] } = {}) {
  const skip = new Set(excludeDates.filter(Boolean));
  const sorted = [...rows]
    .filter((row) => row && row.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const out = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const row = sorted[i];
    if (skip.has(row.date)) continue;
    const history = sorted.slice(0, i).map((r) => num(r[key]));
    if (history.length < minHistory) continue;
    const band = robustBand(history);
    if (!band) continue;
    const value = num(row[key]);
    const z = robustZScore(value, band);
    if (Math.abs(z) < threshold) continue;
    out.push({
      date: row.date,
      key,
      value,
      expected: band.median,
      low: band.low,
      high: band.high,
      z,
      direction: z > 0 ? 'above' : 'below',
      severity: Math.abs(z) >= 3.5 ? 'high' : 'moderate',
    });
  }
  return out;
}

/** Period totals with ratio metrics rebuilt from the sums, not averaged. */
export function periodTotals(rows = []) {
  const revenue = rows.reduce((sum, row) => sum + num(row.revenue_usd), 0);
  const spend = rows.reduce((sum, row) => sum + num(row.spend_usd), 0);
  const orders = rows.reduce((sum, row) => sum + num(row.orders), 0);
  const units = rows.reduce((sum, row) => sum + num(row.units), 0);
  return {
    days: rows.length,
    revenue_usd: revenue,
    spend_usd: spend,
    orders,
    units,
    aov: orders ? revenue / orders : 0,
    cac: orders ? spend / orders : 0,
    roas: spend ? revenue / spend : 0,
  };
}

export function pctChange(current, previous) {
  const prev = num(previous);
  if (!prev) return null;
  return ((num(current) - prev) / Math.abs(prev)) * 100;
}

/**
 * Ranks named items by how much of a period-over-period change they account for.
 * `share` is signed against the total move, so an item pulling the other way
 * reads as a negative share instead of silently inflating the winners.
 */
export function topDrivers(currentItems = [], previousItems = [], { limit = 3, minAbsChange = 0 } = {}) {
  const previousByName = new Map(
    previousItems.filter((item) => item && item.name).map((item) => [item.name, num(item.value)]),
  );
  const names = new Set([
    ...currentItems.filter((item) => item && item.name).map((item) => item.name),
    ...previousByName.keys(),
  ]);
  const rows = [...names].map((name) => {
    const current = num(currentItems.find((item) => item?.name === name)?.value);
    const previous = num(previousByName.get(name));
    return { name, current, previous, change: current - previous };
  });
  const totalChange = rows.reduce((sum, row) => sum + row.change, 0);
  return rows
    .filter((row) => Math.abs(row.change) > minAbsChange)
    .map((row) => ({
      ...row,
      share: totalChange ? (row.change / totalChange) * 100 : 0,
    }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, limit);
}

/** Share of a total held by the single largest item — a concentration read. */
export function concentration(items = []) {
  const values = items.map((item) => num(item?.value)).filter((value) => value > 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total || !items.length) return null;
  const sorted = [...items]
    .filter((item) => num(item?.value) > 0)
    .sort((a, b) => num(b.value) - num(a.value));
  const top = sorted[0];
  if (!top) return null;
  return { name: top.name, value: num(top.value), share: (num(top.value) / total) * 100, total };
}

const fmtMoney = (value) => {
  const n = num(value);
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};
const fmtPct = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`;
const fmtX = (value) => `${num(value).toFixed(2)}x`;
const fmtInt = (value) => String(Math.round(num(value)));

function rangeDays(range) {
  if (!range?.since || !range?.until) return 0;
  const since = new Date(`${range.since}T00:00:00Z`).getTime();
  const until = new Date(`${range.until}T00:00:00Z`).getTime();
  if (!Number.isFinite(since) || !Number.isFinite(until)) return 0;
  return Math.max(1, Math.round((until - since) / 86400000) + 1);
}

function comparisonLabel(days) {
  if (days <= 1) return 'vs the previous day';
  return `vs the previous ${days} days`;
}

function driverSentence(drivers, format) {
  const lead = drivers?.[0];
  if (!lead || !lead.change) return '';
  const direction = lead.change > 0 ? 'added' : 'gave back';
  const shareText = Math.abs(lead.share) >= 15 && Math.abs(lead.share) <= 400
    ? ` (${Math.abs(lead.share).toFixed(0)}% of the move)`
    : '';
  return `${lead.name} ${direction} ${format(Math.abs(lead.change))}${shareText}.`;
}

/**
 * Builds the ranked findings shown in the Key findings panel.
 *
 * Ordering is by materiality, not by metric: a revenue swing that is inside the
 * normal range ranks below an efficiency swing that is outside it, because the
 * second one is the only one that needs a decision.
 */
export function buildKeyFindings({
  windowRows = [],
  historyRows = [],
  range,
  reportingToday = '',
  revenueDrivers = { countries: [], products: [] },
  orderDrivers = { countries: [] },
  concentrationItems = [],
  maxFindings = 5,
} = {}) {
  const days = rangeDays(range);
  const current = periodTotals(windowRows);
  // A window with no rows is absence of data, not a collapse to zero. Comparing it
  // against a populated prior window would manufacture a "-100%" finding.
  if (!windowRows.length) {
    return {
      verdict: { tone: 'neutral', headline: 'No completed days in this window yet', detail: '' },
      findings: [],
      totals: current,
      previousTotals: periodTotals([]),
      hasComparison: false,
    };
  }
  const sortedHistory = [...historyRows]
    .filter((row) => row && row.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  // Compare like for like on *days that have data*, not on calendar length. A 61-day
  // preset holding 10 days of rows must be compared against the previous 10 data days,
  // otherwise the comparison silently reaches back past the start of the account.
  const compareDays = current.days || days;
  const previousRows = range?.since
    ? sortedHistory.filter((row) => row.date < range.since).slice(-compareDays)
    : [];
  const previous = periodTotals(previousRows);
  const hasComparison = previousRows.length > 0;

  // Baseline days: everything before the window, so the band describes "normal
  // before now" rather than being contaminated by the period under review.
  const priorRows = range?.since
    ? sortedHistory.filter((row) => row.date < range.since)
    : sortedHistory;
  // A window anchored at the start of the account (the launch preset) has no "before".
  // Rather than refusing to say whether a day is normal, judge it against the window's
  // own days — and change the wording so the reader knows which baseline was used.
  const usingWindowBaseline = priorRows.length < 5;
  const baselineRows = usingWindowBaseline ? windowRows : priorRows;
  const baselineWord = usingWindowBaseline ? 'this window\'s' : 'the usual';
  const revenueBand = robustBand(baselineRows.map((row) => num(row.revenue_usd)));
  const roasBaseline = periodTotals(baselineRows);

  const findings = [];
  const compareText = comparisonLabel(previous.days || compareDays);

  /* --- Revenue --------------------------------------------------------- */
  const revenueDelta = hasComparison ? pctChange(current.revenue_usd, previous.revenue_usd) : null;
  if (current.revenue_usd > 0 || hasComparison) {
    const dailyRevenue = current.days ? current.revenue_usd / current.days : 0;
    const inBand = revenueBand
      ? dailyRevenue >= revenueBand.low && dailyRevenue <= revenueBand.high
      : null;
    const context = revenueBand
      ? `${fmtMoney(dailyRevenue)}/day ${inBand ? 'sits inside' : 'sits outside'} ${baselineWord} ${fmtMoney(revenueBand.low)}–${fmtMoney(revenueBand.high)} daily range.`
      : 'Not enough days yet to judge whether this is normal.';
    findings.push({
      id: 'revenue',
      metric: 'revenue_usd',
      tone: revenueDelta == null ? 'neutral' : revenueDelta >= 0 ? 'positive' : 'negative',
      priority: revenueDelta == null ? 40 : Math.min(90, 40 + Math.abs(revenueDelta)),
      headline: revenueDelta == null
        ? `Revenue ${fmtMoney(current.revenue_usd)} across ${current.days} day${current.days === 1 ? '' : 's'}`
        : `Revenue ${fmtMoney(current.revenue_usd)}, ${fmtPct(revenueDelta)} ${compareText}`,
      context,
      driver: driverSentence(revenueDrivers.countries, fmtMoney)
        || driverSentence(revenueDrivers.products, fmtMoney),
      action: revenueDelta != null && revenueDelta < -15
        ? 'Open Market → Country sales to see which market pulled back before touching budget.'
        : revenueDelta != null && revenueDelta > 15
          ? 'Check whether the lift is spend-driven or demand-driven in the ROAS finding below.'
          : '',
    });
  }

  /* --- Orders vs basket size ------------------------------------------- */
  if (hasComparison && previous.orders > 0 && current.orders > 0) {
    const orderDelta = pctChange(current.orders, previous.orders);
    const aovDelta = pctChange(current.aov, previous.aov);
    if (orderDelta != null && aovDelta != null && Math.abs(orderDelta - aovDelta) > 8) {
      const demandLed = Math.abs(orderDelta) > Math.abs(aovDelta);
      findings.push({
        id: 'demand-mix',
        metric: 'orders',
        tone: demandLed ? (orderDelta >= 0 ? 'positive' : 'negative') : 'neutral',
        priority: 55 + Math.abs(orderDelta - aovDelta) / 2,
        headline: demandLed
          ? `Demand-led: orders ${fmtPct(orderDelta)} while basket size moved ${fmtPct(aovDelta)}`
          : `Basket-led: AOV ${fmtPct(aovDelta)} while order count moved ${fmtPct(orderDelta)}`,
        context: `${fmtInt(current.orders)} orders at ${fmtMoney(current.aov)} average order value.`,
        driver: driverSentence(orderDrivers.countries, (value) => `${fmtInt(value)} units`),
        action: demandLed
          ? 'Revenue is tracking real buyer count — treat it as a durable move.'
          : 'Revenue is riding basket size, not more buyers. Confirm demand before scaling spend.',
      });
    }
  }

  /* --- Efficiency ------------------------------------------------------- */
  if (current.spend_usd > 0) {
    const roasDelta = hasComparison && previous.roas ? pctChange(current.roas, previous.roas) : null;
    const spendDelta = hasComparison ? pctChange(current.spend_usd, previous.spend_usd) : null;
    const baselineRoas = roasBaseline.roas;
    const vsBaseline = baselineRoas ? ((current.roas - baselineRoas) / baselineRoas) * 100 : null;
    let driver = '';
    if (spendDelta != null && revenueDelta != null) {
      if (spendDelta > 10 && revenueDelta < spendDelta - 10) {
        driver = `Spend rose ${fmtPct(spendDelta)} but revenue only ${fmtPct(revenueDelta)} — the extra budget is not paying back yet.`;
      } else if (spendDelta < -10 && revenueDelta > spendDelta + 10) {
        driver = `Spend fell ${fmtPct(spendDelta)} while revenue held at ${fmtPct(revenueDelta)} — efficiency is coming from restraint.`;
      } else {
        driver = `Spend ${fmtPct(spendDelta)} and revenue ${fmtPct(revenueDelta)} moved together.`;
      }
    }
    findings.push({
      id: 'efficiency',
      metric: 'roas',
      tone: current.roas >= 2.5 ? 'positive' : current.roas >= 1.8 ? 'watch' : 'negative',
      priority: current.roas < 1.8 ? 95 : roasDelta != null ? Math.min(85, 45 + Math.abs(roasDelta)) : 50,
      headline: roasDelta == null
        ? `Blended ROAS ${fmtX(current.roas)} on ${fmtMoney(current.spend_usd)} of Meta spend`
        : `Blended ROAS ${fmtX(current.roas)}, ${fmtPct(roasDelta)} ${compareText}`,
      context: vsBaseline == null
        ? `CAC ${fmtMoney(current.cac)} per order across every channel.`
        : `${fmtPct(vsBaseline)} against the ${fmtX(baselineRoas)} running baseline · CAC ${fmtMoney(current.cac)} per order.`,
      driver,
      action: current.roas < 1.8
        ? 'Below a 1.8x floor. Open Ads → Campaign ROAS tree and cut the worst ad set before adding budget.'
        : current.roas >= 3
          ? 'Headroom to scale. Confirm frequency is not climbing in Launch → Delivery first.'
          : '',
    });
  }

  /* --- Anomalies -------------------------------------------------------- */
  const anomalySeries = [
    { key: 'revenue_usd', label: 'Revenue', format: fmtMoney, outcome: true },
    { key: 'orders', label: 'Orders', format: fmtInt, outcome: true },
    // Spend is an input, not an outcome: an unusual drop is a delivery problem and an
    // unusual jump is an unplanned budget change. Neither reads as a win.
    { key: 'spend_usd', label: 'Meta spend', format: fmtMoney, outcome: false },
  ];
  const windowDates = new Set(windowRows.map((row) => row.date));
  const anomalyHits = anomalySeries.flatMap((series) =>
    detectAnomalies(sortedHistory, series.key, { excludeDates: [reportingToday] })
      .filter((hit) => windowDates.has(hit.date))
      .map((hit) => ({ ...hit, series })));
  // One day that breaks three series at once is one event, not three findings.
  const seenAnomalyDates = new Set();
  for (const hit of anomalyHits.sort((a, b) => Math.abs(b.z) - Math.abs(a.z))) {
    if (seenAnomalyDates.has(hit.date)) continue;
    if (seenAnomalyDates.size >= 2) break;
    seenAnomalyDates.add(hit.date);
    const { series } = hit;
    const above = hit.direction === 'above';
    const tone = series.outcome ? (above ? 'positive' : 'negative') : 'watch';
    findings.push({
      id: `anomaly-${series.key}-${hit.date}`,
      metric: series.key,
      tone,
      priority: 70 + Math.min(20, Math.abs(hit.z) * 3),
      headline: `${hit.date}: ${series.label} ${series.format(hit.value)} was ${above ? 'far above' : 'far below'} normal`,
      context: `Typical day around ${series.format(hit.expected)} (usual range ${series.format(hit.low)}–${series.format(hit.high)}). This is a ${Math.abs(hit.z).toFixed(1)}σ move.`,
      driver: '',
      action: series.outcome
        ? above
          ? 'Worth understanding — check what ran that day so it can be repeated.'
          : 'Check Ads → Ad set edits for a budget or creative change on that date.'
        : above
          ? 'Confirm this budget increase was intentional, then check whether revenue followed.'
          : 'Delivery may have stalled. Check the ad set was not paused or budget-capped that day.',
    });
  }

  /* --- Concentration risk ----------------------------------------------- */
  const top = concentration(concentrationItems);
  if (top && top.share >= 50) {
    findings.push({
      id: 'concentration',
      metric: 'revenue_usd',
      tone: 'watch',
      priority: 45 + (top.share - 50) / 2,
      headline: `${top.name} is ${top.share.toFixed(0)}% of revenue in this window`,
      context: 'A single market carrying most of the revenue means one market\'s bad week is the whole account\'s bad week.',
      driver: '',
      action: 'Check whether the second market is growing in Market → Country sales.',
    });
  }

  const ranked = findings
    .filter((finding) => finding.headline)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxFindings);

  return {
    verdict: buildVerdict({ current, revenueDelta, hasComparison, findings: ranked }),
    findings: ranked,
    totals: current,
    previousTotals: previous,
    hasComparison,
  };
}

function buildVerdict({ current, revenueDelta, hasComparison, findings }) {
  const risky = findings.filter((finding) => finding.tone === 'negative');
  const tone = risky.length ? 'negative' : findings.some((f) => f.tone === 'watch') ? 'watch' : 'positive';
  // Days that actually carry data, not the calendar length of the preset — a 61-day
  // preset over 10 days of rows should not claim 61 days of evidence.
  const dayText = `${current.days} day${current.days === 1 ? '' : 's'} with data`;
  if (!current.days) {
    return { tone: 'neutral', headline: 'No completed days in this window yet', detail: '' };
  }
  const movement = hasComparison && revenueDelta != null
    ? `${fmtPct(revenueDelta)} on revenue`
    : `${fmtMoney(current.revenue_usd)} of revenue`;
  const headline = tone === 'negative'
    ? `${risky.length} thing${risky.length === 1 ? '' : 's'} need${risky.length === 1 ? 's' : ''} attention`
    : tone === 'watch'
      ? 'Holding, with one thing to watch'
      : 'Tracking well';
  return {
    tone,
    headline,
    detail: `${dayText} · ${movement} · ${fmtX(current.roas)} blended ROAS · ${fmtInt(current.orders)} orders`,
  };
}
