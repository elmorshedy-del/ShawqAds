import fs from 'node:fs';
import path from 'node:path';
import { productTaxonomyForName } from '../src/lib/productMapping.js';

const envPaths = [process.env.ENV_FILE, path.resolve('.env')].filter(Boolean);
for (const envPath of envPaths) {
  if (!fs.existsSync(envPath)) continue;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [k, ...rest] = line.replace(/^export\s+/, '').split('=');
    if (!process.env[k]) process.env[k] = rest.join('=').replace(/^["']|["']$/g, '');
  }
}

const token = process.env.SHAWQ_META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
const account = (process.env.SHAWQ_META_AD_ACCOUNT_ID || process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '');
const requestedSince = process.env.META_SINCE || process.env.SINCE || process.env.BACKFILL_START_DATE || '2026-06-03';
const requestedUntil = process.env.META_UNTIL || process.env.UNTIL || '';
const graphVersion = process.env.META_GRAPH_VERSION || 'v20.0';
if (!token || !account) {
  console.error('Missing SHAWQ_META_ACCESS_TOKEN or SHAWQ_META_AD_ACCOUNT_ID.');
  process.exit(1);
}

function dateInTimezone(date = new Date(), timeZone = 'UTC') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function zonedDateTimeToUnix(date, timeZone, endOfDay = false) {
  const [year, month, day] = String(date || '').split('-').map(Number);
  const hour = endOfDay ? 23 : 0;
  const minute = endOfDay ? 59 : 0;
  const second = endOfDay ? 59 : 0;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, endOfDay ? 999 : 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter
    .formatToParts(new Date(utcGuess))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, endOfDay ? 999 : 0);
  return Math.floor((utcGuess - (zonedAsUtc - utcGuess)) / 1000);
}

const adsetFields = [
  'date_start', 'date_stop', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name',
  'spend', 'impressions', 'reach', 'frequency', 'cpm', 'ctr', 'clicks',
  'inline_link_clicks', 'inline_link_click_ctr', 'outbound_clicks', 'outbound_clicks_ctr',
  'actions', 'action_values', 'purchase_roas'
].join(',');

const adFields = [
  'date_start', 'date_stop', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
  'spend', 'impressions', 'reach', 'frequency', 'cpm', 'ctr', 'clicks',
  'inline_link_clicks', 'inline_link_click_ctr', 'outbound_clicks', 'outbound_clicks_ctr',
  'actions', 'action_values', 'purchase_roas'
].join(',');

const hourlyFields = [
  'date_start', 'date_stop', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name',
  'spend', 'impressions',
].join(',');

/**
 * Meta error codes that mean "you are going too fast", as opposed to "this
 * request is wrong". Only these are worth retrying: 4 and 17 are the app- and
 * user-level call limits, 613 is the per-endpoint limit, and the 80000 block is
 * the business-use-case limit that ad accounts hit during a wide backfill.
 */
const META_THROTTLE_CODES = new Set([4, 17, 613, 80000, 80001, 80002, 80003, 80004]);
/**
 * Codes Meta returns for its own transient failures rather than for anything
 * wrong with the request. Code 1 ("An unknown error occurred", subcode 99) and
 * code 2 ("temporary service error") are what a heavily-throttled ad account
 * gets on an insights call once it stops being told plainly that it is
 * throttled. Treating them as permanent is what killed the whole fetch and left
 * two months of stale data on the dashboard.
 */
const META_TRANSIENT_CODES = new Set([1, 2]);
const META_RETRY_ATTEMPTS = 6;
const META_RETRY_BASE_MS = 5000;
/** Backoff ceiling — Meta's account limits clear in minutes, not seconds. */
const META_RETRY_MAX_MS = 120000;
/**
 * Only objects still switched on are worth pulling. Paused, archived and deleted
 * campaigns cannot pace against a budget today, and on a long-lived account they
 * are the bulk of the edge — fetching them is what drove the account into the
 * "too many calls" limit that left the pacing panel empty.
 */
const PACING_EFFECTIVE_STATUSES = ['ACTIVE'];

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function parseMetaError(text) {
  try {
    return JSON.parse(text)?.error || null;
  } catch {
    return null;
  }
}

/** Operator-facing summary of a Meta failure — never the raw JSON envelope. */
function describeMetaError(error) {
  if (!error) return '';
  if (META_THROTTLE_CODES.has(Number(error.code))) {
    return 'Meta is rate-limiting this ad account. Budget pacing will refresh on the next run.';
  }
  if (Number(error.code) === 190) {
    return 'The Meta access token has expired or been revoked. Reconnect the ad account.';
  }
  return error.error_user_msg || error.message || 'Meta did not return budget data.';
}

async function graphGet(url) {
  let lastError = null;
  for (let attempt = 0; attempt < META_RETRY_ATTEMPTS; attempt += 1) {
    const res = await fetch(url);
    const text = await res.text();
    if (res.ok) return JSON.parse(text);

    const error = parseMetaError(text);
    const code = Number(error?.code);
    // Retry anything that is Meta being busy rather than the request being
    // wrong: an explicit throttle code, a 429, one of Meta's own transient
    // codes, or any 5xx. A 400 with a real validation message still fails fast.
    const retryable = res.status === 429
      || res.status >= 500
      || META_THROTTLE_CODES.has(code)
      || META_TRANSIENT_CODES.has(code);
    lastError = Object.assign(
      new Error(`Meta API ${res.status}: ${describeMetaError(error) || text.slice(0, 300)}`),
      { metaError: error, status: res.status, throttled: retryable },
    );
    if (!retryable || attempt === META_RETRY_ATTEMPTS - 1) throw lastError;
    const waitMs = Math.min(META_RETRY_MAX_MS, META_RETRY_BASE_MS * (2 ** attempt));
    console.warn(`Meta ${res.status}${Number.isFinite(code) ? ` (code ${code})` : ''}; retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${META_RETRY_ATTEMPTS - 1}).`);
    await sleep(waitMs);
  }
  throw lastError;
}

/**
 * `effectiveStatuses` filters server-side so Meta never builds or paginates the
 * turned-off objects. Filtering after the fetch would still pay the API cost.
 */
async function getAccountEdge(edge, fields, { effectiveStatuses = null } = {}) {
  const base = new URL(`https://graph.facebook.com/${graphVersion}/act_${account}/${edge}`);
  base.searchParams.set('access_token', token);
  base.searchParams.set('limit', '500');
  base.searchParams.set('fields', fields);
  if (effectiveStatuses?.length) {
    base.searchParams.set('effective_status', JSON.stringify(effectiveStatuses));
  }
  let url = base.toString();
  const rows = [];
  while (url) {
    const data = await graphGet(url);
    rows.push(...(data.data || []));
    url = data.paging?.next || null;
  }
  return rows;
}

async function getAccountMetadata() {
  const base = new URL(`https://graph.facebook.com/${graphVersion}/act_${account}`);
  base.searchParams.set('access_token', token);
  base.searchParams.set('fields', 'currency,account_status,name,timezone_id,timezone_name,timezone_offset_hours_utc');
  try {
    return await graphGet(base.toString());
  } catch (error) {
    console.warn(`Could not fetch account metadata: ${error.message}`);
    return { currency: process.env.META_ACCOUNT_CURRENCY || 'TRY' };
  }
}

const fxCache = new Map();
function parseFxPayload(data, toCurrency) {
  const to = String(toCurrency || 'USD').toUpperCase();
  return {
    rate: Number(data?.rate ?? data?.rates?.[to] ?? 0),
    rate_date: data?.date || '',
  };
}

async function fxRateInfo(date, fromCurrency, toCurrency) {
  const from = String(fromCurrency || 'USD').toUpperCase();
  const to = String(toCurrency || 'USD').toUpperCase();
  if (from === to) {
    return {
      rate: 1,
      provider: 'identity',
      source: 'same_currency',
      requested_date: date,
      rate_date: date,
      from,
      to,
    };
  }
  const key = `${date}:${from}:${to}`;
  if (fxCache.has(key)) return fxCache.get(key);
  const urls = [
    { source: 'frankfurter_v2_daily', url: `https://api.frankfurter.dev/v2/rate/${from}/${to}?date=${date}` },
    { source: 'frankfurter_v2_latest_fallback', url: `https://api.frankfurter.dev/v2/rate/${from}/${to}` },
    { source: 'frankfurter_v1_daily_fallback', url: `https://api.frankfurter.app/${date}?from=${from}&to=${to}` },
    { source: 'frankfurter_v1_latest_fallback', url: `https://api.frankfurter.app/latest?from=${from}&to=${to}` },
  ];
  for (const { source, url } of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const { rate, rate_date } = parseFxPayload(data, to);
      if (rate > 0) {
        const info = {
          rate,
          provider: 'Frankfurter',
          source,
          requested_date: date,
          rate_date: rate_date || (source.includes('latest') ? 'latest' : date),
          from,
          to,
        };
        fxCache.set(key, info);
        return info;
      }
    } catch {}
  }
  console.warn(`Could not fetch FX rate ${from}->${to} for ${date}; using 1.`);
  const fallback = {
    rate: 1,
    provider: 'fallback',
    source: 'identity_after_fx_failure',
    requested_date: date,
    rate_date: date,
    from,
    to,
  };
  fxCache.set(key, fallback);
  return fallback;
}

async function fxContext(date, fromCurrency) {
  const [usd, tryRate] = await Promise.all([
    fxRateInfo(date, fromCurrency, 'USD'),
    fxRateInfo(date, fromCurrency, 'TRY'),
  ]);
  return {
    fx_to_usd: usd.rate,
    fx_to_usd_provider: usd.provider,
    fx_to_usd_source: usd.source,
    fx_to_usd_requested_date: usd.requested_date,
    fx_to_usd_rate_date: usd.rate_date,
    fx_to_try: tryRate.rate,
    fx_to_try_provider: tryRate.provider,
    fx_to_try_source: tryRate.source,
    fx_to_try_requested_date: tryRate.requested_date,
    fx_to_try_rate_date: tryRate.rate_date,
  };
}

async function getInsights({ level, fields, start, end, breakdowns, timeIncrement = '1' }) {
  const base = new URL(`https://graph.facebook.com/${graphVersion}/act_${account}/insights`);
  base.searchParams.set('access_token', token);
  base.searchParams.set('level', level);
  base.searchParams.set('time_increment', timeIncrement);
  base.searchParams.set('limit', '500');
  base.searchParams.set('fields', fields);
  if (breakdowns) base.searchParams.set('breakdowns', breakdowns);
  base.searchParams.set('time_range', JSON.stringify({ since: start, until: end }));
  let url = base.toString();
  const rows = [];
  while (url) {
    const data = await graphGet(url);
    rows.push(...(data.data || []));
    url = data.paging?.next || null;
  }
  return rows;
}

async function getObjectInsights({ objectId, level, fields, start, end, breakdowns }) {
  const base = new URL(`https://graph.facebook.com/${graphVersion}/${objectId}/insights`);
  base.searchParams.set('access_token', token);
  base.searchParams.set('level', level);
  base.searchParams.set('time_increment', '1');
  base.searchParams.set('limit', '500');
  base.searchParams.set('fields', fields);
  if (breakdowns) base.searchParams.set('breakdowns', breakdowns);
  base.searchParams.set('time_range', JSON.stringify({ since: start, until: end }));
  let url = base.toString();
  const rows = [];
  while (url) {
    const data = await graphGet(url);
    rows.push(...(data.data || []));
    url = data.paging?.next || null;
  }
  return rows;
}

async function getActivities(start, end) {
  const base = new URL(`https://graph.facebook.com/${graphVersion}/act_${account}/activities`);
  base.searchParams.set('access_token', token);
  base.searchParams.set('limit', '500');
  base.searchParams.set('fields', 'event_time,event_type,translated_event_type,object_id,object_name,object_type,extra_data');
  base.searchParams.set('since', zonedDateTimeToUnix(start, metaReportingTimezone, false));
  base.searchParams.set('until', zonedDateTimeToUnix(end, metaReportingTimezone, true));
  let url = base.toString();
  const rows = [];
  while (url) {
    const data = await graphGet(url);
    rows.push(...(data.data || []));
    url = data.paging?.next || null;
  }
  return rows;
}

function actionLookup(actions = []) {
  const map = new Map();
  for (const item of actions || []) map.set(String(item.action_type || '').toLowerCase(), Number(item.value || 0));
  return map;
}

function metricFromActions(actions = [], exact = [], includes = []) {
  const map = actionLookup(actions);
  for (const key of exact) {
    const value = map.get(key.toLowerCase());
    if (Number(value || 0) > 0) return value;
  }
  for (const [key, value] of map.entries()) {
    if (includes.some((part) => key.includes(part))) return Number(value || 0);
  }
  return 0;
}

function numericMetric(value) {
  if (Array.isArray(value)) return metricFromActions(value, ['outbound_click', 'link_click'], ['outbound', 'link_click']);
  return Number(value || 0);
}

function clickThroughCtr({ impressions, inlineLinkClicks, inlineLinkCtr, outboundCtr, ctrAll }) {
  const inlineCtr = Number(inlineLinkCtr || 0);
  if (inlineCtr > 0) return { ctr: inlineCtr, source: 'inline_link_click_ctr' };
  const outbound = numericMetric(outboundCtr);
  if (outbound > 0) return { ctr: outbound, source: 'outbound_clicks_ctr' };
  if (impressions && inlineLinkClicks) return { ctr: inlineLinkClicks / impressions * 100, source: 'computed_inline_link_clicks' };
  return { ctr: Number(ctrAll || 0), source: 'ctr_all_fallback' };
}

function countryName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

async function normalizeInsightRow(r, accountCurrency) {
  const date = r.date_start;
  const spend = Number(r.spend || 0);
  const impressions = Number(r.impressions || 0);
  const clicks = Number(r.clicks || 0);
  const reach = Number(r.reach || 0);
  const fx = await fxContext(date, accountCurrency);
  const purchaseValue = metricFromActions(r.action_values, ['offsite_conversion.fb_pixel_purchase', 'omni_purchase', 'purchase'], ['purchase']);
  const purchases = metricFromActions(r.actions, ['offsite_conversion.fb_pixel_purchase', 'omni_purchase', 'purchase'], ['purchase']);
  const addToCart = metricFromActions(r.actions, ['offsite_conversion.fb_pixel_add_to_cart', 'omni_add_to_cart', 'add_to_cart'], ['add_to_cart']);
  const checkoutInitiated = metricFromActions(r.actions, ['offsite_conversion.fb_pixel_initiate_checkout', 'omni_initiated_checkout', 'initiate_checkout', 'initiated_checkout'], ['initiate_checkout', 'initiated_checkout']);
  const linkClicks = metricFromActions(r.actions, ['link_click'], ['link_click']);
  const inlineLinkClicks = Number(r.inline_link_clicks || linkClicks || 0);
  const outboundClicks = numericMetric(r.outbound_clicks);
  const ctrAll = Number(r.ctr || (impressions ? clicks / impressions * 100 : 0));
  const clickCtr = clickThroughCtr({
    impressions,
    inlineLinkClicks,
    inlineLinkCtr: r.inline_link_click_ctr,
    outboundCtr: r.outbound_clicks_ctr,
    ctrAll,
  });
  const product = productTaxonomyForName(r.ad_name || r.adset_name || r.campaign_name);
  const fx_to_usd = fx.fx_to_usd;
  const fx_to_try = fx.fx_to_try;
  const spend_usd = spend * fx_to_usd;
  const spend_try = spend * fx_to_try;
  const purchase_value_usd = purchaseValue * fx_to_usd;
  const purchase_value_try = purchaseValue * fx_to_try;
  return {
    date,
    country_code: r.country || '',
    country: r.country ? countryName(r.country) : '',
    campaign_id: r.campaign_id || '',
    campaign_name: r.campaign_name || '',
    adset_id: r.adset_id || '',
    adset_name: r.adset_name || '',
    ad_id: r.ad_id || '',
    ad_name: r.ad_name || '',
    product_family: product.family,
    product_subtype: product.subtype,
    spend,
    spend_currency: accountCurrency,
    ...fx,
    spend_usd,
    spend_try,
    impressions,
    reach,
    frequency: Number(r.frequency || (reach ? impressions / reach : 0)),
    clicks_all: clicks,
    link_clicks: inlineLinkClicks,
    outbound_clicks: outboundClicks,
    ctr_all: ctrAll,
    ctr: clickCtr.ctr,
    ctr_source: clickCtr.source,
    cpm: Number(r.cpm || (impressions ? spend / impressions * 1000 : 0)),
    cpm_usd: impressions ? spend_usd / impressions * 1000 : 0,
    cpm_try: impressions ? spend_try / impressions * 1000 : 0,
    purchases,
    add_to_cart: addToCart,
    checkout_initiated: checkoutInitiated,
    purchase_value: purchaseValue,
    purchase_value_usd,
    purchase_value_try,
    roas: spend ? purchaseValue / spend : 0,
    cpa_usd: purchases ? spend_usd / purchases : 0,
    cpa_try: purchases ? spend_try / purchases : 0,
  };
}

function emptyAggregate(extra = {}) {
  return {
    ...extra,
    spend: 0,
    spend_usd: 0,
    spend_try: 0,
    impressions: 0,
    reach: 0,
    clicks_all: 0,
    link_clicks: 0,
    outbound_clicks: 0,
    purchases: 0,
    add_to_cart: 0,
    checkout_initiated: 0,
    purchase_value: 0,
    purchase_value_usd: 0,
    purchase_value_try: 0,
    active_days_set: new Set(),
    countries_set: new Set(),
    ads_set: new Set(),
    adsets_set: new Set(),
  };
}

function addToAggregate(target, r) {
  for (const key of ['spend', 'spend_usd', 'spend_try', 'impressions', 'reach', 'clicks_all', 'link_clicks', 'outbound_clicks', 'purchases', 'add_to_cart', 'checkout_initiated', 'purchase_value', 'purchase_value_usd', 'purchase_value_try']) {
    target[key] += Number(r[key] || 0);
  }
  if (Number(r.spend || 0) > 0) target.active_days_set.add(r.date);
  if (r.country_code) target.countries_set.add(r.country_code);
  if (r.ad_id) target.ads_set.add(r.ad_id);
  if (r.adset_id) target.adsets_set.add(r.adset_id);
}

function finalizeAggregate(row) {
  const out = { ...row };
  out.active_days = out.active_days_set?.size || 0;
  out.country_count = out.countries_set?.size || 0;
  out.ad_count = out.ads_set?.size || 0;
  out.adset_count = out.adsets_set?.size || 0;
  delete out.active_days_set;
  delete out.countries_set;
  delete out.ads_set;
  delete out.adsets_set;
  out.ctr_all = out.impressions ? out.clicks_all / out.impressions * 100 : 0;
  out.ctr = out.impressions ? out.link_clicks / out.impressions * 100 : 0;
  out.ctr_source = 'aggregate_link_clicks';
  out.cpm_usd = out.impressions ? out.spend_usd / out.impressions * 1000 : 0;
  out.cpm_try = out.impressions ? out.spend_try / out.impressions * 1000 : 0;
  out.reach_per_dollar = out.spend_usd ? out.reach / out.spend_usd : 0;
  out.cpa_usd = out.purchases ? out.spend_usd / out.purchases : 0;
  out.cpa_try = out.purchases ? out.spend_try / out.purchases : 0;
  out.roas = out.spend ? out.purchase_value / out.spend : 0;
  out.atc_rate = out.clicks_all ? out.add_to_cart / out.clicks_all * 100 : 0;
  out.checkout_rate = out.clicks_all ? out.checkout_initiated / out.clicks_all * 100 : 0;
  out.purchase_rate = out.clicks_all ? out.purchases / out.clicks_all * 100 : 0;
  return out;
}

function aggregateBy(rows, keyFn, seedFn) {
  const map = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    if (!key) continue;
    if (!map.has(key)) map.set(key, emptyAggregate(seedFn(r)));
    addToAggregate(map.get(key), r);
  }
  return [...map.values()].map(finalizeAggregate);
}

function fxMetaFromRow(row = {}) {
  return {
    fx_to_usd: row.fx_to_usd,
    fx_to_usd_provider: row.fx_to_usd_provider,
    fx_to_usd_source: row.fx_to_usd_source,
    fx_to_usd_requested_date: row.fx_to_usd_requested_date,
    fx_to_usd_rate_date: row.fx_to_usd_rate_date,
    fx_to_try: row.fx_to_try,
    fx_to_try_provider: row.fx_to_try_provider,
    fx_to_try_source: row.fx_to_try_source,
    fx_to_try_requested_date: row.fx_to_try_requested_date,
    fx_to_try_rate_date: row.fx_to_try_rate_date,
  };
}

function attachFxMetaByDate(rows, sourceRows) {
  const byDate = new Map();
  for (const row of sourceRows || []) if (row.date && !byDate.has(row.date)) byDate.set(row.date, fxMetaFromRow(row));
  return rows.map((row) => ({ ...row, ...(byDate.get(row.date) || {}) }));
}

function aggregateNormalizedDeliveryByDate(rows = []) {
  const byDate = new Map();
  for (const row of rows) {
    const cur = byDate.get(row.date) || {
      date: row.date,
      spend: 0,
      spend_usd: 0,
      spend_try: 0,
      impressions: 0,
      reach: 0,
      purchases: 0,
      purchase_value: 0,
      purchase_value_usd: 0,
      purchase_value_try: 0,
    };
    cur.spend += Number(row.spend || 0);
    cur.spend_usd += Number(row.spend_usd || 0);
    cur.spend_try += Number(row.spend_try || 0);
    cur.impressions += Number(row.impressions || 0);
    cur.reach += Number(row.reach || 0);
    cur.purchases += Number(row.purchases || 0);
    cur.purchase_value += Number(row.purchase_value || 0);
    cur.purchase_value_usd += Number(row.purchase_value_usd || 0);
    cur.purchase_value_try += Number(row.purchase_value_try || 0);
    byDate.set(row.date, cur);
  }
  return attachFxMetaByDate([...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      ...row,
      frequency: row.reach ? row.impressions / row.reach : 0,
      cpm: row.impressions ? row.spend / row.impressions * 1000 : 0,
      cpm_usd: row.impressions ? row.spend_usd / row.impressions * 1000 : 0,
      cpm_try: row.impressions ? row.spend_try / row.impressions * 1000 : 0,
      reach_per_dollar: row.spend_usd ? row.reach / row.spend_usd : 0,
      roas: row.spend ? row.purchase_value / row.spend : 0,
    })), rows);
}

async function campaignCountryDelivery({ campaignId, since: start, until: end, country = 'US' }) {
  const raw = await getObjectInsights({ objectId: campaignId, level: 'adset', fields: adsetFields, start, end, breakdowns: 'country' });
  const normalized = [];
  for (const row of raw) {
    if (country && row.country !== country) continue;
    normalized.push(await normalizeInsightRow(row, accountCurrency));
  }
  return aggregateNormalizedDeliveryByDate(normalized).filter((row) => Number(row.impressions || 0) > 0 || Number(row.spend || 0) > 0 || Number(row.purchases || 0) > 0);
}

function activePeriod(rows = [], fallback = {}) {
  const active = rows.filter((row) => Number(row.spend || 0) > 0 || Number(row.impressions || 0) > 0 || Number(row.reach || 0) > 0 || Number(row.purchases || 0) > 0);
  return {
    since: active[0]?.date || fallback.since || '',
    until: active[active.length - 1]?.date || fallback.until || '',
    days: active.length,
  };
}

function isUsaRow(r) {
  const text = `${r.campaign_name || ''} ${r.adset_name || ''}`;
  return /\bUSA\b|\bUS\b|_US|US_/i.test(text) && !/AUS|Australia/i.test(text);
}

const accountMeta = await getAccountMetadata();
const accountCurrency = String(accountMeta.currency || process.env.META_ACCOUNT_CURRENCY || 'TRY').toUpperCase();
const metaReportingTimezone = process.env.SHAWQ_META_REPORTING_TIMEZONE
  || process.env.META_REPORTING_TIMEZONE
  || accountMeta.timezone_name
  || 'Europe/Istanbul';
const since = requestedSince;
const until = requestedUntil || dateInTimezone(new Date(), metaReportingTimezone);
const previousOutPath = path.resolve('public/data/adset-radar.json');
let previousAdsetChanges = [];
try {
  if (fs.existsSync(previousOutPath)) previousAdsetChanges = (JSON.parse(fs.readFileSync(previousOutPath, 'utf8')).adset_changes || []).filter((c) => c.date >= since && c.date <= until);
} catch {}

let campaignBudgetObjects = [];
let adsetBudgetObjects = [];
let pacingMetadataError = '';
try {
  // Sequential, not Promise.all: two wide edge reads fired together against an
  // account that is already near its call limit make throttling more likely, and
  // a rejection in either half of a Promise.all discards the half that succeeded.
  campaignBudgetObjects = await getAccountEdge(
    'campaigns',
    'id,name,status,effective_status,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time,updated_time',
    { effectiveStatuses: PACING_EFFECTIVE_STATUSES },
  );
  adsetBudgetObjects = await getAccountEdge(
    'adsets',
    'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,budget_remaining,start_time,end_time,updated_time',
    { effectiveStatuses: PACING_EFFECTIVE_STATUSES },
  );
} catch (error) {
  pacingMetadataError = describeMetaError(error.metaError) || error.message;
  console.warn(`Could not fetch Meta budget metadata: ${error.message}`);
}

const currentAdsetRows = await getInsights({ level: 'adset', fields: adsetFields, start: since, end: until });
const marchAdsetRows = await getInsights({ level: 'adset', fields: adsetFields, start: '2026-03-01', end: '2026-03-31' });
const currentAdsetCountryRows = await getInsights({ level: 'adset', fields: adsetFields, start: since, end: until, breakdowns: 'country' });
const marchAdsetCountryRows = await getInsights({ level: 'adset', fields: adsetFields, start: '2026-03-01', end: '2026-03-31', breakdowns: 'country' });
const adDailyRawRows = await getInsights({ level: 'ad', fields: adFields, start: since, end: until });
const adDaily = [];
for (const row of adDailyRawRows) adDaily.push(await normalizeInsightRow(row, accountCurrency));
const adCountryRawRows = await getInsights({ level: 'ad', fields: adFields, start: since, end: until, breakdowns: 'country' });
const adCountryDaily = [];
for (const row of adCountryRawRows) adCountryDaily.push(await normalizeInsightRow(row, accountCurrency));

const pacingLookbackDays = Math.max(3, Math.min(14, Number(process.env.PACING_BASELINE_DAYS || 7)));
const pacingHourlyRaw = [];
for (let offset = pacingLookbackDays; offset >= 0; offset -= 1) {
  const day = new Date(`${until}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - offset);
  const date = day.toISOString().slice(0, 10);
  try {
    pacingHourlyRaw.push(...await getInsights({
      level: 'adset',
      fields: hourlyFields,
      start: date,
      end: date,
      breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
    }));
  } catch (error) {
    console.warn(`Could not fetch hourly Meta pacing for ${date}: ${error.message}`);
  }
}

const deliveryComparisonConfig = {
  historical: {
    label: 'Testing_USA_ABO',
    campaign_id: '120238099120200138',
    requested_since: '2026-02-23',
    requested_until: '2026-04-12',
  },
  current: {
    label: 'USA_CBO launch',
    campaign_id: '120243127929760138',
    requested_since: process.env.USA_LAUNCH_START || '2026-06-06',
    requested_until: until,
  },
};

let deliveryComparison = {
  ok: false,
  error: '',
  country_code: 'US',
  country: 'United States',
  metric_note: 'Delivery metrics are from Meta. The dashboard overlays Shopify-derived sales from the Shopify comparison export.',
  historical: { ...deliveryComparisonConfig.historical, period: { since: '', until: '', days: 0 }, rows: [] },
  current: { ...deliveryComparisonConfig.current, period: { since: '', until: '', days: 0 }, rows: [] },
};
try {
  const [historicalRows, currentRows] = await Promise.all([
    campaignCountryDelivery({
      campaignId: deliveryComparisonConfig.historical.campaign_id,
      since: deliveryComparisonConfig.historical.requested_since,
      until: deliveryComparisonConfig.historical.requested_until,
      country: 'US',
    }),
    campaignCountryDelivery({
      campaignId: deliveryComparisonConfig.current.campaign_id,
      since: deliveryComparisonConfig.current.requested_since,
      until: deliveryComparisonConfig.current.requested_until,
      country: 'US',
    }),
  ]);
  deliveryComparison = {
    ...deliveryComparison,
    ok: true,
    historical: {
      ...deliveryComparisonConfig.historical,
      period: activePeriod(historicalRows, { since: deliveryComparisonConfig.historical.requested_since, until: deliveryComparisonConfig.historical.requested_until }),
      rows: historicalRows,
    },
    current: {
      ...deliveryComparisonConfig.current,
      period: activePeriod(currentRows, { since: deliveryComparisonConfig.current.requested_since, until: deliveryComparisonConfig.current.requested_until }),
      rows: currentRows,
    },
  };
} catch (error) {
  deliveryComparison = { ...deliveryComparison, error: error.message };
  console.warn(`Could not fetch USA_ABO delivery comparison: ${error.message}`);
}

const usaRows = currentAdsetCountryRows.filter((r) => r.country === 'US');
const usaMarchRows = marchAdsetCountryRows.filter((r) => r.country === 'US');
const byAdset = new Map();
for (const r of usaRows) {
  const adset = byAdset.get(r.adset_id) || { adset_id: r.adset_id, adset_name: r.adset_name, campaign_id: r.campaign_id, campaign_name: r.campaign_name, rows: [] };
  const impressions = Number(r.impressions || 0);
  const reach = Number(r.reach || 0);
  const spend = Number(r.spend || 0);
  const fx = await fxContext(r.date_start, accountCurrency);
  const fx_to_usd = fx.fx_to_usd;
  const fx_to_try = fx.fx_to_try;
  const spend_usd = spend * fx_to_usd;
  const spend_try = spend * fx_to_try;
  adset.rows.push({
    date: r.date_start,
    spend,
    spend_currency: accountCurrency,
    ...fx,
    spend_usd,
    spend_try,
    impressions,
    reach,
    frequency: Number(r.frequency || (reach ? impressions / reach : 0)),
    cpm: Number(r.cpm || (impressions ? spend / impressions * 1000 : 0)),
    cpm_usd: impressions ? spend_usd / impressions * 1000 : 0,
    cpm_try: impressions ? spend_try / impressions * 1000 : 0,
    reach_per_dollar: spend_usd ? reach / spend_usd : 0,
  });
  byAdset.set(r.adset_id, adset);
}
for (const adset of byAdset.values()) adset.rows.sort((a, b) => a.date.localeCompare(b.date));

const avg = (arr, key) => arr.length ? arr.reduce((a, r) => a + Number(r[key] || 0), 0) / arr.length : 0;
async function aggregateAdsetByDate(rows) {
  const byDate = new Map();
  for (const r of rows) {
    const cur = byDate.get(r.date_start) || { date: r.date_start, spend: 0, spend_usd: 0, spend_try: 0, impressions: 0, reach: 0, fx: null };
    const spend = Number(r.spend || 0);
    const fx = await fxContext(r.date_start, accountCurrency);
    const fx_to_usd = fx.fx_to_usd;
    const fx_to_try = fx.fx_to_try;
    cur.spend += spend;
    cur.spend_usd += spend * fx_to_usd;
    cur.spend_try += spend * fx_to_try;
    cur.impressions += Number(r.impressions || 0);
    cur.reach += Number(r.reach || 0);
    cur.fx = cur.fx || fx;
    byDate.set(r.date_start, cur);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({
    ...r,
    ...(r.fx || {}),
    fx: undefined,
    spend_currency: accountCurrency,
    frequency: r.reach ? r.impressions / r.reach : 0,
    cpm: r.impressions ? r.spend / r.impressions * 1000 : 0,
    cpm_usd: r.impressions ? r.spend_usd / r.impressions * 1000 : 0,
    cpm_try: r.impressions ? r.spend_try / r.impressions * 1000 : 0,
    reach_per_dollar: r.spend_usd ? r.reach / r.spend_usd : 0,
  }));
}
const dailyMetrics = await aggregateAdsetByDate(usaRows);
const dailyMarch = await aggregateAdsetByDate(usaMarchRows);

let activities = [];
let activitiesFailed = false;
try {
  activities = await getActivities(since, until);
} catch (error) {
  activitiesFailed = true;
  console.warn(`Could not fetch Meta activities: ${error.message}`);
}
const adsetIds = new Set([...byAdset.keys()]);
const adsetChanges = activities
  .filter((a) => {
    const eventType = String(a.event_type || '');
    const objectId = String(a.object_id || '');
    const objectText = `${a.object_type || ''} ${a.object_name || ''}`;
    return adsetIds.has(objectId) || /ad[_ ]?set/i.test(eventType) || /ad.?set/i.test(objectText);
  })
  .map((a) => {
    const isBudgetChange = /budget|bid_amount|daily_budget|lifetime_budget/i.test(`${a.event_type || ''} ${a.translated_event_type || ''}`);
    return {
      date: String(a.event_time || '').slice(0, 10),
      adset_id: String(a.object_id || ''),
      label: a.translated_event_type || a.event_type || 'Ad set edit',
      object_name: a.object_name || '',
      event_type: a.event_type || '',
      raw_object_type: a.object_type || '',
      is_budget_change: isBudgetChange,
      event_category: isBudgetChange ? 'budget' : 'adset_edit',
    };
  })
  .filter((a) => a.date);
const finalAdsetChanges = activitiesFailed && previousAdsetChanges.length ? previousAdsetChanges : adsetChanges;

const adMetricRows = adDaily.length ? adDaily : adCountryDaily;
const allAdsets = aggregateBy(adMetricRows, (r) => r.adset_id, (r) => ({ adset_id: r.adset_id, adset_name: r.adset_name, campaign_id: r.campaign_id, campaign_name: r.campaign_name }))
  .sort((a, b) => b.spend_usd - a.spend_usd);
const accountDailyMetrics = attachFxMetaByDate(aggregateBy(adMetricRows, (r) => r.date, (r) => ({ date: r.date })), adMetricRows)
  .sort((a, b) => a.date.localeCompare(b.date));
const ads = aggregateBy(adMetricRows, (r) => r.ad_id, (r) => ({ ad_id: r.ad_id, ad_name: r.ad_name, adset_id: r.adset_id, adset_name: r.adset_name, campaign_id: r.campaign_id, campaign_name: r.campaign_name, product_family: r.product_family, product_subtype: r.product_subtype }))
  .sort((a, b) => b.purchases - a.purchases || b.purchase_value_usd - a.purchase_value_usd || b.spend_usd - a.spend_usd);
const countries = aggregateBy(adCountryDaily, (r) => r.country_code, (r) => ({ country_code: r.country_code, country: r.country }))
  .sort((a, b) => b.purchase_value_usd - a.purchase_value_usd || b.purchases - a.purchases || b.spend_usd - a.spend_usd);
const productFamilies = aggregateBy(adMetricRows, (r) => r.product_family, (r) => ({ product_family: r.product_family }))
  .sort((a, b) => b.purchases - a.purchases || b.purchase_value_usd - a.purchase_value_usd || b.spend_usd - a.spend_usd);
const productSubtypes = aggregateBy(adMetricRows, (r) => `${r.product_family}::${r.product_subtype}`, (r) => ({ product_family: r.product_family, product_subtype: r.product_subtype }))
  .sort((a, b) => b.purchases - a.purchases || b.purchase_value_usd - a.purchase_value_usd || b.spend_usd - a.spend_usd);
const fxRates = [...new Map(adMetricRows.map((r) => [r.date, {
  date: r.date,
  account_currency: accountCurrency,
  ...fxMetaFromRow(r),
}])).values()].sort((a, b) => a.date.localeCompare(b.date));

const budgetFx = await fxContext(until, accountCurrency);
const campaignNameById = new Map(
  campaignBudgetObjects.map((campaign) => [String(campaign.id), campaign.name || String(campaign.id)]),
);
const amountFromMinorUnits = (value) => Number(value || 0) / 100;
const targetFromObject = (object, level) => {
  const lifetime = amountFromMinorUnits(object.lifetime_budget);
  const daily = amountFromMinorUnits(object.daily_budget);
  const budgetType = lifetime > 0 ? 'lifetime' : daily > 0 ? 'daily' : '';
  if (!budgetType) return null;
  const budgetAccount = budgetType === 'lifetime' ? lifetime : daily;
  const campaignId = String(level === 'campaign' ? object.id : object.campaign_id || '');
  const adsetId = level === 'adset' ? String(object.id) : '';
  const campaignName = campaignNameById.get(campaignId) || campaignId;
  return {
    id: `${level}:${object.id}`,
    level,
    campaign_id: campaignId,
    campaign_name: campaignName,
    adset_id: adsetId,
    name: level === 'campaign' ? object.name || campaignName : `${campaignName} · ${object.name || adsetId}`,
    status: object.status || '',
    effective_status: object.effective_status || '',
    budget_type: budgetType,
    budget_account: budgetAccount,
    budget_usd: budgetAccount * budgetFx.fx_to_usd,
    budget_remaining_account: amountFromMinorUnits(object.budget_remaining),
    budget_remaining_usd: amountFromMinorUnits(object.budget_remaining) * budgetFx.fx_to_usd,
    start_time: object.start_time || '',
    stop_time: object.stop_time || object.end_time || '',
    updated_time: object.updated_time || '',
  };
};
const campaignTargets = campaignBudgetObjects
  .map((object) => targetFromObject(object, 'campaign'))
  .filter(Boolean);
const campaignTargetById = new Map(campaignTargets.map((target) => [target.campaign_id, target.id]));
const adsetTargets = adsetBudgetObjects
  .filter((object) => !campaignTargetById.has(String(object.campaign_id || '')))
  .map((object) => targetFromObject(object, 'adset'))
  .filter(Boolean);
// Second gate on the same rule the edge query already applied. Meta occasionally
// returns an object whose effective_status moved between the request and the
// response, and a turned-off campaign has no budget to pace against.
const pacingTargets = [...campaignTargets, ...adsetTargets]
  .filter((target) => PACING_EFFECTIVE_STATUSES
    .includes(String(target.effective_status || target.status).toUpperCase()));
const adsetTargetById = new Map(adsetTargets.map((target) => [target.adset_id, target.id]));
const targetIdForRow = (row) => campaignTargetById.get(String(row.campaign_id || ''))
  || adsetTargetById.get(String(row.adset_id || ''))
  || '';

const pacingDailyMap = new Map();
for (const row of adDaily) {
  const targetId = targetIdForRow(row);
  if (!targetId || !row.date) continue;
  const key = `${targetId}|${row.date}`;
  const current = pacingDailyMap.get(key) || {
    target_id: targetId,
    date: row.date,
    spend_account: 0,
    spend_usd: 0,
  };
  current.spend_account += Number(row.spend || 0);
  current.spend_usd += Number(row.spend_usd || 0);
  pacingDailyMap.set(key, current);
}
const pacingDaily = [...pacingDailyMap.values()]
  .sort((a, b) => `${a.target_id}|${a.date}`.localeCompare(`${b.target_id}|${b.date}`));

const pacingHourlyMap = new Map();
for (const row of pacingHourlyRaw) {
  const targetId = targetIdForRow(row);
  const date = row.date_start || row.date;
  const hourLabel = String(row.hourly_stats_aggregated_by_advertiser_time_zone || '');
  const hour = Number(hourLabel.slice(0, 2));
  if (!targetId || !date || !Number.isFinite(hour)) continue;
  const fx = await fxContext(date, accountCurrency);
  const spendAccount = Number(row.spend || 0);
  const key = `${targetId}|${date}|${hour}`;
  const current = pacingHourlyMap.get(key) || {
    target_id: targetId,
    date,
    hour,
    spend_account: 0,
    spend_usd: 0,
  };
  current.spend_account += spendAccount;
  current.spend_usd += spendAccount * fx.fx_to_usd;
  pacingHourlyMap.set(key, current);
}
const pacingHourly = [...pacingHourlyMap.values()]
  .sort((a, b) => `${a.target_id}|${a.date}|${String(a.hour).padStart(2, '0')}`
    .localeCompare(`${b.target_id}|${b.date}|${String(b.hour).padStart(2, '0')}`));

const out = {
  generated_at: new Date().toISOString(),
  source: 'Meta API',
  account_id: `act_${account}`,
  account_currency: accountCurrency,
  account_name: accountMeta.name || '',
  account_timezone: metaReportingTimezone,
  account_timezone_id: accountMeta.timezone_id || '',
  account_timezone_offset_hours_utc: accountMeta.timezone_offset_hours_utc ?? '',
  analysis_window: { since, until },
  delivery_scope: 'usa_adsets_only',
  baseline_window: { since: '2026-03-01', until: '2026-03-31', label: 'March USA benchmark' },
  usa_filter: 'campaign/adset name contains USA, US, _US, or US_ and excludes AUS/Australia',
  delivery_comparison: deliveryComparison,
  data_coverage: {
    adset_daily_rows: currentAdsetRows.length,
    adset_country_daily_rows: currentAdsetCountryRows.length,
    ad_daily_rows: adDaily.length,
    ad_country_daily_rows: adCountryDaily.length,
    all_adsets: allAdsets.length,
    usa_adsets: [...byAdset.values()].filter((a) => a.rows.some((r) => r.spend > 0)).length,
    ads: ads.length,
    countries: countries.length,
  },
  fx_rates: {
    provider: 'Frankfurter',
    note: 'Meta account spend is converted from account currency to USD using the date-specific Frankfurter v2 rate first; latest/v1 endpoints are only fallbacks and are labeled per date.',
    rates: fxRates,
  },
  adset_changes: finalAdsetChanges,
  pacing: {
    generated_at: new Date().toISOString(),
    timezone: metaReportingTimezone,
    currency: 'USD',
    account_currency: accountCurrency,
    coverage_since: since,
    coverage_until: until,
    baseline_days: pacingLookbackDays,
    error: pacingMetadataError,
    targets: pacingTargets,
    daily: pacingDaily,
    hourly: pacingHourly,
  },
  march_baseline: {
    frequency: avg(dailyMarch, 'frequency'),
    cpm: avg(dailyMarch, 'cpm_usd'),
    cpm_usd: avg(dailyMarch, 'cpm_usd'),
    cpm_try: avg(dailyMarch, 'cpm_try'),
    spend_try: avg(dailyMarch, 'spend_try'),
    spend_usd: avg(dailyMarch, 'spend_usd'),
    reach: avg(dailyMarch, 'reach'),
    impressions: avg(dailyMarch, 'impressions'),
  },
  account_daily_metrics: accountDailyMetrics,
  daily_metrics: dailyMetrics,
  adsets: [...byAdset.values()].filter((a) => a.rows.some((r) => r.spend > 0)),
  all_adsets: allAdsets,
  ads,
  countries,
  product_families: productFamilies,
  product_subtypes: productSubtypes,
  ad_daily: adDaily,
  ad_country_daily: adCountryDaily,
};
const outPath = path.resolve('public/data/adset-radar.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${out.data_coverage.usa_adsets} USA ad sets, ${ads.length} ads, ${countries.length} countries, and ${out.adset_changes.length} change markers (${out.adset_changes.filter((c) => c.is_budget_change).length} budget) to ${outPath}`);
console.log(`Backfill window: ${since} to ${until}; March baseline freq=${out.march_baseline.frequency.toFixed(2)} cpm_usd=${out.march_baseline.cpm_usd.toFixed(2)} reach=${Math.round(out.march_baseline.reach)}`);
if (out.delivery_comparison?.ok) console.log(`USA_ABO comparison: ${out.delivery_comparison.historical.label} ${out.delivery_comparison.historical.period.since} to ${out.delivery_comparison.historical.period.until}; ${out.delivery_comparison.current.label} ${out.delivery_comparison.current.period.since} to ${out.delivery_comparison.current.period.until}`);
