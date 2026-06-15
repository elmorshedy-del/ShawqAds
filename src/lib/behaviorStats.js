import {
  benjaminiHochberg,
  formatPValue,
  mannWhitneyU,
  proportionZTest,
  significanceLabel,
} from './statsTests.js';
import { plainConfidence } from './behaviorCopy.js';

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

export function productBehaviorKey(fact = {}) {
  if (fact.source === 'meta_add_payment_info') {
    return `${fact.family || 'Other'}:${fact.subtype || fact.product || 'Unknown product'}`;
  }
  return String(fact.product_id || fact.variant_id || fact.product || 'unknown_product');
}

export function countryDisplayName(code, fallback = 'Unknown') {
  try {
    return code ? new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code).toUpperCase()) || fallback : fallback;
  } catch {
    return code || fallback;
  }
}

export function familyBaselineRates(facts = [], step) {
  const scoped = facts.filter((fact) => fact.step === step);
  const siteExposed = scoped.reduce((sum, fact) => sum + Number(fact.exposed || 0), 0);
  const siteAbandoned = scoped.reduce((sum, fact) => sum + Number(fact.abandoned || 0), 0);
  const siteRate = siteExposed ? siteAbandoned / siteExposed : 0;
  const byFamily = new Map();
  for (const fact of scoped) {
    const family = fact.family || 'Other';
    const row = byFamily.get(family) || { exposed: 0, abandoned: 0 };
    row.exposed += Number(fact.exposed || 0);
    row.abandoned += Number(fact.abandoned || 0);
    byFamily.set(family, row);
  }
  const familyRates = new Map();
  for (const [family, row] of byFamily.entries()) {
    familyRates.set(family, row.exposed >= 12 ? row.abandoned / row.exposed : siteRate);
  }
  return { siteRate, familyRates };
}

function confidenceFromTest({ exposed, abandoned, excessRate, pValue, alpha = 0.05 }) {
  if (exposed < 8 || abandoned < 1) return 'Insufficient data';
  if (pValue == null || !Number.isFinite(pValue) || excessRate <= 0) return 'Watch';
  if (exposed >= 100 && pValue < alpha / 5) return 'High confidence';
  if (exposed >= 50 && pValue < alpha) return 'Actionable';
  if (exposed >= 20 && pValue < alpha) return 'Directional';
  if (pValue < alpha) return 'Directional';
  return 'Watch';
}

export function scoreBehaviorRows(rows, {
  priorStrength = 20,
  globalRate = 0,
  alpha = 0.05,
  useFamilyBaseline = false,
  familyRates = new Map(),
  applyFdr = true,
} = {}) {
  const scored = rows.map((row) => {
    const exposed = Number(row.exposed || 0);
    const abandoned = Number(row.abandoned || 0);
    const baselineRate = useFamilyBaseline
      ? (familyRates.get(row.family || 'Other') ?? globalRate)
      : globalRate;
    const baselineLabel = useFamilyBaseline
      ? `${row.family || 'Other'} average`
      : 'Site average';
    const rawRate = exposed ? abandoned / exposed : 0;
    const shrunkRate = (abandoned + priorStrength * baselineRate) / ((exposed + priorStrength) || 1);
    const excessRate = shrunkRate - baselineRate;
    const supportWeight = Math.min(1, Math.sqrt(exposed / 30));
    const propTest = proportionZTest(abandoned, exposed, baselineRate, { tail: 'upper' });
    const pValue = propTest.pValue;

    return {
      ...row,
      raw_rate: rawRate,
      shrunk_rate: shrunkRate,
      site_rate: globalRate,
      baseline_rate: baselineRate,
      baseline_label: baselineLabel,
      vs_site_pp: (shrunkRate - baselineRate) * 100,
      excess_abandons: Math.max(0, excessRate * exposed),
      anomaly_score: Math.max(0, excessRate) * 100 + (pValue != null && pValue < alpha ? (1 - pValue) * 10 : 0),
      impact_score: Math.max(0, excessRate) * supportWeight * exposed,
      risk_score: Math.max(0, excessRate) * supportWeight * 100,
      p_value: pValue,
      p_value_label: formatPValue(pValue),
      significance: significanceLabel(pValue, alpha),
      confidence: confidenceFromTest({ exposed, abandoned, excessRate, pValue, alpha }),
    };
  });

  const adjusted = applyFdr && scored.length > 1
    ? benjaminiHochberg(scored.map((row) => row.p_value))
    : scored.map((row) => row.p_value);

  return scored.map((row, index) => {
    const pAdj = adjusted[index];
    const confidence = confidenceFromTest({
      exposed: row.exposed,
      abandoned: row.abandoned,
      excessRate: row.shrunk_rate - row.baseline_rate,
      pValue: pAdj,
      alpha,
    });
    return {
      ...row,
      p_value_adjusted: pAdj,
      p_value_adjusted_label: formatPValue(pAdj),
      significance_adjusted: significanceLabel(pAdj, alpha),
      confidence,
      confidence_plain: plainConfidence(confidence),
    };
  }).sort((a, b) => b.excess_abandons - a.excess_abandons || b.shrunk_rate - a.shrunk_rate || b.exposed - a.exposed);
}

export function rollupBehaviorFacts(facts, step, dimension, { countryName = countryDisplayName } = {}) {
  const scoped = (facts || []).filter((fact) => fact.step === step);
  const totalExposed = scoped.reduce((sum, fact) => sum + Number(fact.exposed || 0), 0);
  const totalAbandoned = scoped.reduce((sum, fact) => sum + Number(fact.abandoned || 0), 0);
  const globalRate = totalExposed ? totalAbandoned / totalExposed : 0;
  const { siteRate, familyRates } = familyBaselineRates(scoped, step);
  const map = new Map();

  for (const fact of scoped) {
    const key = dimension === 'product'
      ? productBehaviorKey(fact)
      : String(fact.country_code || 'UNKNOWN');
    const row = map.get(key) || {
      key,
      product_id: fact.product_id || '',
      product: fact.product || 'Unknown product',
      family: fact.family || 'Other',
      subtype: fact.subtype || 'Unknown',
      image_url: fact.image_url || '',
      country_code: fact.country_code || '',
      country: fact.country || countryName(fact.country_code || ''),
      exposed: 0,
      abandoned: 0,
      completed: 0,
      units: 0,
      value_usd: 0,
      countries_map: new Map(),
    };
    row.exposed += Number(fact.exposed || 0);
    row.abandoned += Number(fact.abandoned || 0);
    row.completed += Number(fact.completed || 0);
    row.units += Number(fact.units || 0);
    row.value_usd += Number(fact.value_usd || 0);
    if (!row.image_url && fact.image_url) row.image_url = fact.image_url;
    if (fact.country_code) {
      const countryRow = row.countries_map.get(fact.country_code) || {
        country_code: fact.country_code,
        country: fact.country || countryName(fact.country_code),
        exposed: 0,
        abandoned: 0,
      };
      countryRow.exposed += Number(fact.exposed || 0);
      countryRow.abandoned += Number(fact.abandoned || 0);
      row.countries_map.set(fact.country_code, countryRow);
    }
    map.set(key, row);
  }

  const rows = [...map.values()].map((row) => {
    const countries = [...row.countries_map.values()]
      .sort((a, b) => b.abandoned - a.abandoned || b.exposed - a.exposed)
      .slice(0, 4);
    const out = { ...row, countries };
    delete out.countries_map;
    return out;
  });

  const scored = scoreBehaviorRows(rows, {
    priorStrength: dimension === 'country' ? 30 : 20,
    globalRate: siteRate || globalRate,
    useFamilyBaseline: dimension === 'product',
    familyRates,
    applyFdr: rows.length > 1,
  });

  return {
    global: { exposed: totalExposed, abandoned: totalAbandoned, rate: siteRate || globalRate },
    rows: scored,
  };
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

  const rows = [...byPath.values()].map((row) => {
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

    const trafficShare = row.sessions.size;
    return {
      path: row.path,
      sessions: trafficShare,
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
      anomaly_score: gap > 0 ? gap * (pValue != null && pValue < alpha ? 2 : 0.5) : 0,
      impact_score: gap > 0 ? gap * Math.sqrt(trafficShare) : 0,
    };
  });

  return rows
    .sort((a, b) => {
      const aSig = a.significance === 'significant' || a.significance === 'highly significant';
      const bSig = b.significance === 'significant' || b.significance === 'highly significant';
      if (aSig !== bSig) return Number(bSig) - Number(aSig);
      return b.impact_score - a.impact_score || b.dwell_gap_seconds - a.dwell_gap_seconds;
    })
    .slice(0, 8);
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
      : `Path comparisons unlock after at least ${minPurchasersForLift} buyer sessions and ${minNonPurchasers} browser-only sessions.`,
  };
}

export function sortBehaviorProducts(rows, mode = 'impact') {
  const list = [...(rows || [])];
  if (mode === 'anomaly') {
    return list.sort(
      (a, b) =>
        Number(b.vs_site_pp || 0) - Number(a.vs_site_pp || 0)
        || Number(a.p_value_adjusted ?? a.p_value ?? 1) - Number(b.p_value_adjusted ?? b.p_value ?? 1)
        || Number(b.excess_abandons || 0) - Number(a.excess_abandons || 0),
    );
  }
  return list.sort(
    (a, b) =>
      Number(b.excess_abandons || 0) - Number(a.excess_abandons || 0)
      || Number(b.vs_site_pp || 0) - Number(a.vs_site_pp || 0),
  );
}
