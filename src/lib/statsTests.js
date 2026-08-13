/**
 * Lightweight inferential stats for daily order-count comparisons.
 * Non-parametric tests are used because Shopify daily orders are skewed counts.
 */

function clean(values = []) {
  return values.filter((v) => Number.isFinite(v));
}

/** Abramowitz & Stegun 26.2.17 — standard normal CDF. */
export function normalCdf(z) {
  if (!Number.isFinite(z)) return NaN;
  const x = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * x);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const upper = pdf * poly;
  return z >= 0 ? 1 - upper : upper;
}

/** Regularized lower incomplete gamma P(s, x) via series expansion. */
function lowerRegularizedGamma(s, x) {
  if (x <= 0) return 0;
  if (s <= 0) return NaN;
  if (x > 300) return 1;
  let sum = 1 / s;
  let term = 1 / s;
  for (let k = 1; k < 200; k += 1) {
    term *= x / (s + k);
    sum += term;
    if (Math.abs(term) < 1e-12 * Math.abs(sum)) break;
  }
  const value = sum * Math.exp(-x + s * Math.log(x) - logGamma(s));
  return Number.isFinite(value) ? value : 1;
}

function logGamma(z) {
  const g = 7;
  const coef = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019571e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i += 1) x += coef[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Chi-square survival function P(X > x) for df degrees of freedom. */
export function chiSquarePValue(x, df) {
  if (!Number.isFinite(x) || x <= 0 || df <= 0) return 1;
  return 1 - lowerRegularizedGamma(df / 2, x / 2);
}

function rankAll(values) {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => a.value - b.value);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) j += 1;
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k += 1) indexed[k].rank = avgRank;
    i = j + 1;
  }
  const ranks = Array(values.length);
  indexed.forEach((row) => { ranks[row.index] = row.rank; });
  return ranks;
}

function tieCorrection(ranks) {
  const counts = new Map();
  ranks.forEach((rank) => counts.set(rank, (counts.get(rank) || 0) + 1));
  let sum = 0;
  counts.forEach((t) => { sum += t ** 3 - t; });
  return sum;
}

/**
 * Two-sample Mann-Whitney U (Wilcoxon rank-sum), two-tailed.
 * Appropriate for comparing daily order counts between independent groups.
 */
export function mannWhitneyU(sampleA, sampleB) {
  const a = clean(sampleA);
  const b = clean(sampleB);
  const nA = a.length;
  const nB = b.length;
  if (!nA || !nB) {
    return { u: null, z: null, pValue: null, nA, nB, test: 'mann-whitney-u' };
  }

  const combined = [...a, ...b];
  const ranks = rankAll(combined);
  const rankA = ranks.slice(0, nA).reduce((s, r) => s + r, 0);
  const uA = rankA - (nA * (nA + 1)) / 2;
  const u = Math.min(uA, nA * nB - uA);

  const tieSum = tieCorrection(ranks);
  const n = nA + nB;
  const meanU = (nA * nB) / 2;
  const sdU = Math.sqrt((nA * nB / 12) * ((n + 1) - tieSum / (n * (n - 1 || 1))));
  const z = sdU > 0 ? Math.min(0, u - meanU + 0.5) / sdU : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  return { u, z, pValue, nA, nB, test: 'mann-whitney-u' };
}

/**
 * Kruskal-Wallis H test across independent groups (e.g. weekdays, week buckets).
 */
export function kruskalWallis(groupSamples) {
  const groups = (groupSamples || []).map((g) => clean(g)).filter((g) => g.length > 0);
  const k = groups.length;
  const flat = groups.flat();
  const n = flat.length;
  if (k < 2 || n < 3) {
    return { h: null, df: null, pValue: null, k, n, test: 'kruskal-wallis' };
  }

  const ranks = rankAll(flat);
  let offset = 0;
  const groupStats = groups.map((group) => {
    const groupRanks = ranks.slice(offset, offset + group.length);
    offset += group.length;
    const rankSum = groupRanks.reduce((s, r) => s + r, 0);
    return { n: group.length, rankSum };
  });

  const tieSum = tieCorrection(ranks);
  const hRaw = (12 / (n * (n + 1))) * groupStats.reduce((s, g) => s + (g.rankSum ** 2) / g.n, 0) - 3 * (n + 1);
  const h = hRaw / (1 - tieSum / (n ** 3 - n || 1));
  const df = k - 1;
  const pValue = chiSquarePValue(h, df);

  return { h, df, pValue, k, n, test: 'kruskal-wallis' };
}

export function bonferroniAdjust(pValues = []) {
  const m = pValues.length;
  if (!m) return [];
  return pValues.map((p) => (Number.isFinite(p) ? Math.min(1, p * m) : null));
}

/** Benjamini–Hochberg FDR adjustment for multiple path-level dwell tests. */
export function benjaminiHochberg(pValues = []) {
  const adjusted = Array(pValues.length).fill(null);
  const ranked = pValues
    .map((p, index) => ({ index, p: Number.isFinite(p) ? p : null }))
    .filter((row) => row.p != null)
    .sort((a, b) => a.p - b.p);
  const m = ranked.length;
  if (!m) return adjusted;
  let minSoFar = 1;
  for (let i = m - 1; i >= 0; i -= 1) {
    const rank = i + 1;
    const value = Math.min(1, (ranked[i].p * m) / rank);
    minSoFar = Math.min(minSoFar, value);
    adjusted[ranked[i].index] = minSoFar;
  }
  return adjusted;
}

/**
 * How precisely a ratio is known when its numerator is driven by a conversion
 * count — a ROAS from n orders, a CAC from n customers.
 *
 * Orders arrive as counts, so the count's own sampling error dominates: for a
 * Poisson process the relative standard error of n events is 1/sqrt(n). At three
 * orders that is 58%, which is why ranking ad sets on a three-order ROAS ranks
 * noise. `z` defaults to a 95% interval.
 *
 * Returns null below one order, where the ratio carries no information at all.
 */
export function ratioCountInterval(ratio, orders, z = 1.96) {
  const n = Number(orders);
  const value = Number(ratio);
  if (!Number.isFinite(n) || n < 1 || !Number.isFinite(value)) return null;
  const relativeError = z / Math.sqrt(n);
  return {
    value,
    relativeError,
    // A ratio built on counts cannot go negative; the clamp is the floor, not a
    // claim that the low end is exactly zero.
    low: Math.max(0, value * (1 - relativeError)),
    high: value * (1 + relativeError),
  };
}

/**
 * True when two count-driven ratios are far enough apart that sampling error
 * alone does not explain the gap. Non-overlapping intervals is the conservative
 * reading — it is a stricter bar than a formal two-sample test, which suits a
 * panel that recommends moving budget.
 */
export function intervalsSeparate(a, b) {
  if (!a || !b) return false;
  return a.low > b.high || b.low > a.high;
}

export function formatPValue(pValue) {
  if (pValue == null || !Number.isFinite(pValue)) return '—';
  if (pValue < 0.001) return '< 0.001';
  return pValue.toFixed(3);
}

export function significanceLabel(pValue, alpha = 0.05) {
  if (pValue == null || !Number.isFinite(pValue)) return null;
  if (pValue < alpha / 10) return 'highly significant';
  if (pValue < alpha) return 'significant';
  return 'not significant';
}
