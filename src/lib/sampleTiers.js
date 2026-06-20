/* Plain-language sample-size tiers for comparing abandonment rates.
 *
 * More sessions = a tighter, more trustworthy rate. We express this in plain words
 * (no statistical symbols) as three tiers, each with the rough accuracy it buys:
 *   - Reliable    (400+ sessions): the rate is accurate to within about 5%.
 *   - Comparable  (100+ sessions): accurate to within about 10% — fine for comparing.
 *   - Early signal (30+ sessions): accurate to within about 18% — treat as a hint.
 * Below 30 sessions there isn't enough to compare, so the row is set aside.
 */

export const MIN_COMPARABLE_SESSIONS = 30;

export const SAMPLE_TIERS = [
  { key: 'reliable', min: 400, label: 'Reliable', accuracy: 'within about 5%', rank: 3 },
  { key: 'comparable', min: 100, label: 'Comparable', accuracy: 'within about 10%', rank: 2 },
  { key: 'early', min: 30, label: 'Early signal', accuracy: 'within about 18%', rank: 1 },
];

export function comparabilityTier(sessions) {
  const n = Number(sessions) || 0;
  for (const tier of SAMPLE_TIERS) {
    if (n >= tier.min) return { ...tier, sessions: n, comparable: true };
  }
  return { key: 'too_few', label: 'Too few to compare', accuracy: 'not enough sessions yet', rank: 0, sessions: n, comparable: false };
}

// One-line explanation for the UI legend (kept jargon-free).
export const SAMPLE_TIER_LEGEND = 'Confidence grows with sessions: 30+ is an early signal (accurate to within about 18%), 100+ is comparable (within about 10%), and 400+ is reliable (within about 5%). Products with fewer than 30 sessions are set aside until they gather more.';
