/* ----------------------------------------------------------------------------
 * spendResponse.js — spend saturation and marginal return on ad spend.
 *
 * The question this answers is the one a media buyer actually has: not "what did
 * we get back" but "what will the NEXT dollar get back, and at what point does it
 * stop paying for itself".
 *
 * Model — Michaelis-Menten (the Hill function with n = 1):
 *
 *     R(S) = Vmax * S / (K + S)
 *
 * where S is daily spend, R is daily revenue, Vmax is the revenue ceiling and K
 * is the half-saturation spend (the spend at which you capture half the ceiling).
 *
 * Why n = 1 rather than a full Hill curve: the third parameter buys an S-shaped
 * threshold at the low end, and with ten daily observations it is not identifiable
 * — it fits noise. Two parameters on ten points is already the edge of honest.
 *
 * Useful properties that fall straight out of the model:
 *   average ROAS  = R(S)/S      = Vmax / (K + S)
 *   marginal ROAS = dR/dS       = Vmax * K / (K + S)^2
 *   break-even    = marginal 1x = sqrt(Vmax * K) - K
 *
 * Marginal is always below average under this model, which is the entire point:
 * a healthy blended ROAS can hide a next dollar that no longer pays for itself.
 *
 * Fitting is a coarse-to-fine grid search on (Vmax, K) minimising squared error.
 * No dependency, deterministic, and with two parameters it cannot get stuck the
 * way gradient descent can.
 * ------------------------------------------------------------------------- */

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** A curve is only worth drawing when the spend actually moved around. */
export const MIN_POINTS = 6;
export const MIN_R2 = 0.5;
export const MIN_SPEND_CV = 0.15;

export function coefficientOfVariation(values = []) {
  const finite = values.map(Number).filter((v) => Number.isFinite(v) && v > 0);
  if (finite.length < 2) return 0;
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  if (!mean) return 0;
  const variance = finite.reduce((a, b) => a + (b - mean) ** 2, 0) / finite.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Fits R = Vmax*S/(K+S).
 *
 * Always returns a result object. `ok` is false — with a human-readable `reason` —
 * when the data cannot support a curve, so callers never have to guess whether a
 * returned Vmax means anything.
 */
export function fitResponseCurve(points = []) {
  const clean = points
    .map((p) => ({ date: p.date, spend: num(p.spend), revenue: num(p.revenue) }))
    .filter((p) => p.spend > 0);
  const base = { ok: false, points: clean, n: clean.length };

  if (clean.length < MIN_POINTS) {
    return { ...base, reason: `Needs at least ${MIN_POINTS} days with spend; have ${clean.length}.` };
  }
  const spends = clean.map((p) => p.spend);
  const revenues = clean.map((p) => p.revenue);
  const cv = coefficientOfVariation(spends);
  if (cv < MIN_SPEND_CV) {
    return {
      ...base,
      cv,
      reason: 'Daily spend barely varied, so the shape of the response curve cannot be identified. Vary budget to measure saturation.',
    };
  }
  const maxRevenue = Math.max(...revenues);
  const maxSpend = Math.max(...spends);
  const minSpend = Math.min(...spends);
  if (maxRevenue <= 0) return { ...base, cv, reason: 'No revenue recorded against this spend.' };

  const sse = (vmax, k) => {
    let error = 0;
    for (let i = 0; i < clean.length; i += 1) {
      const predicted = (vmax * spends[i]) / (k + spends[i]);
      error += (revenues[i] - predicted) ** 2;
    }
    return error;
  };

  let bestV = maxRevenue;
  let bestK = maxSpend / 2;
  let bestError = Infinity;
  let vLo = maxRevenue * 0.5;
  let vHi = maxRevenue * 6;
  let kLo = maxSpend * 0.02;
  let kHi = maxSpend * 20;
  for (let pass = 0; pass < 5; pass += 1) {
    const steps = 24;
    for (let i = 0; i <= steps; i += 1) {
      const vmax = vLo + ((vHi - vLo) * i) / steps;
      for (let j = 0; j <= steps; j += 1) {
        const k = kLo + ((kHi - kLo) * j) / steps;
        const error = sse(vmax, k);
        if (error < bestError) {
          bestError = error;
          bestV = vmax;
          bestK = k;
        }
      }
    }
    const vWidth = (vHi - vLo) / 6;
    const kWidth = (kHi - kLo) / 6;
    vLo = Math.max(1e-6, bestV - vWidth);
    vHi = bestV + vWidth;
    kLo = Math.max(1e-6, bestK - kWidth);
    kHi = bestK + kWidth;
  }

  const meanRevenue = revenues.reduce((a, b) => a + b, 0) / revenues.length;
  const totalSS = revenues.reduce((a, b) => a + (b - meanRevenue) ** 2, 0);
  const r2 = totalSS > 0 ? 1 - bestError / totalSS : 0;

  return {
    ok: r2 >= MIN_R2,
    reason: r2 >= MIN_R2 ? '' : `The curve explains only ${Math.round(Math.max(0, r2) * 100)}% of daily revenue variation — too loose to steer budget by.`,
    vmax: bestV,
    k: bestK,
    r2,
    cv,
    n: clean.length,
    points: clean,
    minSpend,
    maxSpend,
    meanSpend: spends.reduce((a, b) => a + b, 0) / spends.length,
  };
}

export function predictedRevenue(spend, fit) {
  if (!fit?.vmax) return 0;
  const s = num(spend);
  return (fit.vmax * s) / (fit.k + s);
}

export function averageRoas(spend, fit) {
  if (!fit?.vmax) return 0;
  return fit.vmax / (fit.k + num(spend));
}

/** dR/dS — what the next dollar returns at this spend level. */
export function marginalRoas(spend, fit) {
  if (!fit?.vmax) return 0;
  return (fit.vmax * fit.k) / (fit.k + num(spend)) ** 2;
}

/**
 * Spend at which the next dollar returns exactly 1x — the point where extra
 * budget stops adding contribution. Null when the curve never reaches it
 * (a ceiling so low that even the first dollar is under water).
 */
export function breakEvenSpend(fit) {
  if (!fit?.vmax || !fit.k) return null;
  const spend = Math.sqrt(fit.vmax * fit.k) - fit.k;
  return spend > 0 ? spend : null;
}

/**
 * Points for plotting. `extrapolated` marks everything beyond the highest spend
 * ever observed — the model has no evidence out there and the chart must not
 * present it as though it does.
 */
export function responseCurve(fit, { maxSpend, steps = 60 } = {}) {
  if (!fit?.vmax) return [];
  const limit = num(maxSpend) || fit.maxSpend * 2;
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const spend = (limit * i) / steps;
    out.push({
      spend,
      revenue: predictedRevenue(spend, fit),
      marginal: marginalRoas(spend, fit),
      average: spend > 0 ? averageRoas(spend, fit) : null,
      extrapolated: spend > fit.maxSpend,
    });
  }
  return out;
}

/**
 * Non-parametric saturation signal per market.
 *
 * Per-market daily series are too short and too noisy to fit a curve to — doing
 * it anyway produced R² below 0.35 on every market in the launch data. Splitting
 * each market's days at its median spend and comparing pooled ROAS either side
 * asks a smaller question that the data can actually answer: when this market
 * spent more than usual, did the money work as hard?
 */
export function marketSaturation(marketPoints = {}, { minDaysPerSide = 3 } = {}) {
  const out = [];
  for (const [market, rows] of Object.entries(marketPoints)) {
    const clean = (rows || [])
      .map((r) => ({ spend: num(r.spend), revenue: num(r.revenue) }))
      .filter((r) => r.spend > 0);
    if (clean.length < minDaysPerSide * 2) continue;
    const sorted = [...clean].sort((a, b) => a.spend - b.spend);
    const half = Math.floor(sorted.length / 2);
    const low = sorted.slice(0, half);
    const high = sorted.slice(sorted.length - half);
    const pooled = (rows2) => {
      const spend = rows2.reduce((a, r) => a + r.spend, 0);
      const revenue = rows2.reduce((a, r) => a + r.revenue, 0);
      return { spend, revenue, roas: spend ? revenue / spend : 0, days: rows2.length };
    };
    const lowSide = pooled(low);
    const highSide = pooled(high);
    if (!lowSide.roas || !highSide.roas) continue;
    out.push({
      market,
      lowSpendPerDay: lowSide.spend / lowSide.days,
      highSpendPerDay: highSide.spend / highSide.days,
      lowRoas: lowSide.roas,
      highRoas: highSide.roas,
      deltaPct: ((highSide.roas - lowSide.roas) / lowSide.roas) * 100,
      days: clean.length,
      totalSpend: lowSide.spend + highSide.spend,
    });
  }
  return out.sort((a, b) => b.totalSpend - a.totalSpend);
}

const fmtMoney = (value) => {
  const n = num(value);
  return Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
};
const fmtX = (value) => `${num(value).toFixed(2)}x`;

/** Findings in the shared shape used by the rest of the dashboard. */
export function buildSpendResponseFindings(fit, saturation = [], { currentSpend } = {}) {
  if (!fit?.ok) return [];
  const spend = num(currentSpend) || fit.meanSpend;
  const marginal = marginalRoas(spend, fit);
  const average = averageRoas(spend, fit);
  const breakEven = breakEvenSpend(fit);
  const findings = [];

  const headroom = breakEven != null && breakEven > spend;
  const extrapolates = breakEven != null && breakEven > fit.maxSpend;
  findings.push({
    id: 'response-marginal',
    tone: marginal >= 1.5 ? 'positive' : marginal >= 1 ? 'watch' : 'negative',
    headline: `The next dollar returns ${fmtX(marginal)} at ${fmtMoney(spend)}/day`,
    context: `Blended ROAS is ${fmtX(average)}, but that averages every dollar including the cheap early ones. Marginal return is what an extra dollar actually buys.`,
    driver: '',
    action: marginal < 1
      ? 'Extra budget is losing money at this level. Cut spend or fix conversion before adding more.'
      : headroom
        ? `Room to scale: the next dollar stops paying for itself around ${fmtMoney(breakEven)}/day.${extrapolates ? ' That figure sits beyond any spend level tested so far — step toward it rather than jumping.' : ''}`
        : '',
  });

  if (breakEven != null && spend > breakEven) {
    findings.push({
      id: 'response-oversaturated',
      tone: 'negative',
      headline: `Spending past the point where extra budget pays for itself`,
      context: `Break-even on the next dollar is around ${fmtMoney(breakEven)}/day; current spend is ${fmtMoney(spend)}/day.`,
      driver: '',
      action: 'Pull spend back toward break-even, or widen the audience so the ceiling moves.',
    });
  }

  const degrading = saturation
    .filter((row) => row.deltaPct <= -25 && row.totalSpend > 0)
    .sort((a, b) => a.deltaPct - b.deltaPct)[0];
  if (degrading) {
    findings.push({
      id: 'response-market-saturating',
      tone: 'watch',
      headline: `${degrading.market} returns less on its heavier days`,
      context: `On its ${Math.floor(degrading.days / 2)} highest-spend days it averaged ${fmtMoney(degrading.highSpendPerDay)}/day at ${fmtX(degrading.highRoas)}, against ${fmtMoney(degrading.lowSpendPerDay)}/day at ${fmtX(degrading.lowRoas)} on the lighter half.`,
      driver: '',
      action: 'A sign this market saturates early. Test a lower daily cap before pushing more into it.',
    });
  }

  const scaling = saturation
    .filter((row) => row.deltaPct >= 25 && row.totalSpend > 0)
    .sort((a, b) => b.deltaPct - a.deltaPct)[0];
  if (scaling) {
    findings.push({
      id: 'response-market-scaling',
      tone: 'positive',
      headline: `${scaling.market} holds up as spend rises`,
      context: `Heavier days averaged ${fmtX(scaling.highRoas)} against ${fmtX(scaling.lowRoas)} on lighter ones — no sign of saturation in the range tested.`,
      driver: '',
      action: 'The most defensible place to send incremental budget.',
    });
  }

  return findings;
}
