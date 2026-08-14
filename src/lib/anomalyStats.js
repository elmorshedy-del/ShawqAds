/* ----------------------------------------------------------------------------
 * anomalyStats.js — decides whether a single day was genuinely unusual, and
 * says so in language a numerate reader can verify without trusting the model.
 *
 * Why this module exists
 * ----------------------
 * The panel used to publish claims like:
 *
 *     "Meta spend $620 was far above normal.
 *      Typical day around $0 (usual range $0–$191). This is a 6.5σ move."
 *
 * Three separate defects produced that sentence, and all three are fixed here.
 *
 *  1. MISSING DAYS WERE COUNTED AS ZERO DAYS.
 *     The merged business series carries spend_usd = 0 for any date with no
 *     Meta row. "The platform reported nothing" is absence of measurement, not
 *     a day on which $0 was spent. With most of the baseline sitting at a
 *     manufactured zero, the "typical day" collapsed to $0 — so every real
 *     spending day looked like an emergency.
 *
 *  2. AN INVENTED SCALE WAS PRINTED AS σ.
 *     When a baseline has no spread, the median absolute deviation is 0. The
 *     old code substituted a placeholder width (10% of the largest day, floored
 *     at 1) and kept dividing by it, then labelled the quotient "σ". That
 *     number is not a standard deviation of anything. Replaying the real series
 *     reproduces the reported 6.5σ and 4.4σ exactly — and also yields a 600σ
 *     day, which is the reductio: no quantity of ad spend is 600 standard
 *     deviations from anything.
 *
 *  3. RARITY WAS CLAIMED FAR BEYOND WHAT THE EVIDENCE COULD RESOLVE.
 *     Read as a normal distribution, 6.5σ means roughly one day in 10^10 — call
 *     it once since the last ice age. That claim was drawn from 28 days of
 *     history. n observations can only demonstrate rarity to about 1-in-(n+1);
 *     everything past that is extrapolation along an assumed bell curve, and
 *     daily ad spend is not bell-curved (it is bounded below at zero, moves in
 *     deliberate operator-set steps, and is heavily autocorrelated). This is
 *     the same discipline as a limit of quantitation: report to the precision
 *     the method actually resolves, and no further.
 *
 * What this module does instead
 * -----------------------------
 *  - Judges a day only against days that were actually measured.
 *  - Refuses to declare a "normal" when the baseline is too short, too sparse,
 *    or too intermittent to have one — and says which of those it hit.
 *  - Describes the move with rank ("higher than all 28 days before it") and
 *    multiples ("3.2x the typical day"). Both are exact, both are checkable by
 *    hand against the chart, and neither needs a distributional assumption.
 *  - Never prints a rarity finer than the baseline length can support.
 * ------------------------------------------------------------------------- */

/**
 * Thresholds for calling a day unusual. All are stated in units a reader can
 * check against the chart, deliberately: there is no tunable that silently
 * changes what "unusual" means in probability terms.
 */
export const ANOMALY_LIMITS = {
  /** Below this many measured days there is no defensible "normal" yet. */
  MIN_MEASURED_DAYS: 10,
  /** Measured days that actually carried activity, needed to place a median. */
  MIN_ACTIVE_DAYS: 5,
  /**
   * Above this share of idle days the series is intermittent (ads on and off)
   * rather than a steady process with a centre. An intermittent series still
   * gets described, but as "N of M days ran", never as a deviation from normal.
   */
  MAX_IDLE_SHARE: 0.5,
  /** A day must reach this multiple of the typical day to count as far above. */
  HIGH_MULTIPLE: 2,
  /** ...or fall to this multiple to count as far below. */
  LOW_MULTIPLE: 0.5,
  /**
   * A spread narrower than this share of the typical day means the series is
   * effectively flat. Flat baselines make every wobble look enormous, so the
   * multiple test carries the decision alone.
   */
  MIN_SPREAD_SHARE: 0.02,
  /**
   * Ceiling on a reported fold-change. A multiple is a ratio, so as the typical
   * day approaches zero it grows without bound: a $600 day against a $0.02
   * typical is "30000x", which is a statement about the denominator, not about
   * the day. Past this point the exact figure carries no extra meaning, so it is
   * reported as "more than 50x" and the ranking weight is clamped with it.
   */
  MAX_REPORTED_MULTIPLE: 50,
};

/** Scales a median absolute deviation onto the same footing as a standard deviation. */
const MAD_TO_SIGMA = 1.4826;

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const finiteValues = (values = []) => values.map(Number).filter(Number.isFinite);

/**
 * Percentile by linear interpolation between order statistics (the "R type 7"
 * convention, which is also what most spreadsheets use). Chosen over a
 * median±k·MAD band because quartiles are directly checkable: "half the days
 * fell between these two numbers" is a statement the reader can count off the
 * chart, with no scaling constant to take on trust.
 */
export function percentile(values = [], fraction = 0.5) {
  const sorted = finiteValues(values).sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, fraction));
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];
  const weight = position - lowerIndex;
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

/**
 * Describes what a baseline can and cannot support before any comparison is
 * made. Separating this from the comparison is the point: the honest answer to
 * "was this day unusual?" is often "this baseline cannot tell you".
 *
 * `values` must already be restricted to days that were actually measured.
 */
/**
 * Median absolute deviation, scaled to be comparable to a standard deviation.
 *
 * Returns null — never a substitute width — when the values are too few or too
 * tied to have a spread. That null is the whole point: the previous version
 * swapped in a placeholder here and kept calling the quotient sigma, which is
 * how a $620 day became a 6.5σ event. A caller that gets null must say it cannot
 * put a scale on the move, not invent one.
 */
export function medianAbsoluteDeviation(values = [], center = null) {
  const finite = finiteValues(values);
  if (finite.length < 2) return null;
  const mid = center == null ? percentile(finite, 0.5) : center;
  if (mid == null) return null;
  const raw = percentile(finite.map((value) => Math.abs(value - mid)), 0.5);
  if (raw == null || raw <= 0) return null;
  return raw * MAD_TO_SIGMA;
}

export function summarizeBaseline(values = [], { idleAtOrBelow = 0 } = {}) {
  const measured = finiteValues(values);
  // Idle means "no activity recorded", which is a magnitude test, not a sign
  // test. A refund-heavy day carries real activity and belongs in the
  // distribution; counting it as idle both loses a real observation and pushes
  // the series toward a false "intermittent" verdict.
  const active = measured.filter((value) => Math.abs(value) > idleAtOrBelow);
  const idleDays = measured.length - active.length;
  const idleShare = measured.length ? idleDays / measured.length : 1;
  const typical = percentile(active, 0.5);
  const middleLow = percentile(active, 0.25);
  const middleHigh = percentile(active, 0.75);
  const spread = typical ? (num(middleHigh) - num(middleLow)) / Math.abs(typical) : 0;

  const base = {
    measuredDays: measured.length,
    activeDays: active.length,
    idleDays,
    idleShare,
    typical,
    middleLow,
    middleHigh,
    highest: active.length ? Math.max(...active) : null,
    lowest: active.length ? Math.min(...active) : null,
    // The finest rarity n observations can demonstrate. Reporting anything
    // rarer than this is extrapolation, not measurement.
    rarityFloor: measured.length ? 1 / (measured.length + 1) : 1,
    isFlat: spread < ANOMALY_LIMITS.MIN_SPREAD_SHARE,
  };

  if (measured.length < ANOMALY_LIMITS.MIN_MEASURED_DAYS) {
    return { ...base, usable: false, limitation: 'short-history' };
  }
  // Idle share is checked before the active-day count on purpose: when both
  // apply, "it was switched off most of the time" explains the series, while
  // "there were few active days" only restates the symptom. Under the default
  // limits an intermittent series always trips this first; the active-day guard
  // below stays as the backstop if MAX_IDLE_SHARE is ever loosened.
  if (idleShare > ANOMALY_LIMITS.MAX_IDLE_SHARE) {
    return { ...base, usable: false, limitation: 'intermittent' };
  }
  if (active.length < ANOMALY_LIMITS.MIN_ACTIVE_DAYS) {
    return { ...base, usable: false, limitation: 'too-few-active-days' };
  }
  return { ...base, usable: true, limitation: '' };
}

/**
 * Compares one day against a measured baseline.
 *
 * Returns `unusual: false` whenever the baseline cannot support the claim, with
 * `limitation` naming the reason so the caller can say something true instead of
 * falling back to a fabricated number.
 */
export function assessDay(value, baselineValues = [], options = {}) {
  const observed = num(value);
  const baseline = summarizeBaseline(baselineValues, options);
  const measured = finiteValues(baselineValues);
  // Rank 1 = the highest day on record including today. Exact, distribution-free,
  // and the strongest honest statement a finite baseline can make.
  const daysAtOrAbove = measured.filter((day) => day >= observed).length;
  const daysAtOrBelow = measured.filter((day) => day <= observed).length;
  const rawMultiple = baseline.typical ? observed / baseline.typical : null;
  const multiple = rawMultiple == null || !Number.isFinite(rawMultiple)
    ? null
    : Math.min(rawMultiple, ANOMALY_LIMITS.MAX_REPORTED_MULTIPLE);
  const multipleCapped = rawMultiple != null && rawMultiple > ANOMALY_LIMITS.MAX_REPORTED_MULTIPLE;
  const direction = baseline.typical != null && observed < baseline.typical ? 'below' : 'above';
  const rankFromTop = daysAtOrAbove + 1;
  const rankFromBottom = daysAtOrBelow + 1;

  // Exact one-sided rank p under exchangeability: of the n+1 values (the baseline
  // plus this day), this day sits at this rank. Distribution-free, so it holds
  // whatever shape the series has — and it cannot go below 1/(n+1), which is
  // precisely the resolution ceiling the old sigma ignored.
  const rankP = measured.length
    ? (direction === 'above' ? rankFromTop : rankFromBottom) / (measured.length + 1)
    : null;
  // A genuine median/MAD scale, or null. Never a stand-in — and the quotient is
  // checked as well as the divisor, because a spread can be positive yet small
  // enough that the division overflows to Infinity. An infinite sigma is exactly
  // the kind of figure this module exists to stop publishing.
  const spread = medianAbsoluteDeviation(measured);
  const rawZ = spread && baseline.typical != null
    ? (observed - percentile(measured, 0.5)) / spread
    : null;
  const robustZ = Number.isFinite(rawZ) ? rawZ : null;

  const shared = {
    ...baseline,
    value: observed,
    multiple,
    multipleCapped,
    direction,
    rankFromTop,
    rankFromBottom,
    rankP,
    robustZ,
    exceedsAll: measured.length > 0 && daysAtOrAbove === 0,
    fallsBelowAll: measured.length > 0 && daysAtOrBelow === 0,
  };

  if (!baseline.usable) {
    return { ...shared, unusual: false };
  }

  // Two independent routes to "unusual", both readable off a chart:
  //  - a new extreme against a baseline long enough for that to mean something;
  //  - a large multiple of the typical day.
  // Requiring either (not both) keeps a genuine record day visible even when the
  // series is volatile enough that 2x is common.
  const isRecord = shared.exceedsAll || shared.fallsBelowAll;
  const bigMultiple = multiple != null
    && (multiple >= ANOMALY_LIMITS.HIGH_MULTIPLE || multiple <= ANOMALY_LIMITS.LOW_MULTIPLE);
  const outsideSeenRange = baseline.highest != null
    && (observed > baseline.highest || observed < baseline.lowest);

  return {
    ...shared,
    unusual: isRecord || bigMultiple || outsideSeenRange,
    // "clear" is reserved for moves that are both a record and a large multiple.
    // Everything else is "notable" — worth a look, not worth an alarm.
    strength: (isRecord && bigMultiple) ? 'clear' : 'notable',
  };
}

/** Rounds a 1-in-N rarity to a readable integer without overstating precision. */
function rarityText(rarityFloor) {
  if (!Number.isFinite(rarityFloor) || rarityFloor <= 0) return '';
  return `1-in-${Math.round(1 / rarityFloor)}`;
}

/**
 * One-line technical restatement of the plain sentence above it, for a reader who
 * wants the formal figure. It is additive: the plain-language claim never depends
 * on it, and it is omitted rather than approximated when the baseline cannot
 * carry it.
 *
 * The sigma here is a real median/MAD scale and appears only when the spread is
 * genuinely non-zero. The rank p is exact and distribution-free, and is floored
 * by the baseline length — which is why both are quoted with n.
 */
export function formalNote(assessment) {
  const { robustZ, rankP, measuredDays } = assessment || {};
  const parts = [];
  if (Number.isFinite(robustZ)) {
    parts.push(`${Math.abs(robustZ).toFixed(1)}σ from the median on a median/MAD scale`);
  }
  if (Number.isFinite(rankP)) {
    parts.push(`one-sided rank p ≈ ${rankP < 0.01 ? rankP.toFixed(3) : rankP.toFixed(2)}`);
  }
  if (!parts.length) return '';
  const flat = Number.isFinite(robustZ) ? '' : ' (spread too flat for a scale-based figure)';
  return `Formally: ${parts.join(', ')}, n = ${measuredDays}${flat}.`;
}

/**
 * Turns an assessment into the two lines the panel shows.
 *
 * Wording rules, chosen for a numerate reader who has not studied statistics:
 *  - every number is one the reader could recount from the chart;
 *  - "typical day" is the median of days that actually ran, and says so;
 *  - the ceiling on what the evidence proves is stated, not implied;
 *  - no sigma, no p-value, no "significant".
 */
export function describeDay({ assessment, label, format = (value) => String(value), date = '' }) {
  const {
    value, typical, multiple, multipleCapped, direction, measuredDays, activeDays,
    idleDays, middleLow, middleHigh, exceedsAll, fallsBelowAll, limitation,
    rarityFloor, isFlat,
  } = assessment;
  const datePrefix = date ? `${date}: ` : '';

  if (limitation === 'short-history') {
    return {
      headline: `${datePrefix}${label} ${format(value)}`,
      context: `Only ${measuredDays} day${measuredDays === 1 ? '' : 's'} of history have been measured, which is not enough to say what a normal day looks like yet.`,
    };
  }
  if (limitation === 'too-few-active-days') {
    return {
      headline: `${datePrefix}${label} ${format(value)}`,
      context: `Only ${activeDays} of the ${measuredDays} measured days carried any ${label.toLowerCase()}, so there is no steady level to compare this against.`,
    };
  }
  if (limitation === 'intermittent') {
    // The case that produced the original "$0 typical day". Say what actually
    // happened — the series was off most of the time — instead of averaging the
    // off days into a centre that never existed.
    const activeTypical = typical != null ? format(typical) : 'n/a';
    return {
      headline: `${datePrefix}${label} ${format(value)} on a day it ran`,
      context: `${label} was idle on ${idleDays} of the ${measuredDays} days before this, so there is no steady "normal" to measure against. Judged only against the ${activeDays} day${activeDays === 1 ? '' : 's'} that did run, the typical one was ${activeTypical}.`,
    };
  }

  const rankText = exceedsAll
    ? `higher than all ${measuredDays} days before it`
    : fallsBelowAll
      ? `lower than all ${measuredDays} days before it`
      : '';
  const multipleText = multiple != null && Number.isFinite(multiple) && multiple > 0
    ? `${multipleCapped ? `more than ${multiple.toFixed(0)}x` : multiple >= 1 ? `${multiple.toFixed(1)}x` : `${(1 / multiple).toFixed(1)}x below`} the typical day`
    : '';

  const headline = rankText
    ? `${datePrefix}${label} ${format(value)} was the ${direction === 'above' ? 'highest' : 'lowest'} in ${measuredDays} days`
    : multipleText
      ? `${datePrefix}${label} ${format(value)} ran ${multipleText}`
      // Neither a record nor a usable multiple (a zero day against a positive
      // baseline lands here). State the value and let the context carry the rest.
      : `${datePrefix}${label} ${format(value)} sat outside its usual level`;

  const middleRange = !isFlat && middleLow != null && middleHigh != null
    ? ` Half the days ran between ${format(middleLow)} and ${format(middleHigh)}.`
    : '';
  // The evidence ceiling. Stated plainly so a reader does not infer a stronger
  // claim than the data supports from the word "highest".
  const ceiling = rankText
    ? ` With ${measuredDays} days to compare against, "${direction === 'above' ? 'highest' : 'lowest'} so far" is the strongest claim the history supports — about ${rarityText(rarityFloor)}, not proof of a rare event.`
    : '';

  const formal = formalNote(assessment);
  return {
    headline,
    context: `Typical day ${typical != null ? format(typical) : 'n/a'}.${middleRange}${ceiling}`.trim(),
    // Kept separate so the panel can render it smaller, and so the plain-language
    // claim above never depends on it being present.
    formal,
  };
}
