import { canonicalCreativeName, logicalCreativeKey } from './logicalCreative.js';

const DOMINANT_COUNTRY_CAMPAIGN_SHARE = 0.7;

function shiftDate(date, days) {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mondayOfWeek(date) {
  if (!date) return '';
  const d = new Date(`${date}T12:00:00Z`);
  return shiftDate(date, -((d.getUTCDay() + 6) % 7));
}

function maxDate(rows = [], key = 'date') {
  return rows.map((row) => row?.[key] || row?.date_start || '').filter(Boolean).sort().at(-1) || '';
}
function minDate(rows = [], key = 'date') {
  return rows.map((row) => row?.[key] || row?.date_start || '').filter(Boolean).sort()[0] || '';
}
function minIso(...values) { return values.filter(Boolean).sort()[0] || ''; }
function maxIso(...values) { return values.filter(Boolean).sort().at(-1) || ''; }
function norm(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

function coverage(meta = {}, shopify = {}) {
  const metaRows = meta.account_daily_metrics?.length
    ? meta.account_daily_metrics
    : (meta.ad_daily?.length ? meta.ad_daily : (meta.ad_country_daily || []));
  const shopRows = shopify.daily || [];
  return {
    since: maxIso(minDate(metaRows), minDate(shopRows)),
    until: minIso(maxDate(metaRows), maxDate(shopRows)),
  };
}

function clipRange(range, bounds) {
  if (!range?.since || !range?.until || !bounds?.since || !bounds?.until) return null;
  const since = maxIso(range.since, bounds.since);
  const until = minIso(range.until, bounds.until);
  return since && until && since <= until ? { since, until } : null;
}

export function settledTopMoverWindows(reportingToday, bounds) {
  if (!reportingToday || !bounds?.until) return { hero: null, thisWeek: null, lastWeek: null };
  const yesterday = shiftDate(reportingToday, -1);
  const latestCompleted = minIso(yesterday, bounds.until);
  const monday = mondayOfWeek(reportingToday);
  const currentWeek = yesterday >= monday ? clipRange({ since: monday, until: yesterday }, bounds) : null;
  const priorWeek = clipRange({ since: shiftDate(monday, -7), until: shiftDate(monday, -1) }, bounds);
  return {
    hero: latestCompleted ? { since: latestCompleted, until: latestCompleted } : null,
    thisWeek: currentWeek,
    lastWeek: priorWeek,
  };
}

function inRange(date, range) {
  return Boolean(date && range?.since && range?.until && date >= range.since && date <= range.until);
}

function isEmailLine(line = {}) {
  return String(line.channel || '').toLowerCase() === 'email';
}
function isTipLine(line = {}) {
  const text = [line.product, line.title, line.name, line.family, line.subtype]
    .filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return /(^|\s)(tip|tips|gratuity)(\s|$)/.test(text);
}

/**
 * Top Movers is explicitly a paid-ads view, so a Shopify order must resolve to
 * a real Meta campaign before it can enter the ranking. Keep this aligned with
 * Conversion: direct campaign ID/name hints win; otherwise the country may own
 * the order only when one campaign has at least 70% of Meta spend there.
 */
function campaignAttributionResolver(meta, range) {
  const metaRows = (meta?.ad_daily?.length ? meta.ad_daily : (meta?.ad_country_daily || []))
    .filter((row) => inRange(row.date || row.date_start, range));
  const countryRows = (meta?.ad_country_daily || [])
    .filter((row) => inRange(row.date || row.date_start, range));

  const knownIds = new Set();
  const nameToId = new Map();
  for (const row of metaRows) {
    if (!row?.campaign_id) continue;
    const id = String(row.campaign_id);
    knownIds.add(id);
    if (row.campaign_name) nameToId.set(norm(row.campaign_name), id);
  }

  const byCountry = new Map();
  for (const row of countryRows) {
    if (!row?.country_code || !row?.campaign_id) continue;
    const country = String(row.country_code).toUpperCase();
    const campaigns = byCountry.get(country) || new Map();
    const id = String(row.campaign_id);
    campaigns.set(id, (campaigns.get(id) || 0) + Number(row.spend_usd ?? row.spend ?? 0));
    byCountry.set(country, campaigns);
  }

  const dominantByCountry = new Map();
  for (const [country, campaigns] of byCountry.entries()) {
    const list = [...campaigns.entries()].sort((a, b) => b[1] - a[1]);
    const total = list.reduce((sum, [, spend]) => sum + spend, 0);
    const [topId, topSpend] = list[0] || [];
    if (topId && total > 0 && topSpend / total >= DOMINANT_COUNTRY_CAMPAIGN_SHARE) {
      dominantByCountry.set(country, topId);
    }
  }

  return (line) => {
    const attribution = line?.attribution || {};
    const hintId = String(attribution.match_hints?.campaign_id || '').trim();
    if (hintId && knownIds.has(hintId)) return true;

    const hintName = norm(
      attribution.match_hints?.campaign_name
      || attribution.campaign_hint
      || attribution.utm?.utm_campaign,
    );
    if (hintName && nameToId.has(hintName)) return true;

    const country = String(line?.country_code || '').toUpperCase();
    return Boolean(country && dominantByCountry.has(country));
  };
}

function paidLines(meta, shopify, range) {
  const isMetaAttributed = campaignAttributionResolver(meta, range);
  return (shopify?.order_lines || []).filter((line) => (
    inRange(line.date, range)
    && !isEmailLine(line)
    && !isTipLine(line)
    && isMetaAttributed(line)
  ));
}

function countryFlag(code) {
  const cc = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '•';
  return [...cc].map((ch) => String.fromCodePoint(127397 + ch.charCodeAt(0))).join('');
}

function topProduct(lines) {
  const map = new Map();
  for (const line of lines) {
    const name = line.product || 'Unknown product';
    const row = map.get(name) || { name, category: line.family || line.subtype || 'Other', units: 0, revenue: 0 };
    row.units += Number(line.quantity || 0) || 1;
    row.revenue += Number(line.line_revenue_usd || 0);
    map.set(name, row);
  }
  return [...map.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue)[0] || null;
}

function adHint(line = {}) {
  const attribution = line.attribution || {};
  const raw = attribution.match_hints?.ad_name
    || attribution.ad_hint
    || attribution.utm?.utm_content
    || attribution.utm?.ad
    || '';
  return canonicalCreativeName(raw);
}

function topAd(meta, lines, range) {
  const metaMap = new Map();
  const metaRows = (meta?.ad_daily?.length ? meta.ad_daily : (meta?.ad_country_daily || []))
    .filter((row) => inRange(row.date || row.date_start, range));
  for (const row of metaRows) {
    const name = canonicalCreativeName(row.ad_name);
    const key = logicalCreativeKey(name);
    if (!key) continue;
    const current = metaMap.get(key) || {
      name,
      category: row.product_family || row.product_subtype || 'Uncategorized',
      spend: 0,
    };
    current.spend += Number(row.spend_usd ?? row.spend ?? 0);
    metaMap.set(key, current);
  }

  const salesMap = new Map();
  for (const line of lines) {
    const name = adHint(line);
    const key = logicalCreativeKey(name);
    if (!key) continue;

    // Top Ad means a real Meta ad, not merely an attribution/source token.
    // UTM values such as `link_in_bio` can describe where an order came from but
    // are not ad names. Only accept a Shopify hint after it resolves to an exact
    // logical creative present in Meta delivery for the same reporting window.
    // Future editors: keep source/channel reporting separate from creative ranking.
    const delivery = metaMap.get(key);
    if (!delivery) continue;

    const current = salesMap.get(key) || { name: delivery.name, orderIds: new Set(), revenue: 0 };
    const orderId = line.order_id || line.order_name || `${line.date}:${line.created_at || ''}:${key}`;
    current.orderIds.add(String(orderId));
    current.revenue += Number(line.line_revenue_usd || 0);
    salesMap.set(key, current);
  }

  const rows = [...salesMap.entries()].map(([key, sales]) => {
    const delivery = metaMap.get(key);
    const spend = Number(delivery?.spend || 0);
    return {
      name: delivery?.name || sales.name,
      category: delivery?.category || 'Uncategorized',
      sales: sales.orderIds.size,
      revenue: sales.revenue,
      spend,
      roas: spend > 0 ? sales.revenue / spend : null,
      roasBasisSpend: spend > 0 ? spend : null,
    };
  });
  return rows.sort((a, b) => b.sales - a.sales || b.revenue - a.revenue || b.spend - a.spend)[0] || null;
}

function topCountry(meta, lines, range) {
  const sales = new Map();
  for (const line of lines) {
    const code = String(line.country_code || '').toUpperCase();
    const key = code || line.country || 'Unknown';
    const row = sales.get(key) || {
      country: line.country || code || 'Unknown',
      countryCode: code,
      units: 0,
      revenue: 0,
      orderIds: new Set(),
    };
    row.units += Number(line.quantity || 0) || 1;
    row.revenue += Number(line.line_revenue_usd || 0);
    const orderId = line.order_id || line.order_name || `${line.date}:${line.created_at || ''}:${key}`;
    row.orderIds.add(String(orderId));
    sales.set(key, row);
  }

  const spend = new Map();
  for (const row of meta?.ad_country_daily || []) {
    if (!inRange(row.date || row.date_start, range)) continue;
    const code = String(row.country_code || row.country || '').toUpperCase();
    if (!code) continue;
    spend.set(code, (spend.get(code) || 0) + Number(row.spend_usd ?? row.spend ?? 0));
  }

  const rows = [...sales.values()].map((row) => {
    const countrySpend = spend.get(row.countryCode) || 0;
    return {
      flag: countryFlag(row.countryCode),
      country: row.country,
      units: row.units,
      orders: row.orderIds.size,
      revenue: row.revenue,
      spend: countrySpend,
      roas: countrySpend > 0 ? row.revenue / countrySpend : null,
    };
  });
  return rows.sort((a, b) => b.units - a.units || b.revenue - a.revenue)[0] || null;
}

export function leadersForRange(meta, shopify, range) {
  if (!range) return { product: null, ad: null, country: null };
  const lines = paidLines(meta, shopify, range);
  return {
    product: topProduct(lines),
    ad: topAd(meta, lines, range),
    country: topCountry(meta, lines, range),
  };
}

export function buildSettledTopMovers(meta, shopify, reportingToday) {
  const bounds = coverage(meta, shopify);
  const windows = settledTopMoverWindows(reportingToday, bounds);
  return {
    bounds,
    windows,
    hero: leadersForRange(meta, shopify, windows.hero),
    thisWeek: leadersForRange(meta, shopify, windows.thisWeek),
    lastWeek: leadersForRange(meta, shopify, windows.lastWeek),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

export async function loadSettledTopMovers(reportingToday) {
  const [meta, shopify] = await Promise.all([
    fetchJson('/api/data/adset-radar.json').catch(() => fetchJson('/data/adset-radar.json')),
    fetchJson('/api/data/shopify-products.json').catch(() => fetchJson('/data/shopify-products.json')),
  ]);
  return buildSettledTopMovers(meta, shopify, reportingToday);
}
