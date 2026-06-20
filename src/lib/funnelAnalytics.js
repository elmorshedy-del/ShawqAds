/* Funnel conversion analytics for the dashboard's Funnel tab.
 *
 * Two step-conversion signals:
 *   - IC/ATC      = checkout_initiated / add_to_cart    (both from Meta)
 *   - Purchase/IC = Shopify orders / checkout_initiated  (purchases from Shopify = ground
 *                   truth; IC from Meta). ONLY Shopify orders that carry Meta attribution to
 *                   a campaign count (direct UTM/match_hints + country-dominant fallback),
 *                   deduped to distinct orders. Account = all such ad-attributed orders
 *                   (union across campaigns); per-campaign = its own attributed orders.
 *
 * METHODOLOGY — why the rates are indexed rather than shown raw:
 * Meta's ATC and IC are counted on different, independently-modeled attribution bases, so
 * the raw IC/ATC ratio is not a true conditional probability and can exceed 100%. Mixing
 * Meta IC with Shopify orders adds another cross-source scale mismatch. Both effects are,
 * to first order, a stable MULTIPLICATIVE bias b on the ratio. We therefore:
 *   1. Smooth with a trailing window (sum numerator & denominator separately, then divide).
 *   2. Stabilize small samples with Empirical-Bayes shrinkage toward the account base rate:
 *        shrunk = (N + kappa*B) / (D + kappa)
 *      where B is the account pooled rate (fraction) and kappa a pseudo-count prior.
 *   3. Ground to a base of 100 by INDEXING to the account's launch-window pooled rate:
 *        index = (shrunk / B) * 100
 *      The unknown multiplicative bias b cancels in shrunk/B, so the index reflects the
 *      true RELATIVE conversion. 100 = the launch baseline; campaigns are indexed to the
 *      same account base, so they are directly comparable (110 = 10% above baseline).
 * The raw (uncorrected) rate is preserved alongside each index for transparency.
 */

const sum = (arr) => (arr || []).reduce((acc, v) => acc + (Number(v) || 0), 0);
const round1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function medianPositive(values) {
  const arr = (values || []).map(Number).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function trailingSums(daily, window) {
  const n = daily.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    let s = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j += 1) s += daily[j] || 0;
    out[i] = s;
  }
  return out;
}

// Build an indexed, shrinkage-stabilized metric for the account + each campaign.
function buildIndexedMetric({ dates, accountNum, accountDen, campaigns, window, minDenominator, maxCampaignLines, kappa }) {
  const pooledNum = sum(accountNum);
  const pooledDen = sum(accountDen);
  const base = pooledDen > 0 ? pooledNum / pooledDen : null; // fraction
  const floorDen = Math.max(5, Math.round(minDenominator / 5));
  const k = kappa == null ? Math.max(minDenominator, medianPositive(accountDen)) : kappa;

  // index series for one entity given its daily numerator/denominator
  function series(numDaily, denDaily) {
    const N = trailingSums(numDaily, window);
    const D = trailingSums(denDaily, window);
    const idx = new Array(dates.length).fill(null);
    const raw = new Array(dates.length).fill(null);
    for (let i = 0; i < dates.length; i += 1) {
      if (D[i] < floorDen || base == null || base <= 0) continue;
      raw[i] = round1((N[i] / D[i]) * 100);
      const shrunk = (N[i] + k * base) / (D[i] + k);
      idx[i] = round1((shrunk / base) * 100);
    }
    return { idx, raw, trailingDen: D };
  }

  const accountSeries = series(accountNum, accountDen);

  const ranked = (campaigns || [])
    .map((c) => ({ id: c.id, name: c.name, totalDen: sum(c.den), totalNum: sum(c.num), s: series(c.num, c.den) }))
    .filter((c) => c.totalDen >= minDenominator)
    .sort((a, b) => b.totalDen - a.totalDen)
    .slice(0, maxCampaignLines);

  const points = dates.map((date, i) => {
    const row = { date, account: accountSeries.idx[i], account__raw: accountSeries.raw[i] };
    for (const c of ranked) {
      row[c.id] = c.s.idx[i];
      row[`${c.id}__raw`] = c.s.raw[i];
    }
    return row;
  });

  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < dates.length; i += 1) {
    if (accountSeries.idx[i] != null) {
      if (firstIdx < 0) firstIdx = i;
      lastIdx = i;
    }
  }
  const currentIndex = lastIdx >= 0 ? accountSeries.idx[lastIdx] : null;
  const launchIndex = firstIdx >= 0 ? accountSeries.idx[firstIdx] : null;

  return {
    points,
    campaigns: ranked.map((c) => ({ id: c.id, name: c.name })),
    summary: {
      currentIndex,
      launchIndex,
      deltaVsBase: currentIndex != null ? round1(currentIndex - 100) : null,
      deltaSinceLaunch: currentIndex != null && launchIndex != null ? round1(currentIndex - launchIndex) : null,
      currentRaw: lastIdx >= 0 ? accountSeries.raw[lastIdx] : null,
      baseRate: round1(base == null ? null : base * 100),
      totalNum: pooledNum,
      totalDen: pooledDen,
    },
  };
}

// Attribute Shopify order_lines to campaigns (direct UTM/hint + country-dominant fallback),
// deduped to distinct orders, returned as per-campaign daily order counts aligned to `dates`.
function attributeOrders(orderLines, metaRows, dates, idx) {
  // Known campaigns + normalized-name -> id map.
  const knownIds = new Set();
  const nameToId = new Map();
  for (const r of metaRows || []) {
    if (!r) continue;
    if (r.campaign_id) {
      knownIds.add(String(r.campaign_id));
      if (r.campaign_name) nameToId.set(norm(r.campaign_name), String(r.campaign_id));
    }
  }
  // Country -> dominant campaign by spend (ambiguous if top share < 0.7).
  const byCountry = new Map();
  for (const r of metaRows || []) {
    if (!r || !r.country_code || !r.campaign_id) continue;
    const m = byCountry.get(r.country_code) || new Map();
    m.set(String(r.campaign_id), (m.get(String(r.campaign_id)) || 0) + (Number(r.spend_usd) || 0));
    byCountry.set(r.country_code, m);
  }
  const dominantByCountry = new Map();
  for (const [country, m] of byCountry.entries()) {
    const list = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const total = list.reduce((s, [, v]) => s + v, 0);
    const [topId, topSpend] = list[0] || [];
    if (topId) dominantByCountry.set(country, { id: topId, ambiguous: !total || topSpend / total < 0.7 });
  }

  function campaignForLine(line) {
    const a = line.attribution || {};
    const hintId = a.match_hints?.campaign_id ? String(a.match_hints.campaign_id) : '';
    if (hintId && knownIds.has(hintId)) return hintId;
    const hintName = norm(a.match_hints?.campaign_name || a.campaign_hint || a.utm?.utm_campaign);
    if (hintName && nameToId.has(hintName)) return nameToId.get(hintName);
    const dom = dominantByCountry.get(line.country_code);
    if (dom && !dom.ambiguous) return dom.id;
    return null;
  }

  // campaign id -> { ordersByDate: Map(date -> Set(orderKey)) }
  const perCampaign = new Map();
  const accountByDate = new Map(); // date -> Set(orderKey) attributed to ANY campaign
  for (const line of orderLines || []) {
    if (!line) continue;
    const d = line.date;
    if (!d || idx.get(d) === undefined) continue;
    const campId = campaignForLine(line);
    if (!campId) continue;
    const orderKey = String(line.order_id || line.order_name || `${d}:${line.product || ''}`);
    let aset = accountByDate.get(d);
    if (!aset) { aset = new Set(); accountByDate.set(d, aset); }
    aset.add(orderKey);
    let c = perCampaign.get(campId);
    if (!c) { c = new Map(); perCampaign.set(campId, c); }
    let set = c.get(d);
    if (!set) { set = new Set(); c.set(d, set); }
    set.add(orderKey);
  }

  const account = new Array(dates.length).fill(0);
  for (const [d, set] of accountByDate.entries()) account[idx.get(d)] = set.size;
  const perCampaignDaily = new Map();
  for (const [campId, byDate] of perCampaign.entries()) {
    const daily = new Array(dates.length).fill(0);
    for (const [d, set] of byDate.entries()) daily[idx.get(d)] = set.size;
    perCampaignDaily.set(campId, daily);
  }
  return { account, perCampaign: perCampaignDaily };
}

export function buildFunnelAnalytics(inputs = {}, {
  launchDate = '2026-06-03',
  window = 7,
  minDenominator = 25,
  maxCampaignLines = 8,
  kappa = null,
} = {}) {
  const metaRows = inputs.metaRows || [];
  const orderLines = inputs.orderLines || [];

  const dateSet = new Set();
  for (const r of metaRows) {
    if (r && r.date && (!launchDate || r.date >= launchDate)) dateSet.add(r.date);
  }
  for (const r of orderLines) {
    if (r && r.date && (!launchDate || r.date >= launchDate)) dateSet.add(r.date);
  }
  const dates = [...dateSet].sort();
  const idx = new Map(dates.map((d, i) => [d, i]));
  const n = dates.length;

  // Meta per-campaign daily ATC / IC; account = sums.
  const accAtc = new Array(n).fill(0);
  const accIc = new Array(n).fill(0);
  const campMap = new Map(); // id -> { id, name, atc[], ic[] }
  for (const r of metaRows) {
    const d = r && r.date;
    if (!d || idx.get(d) === undefined) continue;
    const i = idx.get(d);
    const atc = Number(r.add_to_cart) || 0;
    const ic = Number(r.checkout_initiated) || 0;
    accAtc[i] += atc;
    accIc[i] += ic;
    const id = String(r.campaign_id || r.campaign_name || 'unknown');
    let c = campMap.get(id);
    if (!c) { c = { id, name: r.campaign_name || r.campaign_id || 'Unknown campaign', atc: new Array(n).fill(0), ic: new Array(n).fill(0) }; campMap.set(id, c); }
    if (r.campaign_name) c.name = r.campaign_name;
    c.atc[i] += atc;
    c.ic[i] += ic;
  }

  // Purchases = only Shopify orders that Meta attributes to a campaign (ad-driven).
  // Account = distinct attributed orders across all campaigns; per-campaign = its own.
  const attributed = attributeOrders(orderLines, metaRows, dates, idx);
  const accOrders = attributed.account;
  const campOrders = attributed.perCampaign;

  const icAtcCampaigns = [...campMap.values()].map((c) => ({ id: c.id, name: c.name, num: c.ic, den: c.atc }));
  const purchaseCampaigns = [...campMap.values()].map((c) => ({
    id: c.id,
    name: c.name,
    num: campOrders.get(c.id) || new Array(n).fill(0),
    den: c.ic,
  }));

  const opts = { dates, window, minDenominator, maxCampaignLines, kappa };
  const icAtc = buildIndexedMetric({ ...opts, accountNum: accIc, accountDen: accAtc, campaigns: icAtcCampaigns });
  const purchaseIc = buildIndexedMetric({ ...opts, accountNum: accOrders, accountDen: accIc, campaigns: purchaseCampaigns });

  return {
    dates,
    window,
    launchDate,
    icAtc,
    purchaseIc,
    hasData: n > 0 && (sum(accAtc) + sum(accIc)) > 0,
  };
}
