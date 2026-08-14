/* ----------------------------------------------------------------------------
 * creativeStats.js — per-creative conversion-rate assessment.
 *
 * Ported from the Virona dashboard's first-page ads table. The statistics are
 * copied verbatim so the two dashboards agree on what a creative is worth; only
 * the presentation was restyled to this project's tokens.
 *
 * The method: each creative's conversion rate is modelled as a Beta posterior
 * over visits and purchases, shrunk toward the account's own baseline CVR by a
 * prior worth K_PRIOR visits. Sampling that posterior gives the probability the
 * creative beats the baseline, plus a 10th percentile that says how bad it
 * plausibly is. Ranking on raw CVR would put a 1-visit, 1-purchase creative at
 * 100%; the prior is what stops that.
 *
 * The sampler is seeded from the creative's own key, so the same creative and
 * the same numbers always produce the same verdict. Without that, a table would
 * reshuffle its own conclusions on every render.
 * ------------------------------------------------------------------------- */

/** Strength of the shrinkage prior, in visits. */
const K_PRIOR = 50;
/** Posterior draws per creative. */
const CREATIVE_SAMPLES = 2000;
/** Visit counts at which a verdict is allowed to get progressively firmer. */
const HIGH_DATA_VISITS = 200;
const MED_DATA_VISITS = 50;

const EPSILON = 1e-6;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getFirstPositiveMetric = (...values) => {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed > 0) return parsed;
  }
  return 0;
};

/**
 * Best available stand-in for sessions that reached the site. Landing page views
 * are the truest measure; outbound clicks and link clicks are progressively
 * looser fallbacks for creatives where Meta did not report the first.
 */
export const getVisitsProxy = ({ landingPageViews, outboundClicks, inlineLinkClicks }) =>
  getFirstPositiveMetric(landingPageViews, outboundClicks, inlineLinkClicks);

export const hashStringToSeed = (value) => {
  const str = String(value ?? '');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const createSeededRng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const sampleNormal = (rng) => {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export const sampleGamma = (shape, rng) => {
  if (shape < 1) {
    const u = rng();
    return sampleGamma(1 + shape, rng) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    const x = sampleNormal(rng);
    let v = 1 + c * x;
    if (v <= 0) continue;
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
};

export const sampleBeta = (alpha, beta, rng) => {
  const x = sampleGamma(alpha, rng);
  const y = sampleGamma(beta, rng);
  const total = x + y;
  return total === 0 ? 0 : x / total;
};

export const percentileFromSamples = (samples, percentile) => {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

export const getCreativeDataStrength = (visits) => {
  if (visits >= HIGH_DATA_VISITS) return { key: 'HIGH', label: 'HIGH DATA' };
  if (visits >= MED_DATA_VISITS) return { key: 'MED', label: 'MED DATA' };
  return { key: 'LOW', label: 'LOW DATA' };
};

/* --- return per dollar ---------------------------------------------------
 * The verdict above answers "is this creative's conversion rate above the
 * account's?". That is a real question but not the buyer's one, for two
 * reasons. Return decomposes as (1000/CPM) × CTR × landing-rate × CVR × AOV, so
 * conversion rate is one factor of five — a creative with cheap clicks and a
 * middling CVR can out-earn a creative with the reverse. And the uncertainty in
 * a return comes from the purchase count, not the visit count: 1,100 visits
 * carrying 8 sales is an 8-sale sample.
 *
 * So return is modelled directly, on purchases per dollar of spend. Gamma-
 * Poisson is the conjugate pair for counts accrued over an exposure, and the
 * exposure here is money:
 *
 *   prior      Gamma(shape = λ₀·K, rate = K)     K in dollars
 *   posterior  Gamma(shape = λ₀·K + purchases, rate = K + spend)
 *   ROAS       = λ × AOV
 *
 * K is set to the account's cost per sale, so the prior is worth exactly one
 * expected sale of spend. That shrinkage is also what stops the winner's curse:
 * across a couple of hundred creatives several will post a spectacular return by
 * chance, and the raw figure is the one you would scale by mistake.
 * ------------------------------------------------------------------------- */

/** Purchases an AOV estimate must carry before it stops leaning on the account's. */
const K_AOV_PURCHASES = 3;
/** Expected sales at baseline below which a creative cannot be read at all. */
const MIN_EXPECTED_SALES = 1;
/** Posterior probability above/below which the comparison to target is called. */
const P_ABOVE_TARGET = 0.8;
const P_BELOW_TARGET = 0.2;
/** Credible interval reported beside the estimate. */
const CREDIBLE_LOW = 0.1;
const CREDIBLE_HIGH = 0.9;

/** Regularized lower incomplete gamma P(shape, x) — the Gamma CDF at rate 1. */
function lowerRegularizedGamma(shape, x) {
  if (!(x > 0) || !(shape > 0)) return 0;
  if (x > 1e8) return 1;
  // Series expansion; converges quickly for the shapes a creative produces.
  let sum = 1 / shape;
  let term = sum;
  for (let k = 1; k < 500; k += 1) {
    term *= x / (shape + k);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
  }
  const value = sum * Math.exp(-x + shape * Math.log(x) - logGamma(shape));
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

function logGamma(z) {
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.984369578019571e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  const y = z - 1;
  let x = coef[0];
  for (let i = 1; i < 9; i += 1) x += coef[i] / (y + i);
  const t = y + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(x);
}

/** P(rate parameter exceeds `threshold`) for Gamma(shape, rate). */
function gammaProbAbove(threshold, shape, rate) {
  if (!(threshold > 0)) return 1;
  return 1 - lowerRegularizedGamma(shape, rate * threshold);
}

/** Gamma quantile by bisection on the CDF — accurate enough, and hard to get wrong. */
function gammaQuantile(p, shape, rate) {
  if (!(shape > 0) || !(rate > 0)) return null;
  let low = 0;
  let high = (shape / rate) * 10 + 10 / rate;
  for (let i = 0; i < 200 && lowerRegularizedGamma(shape, rate * high) < p; i += 1) high *= 2;
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (lowerRegularizedGamma(shape, rate * mid) < p) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

/**
 * The verdict is deliberately gated on data strength: a creative cannot be
 * called dead or a winner until enough visits have accumulated to support it,
 * however extreme its win probability looks.
 */
export const getCreativeVerdict = ({ visits, winProb, p10, baselineCvr }) => {
  const strength = getCreativeDataStrength(visits).key;

  if (visits <= 0 || !Number.isFinite(winProb) || !Number.isFinite(p10)) {
    return { label: 'NEUTRAL', key: 'NEUTRAL' };
  }

  if (strength === 'HIGH' && winProb <= 0.1) return { label: 'DEAD', key: 'DEAD' };
  if (strength === 'HIGH' && winProb <= 0.3) return { label: 'LOSER', key: 'LOSER' };
  if (strength === 'HIGH' && winProb >= 0.95 && p10 > baselineCvr) {
    return { label: 'WINNER', key: 'WINNER' };
  }
  if (strength !== 'LOW' && winProb >= 0.7) {
    return { label: 'PROMISING', key: 'PROMISING' };
  }
  if (winProb >= 0.3) return { label: 'NEUTRAL', key: 'NEUTRAL' };

  return { label: 'NEUTRAL', key: 'NEUTRAL' };
};

export const computeCreativeBayesianStats = ({ visits, effectivePurchases, baselineCvr, seedKey }) => {
  if (visits <= 0) {
    return {
      pointCvr: null,
      winProb: null,
      p10: null,
      p90: null,
    };
  }

  const alpha0 = 1 + K_PRIOR * baselineCvr;
  const beta0 = 1 + K_PRIOR * (1 - baselineCvr);
  const alpha = alpha0 + effectivePurchases;
  const beta = beta0 + (visits - effectivePurchases);
  const rng = createSeededRng(hashStringToSeed(seedKey));
  const samples = [];
  let wins = 0;

  for (let i = 0; i < CREATIVE_SAMPLES; i += 1) {
    const sample = sampleBeta(alpha, beta, rng);
    samples.push(sample);
    if (sample > baselineCvr) wins += 1;
  }

  return {
    pointCvr: visits > 0 ? effectivePurchases / visits : null,
    winProb: wins / CREATIVE_SAMPLES,
    p10: percentileFromSamples(samples, 0.1),
    p90: percentileFromSamples(samples, 0.9),
  };
};

/**
 * Where a creative's return stands against the target, stated as a fact rather
 * than as an instruction.
 *
 * Four states, and the middle one is not a gap in knowledge: a posterior sitting
 * between the two thresholds means the return is *indistinguishable from target*
 * on the delivery so far, which is a finding. "Not enough delivery" is reserved
 * for creatives that have not yet bought one expected sale of spend, where the
 * absence of purchases carries no information at all.
 */
export function getReturnStanding({ expectedSales, probAboveTarget }) {
  if (!(expectedSales >= MIN_EXPECTED_SALES) || probAboveTarget == null) {
    return { key: 'UNREAD', label: 'Not enough delivery' };
  }
  if (probAboveTarget >= P_ABOVE_TARGET) return { key: 'ABOVE', label: 'Above target' };
  if (probAboveTarget <= P_BELOW_TARGET) return { key: 'BELOW', label: 'Below target' };
  return { key: 'AT', label: 'At target' };
}

/**
 * Account-wide conversion rate the individual creatives are judged against, and
 * the centre the prior shrinks them toward. Pooled from summed numerators and
 * denominators rather than averaged across creatives, so a high-traffic creative
 * carries the weight its traffic earns.
 */
export function buildCreativeBaselineCvr(rows = []) {
  let totalVisits = 0;
  let totalEffectivePurchases = 0;
  for (const row of rows) {
    const visits = toNumber(row?.visits);
    totalVisits += visits;
    totalEffectivePurchases += Math.min(toNumber(row?.purchases), visits);
  }
  const baseline = totalVisits > 0 ? totalEffectivePurchases / totalVisits : 0;
  return Math.max(baseline, EPSILON);
}

/**
 * Turns raw Meta ad rows into the table's row model: the delivery figures as
 * reported, plus the posterior summary and the verdict drawn from it.
 */
export function buildCreativeRows(ads = []) {
  const base = (ads || []).map((ad, index) => {
    const purchases = toNumber(ad.purchases);
    const revenue = toNumber(ad.purchase_value_usd ?? ad.purchase_value);
    const spend = toNumber(ad.spend_usd ?? ad.spend);
    const impressions = toNumber(ad.impressions);
    const inlineLinkClicks = toNumber(ad.link_clicks ?? ad.inline_link_clicks ?? ad.clicks_all);
    const outboundClicks = toNumber(ad.outbound_clicks);
    const landingPageViews = toNumber(ad.landing_page_views ?? ad.lpv);
    const atc = toNumber(ad.add_to_cart);
    const visits = getVisitsProxy({ landingPageViews, outboundClicks, inlineLinkClicks });
    return {
      key: ad.ad_id || ad.ad_name || `creative-${index}`,
      name: ad.ad_name || 'Creative',
      campaign: ad.campaign_name || '',
      adset: ad.adset_name || '',
      category: ad.product_family || ad.product_subtype || '',
      spend,
      revenue,
      impressions,
      clicks: inlineLinkClicks,
      ctr: toNumber(ad.ctr),
      atc,
      atcRate: visits > 0 ? (atc / visits) * 100 : null,
      purchases,
      visits,
      // Purchases cannot exceed the visits they came from; a creative whose
      // proxy undercounts sessions would otherwise post a CVR above 100%.
      effectivePurchases: Math.min(purchases, visits),
      aov: purchases > 0 ? revenue / purchases : null,
      roas: spend > 0 ? revenue / spend : null,
    };
  });

  const baselineCvr = buildCreativeBaselineCvr(base);

  // Account totals set both the target and the prior. Pooled from sums, never
  // averaged across creatives, so a $562 creative counts for more than a $5 one.
  const totals = base.reduce((acc, row) => ({
    spend: acc.spend + row.spend,
    purchases: acc.purchases + row.purchases,
    revenue: acc.revenue + row.revenue,
  }), { spend: 0, purchases: 0, revenue: 0 });
  const accountAov = totals.purchases > 0 ? totals.revenue / totals.purchases : 0;
  const salesPerDollar = totals.spend > 0 ? totals.purchases / totals.spend : 0;
  const costPerSale = salesPerDollar > 0 ? 1 / salesPerDollar : 0;
  // Default target is the account's own blended return: "is this creative
  // better than the average dollar in this account". A margin-based break-even
  // can be passed in instead when the question is "does this make money".
  const target = totals.spend > 0 ? totals.revenue / totals.spend : 0;

  const rows = base.map((row) => {
    const stats = computeCreativeBayesianStats({
      visits: row.visits,
      effectivePurchases: row.effectivePurchases,
      baselineCvr,
      seedKey: row.key,
    });

    // Posterior on purchases per dollar, and the return it implies.
    const shape = salesPerDollar * costPerSale + row.purchases;
    const rate = costPerSale + row.spend;
    const aov = (row.revenue + K_AOV_PURCHASES * accountAov) / (row.purchases + K_AOV_PURCHASES);
    const usable = shape > 0 && rate > 0 && aov > 0;
    const estimatedRoas = usable ? (shape / rate) * aov : null;
    const probAboveTarget = usable && target > 0 ? gammaProbAbove(target / aov, shape, rate) : null;
    const low = usable ? gammaQuantile(CREDIBLE_LOW, shape, rate) : null;
    const high = usable ? gammaQuantile(CREDIBLE_HIGH, shape, rate) : null;
    const expectedSales = row.spend * salesPerDollar;

    return {
      ...row,
      ...stats,
      expectedSales,
      estimatedRoas,
      probAboveTarget,
      roasLow: low == null ? null : low * aov,
      roasHigh: high == null ? null : high * aov,
      spendShare: totals.spend > 0 ? row.spend / totals.spend : 0,
      dataStrength: getCreativeDataStrength(row.visits),
      standing: getReturnStanding({ expectedSales, probAboveTarget }),
    };
  });

  return {
    baselineCvr,
    target,
    costPerSale,
    accountAov,
    totals,
    rows,
  };
}
