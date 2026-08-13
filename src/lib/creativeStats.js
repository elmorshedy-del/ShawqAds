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

  return {
    baselineCvr,
    rows: base.map((row) => {
      const stats = computeCreativeBayesianStats({
        visits: row.visits,
        effectivePurchases: row.effectivePurchases,
        baselineCvr,
        seedKey: row.key,
      });
      return {
        ...row,
        ...stats,
        dataStrength: getCreativeDataStrength(row.visits),
        verdict: getCreativeVerdict({
          visits: row.visits,
          winProb: stats.winProb,
          p10: stats.p10,
          baselineCvr,
        }),
      };
    }),
  };
}
