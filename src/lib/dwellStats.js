import {
  benjaminiHochberg,
  mannWhitneyU,
} from './statsTests.js';
import { formatDwellSeconds, normalizePagePath, pagePathLabel } from './pagePath.js';

export const DWELL_ALPHA = 0.05;
export const DWELL_MIN_SESSIONS_PER_COHORT = 5;
export const DWELL_MIN_PAGE_VIEWS = 8;
export const DWELL_EFFECT_THRESHOLD = 0.15;

function median(values = []) {
  const arr = values.map(Number).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function descriptiveStats(values = []) {
  const nums = values.map(Number).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = nums.length;
  if (!n) {
    return { n: 0, mean: null, median: null, p25: null, p75: null };
  }
  const mean = nums.reduce((sum, value) => sum + value, 0) / n;
  const p25 = nums[Math.floor((n - 1) * 0.25)] ?? nums[0];
  const p75 = nums[Math.floor((n - 1) * 0.75)] ?? nums[n - 1];
  return {
    n,
    mean,
    median: median(nums),
    p25,
    p75,
  };
}

function rankBiserial(z, nA, nB) {
  if (!Number.isFinite(z) || !nA || !nB) return null;
  return (2 * z) / Math.sqrt(nA + nB);
}

function sessionLevelRows(pageFacts = []) {
  const byKey = new Map();
  for (const fact of pageFacts) {
    const path = normalizePagePath(fact.path);
    const sessionHash = String(fact.session_hash || '');
    if (!path || !sessionHash) continue;
    const key = `${sessionHash}|${path}`;
    const row = byKey.get(key) || {
      path,
      session_hash: sessionHash,
      purchased: Boolean(fact.purchased),
      values: [],
    };
    row.purchased = row.purchased || Boolean(fact.purchased);
    row.values.push(Number(fact.dwell_seconds || 0));
    byKey.set(key, row);
  }
  return [...byKey.values()]
    .map((row) => ({
      path: row.path,
      session_hash: row.session_hash,
      purchased: row.purchased,
      dwell_seconds: median(row.values),
    }))
    .filter((row) => row.dwell_seconds > 0);
}

function siteConversionRate(sessionRows = []) {
  const sessions = new Map();
  for (const row of sessionRows) {
    const current = sessions.get(row.session_hash) || false;
    sessions.set(row.session_hash, current || row.purchased);
  }
  if (!sessions.size) return null;
  const purchasers = [...sessions.values()].filter(Boolean).length;
  return purchasers / sessions.size;
}

function confidenceTier({ purchaserSessions, nonPurchaserSessions, pAdjusted, effectSize, significant }) {
  if (purchaserSessions < DWELL_MIN_SESSIONS_PER_COHORT || nonPurchaserSessions < DWELL_MIN_SESSIONS_PER_COHORT) {
    return 'Insufficient';
  }
  if (significant && Math.abs(effectSize || 0) >= 0.3
    && purchaserSessions >= 10 && nonPurchaserSessions >= 10) {
    return 'High Confidence';
  }
  if (significant && Math.abs(effectSize || 0) >= DWELL_EFFECT_THRESHOLD) return 'Actionable';
  if (pAdjusted != null && pAdjusted < 0.15) return 'Directional';
  return 'Watch';
}

function buildInsight(row) {
  const label = pagePathLabel(row.path);
  const nonBuyerMedian = Number(row.non_purchaser_median_dwell_seconds || 0);
  const buyerMedian = Number(row.purchaser_median_dwell_seconds || 0);
  const buyerSessions = Number(row.purchaser_sessions || 0);
  const nonBuyerSessions = Number(row.non_purchaser_sessions || 0);

  if (row.confidence === 'Insufficient') {
    if (buyerSessions === 0) {
      return {
        headline: 'Non-buyer time only',
        detail: `Median ${formatDwellSeconds(nonBuyerMedian)} from ${nonBuyerSessions} non-buyer session${nonBuyerSessions === 1 ? '' : 's'} on ${label}. No buyer sessions on this page yet — comparison not shown.`,
        pattern: 'non_buyer_only',
      };
    }
    return {
      headline: 'Sample still small',
      detail: `${nonBuyerSessions} non-buyer and ${buyerSessions} buyer session${buyerSessions === 1 ? '' : 's'} on ${label}. Need at least ${DWELL_MIN_SESSIONS_PER_COHORT} in each group before comparing them.`,
      pattern: 'insufficient',
    };
  }

  if (row.pattern === 'high_intent') {
    return {
      headline: 'Strong buyer presence',
      detail: `${Math.round((row.conversion_rate || 0) * 100)}% of sessions that hit ${label} converted (${nonBuyerSessions + buyerSessions} sessions). Buyers median ${formatDwellSeconds(buyerMedian)}.`,
      pattern: 'high_intent',
    };
  }

  if (row.pattern === 'significant_non_buyer_longer') {
    return {
      headline: 'Non-buyers linger longer',
      detail: `Non-buyers spend a median ${formatDwellSeconds(nonBuyerMedian)} here versus ${formatDwellSeconds(buyerMedian)} for buyers. Check copy, price, sizing and load time.`,
      pattern: row.pattern,
    };
  }

  if (row.pattern === 'significant_buyer_longer') {
    return {
      headline: 'Buyers research here',
      detail: `Buyers spend a median ${formatDwellSeconds(buyerMedian)} here versus ${formatDwellSeconds(nonBuyerMedian)} for non-buyers. Strengthen trust, reviews and size guidance.`,
      pattern: row.pattern,
    };
  }

  if (row.pattern === 'uniform_engagement') {
    return {
      headline: 'Similar time for both groups',
      detail: `Non-buyers spend ${formatDwellSeconds(nonBuyerMedian)} and buyers ${formatDwellSeconds(buyerMedian)} on ${label}. There is no clear difference to act on.`,
      pattern: row.pattern,
    };
  }

  return {
    headline: 'Directional only',
    detail: `Non-buyers spend ${formatDwellSeconds(nonBuyerMedian)} and buyers ${formatDwellSeconds(buyerMedian)} on ${label}. Keep watching until more sessions accumulate.`,
    pattern: 'watch',
  };
}

function classifyPattern({ significant, effectSize, conversionRate, siteConversionRate, buyerSessions }) {
  if (buyerSessions >= DWELL_MIN_SESSIONS_PER_COHORT
    && conversionRate != null
    && siteConversionRate != null
    && conversionRate >= siteConversionRate + 0.12) {
    return 'high_intent';
  }
  if (!significant) return 'uniform_engagement';
  if ((effectSize || 0) >= DWELL_EFFECT_THRESHOLD) return 'significant_non_buyer_longer';
  if ((effectSize || 0) <= -DWELL_EFFECT_THRESHOLD) return 'significant_buyer_longer';
  return 'watch';
}

function aggregatePath(path, sessionRows, siteRate) {
  const purchaserDwells = sessionRows.filter((row) => row.purchased).map((row) => row.dwell_seconds);
  const nonPurchaserDwells = sessionRows.filter((row) => !row.purchased).map((row) => row.dwell_seconds);
  const purchaserSessions = new Set(sessionRows.filter((row) => row.purchased).map((row) => row.session_hash)).size;
  const nonPurchaserSessions = new Set(sessionRows.filter((row) => !row.purchased).map((row) => row.session_hash)).size;
  const sessions = new Set(sessionRows.map((row) => row.session_hash)).size;
  const conversionRate = sessions ? purchaserSessions / sessions : null;
  const mw = mannWhitneyU(nonPurchaserDwells, purchaserDwells);
  const effectSize = rankBiserial(mw.z, mw.nA, mw.nB);

  return {
    path,
    label: pagePathLabel(path),
    sessions,
    page_views: sessionRows.length,
    purchaser_sessions: purchaserSessions,
    non_purchaser_sessions: nonPurchaserSessions,
    purchaser_page_views: purchaserDwells.length,
    non_purchaser_page_views: nonPurchaserDwells.length,
    median_dwell_seconds: median([...purchaserDwells, ...nonPurchaserDwells]),
    purchaser_median_dwell_seconds: median(purchaserDwells),
    non_purchaser_median_dwell_seconds: median(nonPurchaserDwells),
    dwell_gap_seconds: median(nonPurchaserDwells) - median(purchaserDwells),
    purchaser_stats: descriptiveStats(purchaserDwells),
    non_purchaser_stats: descriptiveStats(nonPurchaserDwells),
    conversion_rate: conversionRate,
    site_conversion_rate: siteRate,
    test: 'mann-whitney-u',
    u: mw.u,
    z: mw.z,
    p_value_raw: mw.pValue,
    p_value_adjusted: null,
    significant: false,
    effect_size: effectSize,
    confidence: 'Insufficient',
    pattern: purchaserSessions ? 'watch' : 'non_buyer_only',
    insight: { headline: '', detail: '', pattern: '' },
  };
}

export function rollupDwellPages(pageFacts = [], options = {}) {
  const sessionRows = sessionLevelRows(pageFacts);
  const siteRate = options.siteConversionRate ?? siteConversionRate(sessionRows);
  const byPath = new Map();
  for (const row of sessionRows) {
    const list = byPath.get(row.path) || [];
    list.push(row);
    byPath.set(row.path, list);
  }

  const rows = [...byPath.entries()]
    .map(([path, pathRows]) => aggregatePath(path, pathRows, siteRate))
    .filter((row) => row.non_purchaser_page_views >= 1 && row.non_purchaser_median_dwell_seconds > 0);

  const adjusted = benjaminiHochberg(rows.map((row) => row.p_value_raw));
  rows.forEach((row, index) => {
    row.p_value_adjusted = adjusted[index];
    row.significant = Number.isFinite(row.p_value_adjusted) && row.p_value_adjusted < DWELL_ALPHA;
    row.pattern = classifyPattern({
      significant: row.significant,
      effectSize: row.effect_size,
      conversionRate: row.conversion_rate,
      siteConversionRate: siteRate,
      buyerSessions: row.purchaser_sessions,
    });
    row.confidence = confidenceTier({
      purchaserSessions: row.purchaser_sessions,
      nonPurchaserSessions: row.non_purchaser_sessions,
      pAdjusted: row.p_value_adjusted,
      effectSize: row.effect_size,
      significant: row.significant,
    });
    row.insight = buildInsight(row);
    row.read = row.insight.headline;
  });

  return rows.sort(
    (a, b) => {
      const score = (row) => {
        if (row.confidence === 'High Confidence') return 5;
        if (row.confidence === 'Actionable') return 4;
        if (row.confidence === 'Directional') return 3;
        if (row.confidence === 'Watch') return 2;
        return 1;
      };
      return score(b) - score(a)
        || Number(b.non_purchaser_median_dwell_seconds || 0) - Number(a.non_purchaser_median_dwell_seconds || 0)
        || Number(b.sessions || 0) - Number(a.sessions || 0);
    },
  ).slice(0, options.limit || 12);
}

export function dwellPageInsight(page = {}) {
  // Rebuild from the raw statistics so UI copy can improve without waiting for
  // every persisted behavior snapshot to be regenerated.
  return buildInsight(page);
}

export function dwellAnalysisMeta(pageFacts = []) {
  const sessionRows = sessionLevelRows(pageFacts);
  return {
    alpha: DWELL_ALPHA,
    multiple_comparison: 'benjamini-hochberg',
    unit: 'session_median_dwell',
    cohort_definition: 'session_outcome',
    min_sessions_per_cohort: DWELL_MIN_SESSIONS_PER_COHORT,
    site_conversion_rate: siteConversionRate(sessionRows),
    session_rows: sessionRows.length,
    paths_observed: new Set(sessionRows.map((row) => row.path)).size,
  };
}
