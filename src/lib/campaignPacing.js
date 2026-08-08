const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function dateOnly(value) {
  return String(value || '').slice(0, 10);
}

function utcDayNumber(value) {
  const time = new Date(`${dateOnly(value)}T00:00:00Z`).getTime();
  return Number.isFinite(time) ? time / 86400000 : null;
}

function median(values = []) {
  const finite = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return null;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[middle] : (finite[middle - 1] + finite[middle]) / 2;
}

function rowsForTarget(rows, targetId) {
  return (rows || []).filter((row) => row?.target_id === targetId);
}

/**
 * Median cumulative delivery share reached by an hour across completed days.
 * Falls back to linear clock progress until at least three historical days exist.
 */
export function expectedIntradayShare(hourlyRows = [], hour = 0, { minDays = 3 } = {}) {
  const byDate = new Map();
  for (const row of hourlyRows || []) {
    if (!row?.date || num(row.spend_usd) <= 0) continue;
    const dateRows = byDate.get(row.date) || [];
    dateRows.push({ hour: num(row.hour), spend: num(row.spend_usd) });
    byDate.set(row.date, dateRows);
  }
  const shares = [];
  for (const rows of byDate.values()) {
    const total = rows.reduce((sum, row) => sum + row.spend, 0);
    if (!total) continue;
    const throughHour = rows
      .filter((row) => row.hour <= hour)
      .reduce((sum, row) => sum + row.spend, 0);
    shares.push(throughHour / total);
  }
  const fallback = clamp((num(hour) + 1) / 24, 1 / 24, 1);
  if (shares.length < minDays) {
    return { share: fallback, source: 'linear', sampleDays: shares.length };
  }
  return {
    share: clamp(median(shares) ?? fallback, 1 / 24, 1),
    source: 'historical',
    sampleDays: shares.length,
  };
}

function paceStatus({ active, expected, actual, hour, hasCurrentData }) {
  if (!active) return 'paused';
  if (!hasCurrentData) return 'stale';
  if (expected <= 0) return 'unknown';
  const ratio = actual / expected;
  if (ratio > 1.15) return 'over';
  if (hour >= 4 && ratio < 0.7) return actual <= 0 ? 'stalled' : 'under';
  return 'on_track';
}

function buildDailyPace(target, pacing, today, hour) {
  const dailyRows = rowsForTarget(pacing.daily, target.id);
  const todayRows = dailyRows.filter((row) => row.date === today);
  const actual = todayRows.reduce((sum, row) => sum + num(row.spend_usd), 0);
  const historicalHourly = rowsForTarget(pacing.hourly, target.id)
    .filter((row) => row.date < today);
  const todayHourly = rowsForTarget(pacing.hourly, target.id)
    .filter((row) => row.date === today);
  const expectedShare = expectedIntradayShare(historicalHourly, hour);
  const budget = num(target.budget_usd);
  const expected = budget * expectedShare.share;
  const projected = expectedShare.share > 0 ? actual / expectedShare.share : null;
  const active = String(target.effective_status || target.status || '').toUpperCase() === 'ACTIVE';
  const hasCurrentData = todayRows.length > 0 || num(pacing?.live?.target_spend?.[target.id]) >= 0
    && pacing?.live?.date === today;

  let actualCumulative = 0;
  const hourlyCurve = Array.from({ length: 24 }, (_, curveHour) => {
    const actualHour = todayHourly
      .filter((row) => num(row.hour) === curveHour)
      .reduce((sum, row) => sum + num(row.spend_usd), 0);
    actualCumulative += actualHour;
    const curveShare = expectedIntradayShare(historicalHourly, curveHour);
    return {
      hour: curveHour,
      label: `${String(curveHour).padStart(2, '0')}:00`,
      actualHour,
      actualCumulative,
      expectedCumulative: budget * curveShare.share,
    };
  });

  return {
    ...target,
    period: 'day',
    actual,
    expected,
    budget,
    paceRatio: expected > 0 ? actual / expected : null,
    projected,
    remaining: Math.max(0, budget - actual),
    expectedShare: expectedShare.share,
    curveSource: expectedShare.source,
    baselineDays: expectedShare.sampleDays,
    hourlyCurve,
    status: paceStatus({ active, expected, actual, hour, hasCurrentData }),
  };
}

function buildLifetimePace(target, pacing, today) {
  const start = utcDayNumber(target.start_time);
  const end = utcDayNumber(target.stop_time || target.end_time);
  const current = utcDayNumber(today);
  const budget = num(target.budget_usd);
  const dailyRows = rowsForTarget(pacing.daily, target.id);
  const actual = dailyRows
    .filter((row) => row.date <= today)
    .reduce((sum, row) => sum + num(row.spend_usd), 0);
  const active = String(target.effective_status || target.status || '').toUpperCase() === 'ACTIVE';
  if (start == null || end == null || current == null || end <= start) {
    return {
      ...target,
      period: 'flight',
      actual,
      budget,
      expected: null,
      paceRatio: null,
      projected: null,
      remaining: Math.max(0, budget - actual),
      status: active ? 'unknown' : 'paused',
      reason: 'Lifetime pacing needs a valid start and end date.',
    };
  }
  const elapsedShare = clamp((current - start + 1) / (end - start + 1), 1 / (end - start + 1), 1);
  const expected = budget * elapsedShare;
  const projected = elapsedShare > 0 ? actual / elapsedShare : null;
  const hasCoverage = !pacing.coverage_since || dateOnly(target.start_time) >= pacing.coverage_since;
  return {
    ...target,
    period: 'flight',
    actual,
    expected,
    budget,
    paceRatio: expected > 0 ? actual / expected : null,
    projected,
    remaining: Math.max(0, budget - actual),
    expectedShare: elapsedShare,
    curveSource: 'flight',
    baselineDays: 0,
    status: paceStatus({
      active,
      expected,
      actual,
      hour: 24,
      hasCurrentData: dailyRows.length > 0 && hasCoverage,
    }),
    reason: hasCoverage ? '' : 'Loaded spend history starts after this campaign flight began.',
  };
}

export function buildCampaignPacing(pacing, {
  today,
  hour = new Date().getHours(),
} = {}) {
  const targets = pacing?.targets || [];
  if (!targets.length) {
    return {
      configured: false,
      generatedAt: pacing?.generated_at || '',
      timezone: pacing?.timezone || 'Europe/Istanbul',
      rows: [],
      counts: {},
      reason: pacing?.error || 'No Meta campaign or ad-set budget targets were returned.',
    };
  }
  const rows = targets.map((target) =>
    target.budget_type === 'lifetime'
      ? buildLifetimePace(target, pacing, today)
      : buildDailyPace(target, pacing, today, hour));
  const counts = rows.reduce((out, row) => {
    out[row.status] = (out[row.status] || 0) + 1;
    return out;
  }, {});
  return {
    configured: true,
    generatedAt: pacing.generated_at || '',
    timezone: pacing.timezone || 'Europe/Istanbul',
    currency: pacing.currency || 'USD',
    today,
    hour,
    rows: rows.sort((a, b) => {
      const priority = { stalled: 0, over: 1, under: 2, stale: 3, unknown: 4, on_track: 5, paused: 6 };
      return (priority[a.status] ?? 9) - (priority[b.status] ?? 9)
        || num(b.actual) - num(a.actual);
    }),
    counts,
  };
}

export function mergeLivePacing(pacing, liveMeta) {
  if (!pacing?.targets?.length || !liveMeta?.date) return pacing;
  const campaignTargets = new Map(
    pacing.targets
      .filter((target) => target.level === 'campaign')
      .map((target) => [String(target.campaign_id), target.id]),
  );
  const adsetTargets = new Map(
    pacing.targets
      .filter((target) => target.level === 'adset')
      .map((target) => [String(target.adset_id), target.id]),
  );
  const targetSpend = {};
  for (const row of liveMeta.pacing_adset_daily || liveMeta.adset_daily || []) {
    const targetId = campaignTargets.get(String(row.campaign_id))
      || adsetTargets.get(String(row.adset_id));
    if (!targetId) continue;
    targetSpend[targetId] = (targetSpend[targetId] || 0) + num(row.spend_usd);
  }
  const daily = [
    ...(pacing.daily || []).filter((row) => row.date !== liveMeta.date),
    ...Object.entries(targetSpend).map(([target_id, spend_usd]) => ({
      target_id,
      date: liveMeta.date,
      spend_usd,
      live: true,
    })),
  ];
  const liveHourly = (liveMeta.pacing_hourly || []).flatMap((row) => {
    const targetId = campaignTargets.get(String(row.campaign_id))
      || adsetTargets.get(String(row.adset_id));
    return targetId ? [{ ...row, target_id: targetId }] : [];
  });
  const hourly = liveHourly.length
    ? [
        ...(pacing.hourly || []).filter((row) => row.date !== liveMeta.date),
        ...liveHourly,
      ]
    : pacing.hourly || [];
  return {
    ...pacing,
    generated_at: liveMeta.checked_at || pacing.generated_at,
    daily,
    hourly,
    live: {
      date: liveMeta.date,
      checked_at: liveMeta.checked_at || '',
      target_spend: targetSpend,
    },
  };
}

const fmtMoney = (value) => {
  const amount = num(value);
  return Math.abs(amount) >= 1000 ? `$${(amount / 1000).toFixed(1)}k` : `$${Math.round(amount)}`;
};

export function buildCampaignPacingFindings(model) {
  if (!model?.configured) return [];
  const findings = [];
  const atRisk = model.rows.filter((row) => ['stalled', 'over', 'under'].includes(row.status));
  for (const row of atRisk.slice(0, 3)) {
    if (row.status === 'stalled') {
      findings.push({
        id: `pace-${row.id}`,
        tone: 'negative',
        headline: `${row.name} has not spent against its ${fmtMoney(row.budget)} ${row.period} budget`,
        context: `${Math.round((row.expectedShare || 0) * 100)}% of the expected delivery window has elapsed.`,
        driver: '',
        action: 'Check effective status, audience size, bid controls and account delivery warnings.',
        evidence: 'Observed',
      });
    } else if (row.status === 'over') {
      findings.push({
        id: `pace-${row.id}`,
        tone: 'watch',
        headline: `${row.name} is ${Math.round((row.paceRatio - 1) * 100)}% ahead of pace`,
        context: `${fmtMoney(row.actual)} spent against ${fmtMoney(row.expected)} expected by now; projected ${fmtMoney(row.projected)}.`,
        driver: '',
        action: 'Confirm the faster delivery is intentional before changing the budget.',
        evidence: 'Compared',
      });
    } else {
      findings.push({
        id: `pace-${row.id}`,
        tone: 'watch',
        headline: `${row.name} is ${Math.round((1 - row.paceRatio) * 100)}% behind pace`,
        context: `${fmtMoney(row.actual)} spent against ${fmtMoney(row.expected)} expected by now; projected ${fmtMoney(row.projected)}.`,
        driver: '',
        action: 'Check delivery constraints before raising budget; underdelivery is not necessarily lack of budget.',
        evidence: 'Compared',
      });
    }
  }
  return findings;
}
