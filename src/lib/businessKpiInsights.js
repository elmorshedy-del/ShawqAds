/* Month projection + KPI record logic for business cards. */

import { compact, money } from './format.js';

const PROJECTION_BASE_KEYS = ['revenue_usd', 'spend_usd', 'orders', 'units'];
const INTRADAY_RECORD_KEYS = new Set(['revenue_usd', 'orders']);
const FAVORABLE_WHEN_UP = {
  revenue_usd: true,
  orders: true,
  units: true,
  aov: true,
  roas: true,
  spend_usd: false,
  cac: false,
};

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function monthKeyFromDate(date) {
  if (typeof date === 'string' && date.length >= 7) return date.slice(0, 7);
  return '';
}

function daysInMonth(date) {
  const [year, month] = String(date).split('-').map(Number);
  if (!year || !month) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayOfMonth(date) {
  const day = Number(String(date).split('-')[2]);
  return Number.isFinite(day) ? day : 1;
}

function monthLabelFromDate(date) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
}

function weekStartMonday(date) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  const mondayOffset = (parsed.getUTCDay() + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - mondayOffset);
  return parsed.toISOString().slice(0, 10);
}

function metricValue(row, key) {
  if (!row) return null;
  if (key === 'aov') {
    const orders = Number(row.orders);
    return orders > 0 ? Number(row.revenue_usd) / orders : null;
  }
  if (key === 'cac') {
    const orders = Number(row.orders);
    return orders > 0 ? Number(row.spend_usd) / orders : null;
  }
  if (key === 'roas') {
    const spend = Number(row.spend_usd);
    return spend > 0 ? Number(row.revenue_usd) / spend : null;
  }
  const raw = Number(row[key]);
  return Number.isFinite(raw) ? raw : null;
}

function weightedRecentBaseline(values) {
  const finite = (values || []).filter(isFiniteNumber);
  if (!finite.length) return null;
  if (finite.length === 1) return finite[0];
  const sorted = [...finite].sort((a, b) => a - b);
  const quantile = (q) => {
    const index = clamp((sorted.length - 1) * q, 0, sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  };
  const low = quantile(0.1);
  const high = quantile(0.9);
  const decay = Math.log(2) / 7;
  const count = finite.length;
  let weighted = 0;
  let totalWeight = 0;
  for (let i = 0; i < count; i += 1) {
    const value = clamp(finite[i], low, high);
    const age = count - 1 - i;
    const weight = Math.exp(-decay * age);
    weighted += weight * value;
    totalWeight += weight;
  }
  return totalWeight ? weighted / totalWeight : null;
}

export function buildMonthProjection(rows, { today, elapsedShare } = {}) {
  if (!today) return null;
  const allRows = (rows || []).filter((row) => row && typeof row.date === 'string');
  const monthKey = monthKeyFromDate(today);
  const monthDays = daysInMonth(today);
  const currentDay = dayOfMonth(today);
  const remainingDays = Math.max(0, monthDays - currentDay);
  const monthRows = allRows.filter((row) => monthKeyFromDate(row.date) === monthKey);
  const completedMonthRows = monthRows.filter((row) => row.date < today);
  const todayRow = monthRows.find((row) => row.date === today) || null;
  const recentRows = allRows
    .filter((row) => row.date < today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-21);
  if (!completedMonthRows.length && !todayRow && !recentRows.length) return null;

  const share = clamp(Number(elapsedShare) || 0, 1 / 86400, 1);
  const projected = {};
  for (const key of PROJECTION_BASE_KEYS) {
    const monthToDate = completedMonthRows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
    const baseline = weightedRecentBaseline(recentRows.map((row) => Number(row[key]) || 0));
    let todayProjection = 0;
    if (todayRow) {
      const todayValue = Number(todayRow[key]) || 0;
      const intradayPace = todayValue / share;
      const blendedRemainder = baseline == null ? intradayPace : todayValue + (1 - share) * baseline;
      todayProjection = share * intradayPace + (1 - share) * blendedRemainder;
    } else if (baseline != null) {
      todayProjection = baseline;
    }
    const futureDays = remainingDays * (baseline ?? 0);
    const total = monthToDate + todayProjection + futureDays;
    projected[key] = Number.isFinite(total) ? total : null;
  }

  const revenue = projected.revenue_usd;
  const spend = projected.spend_usd;
  const orders = projected.orders;
  const derived = {
    revenue_usd: revenue,
    spend_usd: spend,
    orders,
    units: projected.units,
    aov: isFiniteNumber(revenue) && isFiniteNumber(orders) && orders > 0 ? revenue / orders : null,
    cac: isFiniteNumber(spend) && isFiniteNumber(orders) && orders > 0 ? spend / orders : null,
    roas: isFiniteNumber(revenue) && isFiniteNumber(spend) && spend > 0 ? revenue / spend : null,
  };
  for (const key of Object.keys(derived)) {
    if (derived[key] != null && !Number.isFinite(derived[key])) derived[key] = null;
  }

  return {
    monthLabel: monthLabelFromDate(today),
    monthKey,
    daysInMonth: monthDays,
    dayOfMonth: currentDay,
    projected: derived,
  };
}

export function detectKpiRecord(rows, key, { today, intraday = false } = {}) {
  if (!today) return null;
  const allRows = rows || [];
  const epsilon = 1e-9;
  const favorableWhenUp = FAVORABLE_WHEN_UP[key] !== false;
  const history = allRows
    .filter((row) => row && typeof row.date === 'string' && row.date < today)
    .map((row) => ({ date: row.date, v: metricValue(row, key) }))
    .filter((row) => row.v != null);

  if (intraday && INTRADAY_RECORD_KEYS.has(key) && history.length >= 1) {
    const todayRow = allRows.find((row) => row && row.date === today);
    const todayValue = todayRow ? metricValue(todayRow, key) : null;
    const priorMax = Math.max(...history.map((row) => row.v));
    if (todayValue != null && Number.isFinite(priorMax)
      && (todayValue > priorMax + epsilon || Math.abs(todayValue - priorMax) <= epsilon)) {
      return {
          key,
          kind: 'all-high',
          scope: 'all',
          intraday: true,
          favorable: favorableWhenUp,
          value: todayValue,
          date: today,
          recordKey: `${key}:all-high-intraday:${today}`,
      };
    }
  }

  if (history.length < 2) return null;
  history.sort((a, b) => a.date.localeCompare(b.date));
  const latest = history[history.length - 1];
  const prior = history.slice(0, -1);
  const priorMax = Math.max(...prior.map((row) => row.v));
  const priorMin = Math.min(...prior.map((row) => row.v));
  let kind = null;
  let favorable = false;
  let scope = null;

  // All-time records (including ties) outrank week records on the business cards.
  if (latest.v > priorMax + epsilon || Math.abs(latest.v - priorMax) <= epsilon) {
    kind = 'all-high';
    favorable = true;
    scope = 'all';
  } else if (latest.v < priorMin - epsilon || Math.abs(latest.v - priorMin) <= epsilon) {
    kind = 'all-low';
    favorable = false;
    scope = 'all';
  } else {
    const weekStart = weekStartMonday(latest.date);
    const weekRows = history.filter((row) => row.date >= weekStart && row.date <= latest.date);
    if (weekRows.length >= 2) {
      const weekPrior = weekRows.slice(0, -1).map((row) => row.v);
      const weekMax = Math.max(...weekPrior);
      const weekMin = Math.min(...weekPrior);
      if (latest.v > weekMax + epsilon) {
        kind = 'week-high';
        favorable = true;
        scope = 'week';
      } else if (latest.v < weekMin - epsilon) {
        kind = 'week-low';
        favorable = false;
        scope = 'week';
      }
    }
  }

  if (!kind) return null;
  return {
    key,
    kind,
    scope,
    intraday: false,
    favorable: favorable ? favorableWhenUp : !favorableWhenUp,
    value: latest.v,
    date: latest.date,
    recordKey: `${key}:${kind}:${latest.date}`,
  };
}

export function buildKpiRecordMap(rows, today) {
  return {
    revenue_usd: detectKpiRecord(rows, 'revenue_usd', { today, intraday: true }),
    orders: detectKpiRecord(rows, 'orders', { today, intraday: true }),
    aov: detectKpiRecord(rows, 'aov', { today }),
    spend_usd: detectKpiRecord(rows, 'spend_usd', { today }),
    cac: detectKpiRecord(rows, 'cac', { today }),
    roas: detectKpiRecord(rows, 'roas', { today }),
  };
}

export function formatKpiExactValue(key, value) {
  if (value == null || !Number.isFinite(value)) return null;
  if (key === 'roas') return `${value.toFixed(2)}x`;
  if (key === 'orders' || key === 'units') return compact(Math.round(value));
  return money.format(value);
}

export function formatKpiRecordCompact(key, value) {
  if (value == null || !Number.isFinite(value)) return null;
  if (key === 'roas') return `${value.toFixed(2)}x`;
  if (key === 'orders' || key === 'units') return compact(Math.round(value));
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

export function buildKpiProjectionDisplay(projection, key) {
  if (!projection) return null;
  const label = projection.monthLabel ? `${projection.monthLabel}'s projection is` : null;
  const value = formatKpiExactValue(key, projection.projected?.[key]);
  if (!label || !value) return null;
  return { label, value };
}

export function buildKpiRecordDisplay(records, key) {
  const record = records?.[key];
  if (!record) return null;
  const high = record.kind === 'all-high' || record.kind === 'week-high';
  const when = record.intraday ? 'Today' : 'Yesterday';
  const text = record.scope === 'week'
    ? (high ? 'Week high' : 'Week low')
    : (high ? 'All-time high' : 'All-time low');
  const compactValue = formatKpiRecordCompact(key, record.value);
  const detail = compactValue ? `${when} · ${compactValue}` : when;
  const exactValue = formatKpiExactValue(key, record.value);
  const atValue = exactValue ? ` at ${exactValue}` : '';
  let tip;
  if (record.intraday) {
    tip = `New all-time high today${atValue} — still climbing`;
  } else if (record.scope === 'week') {
    tip = `Yesterday was the ${high ? 'highest' : 'lowest'} this week${atValue}`;
  } else {
    tip = `Yesterday was an all-time ${high ? 'high' : 'low'}${atValue}`;
  }
  return {
    text,
    detail,
    tip,
    favorable: record.favorable,
    celebrate: record.favorable && record.scope === 'all',
    recordKey: record.recordKey,
    high,
  };
}
