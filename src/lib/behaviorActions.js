import { MIN_COMPARABLE_SESSIONS, comparabilityTier } from './sampleTiers.js';
import { pagePathLabel } from './pagePath.js';

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const rate = (row) => {
  const exposed = num(row?.exposed);
  return exposed > 0 ? num(row?.abandoned) / exposed : null;
};

const baseline = (step) => {
  if (num(step?.global?.exposed) <= 0) return null;
  const value = Number(step?.global?.rate);
  return Number.isFinite(value) ? value : null;
};

const pct = (value) => `${Math.round(num(value) * 100)}%`;
const points = (value) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)} pts`;

function strongestFriction(rows = [], siteRate, labelFor, id) {
  const comparable = rows
    .map((row) => {
      const observed = rate(row);
      return {
        row,
        observed,
        difference: observed == null || siteRate == null ? null : observed - siteRate,
      };
    })
    .filter(({ row, observed }) => num(row?.exposed) >= MIN_COMPARABLE_SESSIONS && observed != null)
    .sort((a, b) => {
      const scoreA = a.difference ?? a.observed;
      const scoreB = b.difference ?? b.observed;
      return scoreB - scoreA || num(b.row.exposed) - num(a.row.exposed);
    });
  const worst = comparable[0];
  if (!worst) return null;
  // Do not turn a small or below-average difference into an action card.
  if (worst.difference != null && worst.difference < 0.05) return null;
  const label = labelFor(worst.row);
  const tier = comparabilityTier(worst.row.exposed);
  return {
    id,
    tone: 'negative',
    title: `Check ${label} checkout first`,
    stat: `${num(worst.row.abandoned)} of ${num(worst.row.exposed)} sessions left (${pct(worst.observed)})${
      worst.difference == null ? '' : ` · ${points(worst.difference)} vs site`
    }`,
    confidence: `${tier.label} · ${num(worst.row.exposed)} sessions`,
    meaning: `${label} is losing a meaningfully larger share of shoppers than the site baseline.`,
  };
}

export function buildBehaviorActions(behavior = {}) {
  const checkout = behavior?.matrix?.checkout || {};
  const actions = [];

  const product = strongestFriction(
    checkout.products || [],
    baseline(checkout),
    (row) => row.product || row.family || 'this product',
    'behavior-product',
  );
  if (product) {
    actions.push({
      ...product,
      action: 'Replay recent sessions for this product, then verify shipping cost, size guidance and payment errors.',
    });
  }

  const country = strongestFriction(
    checkout.countries || [],
    baseline(checkout),
    (row) => row.country || row.country_code || 'this market',
    'behavior-country',
  );
  if (country) {
    actions.push({
      ...country,
      action: 'Run checkout from this country and verify shipping price, currency, address validation and payment methods.',
    });
  }

  const dwell = (behavior?.dwell_pages || [])
    .filter((page) => page?.pattern === 'significant_non_buyer_longer')
    .sort((a, b) => num(b.sessions) - num(a.sessions))[0];
  if (dwell && num(dwell.sessions) >= MIN_COMPARABLE_SESSIONS) {
    const label = pagePathLabel(dwell.path);
    actions.push({
      id: 'behavior-dwell',
      tone: 'watch',
      title: `Inspect ${label}`,
      stat: `Non-buyers ${Math.round(num(dwell.non_purchaser_median_dwell_seconds))}s median · buyers ${Math.round(num(dwell.purchaser_median_dwell_seconds))}s · ${num(dwell.sessions)} sessions`,
      confidence: `${dwell.confidence || 'Directional'} · ${num(dwell.sessions)} sessions`,
      meaning: 'Non-buyers spend longer here, which can signal confusion or missing decision information.',
      action: 'Check this page on mobile for load time, price, sizing and the primary call to action, then compare session replays.',
    });
  }

  if (actions.length) return actions.slice(0, 3);

  const totalSessions = num(behavior?.extraction?.session_events?.sessions)
    || num(behavior?.journeys?.totals?.purchasers) + num(behavior?.journeys?.totals?.non_purchasers);
  return [{
    id: 'behavior-clear',
    tone: 'neutral',
    title: totalSessions >= MIN_COMPARABLE_SESSIONS
      ? 'No clear behavior issue is above the site baseline'
      : 'Keep collecting behavior sessions',
    stat: `${totalSessions} captured session${totalSessions === 1 ? '' : 's'}`,
    confidence: totalSessions >= MIN_COMPARABLE_SESSIONS ? 'No material signal' : 'Too early to compare',
    meaning: totalSessions >= MIN_COMPARABLE_SESSIONS
      ? 'The current product and country differences are not large enough to prioritize.'
      : `At least ${MIN_COMPARABLE_SESSIONS} sessions are needed before segment comparisons become useful.`,
    action: totalSessions >= MIN_COMPARABLE_SESSIONS
      ? 'Keep monitoring and investigate only when a segment moves materially above baseline.'
      : 'Confirm the behavior pixel is receiving page views and checkout events, then let the sample build.',
  }];
}
