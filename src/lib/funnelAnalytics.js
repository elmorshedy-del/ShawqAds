/* Funnel conversion analytics for the dashboard's Funnel tab.
 *
 * Two step-conversion rates are derived from Meta funnel actions:
 *   - IC/ATC      = checkout_initiated / add_to_cart   (add-to-carts that start checkout)
 *   - Purchase/IC = purchases / checkout_initiated     (checkouts that convert to a sale)
 *
 * Rates are VOLUME-WEIGHTED (sum of numerator / sum of denominator), so the account line
 * is the true blended conversion rather than a misleading mean-of-campaign-rates. Each
 * series is smoothed with a trailing window (numerator and denominator summed separately,
 * then divided) so day-to-day noise doesn't obscure the trend. Output is produced for the
 * whole account and per campaign, for every day since the campaign launch date.
 */

const sum = (arr) => (arr || []).reduce((acc, v) => acc + (Number(v) || 0), 0);
const round1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const ratePct = (num, den) => (den > 0 ? (num / den) * 100 : null);

function emptyDaily(n) {
  return {
    add_to_cart: new Array(n).fill(0),
    checkout_initiated: new Array(n).fill(0),
    purchases: new Array(n).fill(0),
  };
}

// Trailing-window conversion rate: for each day, sum the numerator and denominator over
// the trailing `window` days and divide. Returns the per-day rate[] plus the trailing
// denominator den[] (used to decide which points are statistically stable).
function trailing(numDaily, denDaily, window) {
  const n = numDaily.length;
  const rate = new Array(n).fill(null);
  const den = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    let numSum = 0;
    let denSum = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j += 1) {
      numSum += numDaily[j] || 0;
      denSum += denDaily[j] || 0;
    }
    den[i] = denSum;
    rate[i] = ratePct(numSum, denSum);
  }
  return { rate, den };
}

const METRICS = {
  icAtc: { num: 'checkout_initiated', den: 'add_to_cart' },
  purchaseIc: { num: 'purchases', den: 'checkout_initiated' },
};

export function buildFunnelAnalytics(rows, {
  launchDate = '2026-06-03',
  window = 7,
  minDenominator = 25,
  maxCampaignLines = 8,
} = {}) {
  const dates = [...new Set((rows || [])
    .map((r) => r && r.date)
    .filter((d) => d && (!launchDate || d >= launchDate)))].sort();
  const idx = new Map(dates.map((d, i) => [d, i]));
  const n = dates.length;

  const account = emptyDaily(n);
  const campaigns = new Map();

  for (const r of rows || []) {
    const d = r && r.date;
    if (!d || (launchDate && d < launchDate)) continue;
    const i = idx.get(d);
    if (i === undefined) continue;
    const atc = Number(r.add_to_cart) || 0;
    const ic = Number(r.checkout_initiated) || 0;
    const pur = Number(r.purchases) || 0;
    account.add_to_cart[i] += atc;
    account.checkout_initiated[i] += ic;
    account.purchases[i] += pur;
    const id = String(r.campaign_id || r.campaign_name || 'unknown');
    let c = campaigns.get(id);
    if (!c) {
      c = { id, name: r.campaign_name || r.campaign_id || 'Unknown campaign', ...emptyDaily(n) };
      campaigns.set(id, c);
    }
    if (r.campaign_name) c.name = r.campaign_name;
    c.add_to_cart[i] += atc;
    c.checkout_initiated[i] += ic;
    c.purchases[i] += pur;
  }

  function buildMetric(numKey, denKey) {
    const acc = trailing(account[numKey], account[denKey], window);
    const ranked = [...campaigns.values()]
      .map((c) => ({
        id: c.id,
        name: c.name,
        totalNum: sum(c[numKey]),
        totalDen: sum(c[denKey]),
        t: trailing(c[numKey], c[denKey], window),
      }))
      .filter((c) => c.totalDen >= minDenominator)
      .sort((a, b) => b.totalDen - a.totalDen)
      .slice(0, maxCampaignLines);

    const points = dates.map((date, i) => {
      const row = { date, account: round1(acc.rate[i]) };
      for (const c of ranked) row[c.id] = round1(c.t.rate[i]);
      return row;
    });

    let firstStable = -1;
    let lastStable = -1;
    for (let i = 0; i < n; i += 1) {
      if (acc.den[i] >= minDenominator && acc.rate[i] != null) {
        if (firstStable < 0) firstStable = i;
        lastStable = i;
      }
    }
    const current = lastStable >= 0 ? acc.rate[lastStable] : null;
    const launch = firstStable >= 0 ? acc.rate[firstStable] : null;
    const totalNum = sum(account[numKey]);
    const totalDen = sum(account[denKey]);

    return {
      points,
      campaigns: ranked.map((c) => ({ id: c.id, name: c.name })),
      summary: {
        current: round1(current),
        launch: round1(launch),
        deltaPp: current != null && launch != null ? round1(current - launch) : null,
        cumulative: round1(ratePct(totalNum, totalDen)),
        totalNum,
        totalDen,
      },
    };
  }

  return {
    dates,
    window,
    launchDate,
    icAtc: buildMetric(METRICS.icAtc.num, METRICS.icAtc.den),
    purchaseIc: buildMetric(METRICS.purchaseIc.num, METRICS.purchaseIc.den),
    hasData: n > 0 && (sum(account.add_to_cart) + sum(account.checkout_initiated)) > 0,
  };
}
