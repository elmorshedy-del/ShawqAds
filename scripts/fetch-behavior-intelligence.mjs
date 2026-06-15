import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { productTaxonomyForName } from '../src/lib/productMapping.js';
import {
  dwellBehaviorRollup as dwellRollup,
  journeyBehaviorRollup as journeyRollup,
  normalizeBehaviorPath,
  rollupBehaviorFacts,
  scoreBehaviorRows as scoreRows,
} from '../src/lib/behaviorStats.js';

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

const shopifyToken = process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN;
const shopifyStore = process.env.SHAWQ_SHOPIFY_STORE || process.env.SHOPIFY_STORE || 'f3e7e9-2.myshopify.com';
const shopifyApiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';
const metaToken = process.env.SHAWQ_META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
const metaAccount = (process.env.SHAWQ_META_AD_ACCOUNT_ID || process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '');
const metaGraphVersion = process.env.META_GRAPH_VERSION || 'v20.0';
const requestedSince = process.env.BEHAVIOR_SINCE || process.env.SINCE || process.env.BACKFILL_START_DATE || '2026-06-03';
const requestedUntil = process.env.BEHAVIOR_UNTIL || process.env.UNTIL || '';
const sessionEventsPath = process.env.SESSION_EVENTS_PATH || path.resolve('data/session-events.ndjson');

function dateInTimezone(date = new Date(), timeZone = 'UTC') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function zonedDateTimeToUtcIso(date, timeZone, endOfDay = false) {
  const [year, month, day] = String(date || '').split('-').map(Number);
  const hour = endOfDay ? 23 : 0;
  const minute = endOfDay ? 59 : 0;
  const second = endOfDay ? 59 : 0;
  const millisecond = endOfDay ? 999 : 0;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(utcGuess)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, millisecond);
  return new Date(utcGuess - (zonedAsUtc - utcGuess)).toISOString();
}

async function graphGet(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text);
}

async function getShopMetadata() {
  if (!shopifyToken || !shopifyStore) return { iana_timezone: 'Europe/Istanbul', currency: 'USD' };
  const url = new URL(`https://${shopifyStore}/admin/api/${shopifyApiVersion}/shop.json`);
  url.searchParams.set('fields', 'name,currency,iana_timezone,timezone');
  try {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': shopifyToken } });
    const text = await res.text();
    if (!res.ok) throw new Error(text.slice(0, 400));
    return JSON.parse(text).shop || {};
  } catch (error) {
    console.warn(`Could not fetch Shopify shop metadata: ${error.message}`);
    return { iana_timezone: 'Europe/Istanbul', currency: 'USD' };
  }
}

async function getMetaMetadata() {
  if (!metaToken || !metaAccount) return { currency: 'TRY', timezone_name: 'Europe/Istanbul' };
  const url = new URL(`https://graph.facebook.com/${metaGraphVersion}/act_${metaAccount}`);
  url.searchParams.set('access_token', metaToken);
  url.searchParams.set('fields', 'currency,name,timezone_name,timezone_id,timezone_offset_hours_utc');
  try {
    return await graphGet(url.toString());
  } catch (error) {
    console.warn(`Could not fetch Meta metadata: ${error.message}`);
    return { currency: process.env.META_ACCOUNT_CURRENCY || 'TRY', timezone_name: 'Europe/Istanbul' };
  }
}

function readJson(file, fallback) {
  try {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
  } catch {
    return fallback;
  }
}

function hashId(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function dayFor(value, timeZone) {
  if (!value) return '';
  return dateInTimezone(new Date(value), timeZone);
}

function countryName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code || 'Unknown';
  }
}

function countryFromAddress(address = {}) {
  const code = address.country_code || address.countryCode || address.country_code_v2 || '';
  const country = address.country || address.country_name || (code ? countryName(code) : 'Unknown');
  return { country_code: String(code || '').toUpperCase(), country };
}

function checkoutCountry(checkout = {}) {
  return countryFromAddress(checkout.shipping_address || checkout.shippingAddress || checkout.billing_address || checkout.billingAddress || {});
}

function taxonomyFor(title) {
  const taxonomy = productTaxonomyForName(title);
  if (!taxonomy.family) return taxonomy;
  if (taxonomy.family === 'unknown_product') return { family: 'Other', subtype: 'Other' };
  return taxonomy;
}

function productKey({ source, product_id, variant_id, product, family, subtype }) {
  if (source === 'meta_add_payment_info') return `${family || 'Other'}:${subtype || product || 'Unknown product'}`;
  return String(product_id || variant_id || product || 'unknown_product');
}

function productImageLookup(shopify = {}) {
  const map = new Map();
  for (const row of shopify.products || []) if (row.product) map.set(String(row.product), row.image_url || '');
  for (const line of shopify.order_lines || []) {
    if (line.product_id) map.set(String(line.product_id), line.image_url || map.get(String(line.product_id)) || '');
    if (line.product) map.set(String(line.product), line.image_url || map.get(String(line.product)) || '');
  }
  return map;
}

function paidOrderFacts(shopify = {}) {
  const byOrderProduct = new Map();
  for (const line of shopify.order_lines || []) {
    const key = `${line.order_id || line.order_name || line.date}:${productKey(line)}`;
    const current = byOrderProduct.get(key) || {
      date: line.date,
      step: 'checkout',
      source: 'shopify_paid_order',
      session_hash: hashId(line.order_id || line.order_name || key),
      product_id: String(line.product_id || ''),
      variant_id: String(line.variant_id || ''),
      product: line.product || 'Unknown product',
      family: line.family || 'Other',
      subtype: line.subtype || 'Unknown',
      image_url: line.image_url || '',
      country_code: String(line.country_code || '').toUpperCase(),
      country: line.country || countryName(line.country_code || ''),
      exposed: 1,
      abandoned: 0,
      completed: 1,
      units: 0,
      value_usd: 0,
    };
    current.units += Number(line.quantity || 0) || 1;
    current.value_usd += Number(line.line_revenue_usd || 0);
    byOrderProduct.set(key, current);
  }
  return [...byOrderProduct.values()];
}

async function getAbandonedCheckouts({ since, until, timezone }) {
  if (!shopifyToken || !shopifyStore) return { ok: false, configured: false, rows: [], error: 'Shopify token or store missing' };
  const startIso = zonedDateTimeToUtcIso(since, timezone, false);
  const endIso = zonedDateTimeToUtcIso(until, timezone, true);
  const fields = [
    'id', 'token', 'created_at', 'updated_at', 'completed_at', 'closed_at', 'currency', 'presentment_currency',
    'total_price', 'subtotal_price', 'total_line_items_price', 'line_items', 'shipping_address', 'billing_address',
    'landing_site', 'referring_site', 'source_name', 'note_attributes', 'abandoned_checkout_url'
  ].join(',');
  const rows = [];
  let url = new URL(`https://${shopifyStore}/admin/api/${shopifyApiVersion}/checkouts.json`);
  url.searchParams.set('limit', '250');
  url.searchParams.set('created_at_min', startIso);
  url.searchParams.set('created_at_max', endIso);
  url.searchParams.set('order', 'created_at asc');
  url.searchParams.set('fields', fields);
  while (url) {
    const response = await fetch(url, { headers: { 'X-Shopify-Access-Token': shopifyToken } });
    const text = await response.text();
    if (!response.ok) throw new Error(`Shopify abandoned checkouts ${response.status}: ${text.slice(0, 800)}`);
    const data = JSON.parse(text);
    rows.push(...(data.checkouts || []));
    const link = response.headers.get('link') || '';
    const next = link.split(',').find((part) => part.includes('rel="next"'));
    url = next ? new URL(next.slice(next.indexOf('<') + 1, next.indexOf('>'))) : null;
  }
  return { ok: true, configured: true, rows, error: '' };
}

function checkoutFacts(checkouts = [], { timezone, imageMap }) {
  const facts = [];
  for (const checkout of checkouts || []) {
    const completed = Boolean(checkout.completed_at);
    const country = checkoutCountry(checkout);
    const sessionHash = hashId(checkout.token || checkout.id || checkout.abandoned_checkout_url || checkout.created_at);
    const date = dayFor(checkout.created_at || checkout.updated_at, timezone);
    for (const item of checkout.line_items || []) {
      const product = item.title || item.name || 'Unknown product';
      const taxonomy = taxonomyFor(product);
      if (!taxonomy.family) continue;
      const product_id = String(item.product_id || item.product?.id || '');
      facts.push({
        date,
        step: 'checkout',
        source: 'shopify_abandoned_checkout',
        session_hash: sessionHash,
        checkout_hash: hashId(checkout.id || checkout.token || ''),
        product_id,
        variant_id: String(item.variant_id || ''),
        product,
        family: taxonomy.family,
        subtype: taxonomy.subtype,
        image_url: imageMap.get(product_id) || imageMap.get(product) || '',
        country_code: country.country_code,
        country: country.country,
        exposed: 1,
        abandoned: completed ? 0 : 1,
        completed: completed ? 1 : 0,
        recovered: completed ? 1 : 0,
        units: Number(item.quantity || 0) || 1,
        value_usd: Number(item.line_price || item.price || 0) * (Number(item.quantity || 0) || 1),
      });
    }
  }
  return facts;
}

function parseNdjson(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function rawEventName(raw = {}) {
  return String(raw.event_name || raw.eventType || raw.event_type || raw.name || raw.payload?.event_name || raw.payload?.name || '').trim();
}

function eventTimestamp(raw = {}) {
  return raw.event_ts || raw.timestamp || raw.created_at || raw.payload?.timestamp || raw.payload?.context?.timestamp || raw.received_at || new Date().toISOString();
}

function eventPath(raw = {}) {
  const href = raw.path || raw.url || raw.page_url || raw.context?.document?.location?.href || raw.payload?.context?.document?.location?.href || raw.payload?.url || '';
  return normalizeBehaviorPath(href);
}

function eventSessionKey(raw = {}) {
  return hashId(raw.session_id || raw.client_id || raw.clientId || raw.payload?.clientId || raw.payload?.client_id || raw.id || raw.payload?.id || '');
}

function lineItemsFromEvent(raw = {}) {
  const checkout = raw.checkout || raw.payload?.checkout || raw.data?.checkout || raw.payload?.data?.checkout || {};
  const explicit = raw.line_items || raw.lineItems || raw.payload?.line_items || raw.payload?.lineItems;
  const lines = explicit || checkout.lineItems || checkout.line_items || [];
  return (lines || []).map((item) => {
    const product = item.title || item.name || item.productTitle || item.merchandise?.product?.title || item.variant?.product?.title || 'Unknown product';
    const taxonomy = taxonomyFor(product);
    return {
      product_id: String(item.product_id || item.productId || item.product?.id || item.merchandise?.product?.id || ''),
      variant_id: String(item.variant_id || item.variantId || item.variant?.id || item.merchandise?.id || ''),
      product,
      family: taxonomy.family || 'Other',
      subtype: taxonomy.subtype || 'Unknown',
      quantity: Number(item.quantity || 1),
      value_usd: Number(item.price?.amount || item.finalLinePrice?.amount || item.line_price || item.price || 0) * (Number(item.quantity || 1)),
    };
  }).filter((item) => item.family);
}

function countryFromEvent(raw = {}) {
  const checkout = raw.checkout || raw.payload?.checkout || raw.data?.checkout || raw.payload?.data?.checkout || {};
  const direct = raw.country_code || raw.countryCode || raw.payload?.country_code || raw.payload?.countryCode || checkout.localization?.country?.isoCode;
  if (direct) return { country_code: String(direct).toUpperCase(), country: countryName(String(direct).toUpperCase()) };
  return checkoutCountry(checkout);
}

function normalizeSessionEvents(rawRows = [], timezone) {
  return rawRows.map((raw) => {
    const ts = eventTimestamp(raw);
    const country = countryFromEvent(raw);
    return {
      date: dayFor(ts, timezone),
      ts,
      event_name: rawEventName(raw),
      session_hash: eventSessionKey(raw),
      path: eventPath(raw),
      country_code: country.country_code,
      country: country.country,
      line_items: lineItemsFromEvent(raw),
    };
  }).filter((event) => event.event_name && event.session_hash);
}

function aggregateSessionFacts(events = []) {
  const bySession = new Map();
  for (const event of events) {
    const list = bySession.get(event.session_hash) || [];
    list.push(event);
    bySession.set(event.session_hash, list);
  }
  const paymentFacts = [];
  const pageFacts = [];
  const journeyRows = [];
  for (const [sessionHash, list] of bySession.entries()) {
    list.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const purchaseIndex = list.findIndex((event) => /checkout_completed|purchase/i.test(event.event_name));
    const purchased = purchaseIndex >= 0;
    const purchaseTime = purchased ? new Date(list[purchaseIndex].ts).getTime() : 0;
    const paymentEvents = list.filter((event) => /payment_info_submitted|add_payment_info|payment_submit/i.test(event.event_name));
    for (const event of paymentEvents) {
      const eventTime = new Date(event.ts).getTime();
      const completedWithinWindow = Boolean(purchased && purchaseTime >= eventTime && purchaseTime - eventTime <= 2 * 60 * 60 * 1000);
      for (const item of event.line_items || []) {
        paymentFacts.push({
          date: event.date,
          step: 'submit_payment',
          source: 'shopify_session_pixel',
          session_hash: sessionHash,
          product_id: item.product_id,
          variant_id: item.variant_id,
          product: item.product,
          family: item.family,
          subtype: item.subtype,
          image_url: '',
          country_code: event.country_code,
          country: event.country,
          exposed: 1,
          abandoned: completedWithinWindow ? 0 : 1,
          completed: completedWithinWindow ? 1 : 0,
          units: item.quantity || 1,
          value_usd: item.value_usd || 0,
        });
      }
    }

    const pageViews = list.filter((event) => /page_viewed|page_view/i.test(event.event_name));
    for (let i = 0; i < pageViews.length; i += 1) {
      const current = pageViews[i];
      const currentTime = new Date(current.ts).getTime();
      const nextPage = pageViews[i + 1];
      const nextPageTime = nextPage ? new Date(nextPage.ts).getTime() : Infinity;
      const heartbeatOrEnd = list
        .filter((event) => {
          const ts = new Date(event.ts).getTime();
          return ts > currentTime && ts < nextPageTime && /session_heartbeat|visibility_hidden|session_end/i.test(event.event_name);
        })
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))[0];
      const next = nextPage || heartbeatOrEnd;
      const dwell = next ? Math.max(1, Math.min(1800, Math.round((new Date(next.ts) - new Date(current.ts)) / 1000))) : 0;
      if (dwell > 0) pageFacts.push({ date: current.date, path: current.path, dwell_seconds: dwell, purchased, session_hash: sessionHash });
    }
    const sequence = [];
    for (const event of pageViews) {
      if (sequence.at(-1) !== event.path) sequence.push(event.path);
      if (sequence.length >= 6) break;
    }
    if (sequence.length) journeyRows.push({ date: list[0].date, purchased, session_hash: sessionHash, path_sequence: sequence });
  }
  return { paymentFacts, pageFacts, journeyRows, sessions: bySession.size };
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
async function getInsights({ fields, start, end, breakdowns }) {
  const base = new URL(`https://graph.facebook.com/${metaGraphVersion}/act_${metaAccount}/insights`);
  base.searchParams.set('access_token', metaToken);
  base.searchParams.set('level', 'ad');
  base.searchParams.set('time_increment', '1');
  base.searchParams.set('limit', '500');
  base.searchParams.set('fields', fields);
  base.searchParams.set('breakdowns', breakdowns);
  base.searchParams.set('time_range', JSON.stringify({ since: start, until: end }));
  const rows = [];
  let url = base.toString();
  while (url) {
    const data = await graphGet(url);
    rows.push(...(data.data || []));
    url = data.paging?.next || null;
  }
  return rows;
}
async function getMetaDemographics({ since, until }) {
  if (!metaToken || !metaAccount) return { ok: false, configured: false, rows: [], error: 'Meta token or account missing' };
  const fields = ['date_start', 'date_stop', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name', 'spend', 'impressions', 'clicks', 'actions', 'action_values'].join(',');
  const attempts = ['age,gender', 'gender'];
  let lastError = '';
  for (const breakdowns of attempts) {
    try {
      const raw = await getInsights({ fields, start: since, end: until, breakdowns });
      const rows = raw.map((r) => ({
        date: r.date_start,
        age: r.age || 'unknown',
        gender: r.gender || 'unknown',
        campaign_id: r.campaign_id || '',
        campaign_name: r.campaign_name || '',
        adset_id: r.adset_id || '',
        adset_name: r.adset_name || '',
        ad_id: r.ad_id || '',
        ad_name: r.ad_name || '',
        spend: Number(r.spend || 0),
        impressions: Number(r.impressions || 0),
        clicks: Number(r.clicks || 0),
        add_to_cart: metricFromActions(r.actions, ['offsite_conversion.fb_pixel_add_to_cart', 'omni_add_to_cart', 'add_to_cart'], ['add_to_cart']),
        checkout_initiated: metricFromActions(r.actions, ['offsite_conversion.fb_pixel_initiate_checkout', 'omni_initiated_checkout', 'initiate_checkout', 'initiated_checkout'], ['initiate_checkout', 'initiated_checkout']),
        payment_info: metricFromActions(r.actions, ['offsite_conversion.fb_pixel_add_payment_info', 'add_payment_info', 'payment_info_submitted'], ['payment_info', 'add_payment']),
        purchases: metricFromActions(r.actions, ['offsite_conversion.fb_pixel_purchase', 'omni_purchase', 'purchase'], ['purchase']),
      }));
      return { ok: true, configured: true, rows, breakdowns, error: '' };
    } catch (error) {
      lastError = error.message;
    }
  }
  return { ok: false, configured: true, rows: [], error: lastError || 'Meta demographics fetch failed' };
}

async function getMetaPaymentCountry({ since, until }) {
  if (!metaToken || !metaAccount) return { ok: false, configured: false, rows: [], error: 'Meta token or account missing' };
  const fields = ['date_start', 'date_stop', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name', 'spend', 'impressions', 'clicks', 'actions'].join(',');
  try {
    const raw = await getInsights({ fields, start: since, end: until, breakdowns: 'country' });
    const rows = raw.map((r) => {
      const taxonomy = taxonomyFor(`${r.ad_name || ''} ${r.adset_name || ''} ${r.campaign_name || ''}`);
      const paymentInfo = metricFromActions(r.actions, ['offsite_conversion.fb_pixel_add_payment_info', 'add_payment_info', 'payment_info_submitted'], ['add_payment_info', 'payment_info']);
      const purchases = metricFromActions(r.actions, ['offsite_conversion.fb_pixel_purchase', 'omni_purchase', 'purchase'], ['purchase']);
      return {
        date: r.date_start,
        country_code: String(r.country || '').toUpperCase(),
        country: r.country ? countryName(String(r.country).toUpperCase()) : 'Unknown',
        campaign_id: r.campaign_id || '',
        campaign_name: r.campaign_name || '',
        adset_id: r.adset_id || '',
        adset_name: r.adset_name || '',
        ad_id: r.ad_id || '',
        ad_name: r.ad_name || '',
        product: taxonomy.subtype && taxonomy.subtype !== 'unknown_product' ? taxonomy.subtype : (r.ad_name || 'Unknown product'),
        family: taxonomy.family || 'Other',
        subtype: taxonomy.subtype || 'Unknown',
        payment_info: paymentInfo,
        purchases,
      };
    }).filter((row) => Number(row.payment_info || 0) > 0 || Number(row.purchases || 0) > 0);
    return { ok: true, configured: true, rows, breakdowns: 'country', error: '' };
  } catch (error) {
    return { ok: false, configured: true, rows: [], breakdowns: 'country', error: error.message };
  }
}

function metaPaymentFacts(rows = []) {
  return rows.filter((row) => Number(row.payment_info || 0) > 0).map((row) => {
    const exposed = Number(row.payment_info || 0);
    const purchases = Number(row.purchases || 0);
    return {
      date: row.date,
      step: 'submit_payment',
      source: 'meta_add_payment_info',
      session_hash: hashId(`meta:${row.date}:${row.country_code}:${row.ad_id || row.ad_name}`),
      product_id: '',
      variant_id: '',
      product: row.product || row.ad_name || 'Unknown product',
      family: row.family || 'Other',
      subtype: row.subtype || 'Unknown',
      image_url: '',
      country_code: row.country_code,
      country: row.country,
      exposed,
      abandoned: Math.max(0, exposed - purchases),
      completed: Math.min(exposed, purchases),
      units: exposed,
      value_usd: 0,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      adset_id: row.adset_id,
      adset_name: row.adset_name,
      ad_id: row.ad_id,
      ad_name: row.ad_name,
    };
  });
}

function rollupFacts(facts, step, dimension) {
  return rollupBehaviorFacts(facts, step, dimension, { countryName: countryName });
}

function demographicsRollup(rows = []) {
  const byGender = new Map();
  const byAgeGender = new Map();
  for (const row of rows) {
    const gender = row.gender || 'unknown';
    const ageGender = `${row.age || 'unknown'} · ${gender}`;
    for (const [key, map] of [[gender, byGender], [ageGender, byAgeGender]]) {
      const cur = map.get(key) || { key, segment: key, age: row.age || 'unknown', gender, exposed_checkout: 0, abandoned_checkout: 0, exposed_payment: 0, abandoned_payment: 0, purchases: 0 };
      cur.exposed_checkout += Number(row.checkout_initiated || 0);
      cur.abandoned_checkout += Math.max(0, Number(row.checkout_initiated || 0) - Number(row.purchases || 0));
      cur.exposed_payment += Number(row.payment_info || 0);
      cur.abandoned_payment += Math.max(0, Number(row.payment_info || 0) - Number(row.purchases || 0));
      cur.purchases += Number(row.purchases || 0);
      map.set(key, cur);
    }
  }
  const checkoutGlobalExposure = [...byGender.values()].reduce((a, r) => a + r.exposed_checkout, 0);
  const checkoutGlobalAbandoned = [...byGender.values()].reduce((a, r) => a + r.abandoned_checkout, 0);
  const paymentGlobalExposure = [...byGender.values()].reduce((a, r) => a + r.exposed_payment, 0);
  const paymentGlobalAbandoned = [...byGender.values()].reduce((a, r) => a + r.abandoned_payment, 0);
  const checkoutRows = [...byAgeGender.values()].filter((row) => Number(row.exposed_checkout || 0) > 0);
  const paymentRows = [...byAgeGender.values()].filter((row) => Number(row.exposed_payment || 0) > 0);
  return {
    checkout: scoreRows(checkoutRows.map((r) => ({ ...r, exposed: r.exposed_checkout, abandoned: r.abandoned_checkout })), { priorStrength: 40, globalRate: checkoutGlobalExposure ? checkoutGlobalAbandoned / checkoutGlobalExposure : 0 }).slice(0, 8),
    submit_payment: scoreRows(paymentRows.map((r) => ({ ...r, exposed: r.exposed_payment, abandoned: r.abandoned_payment })), { priorStrength: 40, globalRate: paymentGlobalExposure ? paymentGlobalAbandoned / paymentGlobalExposure : 0 }).slice(0, 8),
  };
}

const shopMetadata = await getShopMetadata();
const metaMetadata = await getMetaMetadata();
const shopifyTimezone = process.env.SHAWQ_SHOPIFY_REPORTING_TIMEZONE || process.env.SHOPIFY_REPORTING_TIMEZONE || shopMetadata.iana_timezone || 'Europe/Istanbul';
const metaTimezone = process.env.SHAWQ_META_REPORTING_TIMEZONE || process.env.META_REPORTING_TIMEZONE || metaMetadata.timezone_name || 'Europe/Istanbul';
const since = requestedSince;
const until = requestedUntil || dateInTimezone(new Date(), shopifyTimezone);
const shopifyProducts = readJson(path.resolve('public/data/shopify-products.json'), { order_lines: [], daily: [], products: [] });
const imageMap = productImageLookup(shopifyProducts);

let abandonedResult = { ok: false, configured: Boolean(shopifyToken && shopifyStore), rows: [], error: 'not run' };
try {
  abandonedResult = await getAbandonedCheckouts({ since, until, timezone: shopifyTimezone });
} catch (error) {
  abandonedResult = { ok: false, configured: Boolean(shopifyToken && shopifyStore), rows: [], error: error.message };
  console.warn(`Could not fetch Shopify abandoned checkouts: ${error.message}`);
}

let metaDemographics = { ok: false, configured: Boolean(metaToken && metaAccount), rows: [], error: 'not run' };
try {
  metaDemographics = await getMetaDemographics({ since, until });
} catch (error) {
  metaDemographics = { ok: false, configured: Boolean(metaToken && metaAccount), rows: [], error: error.message };
  console.warn(`Could not fetch Meta demographics: ${error.message}`);
}

let metaPayment = { ok: false, configured: Boolean(metaToken && metaAccount), rows: [], error: 'not run' };
try {
  metaPayment = await getMetaPaymentCountry({ since, until });
} catch (error) {
  metaPayment = { ok: false, configured: Boolean(metaToken && metaAccount), rows: [], error: error.message };
  console.warn(`Could not fetch Meta payment info: ${error.message}`);
}

const rawSessionEvents = parseNdjson(sessionEventsPath);
const sessionEvents = normalizeSessionEvents(rawSessionEvents, shopifyTimezone).filter((event) => event.date >= since && event.date <= until);
const sessionAgg = aggregateSessionFacts(sessionEvents);
const facts = [
  ...paidOrderFacts(shopifyProducts).filter((fact) => fact.date >= since && fact.date <= until),
  ...checkoutFacts(abandonedResult.rows, { timezone: shopifyTimezone, imageMap }),
  ...metaPaymentFacts(metaPayment.rows || []),
  ...sessionAgg.paymentFacts,
];

const checkoutProducts = rollupFacts(facts, 'checkout', 'product');
const checkoutCountries = rollupFacts(facts, 'checkout', 'country');
const paymentProducts = rollupFacts(facts, 'submit_payment', 'product');
const paymentCountries = rollupFacts(facts, 'submit_payment', 'country');
const demographics = demographicsRollup(metaDemographics.rows || []);
const dwellPages = dwellRollup(sessionAgg.pageFacts);
const journeys = journeyRollup(sessionAgg.journeyRows);

const out = {
  source: 'Shopify abandoned checkouts + Meta demographics + first-party session events',
  generated_at: new Date().toISOString(),
  period: {
    since,
    until,
    shopify_timezone: shopifyTimezone,
    meta_timezone: metaTimezone,
    shop_currency: shopMetadata.currency || 'USD',
  },
  extraction: {
    abandoned_checkouts: {
      source: 'Shopify Admin abandoned checkouts',
      configured: abandonedResult.configured,
      ok: abandonedResult.ok,
      count: abandonedResult.rows.length,
      error: abandonedResult.ok ? '' : abandonedResult.error,
      note: 'Checkout abandonment uses Shopify abandoned checkouts plus paid-order checkout exposures by product.',
    },
    meta_demographics: {
      source: 'Meta Insights age/gender breakdown',
      configured: metaDemographics.configured,
      ok: metaDemographics.ok,
      count: metaDemographics.rows.length,
      breakdowns: metaDemographics.breakdowns || '',
      error: metaDemographics.ok ? '' : metaDemographics.error,
      note: 'Gender is aggregate platform reporting, not user-level gender.',
    },
    meta_payment: {
      source: 'Meta AddPaymentInfo by ad and country',
      configured: metaPayment.configured,
      ok: metaPayment.ok,
      count: metaPayment.rows.length,
      breakdowns: metaPayment.breakdowns || '',
      error: metaPayment.ok ? '' : metaPayment.error,
      note: 'Immediate submit-payment abandonment uses Meta AddPaymentInfo minus purchases by ad/country. Exact product/session rows are added when the Shopify session pixel posts payment_info_submitted.',
    },
    session_events: {
      source: 'First-party Shopify customer-events pixel',
      configured: fs.existsSync(sessionEventsPath),
      ok: sessionEvents.length > 0,
      count: sessionEvents.length,
      sessions: sessionAgg.sessions,
      path: sessionEventsPath,
      note: 'Payment-submit, dwell, and non-purchaser journeys become real after the pixel posts events to /api/session-events.',
    },
  },
  scoring: {
    method: 'Family-adjusted Bayesian shrinkage, Benjamini–Hochberg FDR across product tests, Mann-Whitney U for dwell',
    popularity_adjustment: 'Products compare to their category average (hoodie vs hoodies), not raw traffic counts.',
    checkout_window: 'No paid order/recovery in selected window; Shopify abandoned checkout completed_at is treated as recovered.',
    submit_payment_window: 'No checkout_completed within 2 hours after payment_info_submitted.',
    thresholds: {
      visible_exposure: 8,
      family_baseline_exposure: 12,
      directional_exposure: 20,
      actionable_exposure: 50,
      dwell_min_per_cohort: { purchaser: 3, non_purchaser: 5 },
      journey_lift_min: { purchasers: 5, non_purchasers: 5 },
    },
  },
  facts,
  meta_demographics_rows: metaDemographics.rows || [],
  meta_payment_rows: metaPayment.rows || [],
  page_facts: sessionAgg.pageFacts,
  journey_rows: sessionAgg.journeyRows,
  matrix: {
    checkout: { global: checkoutProducts.global, products: checkoutProducts.rows, countries: checkoutCountries.rows, gender: demographics.checkout },
    submit_payment: { global: paymentProducts.global, products: paymentProducts.rows, countries: paymentCountries.rows, gender: demographics.submit_payment },
  },
  dwell_pages: dwellPages,
  journeys,
  pixel_contract: {
    endpoint: '/api/session-events',
    recommended_events: ['page_viewed', 'product_viewed', 'product_added_to_cart', 'checkout_started', 'payment_info_submitted', 'checkout_completed', 'visibility_hidden'],
    privacy: 'Send clientId/session id, event name, timestamp, page path, country code, and checkout/product line items only. Do not send email, phone, full address, name, or raw IP.',
  },
};

const outPath = path.resolve('public/data/behavior-intelligence.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote behavior intelligence: ${checkoutProducts.rows.length} checkout products, ${paymentProducts.rows.length} payment products, ${dwellPages.length} dwell pages to ${outPath}`);
console.log(`Coverage: abandoned_checkouts=${abandonedResult.ok ? abandonedResult.rows.length : 'failed'} meta_demographics=${metaDemographics.ok ? metaDemographics.rows.length : 'failed'} meta_payment=${metaPayment.ok ? metaPayment.rows.length : 'failed'} session_events=${sessionEvents.length}`);
