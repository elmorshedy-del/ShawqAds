import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { productTaxonomyForName } from './src/lib/productMapping.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.replace(/^export\s+/, '').split('=');
    if (!process.env[key]) process.env[key] = rest.join('=').replace(/^["']|["']$/g, '');
  }
}

loadEnv();

const distDir = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 3000);
const refreshKey = process.env.REFRESH_API_KEY || '';
const sessionEventKey = process.env.SESSION_EVENT_INGEST_KEY || '';
const sessionEventsPath = process.env.SESSION_EVENTS_PATH || path.join(__dirname, 'data', 'session-events.ndjson');
const refreshOnStart = process.env.REFRESH_ON_START !== 'false';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function runScript(script, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', script], { cwd: __dirname, env: { ...process.env, ...extraEnv }, shell: false });
    let output = '';
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });
    child.on('close', (code) => resolve({ code, output }));
  });
}

function publicDataPath(name) {
  return path.join(__dirname, 'public', 'data', name);
}

function isAuthorized(req) {
  return Boolean(refreshKey && req.headers.authorization === `Bearer ${refreshKey}`);
}

function isSessionEventAuthorized(req, url) {
  if (!sessionEventKey) return true;
  return req.headers['x-session-event-key'] === sessionEventKey || url.searchParams.get('key') === sessionEventKey;
}

function dateEnvFromUrl(url) {
  const since = url.searchParams.get('since') || url.searchParams.get('start') || '';
  const until = url.searchParams.get('until') || url.searchParams.get('end') || '';
  const env = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    env.SINCE = since;
    env.META_SINCE = since;
    env.SHOPIFY_SINCE = since;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    env.UNTIL = until;
    env.META_UNTIL = until;
    env.SHOPIFY_UNTIL = until;
  }
  return env;
}

function shopifyConfig() {
  return {
    token: process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN,
    store: process.env.SHAWQ_SHOPIFY_STORE || process.env.SHOPIFY_STORE || 'f3e7e9-2.myshopify.com',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2025-10',
  };
}

function readRequestBody(req, maxBytes = 160000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sanitizePixelPayload(value, depth = 0) {
  if (depth > 6) return null;
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizePixelPayload(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (/email|phone|first.?name|last.?name|address1|address2|zip|postal|company|customer/i.test(key)) continue;
    out[key] = sanitizePixelPayload(child, depth + 1);
  }
  return out;
}

function sessionEventStatus() {
  if (!fs.existsSync(sessionEventsPath)) {
    return { configured: false, count: 0, sessions: 0, last_received_at: '', path: sessionEventsPath };
  }
  const text = fs.readFileSync(sessionEventsPath, 'utf8');
  const rows = text.split(/\r?\n/).filter(Boolean);
  const sessions = new Set();
  let lastReceived = '';
  for (const line of rows) {
    try {
      const event = JSON.parse(line);
      const session = event.session_id || event.client_id || event.payload?.session_id || event.payload?.client_id || event.payload?.clientId || '';
      if (session) sessions.add(String(session));
      lastReceived = event.received_at || lastReceived;
    } catch {}
  }
  return { configured: true, count: rows.length, sessions: sessions.size, last_received_at: lastReceived, path: sessionEventsPath };
}

async function recordSessionEvent(req, res, url) {
  if (!isSessionEventAuthorized(req, url)) {
    send(res, 401, JSON.stringify({ ok: false, error: 'unauthorized' }));
    return;
  }
  try {
    const text = await readRequestBody(req);
    const payload = text ? JSON.parse(text) : {};
    const event = sanitizePixelPayload({
      received_at: new Date().toISOString(),
      event_name: payload.event_name || payload.name || payload.eventType || payload.event_type || '',
      client_id: payload.client_id || payload.clientId || payload.payload?.clientId || '',
      session_id: payload.session_id || payload.sessionId || '',
      timestamp: payload.timestamp || payload.ts || payload.context?.timestamp || '',
      path: payload.path || payload.url || '',
      country_code: payload.country_code || payload.countryCode || '',
      line_items: payload.line_items || payload.lineItems || [],
      payload,
    });
    if (url.searchParams.get('dry_run') === '1') {
      send(res, 200, JSON.stringify({ ok: true, dry_run: true, event_name: event.event_name || '', has_session: Boolean(event.session_id || event.client_id) }));
      return;
    }
    fs.mkdirSync(path.dirname(sessionEventsPath), { recursive: true });
    fs.appendFileSync(sessionEventsPath, `${JSON.stringify(event)}\n`);
    send(res, 200, JSON.stringify({ ok: true }));
  } catch (error) {
    send(res, 400, JSON.stringify({ ok: false, error: error.message }));
  }
}

function queryParamsFromMaybeUrl(value = '') {
  const text = String(value || '');
  const query = text.includes('?') ? text.slice(text.indexOf('?') + 1) : text;
  const params = new URLSearchParams(query);
  return Object.fromEntries([...params.entries()].filter(([key]) => /^(utm_|campaign_|campaign$|ad_|ad$|adset_|adset$|placement|creative|attributes\[(ad|ad-id|campaign|campaign-id|adset|adset-id)\])/i.test(key)));
}

function compactObject(obj = {}) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && String(value) !== ''));
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || '';
}

function publicNoteAttributes(noteAttributes = {}) {
  const allowed = /^(utm_(source|medium|campaign|content|term)(_(first|last))?|campaign(_name|_id)?|adset(_name|_id)?|ad_set_name|ad(_name|_id)?|source|medium|content|term|placement|creative|channel)$/i;
  return Object.fromEntries(Object.entries(noteAttributes).filter(([key]) => allowed.test(key)));
}

function pathOnly(value = '') {
  return String(value || '').split('?')[0].slice(0, 220);
}

function hostOnly(value = '') {
  try {
    return value ? new URL(value, 'https://shawq.co').hostname : '';
  } catch {
    return '';
  }
}

function orderCountry(order) {
  const address = order.shipping_address || order.billing_address || {};
  return {
    code: address.country_code || '',
    name: address.country || address.country_code || 'Unknown',
  };
}

function orderAttribution(order) {
  const noteAttributes = {};
  for (const attr of order.note_attributes || []) {
    if (attr?.name) noteAttributes[attr.name] = attr.value;
  }
  const lowerNote = Object.fromEntries(Object.entries(noteAttributes).map(([key, value]) => [key.toLowerCase(), value]));
  const landingParams = queryParamsFromMaybeUrl(order.landing_site || order.landing_site_ref || '');
  const referrerParams = queryParamsFromMaybeUrl(order.referring_site || '');
  const noteLandingLast = queryParamsFromMaybeUrl(lowerNote.landing_page_last || lowerNote.landing_page || '');
  const noteLandingFirst = queryParamsFromMaybeUrl(lowerNote.landing_page_first || '');
  const params = compactObject({
    ...noteLandingFirst,
    ...landingParams,
    ...referrerParams,
    ...noteLandingLast,
  });
  const campaignHint = firstPresent(
    lowerNote.utm_campaign_last,
    params.utm_campaign,
    lowerNote.utm_campaign,
    lowerNote.campaign_name,
    lowerNote.campaign,
    params.campaign_id,
    params.campaign
  );
  const adsetHint = firstPresent(
    lowerNote.utm_term_last,
    params.utm_term,
    lowerNote.utm_term,
    lowerNote.adset_name,
    lowerNote.ad_set_name,
    lowerNote.adset,
    params.adset_id,
    params.adset,
    params['attributes[adset-id]']
  );
  const adHint = firstPresent(
    lowerNote.utm_content_last,
    params.utm_content,
    lowerNote.utm_content,
    lowerNote.ad_name,
    lowerNote.ad_id,
    lowerNote.ad,
    params.ad_id,
    params.ad,
    params['attributes[ad-id]']
  );
  const sourceCandidates = [
    adHint,
    adsetHint,
    campaignHint,
  ].filter(Boolean);
  return {
    source_name: order.source_name || '',
    landing_path: pathOnly(order.landing_site || order.landing_site_ref || ''),
    referrer_host: hostOnly(order.referring_site || ''),
    utm: params,
    note_attributes: publicNoteAttributes(noteAttributes),
    campaign_hint: campaignHint,
    adset_hint: adsetHint,
    ad_hint: sourceCandidates[0] || '',
    match_hints: {
      campaign_id: params.campaign_id || lowerNote.campaign_id || '',
      adset_id: params.adset_id || lowerNote.adset_id || '',
      ad_id: params.ad_id || lowerNote.ad_id || '',
      campaign_name: campaignHint,
      adset_name: adsetHint,
      ad_name: adHint,
    },
  };
}

function normalizeMatch(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function matchAttributionToMetaAd(attribution) {
  const hints = [
    attribution.ad_hint,
    attribution.utm?.utm_content,
    attribution.utm?.utm_term,
    attribution.note_attributes?.ad_name,
    attribution.note_attributes?.ad_id,
  ].filter(Boolean).map(String);
  if (!hints.length) return null;
  try {
    const data = JSON.parse(fs.readFileSync(publicDataPath('adset-radar.json'), 'utf8'));
    const ads = data.ads || [];
    for (const hint of hints) {
      const normalizedHint = normalizeMatch(hint);
      const idMatch = ads.find((ad) => String(ad.ad_id || '') === hint);
      if (idMatch) return { ad_id: idMatch.ad_id, ad_name: idMatch.ad_name, match_type: 'ad_id' };
      const nameMatch = ads.find((ad) => {
        const adName = normalizeMatch(ad.ad_name);
        return adName && normalizedHint && adName === normalizedHint;
      });
      if (nameMatch) return { ad_id: nameMatch.ad_id, ad_name: nameMatch.ad_name, match_type: 'shopify_hint' };
    }
  } catch {}
  return null;
}

function summarizeOrder(order) {
  const lineItems = order.line_items || [];
  const itemCount = lineItems.reduce((total, item) => total + Number(item.quantity || 0), 0);
  const firstProduct = lineItems.find((item) => item?.title)?.title || '';
  const attribution = orderAttribution(order);
  const matchedAd = matchAttributionToMetaAd(attribution);
  const country = orderCountry(order);
  return {
    id: String(order.id || ''),
    name: order.name || (order.id ? `#${order.id}` : 'Latest order'),
    created_at: order.created_at || '',
    total_price: Number(order.current_total_price || order.total_price || 0),
    currency: order.currency || order.presentment_currency || 'USD',
    financial_status: order.financial_status || '',
    country,
    item_count: itemCount,
    product_title: firstProduct,
    line_items: lineItems.map((item) => {
      const taxonomy = productTaxonomyForName(item.title);
      return {
        title: item.title || '',
        quantity: Number(item.quantity || 0),
        price: Number(item.price || 0),
        family: taxonomy.family || 'Other',
        subtype: taxonomy.subtype || 'Other',
      };
    }),
    attribution,
    matched_ad: matchedAd,
    attribution_label: matchedAd?.ad_name || attribution.ad_hint || attribution.source_name || attribution.referrer_host || 'Unattributed in Shopify',
  };
}

async function fetchLatestShopifySale() {
  const { token, store, apiVersion } = shopifyConfig();
  if (!token || !store) return { ok: false, configured: false, error: 'Shopify token or store is not configured', sale: null };

  const url = new URL(`https://${store}/admin/api/${apiVersion}/orders.json`);
  url.searchParams.set('status', 'any');
  url.searchParams.set('limit', '20');
  url.searchParams.set('order', 'created_at desc');
  url.searchParams.set('fields', 'id,name,created_at,cancelled_at,financial_status,current_total_price,total_price,currency,presentment_currency,line_items,shipping_address,billing_address,landing_site,landing_site_ref,referring_site,source_name,source_identifier,note_attributes,tags');

  const response = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Shopify latest-sale ${response.status}: ${text.slice(0, 600)}`);
  const data = JSON.parse(text);
  const includeStatus = new Set(['paid', 'partially_paid', 'partially_refunded']);
  const sale = (data.orders || []).find((order) => !order.cancelled_at && includeStatus.has(order.financial_status));
  return { ok: true, configured: true, checked_at: new Date().toISOString(), sale: sale ? summarizeOrder(sale) : null };
}

async function serveData(req, res, name, script) {
  const file = publicDataPath(name);
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const force = url.searchParams.get('refresh') === '1';
  if (force && !isAuthorized(req)) {
    send(res, 401, JSON.stringify({ ok: false, error: 'unauthorized' }));
    return;
  }

  if (!force && !fs.existsSync(file) && !refreshOnStart) {
    send(res, 503, JSON.stringify({
      ok: false,
      error: 'cached data unavailable',
      detail: 'Automatic data refresh is disabled. Use the authorized refresh endpoint or ship cached public/data files.',
    }));
    return;
  }

  if (force || !fs.existsSync(file)) {
    const result = await runScript(script, dateEnvFromUrl(url));
    if (result.code !== 0) {
      console.warn(result.output);
      if (!fs.existsSync(file)) {
        send(res, 500, JSON.stringify({ ok: false, error: 'refresh failed', detail: result.output.slice(0, 2000) }));
        return;
      }
    }
  }

  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

async function warmData() {
  if (!refreshOnStart) return;
  const jobs = [];
  if (process.env.SHAWQ_META_ACCESS_TOKEN && process.env.SHAWQ_META_AD_ACCOUNT_ID) jobs.push(runScript('fetch:meta'));
  if (process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN && process.env.SHAWQ_SHOPIFY_STORE) jobs.push(runScript('fetch:shopify'));
  const results = jobs.length ? await Promise.all(jobs) : [];
  if (process.env.SHAWQ_META_ACCESS_TOKEN || process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN) results.push(await runScript('fetch:behavior'));
  results.forEach((r) => { if (r.code !== 0) console.warn(r.output); });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-session-event-key',
      'access-control-max-age': '86400',
    });
    res.end();
    return;
  }

  if (url.pathname === '/health') {
    send(res, 200, JSON.stringify({ ok: true, service: 'shawq-adset-radar' }));
    return;
  }

  if (url.pathname === '/api/data/adset-radar.json') {
    await serveData(req, res, 'adset-radar.json', 'fetch:meta');
    return;
  }

  if (url.pathname === '/api/data/shopify-products.json') {
    await serveData(req, res, 'shopify-products.json', 'fetch:shopify');
    return;
  }

  if (url.pathname === '/api/data/behavior-intelligence.json') {
    await serveData(req, res, 'behavior-intelligence.json', 'fetch:behavior');
    return;
  }

  if (url.pathname === '/api/session-events/status') {
    send(res, 200, JSON.stringify({ ok: true, ...sessionEventStatus() }));
    return;
  }

  if (url.pathname === '/api/session-events' && req.method === 'POST') {
    res.setHeader('access-control-allow-origin', '*');
    await recordSessionEvent(req, res, url);
    return;
  }

  if (url.pathname === '/api/shopify/latest-sale') {
    try {
      const payload = await fetchLatestShopifySale();
      send(res, payload.ok ? 200 : 503, JSON.stringify(payload));
    } catch (error) {
      send(res, 500, JSON.stringify({ ok: false, configured: true, error: error.message, sale: null }));
    }
    return;
  }

  if (url.pathname === '/api/refresh') {
    if (!isAuthorized(req)) {
      send(res, 401, JSON.stringify({ ok: false, error: 'unauthorized' }));
      return;
    }
    const env = dateEnvFromUrl(url);
    const [meta, shopify] = await Promise.all([runScript('fetch:meta', env), runScript('fetch:shopify', env)]);
    const behavior = await runScript('fetch:behavior', env);
    send(res, meta.code || shopify.code || behavior.code ? 500 : 200, JSON.stringify({ ok: !(meta.code || shopify.code || behavior.code), meta, shopify, behavior }));
    return;
  }

  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = path.normalize(path.join(distDir, requested));
  if (!target.startsWith(distDir)) {
    send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    return;
  }
  const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(distDir, 'index.html');
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': mime[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`ShawQ Ad Set Radar listening on ${port}`);
  warmData().catch((error) => console.warn(error));
});
