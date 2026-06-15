import { formatPValue, mannWhitneyU, proportionZTest, significanceLabel } from './statsTests.js';

export function behaviorMedian(values = []) {
  const arr = values.map(Number).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

export function normalizeBehaviorPath(href, base = 'https://shawq.co') {
  try {
    const url = new URL(String(href || '/'), base);
    [...url.searchParams.keys()].forEach((key) => {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    });
    const query = url.search ? url.search.slice(0, 120) : '';
    return `${url.pathname}${query}` || '/';
  } catch {
    return String(href || '/').slice(0, 160) || '/';
  }
}

export function scoreBehaviorRows(rows, { priorStrength = 20, globalRate = 0, alpha = 0.05 } = {}) {
  return rows.map((row) => {
    const exposed = Number(row.exposed || 0);
    const abandoned = Number(row.abandoned || 0);
    const rawRate = exposed ? abandoned / exposed : 0;
    const shrunkRate = (abandoned + priorStrength * globalRate) / ((exposed + priorStrength) || 1);
    const excessRate = shrunkRate - globalRate;
    const supportWeight = Math.min(1, Math.sqrt(exposed / 30));
    const propTest = proportionZTest(abandoned, exposed, globalRate, { tail: 'upper' });
    const pValue = propTest.pValue;

    let confidence = 'Insufficient data';
    if (exposed >= 8 && abandoned >= 1) {
      if (exposed >= 100 && pValue != null && pValue < alpha / 5 && excessRate > 0) confidence = 'High confidence';
      else if (exposed >= 50 && pValue != null && pValue < alpha && excessRate > 0) confidence = 'Actionable';
      else if (exposed >= 20 && pValue != null && pValue < alpha && excessRate > 0) confidence = 'Directional';
      else if (pValue != null && pValue < alpha && excessRate > 0) confidence = 'Directional';
      else confidence = 'Watch';
    }

    return {
      ...row,
      raw_rate: rawRate,
      shrunk_rate: shrunkRate,
      site_rate: globalRate,
      vs_site_pp: (shrunkRate - globalRate) * 100,
      excess_abandons: Math.max(0, excessRate * exposed),
      risk_score: Math.max(0, excessRate) * supportWeight * 100,
      confidence,
      p_value: pValue,
      p_value_label: formatPValue(pValue),
      significance: significanceLabel(pValue, alpha),
    };
  }).sort((a, b) => b.excess_abandons - a.excess_abandons || b.shrunk_rate - a.shrunk_rate || b.exposed - a.exposed);
}

export function dwellBehaviorRollup(pageFacts = [], { alpha = 0.05 } = {}) {
  const byPath = new Map();
  for (const fact of pageFacts) {
    const path = normalizeBehaviorPath(fact.path);
    const row = byPath.get(path) || { path, sessions: new Set(), purchaser_values: [], non_purchaser_values: [] };
    row.sessions.add(fact.session_hash || `${path}-${row.sessions.size}`);
    if (fact.purchased) row.purchaser_values.push(fact.dwell_seconds);
    else row.non_purchaser_values.push(fact.dwell_seconds);
    byPath.set(path, row);
  }

  return [...byPath.values()].map((row) => {
    const purchaserMedian = behaviorMedian(row.purchaser_values);
    const nonPurchaserMedian = behaviorMedian(row.non_purchaser_values);
    const nPurchaser = row.purchaser_values.length;
    const nNonPurchaser = row.non_purchaser_values.length;
    const test = mannWhitneyU(row.purchaser_values, row.non_purchaser_values);
    const pValue = test.pValue;
    const gap = nonPurchaserMedian - purchaserMedian;

    let read = 'Insufficient sample';
    if (nPurchaser >= 3 && nNonPurchaser >= 5) {
      if (pValue != null && pValue < alpha && gap > 10) read = 'Friction watch';
      else if (purchaserMedian >= nonPurchaserMedian) read = 'Consideration path';
      else read = 'Neutral';
    } else if (nNonPurchaser >= 1 && nPurchaser === 0) {
      read = 'Non-purchaser only';
    } else if (nPurchaser + nNonPurchaser >= 3) {
      read = gap > 20 ? 'Possible friction (underpowered)' : 'Neutral';
    }

    return {
      path: row.path,
      sessions: row.sessions.size,
      median_dwell_seconds: behaviorMedian([...row.purchaser_values, ...row.non_purchaser_values]),
      purchaser_median_dwell_seconds: purchaserMedian,
      non_purchaser_median_dwell_seconds: nonPurchaserMedian,
      dwell_gap_seconds: gap,
      n_purchaser: nPurchaser,
      n_non_purchaser: nNonPurchaser,
      dwell_p_value: pValue,
      p_value_label: formatPValue(pValue),
      significance: significanceLabel(pValue, alpha),
      read,
    };
  }).sort((a, b) => b.non_purchaser_median_dwell_seconds - a.non_purchaser_median_dwell_seconds || b.sessions - a.sessions).slice(0, 8);
}

export function journeyBehaviorRollup(journeyRows = [], { minPurchasersForLift = 5, minNonPurchasers = 5 } = {}) {
  const totals = { purchasers: 0, non_purchasers: 0 };
  const pageMap = new Map();
  const pathMap = new Map();

  for (const row of journeyRows) {
    const cohort = row.purchased ? 'purchasers' : 'non_purchasers';
    totals[cohort] += 1;
    const sequence = (row.path_sequence || []).map((path) => normalizeBehaviorPath(path));
    sequence.forEach((path, index) => {
      const key = `${index}:${path}`;
      const cur = pageMap.get(key) || { step: index + 1, path, purchasers: 0, non_purchasers: 0 };
      cur[cohort] += 1;
      pageMap.set(key, cur);
    });
    const pathKey = sequence.join(' → ');
    if (pathKey) {
      const curPath = pathMap.get(pathKey) || { path_sequence: sequence, purchasers: 0, non_purchasers: 0 };
      curPath[cohort] += 1;
      pathMap.set(pathKey, curPath);
    }
  }

  const liftReliable = totals.purchasers >= minPurchasersForLift && totals.non_purchasers >= minNonPurchasers;
  const steps = [...pageMap.values()].map((row) => {
    const purchaserSupport = totals.purchasers ? row.purchasers / totals.purchasers : 0;
    const nonPurchaserSupport = totals.non_purchasers ? row.non_purchasers / totals.non_purchasers : 0;
    const lift = liftReliable && nonPurchaserSupport ? purchaserSupport / nonPurchaserSupport : null;
    return {
      ...row,
      purchaser_support: purchaserSupport,
      non_purchaser_support: nonPurchaserSupport,
      lift,
      lift_reliable: liftReliable,
    };
  }).sort((a, b) => a.step - b.step || b.purchaser_support - a.purchaser_support).slice(0, 10);

  const paths = [...pathMap.values()].map((row) => ({
    ...row,
    purchaser_support: totals.purchasers ? row.purchasers / totals.purchasers : 0,
    non_purchaser_support: totals.non_purchasers ? row.non_purchasers / totals.non_purchasers : 0,
    lift_reliable: liftReliable,
  })).sort((a, b) => (b.purchasers + b.non_purchasers) - (a.purchasers + a.non_purchasers)).slice(0, 4);

  return {
    totals,
    steps,
    paths,
    lift_reliable: liftReliable,
    note: liftReliable
      ? ''
      : `Lift comparisons need at least ${minPurchasersForLift} purchaser and ${minNonPurchasers} non-purchaser sessions.`,
  };
}
