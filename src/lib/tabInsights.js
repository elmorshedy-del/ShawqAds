/* ----------------------------------------------------------------------------
 * tabInsights.js — per-tab findings.
 *
 * Overview answers "how is the business doing". Each other tab answers a
 * narrower question, and until now answered it only with charts and tables:
 * the reader had to derive the conclusion themselves. These builders produce
 * the same finding shape as analyticsInsights.buildKeyFindings
 * ({ tone, headline, context, driver, action }) so one component renders them all.
 *
 * Every builder is defensive: missing or empty inputs return [], never a
 * fabricated conclusion.
 * ------------------------------------------------------------------------- */

import { intervalsSeparate, ratioCountInterval } from './statsTests.js';

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (value) => {
  const n = num(value);
  return Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
};

/**
 * One item's share of a total, as a percentage, or null when the total cannot
 * carry one.
 *
 * Testing `total > 0` is not sufficient. Refunds and credits can leave a total
 * that is positive but vanishingly small — a few thousand dollars of revenue in
 * one market against nearly the same in refunds elsewhere — and the quotient
 * then overflows, publishing "C0 is Infinity% of revenue". The result is checked
 * and clamped, not just the divisor.
 */
function shareOfTotal(part, total) {
  if (!(total > 0)) return null;
  const share = (num(part) / total) * 100;
  return Number.isFinite(share) ? Math.min(100, Math.max(0, share)) : null;
}
const fmtX = (value) => `${num(value).toFixed(2)}x`;
const fmtIdx = (value) => (value == null || !Number.isFinite(Number(value)) ? '—' : String(Math.round(Number(value))));
const fmtPct = (value) => `${num(value) >= 0 ? '+' : ''}${Math.round(num(value))}%`;

/* ============================ Funnel ==================================== */

/** Sessions a campaign line needs before its index is worth comparing. */
const FUNNEL_MIN_CAMPAIGN_VOLUME = 50;
/** Index points between two campaign lines before the gap is worth reporting. */
const FUNNEL_MIN_SPREAD_POINTS = 20;
/**
 * Delivery days needed before reach and frequency trends are compared. The
 * saturation test splits the window into thirds, so six days meant averaging
 * two days against two — well inside normal day-to-day movement.
 */
const LAUNCH_MIN_DELIVERY_DAYS = 9;
/** Percent move in reach or frequency that counts as a real trend, not wobble. */
const LAUNCH_TREND_PCT = 10;

/**
 * The funnel has two measurable steps. The reader needs to know which one is
 * losing more people than it used to, because that is the one worth fixing.
 *
 * Both figures are indexes against the launch baseline (100), already
 * bias-corrected upstream in funnelAnalytics.js — so they are comparable to
 * each other even though their raw rates are not.
 */
export function buildFunnelFindings(funnel) {
  if (!funnel?.hasData) return [];
  const findings = [];
  const steps = [
    { key: 'icAtc', label: 'Checkout start rate', short: 'add-to-cart → checkout', data: funnel.icAtc },
    { key: 'purchaseIc', label: 'Purchase rate', short: 'checkout → purchase', data: funnel.purchaseIc },
  ].filter((step) => step.data?.summary?.currentIndex != null);
  if (!steps.length) return [];

  // Bottleneck = the step furthest below its own launch baseline.
  const ranked = [...steps].sort(
    (a, b) => num(a.data.summary.currentIndex) - num(b.data.summary.currentIndex),
  );
  const worst = ranked[0];
  const best = ranked[ranked.length - 1];
  const worstIndex = num(worst.data.summary.currentIndex);

  if (steps.length > 1 && Math.abs(worstIndex - num(best.data.summary.currentIndex)) >= 5) {
    findings.push({
      id: 'funnel-bottleneck',
      tone: worstIndex < 95 ? 'negative' : 'watch',
      evidence: 'Compared',
      headline: `${worst.label} is the weaker step at ${fmtIdx(worstIndex)}`,
      context: `${best.label} sits at ${fmtIdx(best.data.summary.currentIndex)}. Both are indexed to the launch baseline of 100, so they are directly comparable.`,
      driver: worst.data.summary.currentRaw != null
        ? `Raw ${worst.short} rate is now ${Math.round(num(worst.data.summary.currentRaw))}% against a ${Math.round(num(worst.data.summary.baseRate))}% launch base.`
        : '',
      action: worstIndex < 95
        ? `Fixing ${worst.short} moves more volume than any spend change at this stage.`
        : '',
    });
  }

  for (const step of steps) {
    const since = step.data.summary.deltaSinceLaunch;
    if (since == null || Math.abs(num(since)) < 5) continue;
    const improving = num(since) > 0;
    findings.push({
      id: `funnel-trend-${step.key}`,
      tone: improving ? 'positive' : 'negative',
      evidence: 'Compared',
      headline: `${step.label} has ${improving ? 'improved' : 'degraded'} ${Math.abs(Math.round(num(since)))} points since launch`,
      context: `Now ${fmtIdx(step.data.summary.currentIndex)} against ${fmtIdx(step.data.summary.launchIndex)} at launch. 7-day rolling, shrinkage-stabilised.`,
      driver: '',
      action: improving
        ? ''
        : `Compare campaign lines below — a single campaign dragging the account line is a targeting problem, not a site problem.`,
    });
  }

  // Spread across campaigns at the latest point with data.
  for (const step of steps) {
    const points = step.data.points || [];
    const campaigns = step.data.campaigns || [];
    if (campaigns.length < 2) continue;
    let latest = null;
    for (let i = points.length - 1; i >= 0; i -= 1) {
      if (campaigns.some((c) => points[i]?.[c.id] != null)) { latest = points[i]; break; }
    }
    if (!latest) continue;
    // Both ends must carry real traffic. This is the widest gap among every
    // campaign line, so with enough thin lines a 20-point spread appears without
    // anything differing — and the reader was never told how many were compared
    // or how much traffic sat behind either end.
    const values = campaigns
      .map((c) => ({ name: c.name, value: latest[c.id], volume: num(c.totalDen) }))
      .filter((row) => row.value != null && row.volume >= FUNNEL_MIN_CAMPAIGN_VOLUME)
      .sort((a, b) => num(b.value) - num(a.value));
    if (values.length < 2) continue;
    const top = values[0];
    const bottom = values[values.length - 1];
    const spread = num(top.value) - num(bottom.value);
    if (spread < FUNNEL_MIN_SPREAD_POINTS) continue;
    findings.push({
      id: `funnel-spread-${step.key}`,
      tone: 'watch',
      evidence: 'Compared',
      headline: `${step.label} varies ${Math.round(spread)} points across campaigns`,
      context: `${top.name} converts at ${fmtIdx(top.value)} on ${Math.round(top.volume)} sessions while ${bottom.name} sits at ${fmtIdx(bottom.value)} on ${Math.round(bottom.volume)}, the widest gap among ${values.length} campaign lines carrying real traffic. Both are shrunk toward the account rate, so thin lines already read closer to 100 than their raw numbers.`,
      driver: '',
      action: `A gap this wide is an audience or creative difference, not site friction. Compare ${top.name} and ${bottom.name} in the Ads tab.`,
    });
    break;
  }

  return findings.slice(0, 4);
}

/* ============================== Ads ===================================== */

/**
 * The Ads tab exists to answer one question: what should I cut and what should
 * I scale. Ranking by spend (the default sort) does not answer it — the tables
 * showed the inputs to that decision without ever stating it.
 */
export function buildAdsFindings({
  adSets = [],
  campaigns = [],
  minSpend = 100,
  minConversions = 3,
} = {}) {
  const findings = [];
  const funded = adSets.filter(
    (row) => num(row.spend) >= minSpend && num(row.sales) >= minConversions,
  );

  if (funded.length >= 2) {
    const byRoas = [...funded].sort((a, b) => num(b.roas) - num(a.roas));
    const best = byRoas[0];
    const worst = byRoas[byRoas.length - 1];
    // Best-vs-worst over many ad sets is the widest gap the account contains, so
    // it looks impressive whether or not anything real separates the two. A ROAS
    // built on a handful of orders inherits the order count's sampling error
    // (roughly 1/sqrt(n) — 58% at three orders), and the old copy quoted the
    // three-conversion floor as if clearing it made the ranking trustworthy.
    // Only claim a difference when the two plausible ranges do not overlap.
    const bestRange = ratioCountInterval(num(best.roas), num(best.sales));
    const worstRange = ratioCountInterval(num(worst.roas), num(worst.sales));
    if (intervalsSeparate(bestRange, worstRange)) {
      findings.push({
        id: 'ads-spread',
        tone: num(worst.roas) < 1 ? 'negative' : 'watch',
        evidence: 'Compared',
        headline: `${worst.adSet} returns ${fmtX(worst.roas)} while ${best.adSet} returns ${fmtX(best.roas)}`,
        context: `${best.adSet} is measured on ${num(best.sales)} sales and ${worst.adSet} on ${num(worst.sales)}. Allowing for how few that is, the true figures sit near ${fmtX(bestRange.low)}–${fmtX(bestRange.high)} and ${fmtX(worstRange.low)}–${fmtX(worstRange.high)} — the ranges do not overlap, so the gap is larger than counting noise. ${worst.adSet} has spent ${fmtMoney(worst.spend)}.`,
        driver: '',
        // Investigating is cheap, so a sub-1x point estimate is enough to warrant
        // it. The stronger sentence is reserved for an ad set whose whole
        // plausible range sits below break-even.
        action: worstRange.high < 1
          ? `Even the optimistic end of ${worst.adSet}'s range is below break-even. Investigate its targeting and creative before adding budget.`
          : num(worst.roas) < 1
            ? `Investigate ${worst.adSet}'s targeting and creative before adding budget.`
            : `Test a measured shift from ${worst.adSet} toward ${best.adSet}, then verify the result.`,
      });
    } else if (funded.length >= 3) {
      // Saying "we looked and cannot yet tell them apart" is a finding. Silence
      // reads as "nothing to see", which is how thin samples get scaled on.
      findings.push({
        id: 'ads-spread-unresolved',
        tone: 'neutral',
        evidence: 'Observed',
        headline: `${funded.length} funded ad sets are not yet separable on ROAS`,
        context: `${best.adSet} leads at ${fmtX(best.roas)} and ${worst.adSet} trails at ${fmtX(worst.roas)}, but with ${num(worst.sales)}–${num(best.sales)} sales behind them those figures could still swap order.`,
        driver: '',
        action: 'Let the low-volume ad sets accumulate sales before moving budget on this ranking.',
      });
    }
  }

  const risky = adSets.filter((row) => /fatigue|expensive/i.test(String(row.status || '')));
  if (risky.length) {
    const worst = [...risky].sort((a, b) => num(b.spend) - num(a.spend))[0];
    findings.push({
      id: 'ads-fatigue',
      tone: 'negative',
      evidence: 'Heuristic',
      headline: `${risky.length} ad set${risky.length === 1 ? '' : 's'} showing delivery fatigue`,
      context: `${worst.adSet} is the most exposed at ${fmtMoney(worst.spend)} spent, frequency ${num(worst.freq).toFixed(2)} and CPM ${fmtMoney(worst.cpm)}.`,
      driver: num(worst.cpmVsMar) ? `CPM is ${fmtPct(worst.cpmVsMar)} against the March benchmark.` : '',
      action: 'Refresh creative before scaling — extra budget into a fatigued ad set buys impressions, not reach.',
    });
  }

  // Attribution quality: mapped ROAS leaning on inference is a trust caveat, not a result.
  const flagged = campaigns.filter((c) => c.flag === 'warning');
  const inferred = campaigns.filter((c) => c.flag === 'inferred');
  if (flagged.length) {
    findings.push({
      id: 'ads-attribution',
      tone: 'watch',
      evidence: 'Observed',
      headline: `${flagged.length} campaign${flagged.length === 1 ? '' : 's'} report more Meta sales than Shopify can match`,
      context: 'Meta counts a sale its own attribution window claims; Shopify counts orders that actually landed. A gap means the mapping is incomplete, not that revenue is missing.',
      driver: '',
      action: 'Treat mapped ROAS for those rows as a ceiling. Expand the row before acting on it.',
    });
  } else if (inferred.length) {
    findings.push({
      id: 'ads-inferred',
      tone: 'neutral',
      evidence: 'Observed',
      headline: `${inferred.length} campaign${inferred.length === 1 ? '' : 's'} rely on inferred product/country matching`,
      context: 'Those orders carried no ad reference, so they were assigned by product and country ownership rather than a direct match.',
      driver: '',
      action: 'Shopify ROAS is the safer column for budget decisions on those rows.',
    });
  }

  // Spend concentration across campaigns.
  const totalSpend = campaigns.reduce((sum, c) => sum + num(c.spend), 0);
  const topSpender = [...campaigns].sort((a, b) => num(b.spend) - num(a.spend))[0];
  const spendShare = topSpender ? shareOfTotal(topSpender.spend, totalSpend) : null;
  if (spendShare != null && spendShare >= 40 && campaigns.length > 2) {
    const share = spendShare;
    findings.push({
      id: 'ads-concentration',
      tone: 'neutral',
      evidence: 'Observed',
      headline: `${topSpender.name} takes ${share.toFixed(0)}% of spend`,
      context: `${fmtMoney(topSpender.spend)} of ${fmtMoney(totalSpend)} across ${campaigns.length} campaigns, returning ${fmtX(topSpender.shopifyRoas)} on Shopify revenue.`,
      driver: '',
      action: num(topSpender.shopifyRoas) < 2
        ? 'The largest budget line is also a below-average performer — worth a hard look.'
        : '',
    });
  }

  return findings.slice(0, 4);
}

/* ============================= Market =================================== */

/**
 * `minOrders` matches the low-sample guard on the country cards. Units are not
 * independent outcomes — one bulk order must not make a market look validated.
 */
export function buildMarketFindings({ countries = [], minOrders = 5 } = {}) {
  const findings = [];
  const comparable = countries.filter((c) => num(c.orders) >= minOrders && num(c.spend) > 0);
  if (!countries.length) return [];

  if (comparable.length >= 2) {
    const byRoas = [...comparable].sort((a, b) => num(b.roas) - num(a.roas));
    const best = byRoas[0];
    const worst = byRoas[byRoas.length - 1];
    findings.push({
      id: 'market-best',
      tone: 'positive',
      evidence: 'Compared',
      headline: `${best.country} is the strongest market at ${fmtX(best.roas)}`,
      context: `${num(best.orders)} orders and ${fmtMoney(best.revenue)} of revenue on ${fmtMoney(best.spend)} of spend.`,
      driver: '',
      action: 'Check whether spend here is capped before looking for growth elsewhere.',
    });
    if (num(worst.roas) < 1.5) {
      findings.push({
        id: 'market-worst',
        tone: num(worst.roas) < 1 ? 'negative' : 'watch',
        evidence: 'Compared',
        headline: `${worst.country} returns ${fmtX(worst.roas)} on ${fmtMoney(worst.spend)} of spend`,
        context: `${num(worst.orders)} orders — enough to compare directionally with the other measured markets.`,
        driver: '',
        action: num(worst.roas) < 1
          ? 'Below break-even with a real sample. Cut or rework targeting here.'
          : 'Watch this market; it is the weakest one carrying meaningful volume.',
      });
    }
  }

  // Spend with nothing to show for it is the most actionable market signal there is.
  const dead = countries.filter((c) => num(c.spend) >= 100 && num(c.revenue) === 0);
  if (dead.length) {
    const worst = [...dead].sort((a, b) => num(b.spend) - num(a.spend))[0];
    findings.push({
      id: 'market-dead',
      tone: 'negative',
      evidence: 'Observed',
      headline: `${dead.length} market${dead.length === 1 ? '' : 's'} spent with no revenue back`,
      context: `${worst.country} is the largest at ${fmtMoney(worst.spend)} spent and nothing returned.`,
      driver: '',
      action: 'Confirm the storefront ships there and the currency/checkout works before spending more.',
    });
  }

  const totalRevenue = countries.reduce((sum, c) => sum + num(c.revenue), 0);
  const top = [...countries].sort((a, b) => num(b.revenue) - num(a.revenue))[0];
  const revenueShare = top ? shareOfTotal(top.revenue, totalRevenue) : null;
  if (revenueShare != null && revenueShare >= 50) {
    const share = revenueShare;
    findings.push({
      id: 'market-concentration',
      tone: 'watch',
      evidence: 'Observed',
      headline: `${top.country} is ${share.toFixed(0)}% of revenue`,
      context: `${countries.length} markets are selling, but one carries most of the result.`,
      driver: '',
      action: 'A bad week in one market is a bad week for the account. Look at whether the second market is growing.',
    });
  }

  const lowSample = countries.filter((c) => num(c.orders) > 0 && num(c.orders) < minOrders);
  if (lowSample.length >= 3) {
    findings.push({
      id: 'market-lowsample',
      tone: 'neutral',
      evidence: 'Observed',
      headline: `${lowSample.length} markets have fewer than ${minOrders} orders`,
      context: 'Their ROAS is shown greyed out because one order can move it enough to invert the verdict.',
      driver: '',
      action: 'Let them accumulate before cutting or scaling on their numbers.',
    });
  }

  return findings.slice(0, 4);
}

/* ============================= Launch =================================== */

/**
 * Reach flattening while frequency climbs is the audience-saturation signal the
 * delivery chart is built to show. Stating it means the reader does not have to
 * eyeball two lines on different axes to spot it.
 */
export function buildLaunchFindings({ delivery = [], phases = null } = {}) {
  const findings = [];

  if (phases?.history && phases?.launch && num(phases.launch.days) >= 2) {
    const h = phases.history;
    const l = phases.launch;
    if (num(h.reachPerDollar) > 0) {
      const delta = ((num(l.reachPerDollar) - num(h.reachPerDollar)) / num(h.reachPerDollar)) * 100;
      const better = delta >= 0;
      findings.push({
        id: 'launch-efficiency',
        tone: better ? 'positive' : Math.abs(delta) > 15 ? 'negative' : 'watch',
        evidence: 'Compared',
        headline: `Launch buys ${Math.abs(delta).toFixed(0)}% ${better ? 'more' : 'less'} unique reach per dollar than ${h.name}`,
        context: `${num(l.reachPerDollar).toFixed(1)} reach/$ against ${num(h.reachPerDollar).toFixed(1)}, at ${fmtMoney(l.cpm)} CPM vs ${fmtMoney(h.cpm)}. Compared at the same delivery stage, ${num(l.days)} days in.`,
        driver: '',
        action: better ? '' : 'Rising CPM this early usually means audience overlap. Check frequency below.',
      });
    }
  }

  // Saturation: compare the first and last third of the delivery window.
  const rows = (delivery || []).filter((row) => num(row.reach) > 0);
  if (rows.length >= LAUNCH_MIN_DELIVERY_DAYS) {
    const third = Math.max(3, Math.floor(rows.length / 3));
    const head = rows.slice(0, third);
    const tail = rows.slice(-third);
    const mean = (arr, key) => arr.reduce((sum, row) => sum + num(row[key]), 0) / (arr.length || 1);
    const reachDelta = mean(head, 'reach') ? ((mean(tail, 'reach') - mean(head, 'reach')) / mean(head, 'reach')) * 100 : 0;
    const freqDelta = mean(head, 'frequency') ? ((mean(tail, 'frequency') - mean(head, 'frequency')) / mean(head, 'frequency')) * 100 : 0;
    const saturating = reachDelta < -LAUNCH_TREND_PCT && freqDelta > LAUNCH_TREND_PCT;
    if (saturating) {
      findings.push({
        id: 'launch-saturation',
        tone: 'negative',
        evidence: 'Compared',
        headline: 'Audience saturation signal: reach falling while frequency climbs',
        context: `Reach is ${fmtPct(reachDelta)} and frequency ${fmtPct(freqDelta)} comparing the last ${third} days against the first ${third}. The same people are seeing the ads more often.`,
        driver: '',
        action: 'Broaden targeting or refresh creative — more budget into a saturated audience raises CPM without adding buyers.',
      });
    } else if (reachDelta > LAUNCH_TREND_PCT && freqDelta < LAUNCH_TREND_PCT) {
      findings.push({
        id: 'launch-headroom',
        tone: 'positive',
        evidence: 'Compared',
        headline: 'Still finding new people: reach growing without frequency climbing',
        context: `Reach ${fmtPct(reachDelta)} and frequency ${fmtPct(freqDelta)} across the window. The audience is not exhausted.`,
        driver: '',
        action: 'There is room to scale spend before creative fatigue becomes the constraint.',
      });
    }
  }

  return findings.slice(0, 3);
}
