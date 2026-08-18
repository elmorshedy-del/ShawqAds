import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { productTaxonomyForName } from './src/lib/productMapping.js';
import { isTipTitle, merchandiseLineItems, merchandiseItemCount } from './src/lib/orderMerchandise.js';
import { createLocationStore, createGeocoder, buildPurchase, relativeTime } from './src/lib/orderResolver.mjs';
import { isEmailAttribution, emailCampaignName, emailSourceLabel } from './src/lib/orderChannel.mjs';
import {
  buildSessionReplayIndex,
  checkoutOutcomeFromEvents,
  formatCheckoutOutcome,
  hashSessionKey,
  listCheckoutReplaySessions,
  loadSessionPixelEvents,
  loadSessionReplayChunks,
  readReplayIndex,
  sessionReplayStatus,
  summarizePixelTimeline,
  upsertReplayIndexEntry,
  writeReplayIndex,
} from './src/lib/sessionReplay.js';
import { buildCheckoutTheaterScript } from './src/lib/checkoutTheater.js';
import {
  buildSessionRecorderScript,
  ensureShopifyRecorderScriptTag,
  listShopifyScriptTags,
  recorderScriptTagSrc,
} from './src/lib/sessionRecorderInstall.js';

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
// Durable data directory. On Railway attach a volume and set DATA_DIR (or rely on
// the auto-set RAILWAY_VOLUME_MOUNT_PATH) so accumulated state — raw session
// events, the behavior snapshot, the live-orders map, and the geocode cache —
// survives redeploys and restarts. Falls back to the in-repo ./data dir for local
// dev, preserving prior behavior when no volume is configured.
const dataDir = process.env.DATA_DIR
  || (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'shawq-data')
    : path.join(__dirname, 'data'));
try {
  fs.mkdirSync(dataDir, { recursive: true });
} catch (error) {
  console.warn(`Failed to create data directory at ${dataDir}:`, error.message);
}
const sessionEventsPath = process.env.SESSION_EVENTS_PATH || path.join(dataDir, 'session-events.ndjson');
const sessionReplayPath = process.env.SESSION_REPLAY_PATH || path.join(dataDir, 'session-replay.ndjson');
const sessionReplayIndexPath = process.env.SESSION_REPLAY_INDEX_PATH || path.join(dataDir, 'session-replay-index.json');
const MAX_REPLAY_CHUNK_EVENTS = Number(process.env.SESSION_REPLAY_MAX_CHUNK_EVENTS || 120);
const MAX_REPLAY_CHUNKS_PER_SESSION = Number(process.env.SESSION_REPLAY_MAX_CHUNKS || 40);
const MAX_REPLAY_BODY_BYTES = Number(process.env.SESSION_REPLAY_MAX_BODY_BYTES || 750000);
// Child scripts (e.g. `npm run fetch:behavior`) must read the same NDJSON path.
process.env.SESSION_EVENTS_PATH = sessionEventsPath;
process.env.SESSION_REPLAY_PATH = sessionReplayPath;
const refreshOnStart = process.env.REFRESH_ON_START !== 'false';
const SHOPIFY_HISTORICAL_SINCE = process.env.SHOPIFY_BACKFILL_START_DATE || '2026-02-01';
const shopifyReportingTimezone = process.env.SHAWQ_SHOPIFY_REPORTING_TIMEZONE
  || process.env.SHOPIFY_REPORTING_TIMEZONE
  || 'Europe/Istanbul';
const metaReportingTimezone = process.env.SHAWQ_META_REPORTING_TIMEZONE
  || process.env.META_REPORTING_TIMEZONE
  || 'Europe/Istanbul';
const DEFAULT_META_LIVE_TTL_MS = 120000;
const META_ACCOUNT_CACHE_TTL_MS = 3600000;
const DEFAULT_FX_MAX_LOOKBACK_DAYS = 7;
const DEFAULT_DATA_REFRESH_COOLDOWN_MS = 300000;
/**
 * How old a payload covering today may get before the current day inside it is
 * refetched. The refresh cooldown still rate-limits the actual fetches, so this
 * only decides when a refresh becomes worth asking for.
 */
const DEFAULT_INTRADAY_CACHE_MAX_AGE_MS = 1800000;
const metaLiveTtlRaw = Number(process.env.SHAWQ_META_LIVE_TTL_MS || process.env.META_LIVE_TTL_MS || DEFAULT_META_LIVE_TTL_MS);
const fxMaxLookbackRaw = Number(process.env.SHAWQ_FX_MAX_LOOKBACK_DAYS || process.env.FX_MAX_LOOKBACK_DAYS || DEFAULT_FX_MAX_LOOKBACK_DAYS);
const dataRefreshCooldownRaw = Number(process.env.DATA_REFRESH_COOLDOWN_MS || DEFAULT_DATA_REFRESH_COOLDOWN_MS);
const metaLiveTtlMs = Number.isFinite(metaLiveTtlRaw) && metaLiveTtlRaw > 0 ? metaLiveTtlRaw : DEFAULT_META_LIVE_TTL_MS;
const fxMaxLookbackDays = Number.isFinite(fxMaxLookbackRaw) && fxMaxLookbackRaw >= 0 ? Math.floor(fxMaxLookbackRaw) : DEFAULT_FX_MAX_LOOKBACK_DAYS;
const dataRefreshCooldownMs = Number.isFinite(dataRefreshCooldownRaw) && dataRefreshCooldownRaw > 0 ? dataRefreshCooldownRaw : DEFAULT_DATA_REFRESH_COOLDOWN_MS;
const intradayCacheMaxAgeRaw = Number(process.env.INTRADAY_CACHE_MAX_AGE_MS || DEFAULT_INTRADAY_CACHE_MAX_AGE_MS);
const intradayCacheMaxAgeMs = Number.isFinite(intradayCacheMaxAgeRaw) && intradayCacheMaxAgeRaw > 0
  ? intradayCacheMaxAgeRaw
  : DEFAULT_INTRADAY_CACHE_MAX_AGE_MS;
let metaLiveCache = { key: '', fetchedAt: 0, payload: null };
let metaLiveInFlight = { key: '', promise: null };
let metaAccountCache = { fetchedAt: 0, payload: null };
const fxCache = new Map();

// Behavior regeneration is expensive (Meta + Shopify + full session-event log). Cap how
// often the background refresh actually runs so constant pixel traffic can't peg it.
const BEHAVIOR_REFRESH_MIN_INTERVAL_MS = Number(process.env.BEHAVIOR_REFRESH_MIN_INTERVAL_MS || 180000);
let lastBehaviorRefreshAt = 0;
let sessionBehaviorRefreshTimer = null;
let sessionBehaviorRefreshInFlight = false;
let sessionBehaviorRefreshPending = false;

async function runBehaviorRefresh() {
  if (sessionBehaviorRefreshInFlight) {
    sessionBehaviorRefreshPending = true;
    return;
  }
  sessionBehaviorRefreshInFlight = true;
  try {
    do {
      sessionBehaviorRefreshPending = false;
      const result = await runScript('fetch:behavior', behaviorBackfillEnv());
      if (result.code !== 0) console.warn(result.output || 'fetch:behavior background refresh failed');
    } while (sessionBehaviorRefreshPending);
  } catch (error) {
    console.warn('behavior background refresh failed:', error.message);
  } finally {
    sessionBehaviorRefreshInFlight = false;
  }
}

// Request a throttled, non-blocking behavior refresh. Safe to call on every pixel event
// and every behavior GET: while a refresh is in flight, later calls set the pending flag so
// one more run follows; within the min-interval quiet period exactly ONE trailing refresh is
// armed for when the period expires. The timer is set ONCE and never reset by subsequent
// calls, so continuous polling/events cannot starve it (the bug a resettable debounce had).
function requestBehaviorRefresh() {
  if (sessionBehaviorRefreshInFlight) {
    sessionBehaviorRefreshPending = true;
    return;
  }
  const timeSinceLast = lastBehaviorRefreshAt ? Date.now() - lastBehaviorRefreshAt : Infinity;
  if (timeSinceLast < BEHAVIOR_REFRESH_MIN_INTERVAL_MS) {
    if (!sessionBehaviorRefreshTimer) {
      sessionBehaviorRefreshTimer = setTimeout(() => {
        sessionBehaviorRefreshTimer = null;
        void runBehaviorRefresh();
      }, BEHAVIOR_REFRESH_MIN_INTERVAL_MS - timeSinceLast);
      sessionBehaviorRefreshTimer.unref?.();
    }
    return;
  }
  void runBehaviorRefresh();
}

// Live orders map: location resolver + webhook-sourced purchase store.
const shopifyWebhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET || '';
const locationCachePath = process.env.LOCATION_CACHE_PATH || path.join(dataDir, 'location-cache.json');
const webhookStorePath = process.env.ORDERS_MAP_STORE_PATH || path.join(dataDir, 'orders-map.json');
const locationStore = createLocationStore({ cachePath: locationCachePath, geocoder: createGeocoder(process.env) });
const MAX_STORED_PURCHASES = 250;

function loadWebhookPurchases() {
  if (!fs.existsSync(webhookStorePath)) return { ids: new Set(), purchases: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(webhookStorePath, 'utf8'));
    const purchases = Array.isArray(raw.purchases) ? raw.purchases : [];
    return { ids: new Set(purchases.map((p) => String(p.id))), purchases };
  } catch {
    return { ids: new Set(), purchases: [] };
  }
}

const webhookStore = loadWebhookPurchases();

async function persistWebhookPurchases() {
  try {
    await fs.promises.mkdir(path.dirname(webhookStorePath), { recursive: true });
    await fs.promises.writeFile(
      webhookStorePath,
      JSON.stringify({ purchases: webhookStore.purchases.slice(0, MAX_STORED_PURCHASES) }),
    );
  } catch {
    // Best-effort persistence only.
  }
}

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
    child.on('close', (code) => {
      // Persist asynchronously without blocking runScript resolution: serveData
      // serves behavior data from the public path, so the client need not wait
      // for the volume copy. persistBehaviorToVolume handles its own errors.
      if (code === 0 && script === 'fetch:behavior') {
        lastBehaviorRefreshAt = Date.now();
        void persistBehaviorToVolume();
      }
      resolve({ code, output });
    });
  });
}

function publicDataPath(name) {
  return path.join(__dirname, 'public', 'data', name);
}

// Behavior intelligence accumulates across refreshes via mergeBehaviorSnapshot,
// but its working copy lives in public/data which resets to the committed seed on
// every redeploy. Mirror it to the durable data volume so accumulation survives
// restarts: on boot restore volume -> public (or seed the volume from the
// committed snapshot the first time), and copy public -> volume after each fetch.
const behaviorPublicPath = publicDataPath('behavior-intelligence.json');
const behaviorVolumePath = path.join(dataDir, 'behavior-intelligence.json');
const behaviorPersistEnabled = Boolean(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH);

function restoreBehaviorFromVolume() {
  if (!behaviorPersistEnabled) return;
  try {
    if (fs.existsSync(behaviorVolumePath)) {
      fs.copyFileSync(behaviorVolumePath, behaviorPublicPath);
      console.log(`Restored behavior snapshot from volume: ${behaviorVolumePath}`);
    } else if (fs.existsSync(behaviorPublicPath)) {
      fs.copyFileSync(behaviorPublicPath, behaviorVolumePath);
      console.log(`Seeded behavior volume from committed snapshot: ${behaviorVolumePath}`);
    }
  } catch (error) {
    console.warn('restoreBehaviorFromVolume failed:', error.message);
  }
}

async function persistBehaviorToVolume() {
  if (!behaviorPersistEnabled) return;
  try {
    await fs.promises.copyFile(behaviorPublicPath, behaviorVolumePath);
  } catch (error) {
    // ENOENT just means the snapshot hasn't been written yet — not an error worth logging.
    if (error.code !== 'ENOENT') console.warn('persistBehaviorToVolume failed:', error.message);
  }
}

// Cache parsed JSON keyed by file mtime so hot paths (per-order attribution
// matching, per-row FX lookups) don't re-read and re-parse large files from
// disk on every call and block the event loop.
const jsonFileCache = new Map();
function readJsonCached(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const cached = jsonFileCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    jsonFileCache.set(filePath, { mtimeMs: stat.mtimeMs, data });
    return data;
  } catch {
    return null;
  }
}

function isAuthorized(req) {
  return Boolean(refreshKey && req.headers.authorization === `Bearer ${refreshKey}`);
}

function isSessionEventAuthorized(req, url) {
  if (!sessionEventKey) return true;
  return req.headers['x-session-event-key'] === sessionEventKey || url.searchParams.get('key') === sessionEventKey;
}

function shopifyBackfillEnv(extra = {}) {
  return {
    SHOPIFY_BACKFILL_START_DATE: SHOPIFY_HISTORICAL_SINCE,
    ...extra,
  };
}

function behaviorBackfillEnv(extra = {}) {
  const launchSince = process.env.BEHAVIOR_SINCE || process.env.BACKFILL_START_DATE || '2026-06-03';
  const env = {
    BACKFILL_START_DATE: process.env.BACKFILL_START_DATE || launchSince,
    ...extra,
  };
  if (!extra.SINCE && !extra.BEHAVIOR_SINCE) {
    env.BEHAVIOR_SINCE = launchSince;
  }
  return env;
}

function readShopifyPeriodSince(filePath) {
  if (!fs.existsSync(filePath)) return null;
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    const chunk = buf.toString('utf8', 0, bytes);
    const match = chunk.match(/"period"\s*:\s*\{[\s\S]*?"since"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
    if (match?.[1]) return match[1];
  } catch {
    // Fall through to full read fallback.
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
  try {
    return readJsonCached(filePath)?.period?.since || null;
  } catch {
    return null;
  }
}

function shopifyCacheNeedsHistoricalBackfill(filePath) {
  if (!fs.existsSync(filePath)) return true;
  const since = readShopifyPeriodSince(filePath);
  return !since || since > SHOPIFY_HISTORICAL_SINCE;
}

function readDataPeriod(filePath) {
  const data = readJsonCached(filePath) || {};
  const period = data.period || data.analysis_window || {};
  return {
    since: period.since || '',
    until: period.until || '',
  };
}

function cacheUntilBeforeToday(filePath, timeZone) {
  if (!fs.existsSync(filePath)) return true;
  const { until } = readDataPeriod(filePath);
  const today = dateInTimezone(new Date(), timeZone);
  return Boolean(today && (!until || until < today));
}

/**
 * True when a payload that already covers today was built long enough ago that
 * today's figures inside it have gone stale.
 *
 * Date coverage is not freshness. `cacheUntilBeforeToday` stops asking for a
 * refresh the moment a payload's `until` reaches today, so the first fetch of
 * the morning froze the current day for the rest of it: spend kept accruing at
 * Meta while the dashboard held the 04:30 snapshot. Orders landing later were
 * then divided by that morning's spend, which is how one $93.99 order against
 * $0.78 of recorded spend published a 120x ad ROAS on a day Meta reported 7.4x
 * for the same ad.
 */
function cacheGeneratedBefore(filePath, maxAgeMs) {
  if (!fs.existsSync(filePath)) return true;
  const generatedAt = Date.parse((readJsonCached(filePath) || {}).generated_at || '');
  // An unreadable or missing timestamp is treated as stale: refusing to refresh
  // on the strength of a timestamp we could not read is how data freezes.
  if (!Number.isFinite(generatedAt)) return true;
  return Date.now() - generatedAt > maxAgeMs;
}

function metaCacheNeedsRefresh(filePath) {
  if (cacheUntilBeforeToday(filePath, metaReportingTimezone)) return true;
  if (cacheGeneratedBefore(filePath, intradayCacheMaxAgeMs)) return true;
  const { since } = readDataPeriod(filePath);
  const desiredSince = process.env.META_SINCE || process.env.SINCE || process.env.BACKFILL_START_DATE || '2026-06-03';
  return Boolean(since && desiredSince && since > desiredSince);
}

function shopifyCacheNeedsRefresh(filePath) {
  return shopifyCacheNeedsHistoricalBackfill(filePath)
    || cacheUntilBeforeToday(filePath, shopifyReportingTimezone)
    || cacheGeneratedBefore(filePath, intradayCacheMaxAgeMs);
}

function inDataRefreshCooldown(lastAttemptAt, now = Date.now()) {
  return Boolean(lastAttemptAt && now - lastAttemptAt < dataRefreshCooldownMs);
}

function dataCacheNeedsRefresh(filePath, script) {
  if (script === 'fetch:meta') {
    if (inDataRefreshCooldown(lastMetaFetchAttemptAt)) return false;
    return metaCacheNeedsRefresh(filePath);
  }
  if (script === 'fetch:shopify') {
    if (inDataRefreshCooldown(lastShopifyFetchAttemptAt)) return false;
    return shopifyCacheNeedsRefresh(filePath);
  }
  return false;
}

let shopifyFetchPromise = null;
let metaFetchPromise = null;
let lastMetaFetchAttemptAt = 0;
let lastShopifyFetchAttemptAt = 0;

function runMetaFetch(extraEnv = {}) {
  if (metaFetchPromise) return metaFetchPromise;
  lastMetaFetchAttemptAt = Date.now();
  metaFetchPromise = runScript('fetch:meta', extraEnv).finally(() => {
    metaFetchPromise = null;
  });
  return metaFetchPromise;
}

function runShopifyFetch(extraEnv = {}) {
  if (shopifyFetchPromise) return shopifyFetchPromise;
  lastShopifyFetchAttemptAt = Date.now();
  shopifyFetchPromise = runScript('fetch:shopify', shopifyBackfillEnv(extraEnv)).finally(() => {
    shopifyFetchPromise = null;
  });
  return shopifyFetchPromise;
}

function scheduleShopifyHistoricalBackfill(filePath, extraEnv = {}) {
  if (!shopifyCacheNeedsHistoricalBackfill(filePath)) return null;
  if (!process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN || !process.env.SHAWQ_SHOPIFY_STORE) return null;
  const promise = runShopifyFetch(extraEnv);
  promise.then((result) => {
    if (result?.code !== 0) console.warn(result?.output || 'shopify historical backfill failed');
  }).catch((error) => {
    console.warn(error?.message || 'shopify historical backfill failed');
  });
  return promise;
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

function dateInTimezone(date = new Date(), timeZone = shopifyReportingTimezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function addDaysToIsoDate(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function zonedDateTimeToUtcIso(date, timeZone, endOfDay = false) {
  const [year, month, day] = String(date || '').split('-').map(Number);
  const hour = endOfDay ? 23 : 0;
  const minute = endOfDay ? 59 : 0;
  const second = endOfDay ? 59 : 0;
  const millisecond = endOfDay ? 999 : 0;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
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
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, millisecond);
  return new Date(utcGuess - (zonedAsUtc - utcGuess)).toISOString();
}

function nextLinkUrl(linkHeader = '') {
  const next = String(linkHeader || '').split(',').find((part) => part.includes('rel="next"'));
  return next ? new URL(next.slice(next.indexOf('<') + 1, next.indexOf('>'))) : null;
}

function normalizeCurrency(value, fallback = 'USD') {
  const currency = String(value || fallback || 'USD').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : fallback;
}

function shopifyConfig() {
  return {
    token: process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN,
    store: process.env.SHAWQ_SHOPIFY_STORE || process.env.SHOPIFY_STORE || 'f3e7e9-2.myshopify.com',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2025-10',
  };
}

function metaConfig() {
  return {
    token: process.env.SHAWQ_META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN,
    account: (process.env.SHAWQ_META_AD_ACCOUNT_ID || process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, ''),
    graphVersion: process.env.META_GRAPH_VERSION || 'v20.0',
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

function readRawBody(req, maxBytes = 2000000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyShopifyHmac(rawBody, headerHmac) {
  if (!shopifyWebhookSecret || !headerHmac) return false;
  const digest = crypto.createHmac('sha256', shopifyWebhookSecret).update(rawBody).digest('base64');
  const a = Buffer.from(digest);
  const b = Buffer.from(String(headerHmac));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handleShopifyWebhook(req, res) {
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    send(res, 413, JSON.stringify({ ok: false, error: error.message }));
    return;
  }

  // Validate the HMAC against the raw body BEFORE parsing or storing anything.
  const headerHmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyShopifyHmac(rawBody, headerHmac)) {
    send(res, 401, JSON.stringify({ ok: false, error: 'invalid webhook signature' }));
    return;
  }

  let order;
  try {
    order = JSON.parse(rawBody.toString('utf8'));
  } catch {
    send(res, 400, JSON.stringify({ ok: false, error: 'invalid json' }));
    return;
  }

  const orderId = String(order.id || req.headers['x-shopify-order-id'] || '');
  // Idempotency: ignore retries for an order we already stored.
  if (orderId && webhookStore.ids.has(orderId)) {
    send(res, 200, JSON.stringify({ ok: true, duplicate: true }));
    return;
  }

  try {
    const purchase = await buildPurchase(order, locationStore, orderMapExtras(order));
    if (purchase && purchase.id) {
      webhookStore.ids.add(purchase.id);
      webhookStore.purchases = [purchase, ...webhookStore.purchases.filter((p) => p.id !== purchase.id)]
        .slice(0, MAX_STORED_PURCHASES);
      void persistWebhookPurchases();
    }
    send(res, 200, JSON.stringify({ ok: true, stored: Boolean(purchase) }));
  } catch (error) {
    // Acknowledge with 200 so Shopify does not retry a non-recoverable parse.
    send(res, 200, JSON.stringify({ ok: false, error: error.message }));
  }
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

function behaviorNeedsSessionRefresh(behaviorFile) {
  if (!fs.existsSync(sessionEventsPath)) return false;
  const status = sessionEventStatus();
  if (!status.configured || status.count === 0) return false;
  if (!fs.existsSync(behaviorFile)) return true;
  try {
    const sessionMtime = fs.statSync(sessionEventsPath).mtimeMs;
    const behaviorMtime = fs.statSync(behaviorFile).mtimeMs;
    if (sessionMtime > behaviorMtime) return true;
    const behavior = JSON.parse(fs.readFileSync(behaviorFile, 'utf8'));
    const cachedCount = Number(behavior?.extraction?.session_events?.count || 0);
    return status.count > cachedCount;
  } catch {
    return true;
  }
}

function behaviorNeedsRefresh(behaviorFile) {
  if (!fs.existsSync(behaviorFile)) return true;
  if (behaviorNeedsSessionRefresh(behaviorFile)) return true;
  try {
    const behavior = JSON.parse(fs.readFileSync(behaviorFile, 'utf8'));
    const until = behavior?.period?.until || '';
    const today = dateInTimezone(new Date(), shopifyReportingTimezone);
    if (today && until && until < today) return true;
    const since = behavior?.period?.since || '';
    const launchSince = process.env.BEHAVIOR_SINCE || process.env.BACKFILL_START_DATE || '2026-06-03';
    return Boolean(since && launchSince && since > launchSince);
  } catch {
    return true;
  }
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
    requestBehaviorRefresh();
    send(res, 200, JSON.stringify({ ok: true }));
  } catch (error) {
    send(res, 400, JSON.stringify({ ok: false, error: error.message }));
  }
}

function countReplayChunksForSession(sessionKey) {
  const index = readReplayIndex(sessionReplayIndexPath);
  const row = index.sessions.find((entry) => entry.session_key === sessionKey);
  return Number(row?.replay_chunks || 0);
}

async function recordSessionReplay(req, res, url) {
  if (!isSessionEventAuthorized(req, url)) {
    send(res, 401, JSON.stringify({ ok: false, error: 'unauthorized' }));
    return;
  }
  try {
    const text = await readRequestBody(req, MAX_REPLAY_BODY_BYTES);
    const payload = text ? JSON.parse(text) : {};
    const sessionId = String(payload.session_id || payload.sessionId || '').trim();
    const clientId = String(payload.client_id || payload.clientId || '').trim();
    const sessionKey = hashSessionKey(clientId || sessionId);
    const events = Array.isArray(payload.events) ? payload.events.slice(0, MAX_REPLAY_CHUNK_EVENTS) : [];
    if (!sessionKey) {
      send(res, 400, JSON.stringify({ ok: false, error: 'session_id or client_id required' }));
      return;
    }
    if (!events.length) {
      send(res, 400, JSON.stringify({ ok: false, error: 'events array required' }));
      return;
    }
    if (countReplayChunksForSession(sessionKey) >= MAX_REPLAY_CHUNKS_PER_SESSION) {
      send(res, 429, JSON.stringify({ ok: false, error: 'session replay chunk limit reached' }));
      return;
    }
    const chunk = sanitizePixelPayload({
      received_at: new Date().toISOString(),
      session_id: sessionId,
      client_id: clientId,
      session_key: sessionKey,
      chunk_seq: Number(payload.chunk_seq || payload.seq || 0),
      timestamp: payload.timestamp || new Date().toISOString(),
      path: payload.path || payload.url || '',
      country_code: payload.country_code || payload.countryCode || '',
      viewport: payload.viewport || null,
      events,
    });
    if (url.searchParams.get('dry_run') === '1') {
      send(res, 200, JSON.stringify({ ok: true, dry_run: true, session_key: sessionKey, events: events.length }));
      return;
    }
    fs.mkdirSync(path.dirname(sessionReplayPath), { recursive: true });
    fs.appendFileSync(sessionReplayPath, `${JSON.stringify(chunk)}\n`);
    const index = readReplayIndex(sessionReplayIndexPath);
    const nextSessions = upsertReplayIndexEntry(index.sessions, {
      session_id: sessionId,
      client_id: clientId,
      country_code: chunk.country_code,
      received_at: chunk.received_at,
      timestamp: chunk.timestamp,
      path: chunk.path,
      replay_chunks: 1,
      replay_events: events.length,
      has_replay: true,
    });
    writeReplayIndex(sessionReplayIndexPath, nextSessions);
    send(res, 200, JSON.stringify({ ok: true, session_key: sessionKey, events: events.length }));
  } catch (error) {
    send(res, 400, JSON.stringify({ ok: false, error: error.message }));
  }
}

function serveSessionReplayIndex(req, res, url) {
  buildSessionReplayIndex({
    sessionEventsPath,
    replayIndexPath: sessionReplayIndexPath,
    replayPath: sessionReplayPath,
  });
  const limit = Number(url.searchParams.get('limit') || 25);
  const sessions = listCheckoutReplaySessions(sessionReplayIndexPath, { limit });
  send(res, 200, JSON.stringify({ ok: true, sessions }));
}

function serveSessionReplaySession(req, res, sessionKey, url) {
  const key = String(sessionKey || '').trim();
  if (!/^[a-f0-9]{16}$/.test(key)) {
    send(res, 400, JSON.stringify({ ok: false, error: 'invalid session key' }));
    return;
  }
  const sessionId = String(url.searchParams.get('session_id') || '').trim();
  const clientId = String(url.searchParams.get('client_id') || '').trim();
  const replay = loadSessionReplayChunks(sessionReplayPath, key, sessionId, clientId);
  const pixelEvents = loadSessionPixelEvents(sessionEventsPath, key, sessionId, clientId);
  const outcome = checkoutOutcomeFromEvents(pixelEvents);
  const theater = buildCheckoutTheaterScript(pixelEvents);
  send(res, 200, JSON.stringify({
    ok: true,
    session_key: key,
    session_id: sessionId || pixelEvents.find((event) => event.session_id)?.session_id || '',
    client_id: clientId || pixelEvents.find((event) => event.client_id)?.client_id || '',
    has_replay: replay.events.length > 0,
    replay_events: replay.events.length,
    replay_chunks: replay.chunks,
    checkout_timeline: summarizePixelTimeline(pixelEvents.filter((event) => /checkout|cart|payment|page_viewed|product_viewed|collection_viewed/i.test(event.event_name || ''))),
    checkout_theater: theater,
    checkout_outcome: outcome,
    checkout_outcome_label: formatCheckoutOutcome(outcome),
    pixel_events: pixelEvents.length,
    events: replay.events,
  }));
}

function publicAppBaseUrl(req) {
  const configured = process.env.SHAWQ_PUBLIC_APP_URL || process.env.PUBLIC_APP_URL || '';
  if (configured) return String(configured).replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return host ? `${proto}://${host}` : '';
}

function serveHostedSessionRecorder(req, res) {
  const baseUrl = publicAppBaseUrl(req);
  const endpoint = `${baseUrl}/api/session-replay`;
  const body = buildSessionRecorderScript({
    endpoint,
    ingestKey: sessionEventKey,
    store: process.env.SHAWQ_STORE_SLUG || 'shawq',
  });
  res.writeHead(200, {
    'content-type': 'application/javascript; charset=utf-8',
    'cache-control': 'public, max-age=300',
    'access-control-allow-origin': '*',
  });
  res.end(body);
}

async function serveShopifyRecorderStatus(_req, res) {
  const { token, store, apiVersion } = shopifyConfig();
  if (!token || !store) {
    send(res, 200, JSON.stringify({ ok: false, configured: false, error: 'Shopify token or store is not configured' }));
    return;
  }
  try {
    const tags = await listShopifyScriptTags({ token, store, apiVersion });
    const hosted = tags.filter((tag) => String(tag.src || '').includes('/shopify/session-recorder.js'));
    send(res, 200, JSON.stringify({
      ok: true,
      configured: true,
      store,
      script_tags: hosted,
      installed: hosted.length > 0,
      hosted_src: recorderScriptTagSrc(publicAppBaseUrl(_req) || process.env.SHAWQ_PUBLIC_APP_URL || ''),
    }));
  } catch (error) {
    send(res, 502, JSON.stringify({ ok: false, configured: true, error: error.message, installed: false }));
  }
}

async function installShopifyRecorder(req, res) {
  if (!isAuthorized(req)) {
    send(res, 401, JSON.stringify({ ok: false, error: 'unauthorized' }));
    return;
  }
  const { token, store, apiVersion } = shopifyConfig();
  if (!token || !store) {
    send(res, 503, JSON.stringify({ ok: false, error: 'Shopify token or store is not configured' }));
    return;
  }
  try {
    const src = recorderScriptTagSrc(publicAppBaseUrl(req) || process.env.SHAWQ_PUBLIC_APP_URL || '');
    const result = await ensureShopifyRecorderScriptTag({ token, store, apiVersion, src });
    send(res, 200, JSON.stringify({ ok: true, ...result, src }));
  } catch (error) {
    send(res, 502, JSON.stringify({
      ok: false,
      error: error.message,
      hint: 'Admin token needs write_script_tags scope. Custom pixels still require manual install in Customer events.',
    }));
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
    const data = readJsonCached(publicDataPath('adset-radar.json'));
    const ads = data?.ads || [];
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

async function graphGet(url) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`Meta API ${response.status}: ${text.slice(0, 1000)}`);
  return JSON.parse(text);
}

async function getMetaAccountMetadata() {
  const { token, account, graphVersion } = metaConfig();
  if (!token || !account) return { currency: process.env.META_ACCOUNT_CURRENCY || 'TRY', timezone_name: metaReportingTimezone };
  const now = Date.now();
  if (metaAccountCache.payload && now - metaAccountCache.fetchedAt < META_ACCOUNT_CACHE_TTL_MS) return metaAccountCache.payload;
  const base = new URL(`https://graph.facebook.com/${graphVersion}/act_${account}`);
  base.searchParams.set('access_token', token);
  base.searchParams.set('fields', 'currency,account_status,name,timezone_id,timezone_name,timezone_offset_hours_utc');
  try {
    const payload = await graphGet(base.toString());
    metaAccountCache = { fetchedAt: now, payload };
    return payload;
  } catch (error) {
    console.warn(`Could not fetch Meta metadata: ${error.message}`);
    return { currency: process.env.META_ACCOUNT_CURRENCY || 'TRY', timezone_name: metaReportingTimezone };
  }
}

function parseFxPayload(data, toCurrency) {
  const to = String(toCurrency || 'USD').toUpperCase();
  return {
    rate: Number(data?.rate ?? data?.rates?.[to] ?? 0),
    rate_date: data?.date || '',
  };
}

function cachedFxRateInfo(date, fromCurrency, toCurrency) {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (from === to) return { rate: 1, provider: 'identity', source: 'same_currency', requested_date: date, rate_date: date, from, to };
  if (to !== 'USD') return null;
  try {
    const data = readJsonCached(publicDataPath('adset-radar.json'));
    const match = (data?.fx_rates?.rates || []).find((row) => row.date === date && Number(row.fx_to_usd || 0) > 0);
    if (!match) return null;
    return {
      rate: Number(match.fx_to_usd || 0),
      provider: match.fx_to_usd_provider || 'cached',
      source: `cached_${match.fx_to_usd_source || 'fx_rate'}`,
      requested_date: match.fx_to_usd_requested_date || date,
      rate_date: match.fx_to_usd_rate_date || date,
      from,
      to,
    };
  } catch {
    return null;
  }
}

async function fetchFrankfurterDailyRate(candidateDate, from, to) {
  const url = new URL(`https://api.frankfurter.dev/v2/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}`);
  url.searchParams.set('date', candidateDate);
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  const { rate, rate_date } = parseFxPayload(data, to);
  if (!(rate > 0)) return null;
  if (rate_date && rate_date !== candidateDate) return null;
  return {
    rate,
    provider: 'Frankfurter',
    source: 'frankfurter_v2_daily',
    rate_date: candidateDate,
  };
}

async function frankfurterRateWithBackoff(date, from, to) {
  for (let lookbackDays = 0; lookbackDays <= fxMaxLookbackDays; lookbackDays += 1) {
    const candidateDate = addDaysToIsoDate(date, -lookbackDays);
    try {
      const daily = await fetchFrankfurterDailyRate(candidateDate, from, to);
      if (daily) {
        return {
          ...daily,
          requested_date: date,
          lookup_date: candidateDate,
          lookback_days: lookbackDays,
          source: lookbackDays ? 'frankfurter_v2_previous_day_backoff' : daily.source,
          from,
          to,
        };
      }
    } catch {}
  }
  return null;
}

async function fxRateInfo(date, fromCurrency, toCurrency) {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  const cacheKey = `${date}:${from}:${to}`;
  if (fxCache.has(cacheKey)) return fxCache.get(cacheKey);
  const cached = isIsoDate(date) ? cachedFxRateInfo(date, from, to) : null;
  if (cached) {
    fxCache.set(cacheKey, cached);
    return cached;
  }
  if (from === to) {
    const identity = { rate: 1, provider: 'identity', source: 'same_currency', requested_date: date, rate_date: date, from, to };
    fxCache.set(cacheKey, identity);
    return identity;
  }

  if (isIsoDate(date)) {
    const frankfurter = await frankfurterRateWithBackoff(date, from, to);
    if (frankfurter) {
      fxCache.set(cacheKey, frankfurter);
      return frankfurter;
    }
  }
  const fallback = { rate: 1, provider: 'fallback', source: 'identity_after_fx_failure', requested_date: date, rate_date: date, lookup_date: date, lookback_days: null, from, to };
  fxCache.set(cacheKey, fallback);
  return fallback;
}

async function fxContext(date, fromCurrency) {
  const from = normalizeCurrency(fromCurrency, 'TRY');
  const usd = await fxRateInfo(date, from, 'USD');
  const tryRate = from === 'TRY'
    ? { rate: 1, provider: 'identity', source: 'same_currency', requested_date: date, rate_date: date }
    : await fxRateInfo(date, from, 'TRY');
  return {
    fx_to_usd: usd.rate,
    fx_to_usd_provider: usd.provider,
    fx_to_usd_source: usd.source,
    fx_to_usd_requested_date: usd.requested_date,
    fx_to_usd_rate_date: usd.rate_date,
    fx_to_usd_lookup_date: usd.lookup_date || usd.rate_date,
    fx_to_usd_lookback_days: usd.lookback_days ?? 0,
    fx_to_try: tryRate.rate,
    fx_to_try_provider: tryRate.provider,
    fx_to_try_source: tryRate.source,
    fx_to_try_requested_date: tryRate.requested_date,
    fx_to_try_rate_date: tryRate.rate_date,
    fx_to_try_lookup_date: tryRate.lookup_date || tryRate.rate_date,
    fx_to_try_lookback_days: tryRate.lookback_days ?? 0,
  };
}

function countryName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
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

async function normalizeMetaInsightRow(row, accountCurrency) {
  const date = row.date_start;
  const spend = Number(row.spend || 0);
  const impressions = Number(row.impressions || 0);
  const clicks = Number(row.clicks || 0);
  const reach = Number(row.reach || 0);
  const fx = await fxContext(date, accountCurrency);
  const purchaseValue = metricFromActions(row.action_values, ['offsite_conversion.fb_pixel_purchase', 'omni_purchase', 'purchase'], ['purchase']);
  const purchases = metricFromActions(row.actions, ['offsite_conversion.fb_pixel_purchase', 'omni_purchase', 'purchase'], ['purchase']);
  const addToCart = metricFromActions(row.actions, ['offsite_conversion.fb_pixel_add_to_cart', 'omni_add_to_cart', 'add_to_cart'], ['add_to_cart']);
  const checkoutInitiated = metricFromActions(row.actions, ['offsite_conversion.fb_pixel_initiate_checkout', 'omni_initiated_checkout', 'initiate_checkout', 'initiated_checkout'], ['initiate_checkout', 'initiated_checkout']);
  const linkClicks = metricFromActions(row.actions, ['link_click'], ['link_click']);
  const inlineLinkClicks = Number(row.inline_link_clicks || linkClicks || 0);
  const outboundClicks = numericMetric(row.outbound_clicks);
  const ctrAll = Number(row.ctr || (impressions ? clicks / impressions * 100 : 0));
  const clickCtr = clickThroughCtr({ impressions, inlineLinkClicks, inlineLinkCtr: row.inline_link_click_ctr, outboundCtr: row.outbound_clicks_ctr, ctrAll });
  const product = productTaxonomyForName(row.ad_name || row.adset_name || row.campaign_name);
  const spend_usd = spend * fx.fx_to_usd;
  const spend_try = spend * fx.fx_to_try;
  const purchase_value_usd = purchaseValue * fx.fx_to_usd;
  const purchase_value_try = purchaseValue * fx.fx_to_try;
  return {
    date,
    date_start: row.date_start || date,
    date_stop: row.date_stop || date,
    country_code: row.country || '',
    country: row.country ? countryName(row.country) : '',
    campaign_id: row.campaign_id || '',
    campaign_name: row.campaign_name || '',
    adset_id: row.adset_id || '',
    adset_name: row.adset_name || '',
    ad_id: row.ad_id || '',
    ad_name: row.ad_name || '',
    product_family: product.family,
    product_subtype: product.subtype,
    spend,
    spend_currency: accountCurrency,
    ...fx,
    spend_usd,
    spend_try,
    impressions,
    reach,
    frequency: Number(row.frequency || (reach ? impressions / reach : 0)),
    clicks_all: clicks,
    link_clicks: inlineLinkClicks,
    outbound_clicks: outboundClicks,
    ctr_all: ctrAll,
    ctr: clickCtr.ctr,
    ctr_source: clickCtr.source,
    cpm: Number(row.cpm || (impressions ? spend / impressions * 1000 : 0)),
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
    live_today: true,
  };
}

const liveAccountMetaFields = [
  'date_start', 'date_stop',
  'spend', 'impressions', 'reach', 'frequency', 'cpm', 'ctr', 'clicks',
  'inline_link_clicks', 'inline_link_click_ctr', 'outbound_clicks', 'outbound_clicks_ctr',
  'actions', 'action_values', 'purchase_roas',
].join(',');

const liveMetaFields = [
  'date_start', 'date_stop', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
  'spend', 'impressions', 'reach', 'frequency', 'cpm', 'ctr', 'clicks',
  'inline_link_clicks', 'inline_link_click_ctr', 'outbound_clicks', 'outbound_clicks_ctr',
  'actions', 'action_values', 'purchase_roas',
].join(',');

const liveHourlyMetaFields = [
  'date_start', 'date_stop', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name',
  'spend', 'impressions',
].join(',');

async function getMetaInsights({ level, date, breakdowns, fields }) {
  const { token, account, graphVersion } = metaConfig();
  const base = new URL(`https://graph.facebook.com/${graphVersion}/act_${account}/insights`);
  base.searchParams.set('access_token', token);
  base.searchParams.set('level', level);
  base.searchParams.set('time_increment', '1');
  base.searchParams.set('limit', '500');
  base.searchParams.set('fields', fields || (level === 'account' ? liveAccountMetaFields : liveMetaFields));
  base.searchParams.set('time_range', JSON.stringify({ since: date, until: date }));
  if (breakdowns) base.searchParams.set('breakdowns', breakdowns);
  let next = base.toString();
  const rows = [];
  while (next) {
    const data = await graphGet(next);
    rows.push(...(data.data || []));
    next = data.paging?.next || null;
  }
  return rows;
}

function aggregateMetaRows(rows = [], seed = {}) {
  const out = {
    ...seed,
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
  };
  for (const row of rows) {
    for (const key of ['spend', 'spend_usd', 'spend_try', 'impressions', 'reach', 'clicks_all', 'link_clicks', 'outbound_clicks', 'purchases', 'add_to_cart', 'checkout_initiated', 'purchase_value', 'purchase_value_usd', 'purchase_value_try']) out[key] += Number(row[key] || 0);
  }
  out.frequency = out.reach ? out.impressions / out.reach : 0;
  out.ctr_all = out.impressions ? out.clicks_all / out.impressions * 100 : 0;
  out.ctr = out.impressions ? out.link_clicks / out.impressions * 100 : 0;
  out.ctr_source = 'live_aggregate_link_clicks';
  out.cpm = out.impressions ? out.spend / out.impressions * 1000 : 0;
  out.cpm_usd = out.impressions ? out.spend_usd / out.impressions * 1000 : 0;
  out.cpm_try = out.impressions ? out.spend_try / out.impressions * 1000 : 0;
  out.reach_per_dollar = out.spend_usd ? out.reach / out.spend_usd : 0;
  out.roas = out.spend ? out.purchase_value / out.spend : 0;
  out.cpa_usd = out.purchases ? out.spend_usd / out.purchases : 0;
  out.cpa_try = out.purchases ? out.spend_try / out.purchases : 0;
  return out;
}

function emptyLiveMetaPayload({ ok = false, configured = false, error = '', status = 'unavailable', accountCurrency = '', date = dateInTimezone(new Date(), metaReportingTimezone) } = {}) {
  return {
    ok,
    configured,
    source: 'meta_live_insights',
    status,
    error,
    date,
    timezone: metaReportingTimezone,
    checked_at: new Date().toISOString(),
    ttl_ms: metaLiveTtlMs,
    account_currency: accountCurrency,
    cached: false,
    cache_age_ms: 0,
    account_daily_metrics: [],
    ad_country_daily: [],
    adset_daily: [],
    pacing_adset_daily: [],
    pacing_hourly: [],
    data_coverage: {
      account_rows: 0,
      ad_country_daily_rows: 0,
      adset_daily_rows: 0,
      pacing_hourly_rows: 0,
    },
  };
}

function settledRows(result, label, errors) {
  if (result.status === 'fulfilled') return result.value;
  errors.push({ scope: label, error: result.reason?.message || String(result.reason || 'Meta request failed') });
  return [];
}

async function fetchLiveMetaSpend() {
  const { token, account } = metaConfig();
  const date = dateInTimezone(new Date(), metaReportingTimezone);
  if (!token || !account) {
    return emptyLiveMetaPayload({
      configured: false,
      status: 'not_configured',
      error: 'Meta token or account is not configured',
      date,
    });
  }
  const accountMeta = await getMetaAccountMetadata();
  const accountCurrency = normalizeCurrency(accountMeta.currency || process.env.META_ACCOUNT_CURRENCY || 'TRY', 'TRY');
  const cacheKey = `${date}:${accountCurrency}`;
  const now = Date.now();
  if (metaLiveCache.payload && metaLiveCache.key === cacheKey && now - metaLiveCache.fetchedAt < metaLiveTtlMs) {
    return { ...metaLiveCache.payload, cached: true, cache_age_ms: now - metaLiveCache.fetchedAt };
  }
  if (metaLiveInFlight.promise && metaLiveInFlight.key === cacheKey) return metaLiveInFlight.promise;

  const promise = (async () => {
    const errors = [];
    const [accountResult, adCountryResult, adsetCountryResult, pacingAdsetResult, pacingHourlyResult] = await Promise.allSettled([
      getMetaInsights({ level: 'account', date }),
      getMetaInsights({ level: 'ad', date, breakdowns: 'country' }),
      getMetaInsights({ level: 'adset', date, breakdowns: 'country' }),
      getMetaInsights({ level: 'adset', date }),
      getMetaInsights({
        level: 'adset',
        date,
        breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
        fields: liveHourlyMetaFields,
      }),
    ]);
    const accountRaw = settledRows(accountResult, 'account', errors);
    const adCountryRaw = settledRows(adCountryResult, 'ad_country', errors);
    const adsetCountryRaw = settledRows(adsetCountryResult, 'adset_country', errors);
    const pacingAdsetRaw = settledRows(pacingAdsetResult, 'pacing_adset', errors);
    const pacingHourlyRaw = settledRows(pacingHourlyResult, 'pacing_hourly', errors);
    if (!accountRaw.length && !adCountryRaw.length && !adsetCountryRaw.length && !pacingAdsetRaw.length) {
      throw new Error(errors.map((entry) => `${entry.scope}: ${entry.error}`).join(' | '));
    }

    const accountRows = [];
    for (const row of accountRaw) accountRows.push(await normalizeMetaInsightRow(row, accountCurrency));
    const adCountryDaily = [];
    for (const row of adCountryRaw) adCountryDaily.push(await normalizeMetaInsightRow(row, accountCurrency));
    const adsetDaily = [];
    for (const row of adsetCountryRaw) adsetDaily.push(await normalizeMetaInsightRow(row, accountCurrency));
    const pacingAdsetDaily = [];
    for (const row of pacingAdsetRaw) pacingAdsetDaily.push(await normalizeMetaInsightRow(row, accountCurrency));
    const pacingHourly = [];
    for (const row of pacingHourlyRaw) {
      const normalized = await normalizeMetaInsightRow(row, accountCurrency);
      const hourLabel = String(row.hourly_stats_aggregated_by_advertiser_time_zone || '');
      const hour = Number(hourLabel.slice(0, 2));
      if (Number.isFinite(hour)) pacingHourly.push({ ...normalized, hour });
    }
    const dayFx = await fxContext(date, accountCurrency);
    const accountDaily = accountRows[0]
      ? { ...accountRows[0], live_today: true }
      : aggregateMetaRows(adCountryDaily, { date, date_start: date, date_stop: date, spend_currency: accountCurrency, ...dayFx, live_today: true });
    const payload = {
      ok: true,
      configured: true,
      source: 'meta_live_insights',
      status: errors.length ? 'partial' : 'fresh',
      date,
      timezone: metaReportingTimezone,
      checked_at: new Date().toISOString(),
      ttl_ms: metaLiveTtlMs,
      account_currency: accountCurrency,
      cached: false,
      cache_age_ms: 0,
      warnings: errors,
      account_daily_metrics: [accountDaily],
      ad_country_daily: adCountryDaily,
      adset_daily: adsetDaily,
      pacing_adset_daily: pacingAdsetDaily,
      pacing_hourly: pacingHourly,
      data_coverage: {
        account_rows: accountRows.length,
        ad_country_daily_rows: adCountryDaily.length,
        adset_daily_rows: adsetDaily.length,
        pacing_hourly_rows: pacingHourly.length,
      },
    };
    metaLiveCache = { key: cacheKey, fetchedAt: Date.now(), payload };
    return payload;
  })();
  metaLiveInFlight = { key: cacheKey, promise };
  try {
    return await promise;
  } finally {
    if (metaLiveInFlight.promise === promise) metaLiveInFlight = { key: '', promise: null };
  }
}

function orderTipAmount(order = {}) {
  return Math.max(
    0,
    Number(order.total_tip_received || 0),
    Number(order.current_total_tip_received || 0),
  );
}

function summarizeOrder(order) {
  const lineItems = order.line_items || [];
  const merchLineItems = merchandiseLineItems(lineItems);
  const itemCount = merchandiseItemCount(lineItems);
  const firstProduct = merchLineItems[0]?.item?.title || lineItems.find((item) => item?.title)?.title || '';
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
    line_items: merchLineItems.map(({ item, taxonomy }) => {
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

function summarizeCurrentDayOrders(orders = []) {
  const date = dateInTimezone(new Date(), shopifyReportingTimezone);
  const todayOrders = orders.filter((order) => dateInTimezone(new Date(order.created_at || Date.now()), shopifyReportingTimezone) === date);
  const orderLines = [];
  const tipOrders = new Set();
  const tipSummary = { orders: 0, people: 0, total_usd: 0, by_date: [{ date, orders: 0, total_usd: 0 }] };
  let revenue = 0;
  let units = 0;
  // Email-channel (utm_medium=email) accumulators. These orders stay in the
  // headline revenue/units totals but are reported separately so they can be
  // pulled out of the paid-ads "top movers" view downstream.
  const emailOrderIds = new Set();
  const emailProducts = new Map();
  const emailCampaigns = new Map();
  let emailUnits = 0;
  let emailRevenue = 0;
  for (const order of todayOrders) {
    const country = orderCountry(order);
    const attribution = orderAttribution(order);
    const isEmail = isEmailAttribution(attribution);
    const orderChannel = isEmail ? 'email' : '';
    const lineItems = order.line_items || [];
    const orderRevenue = Number(order.current_total_price || order.total_price || 0);
    const entries = lineItems
      .map((item) => ({ item, taxonomy: productTaxonomyForName(item.title), quantity: Number(item.quantity || 0) }))
      .filter(({ quantity }) => quantity > 0);
    const tipLineSubtotal = entries
      .filter(({ item, taxonomy }) => !taxonomy.family && isTipTitle(item.title))
      .reduce((total, { item, quantity }) => total + (Number(item.price || 0) * quantity), 0);
    const orderTip = Math.max(orderTipAmount(order), tipLineSubtotal);
    const merchandiseRevenue = Math.max(0, orderRevenue - orderTip);
    if (orderTip > 0) {
      tipOrders.add(String(order.id || order.name || `${date}:${orderTip}`));
      tipSummary.total_usd += orderTip;
      tipSummary.by_date[0].total_usd += orderTip;
    }
    const merchEntries = entries.filter(({ item, taxonomy }) => taxonomy.family && !isTipTitle(item.title));
    const merchandiseSubtotal = merchEntries.reduce((total, { item, quantity }) => total + (Number(item.price || 0) * quantity), 0);
    revenue += orderRevenue;
    if (isEmail) {
      emailOrderIds.add(String(order.id || order.name || `${date}:${orderRevenue}`));
      emailRevenue += orderRevenue;
      const campaignKey = emailCampaignName(attribution) || 'Email';
      const campaignRow = emailCampaigns.get(campaignKey) || { name: campaignKey, orders: 0, revenue_usd: 0 };
      campaignRow.orders += 1;
      campaignRow.revenue_usd += orderRevenue;
      emailCampaigns.set(campaignKey, campaignRow);
    }
    merchEntries.forEach(({ item, taxonomy, quantity }, index) => {
      const subtotal = Number(item.price || 0) * quantity;
      const lineRevenue = merchandiseSubtotal
        ? merchandiseRevenue * (subtotal / merchandiseSubtotal)
        : merchandiseRevenue / Math.max(1, merchEntries.length);
      units += quantity;
      if (isEmail) {
        emailUnits += quantity;
        const productKey = item.title || 'Unknown product';
        const productRow = emailProducts.get(productKey) || { product: productKey, units: 0, revenue_usd: 0 };
        productRow.units += quantity;
        productRow.revenue_usd += lineRevenue;
        emailProducts.set(productKey, productRow);
      }
      orderLines.push({
        order_id: String(order.id || ''),
        order_name: order.name || '',
        date,
        created_at: order.created_at || '',
        country_code: country.code || '',
        country: country.name || country.code || 'Unknown',
        product: item.title || '',
        product_id: String(item.product_id || ''),
        variant_id: String(item.variant_id || ''),
        image_url: '',
        quantity,
        line_item_subtotal_usd: subtotal,
        order_revenue_usd: orderRevenue,
        line_revenue_usd: lineRevenue,
        family: taxonomy.family || 'Other',
        subtype: taxonomy.subtype || 'Other',
        attribution,
        channel: orderChannel,
        live_today: true,
      });
      if (index === merchEntries.length - 1) {
        const allocated = orderLines
          .filter((line) => line.order_id === String(order.id || ''))
          .reduce((total, line) => total + Number(line.line_revenue_usd || 0), 0);
        const drift = merchandiseRevenue - allocated;
        if (Math.abs(drift) > 0.000001) orderLines[orderLines.length - 1].line_revenue_usd += drift;
      }
    });
  }
  tipSummary.orders = tipOrders.size;
  tipSummary.people = tipOrders.size;
  tipSummary.by_date[0].orders = tipOrders.size;
  if (!tipSummary.orders && !tipSummary.total_usd) tipSummary.by_date = [];
  const emailCampaign = {
    orders: emailOrderIds.size,
    units: emailUnits,
    revenue_usd: emailRevenue,
    products: [...emailProducts.values()]
      .sort((a, b) => b.units - a.units || b.revenue_usd - a.revenue_usd)
      .slice(0, 6),
    campaigns: [...emailCampaigns.values()]
      .sort((a, b) => b.revenue_usd - a.revenue_usd || b.orders - a.orders)
      .slice(0, 6),
  };
  return {
    date,
    timezone: shopifyReportingTimezone,
    source: 'shopify_live_orders',
    coverage_note: 'Uses live Shopify orders for the developing reporting day until the full daily cache refresh runs.',
    orders: todayOrders.length,
    units,
    revenue_usd: revenue,
    order_lines: orderLines,
    tips: tipSummary,
    email_campaign: emailCampaign,
  };
}

function orderMapExtras(order) {
  const attribution = orderAttribution(order);
  const isEmail = isEmailAttribution(attribution);
  // Email orders are a separate channel: never matched to a paid Meta ad, and
  // always labeled "Email campaign" so the live monitor reads them as such.
  const matchedAd = isEmail ? null : matchAttributionToMetaAd(attribution);
  const source = isEmail
    ? emailSourceLabel(attribution)
    : (matchedAd?.ad_name || attribution.ad_hint || attribution.source_name || attribution.referrer_host || '');
  const merch = (order.line_items || [])
    .map((item) => ({ item, taxonomy: productTaxonomyForName(item.title) }))
    .filter(({ item, taxonomy }) => taxonomy.family && !isTipTitle(item.title));
  const product = merch[0]?.item?.title || (order.line_items || []).find((item) => item?.title)?.title || '';
  return { source, product, channel: isEmail ? 'email' : '' };
}

async function buildDayPurchases(paidOrders = [], reportingDay = dateInTimezone(new Date(), shopifyReportingTimezone)) {
  const now = Date.now();
  const built = await Promise.all(paidOrders.map((order) => buildPurchase(order, locationStore, { now, ...orderMapExtras(order) }).catch(() => null)));
  const fetched = built.filter(Boolean);
  const byId = new Map(fetched.map((p) => [p.id, p]));

  // Merge in any webhook-stored purchases the REST fetch did not include
  // (e.g. orders that arrived between cache windows), deduped by id.
  for (const stored of webhookStore.purchases) {
    if (!stored?.id || byId.has(stored.id)) continue;
    const orderDay = stored.createdAt
      ? dateInTimezone(new Date(stored.createdAt), shopifyReportingTimezone)
      : '';
    if (orderDay && orderDay !== reportingDay) continue;
    byId.set(stored.id, { ...stored, time: relativeTime(stored.createdAt, now) });
  }

  return [...byId.values()].sort((a, b) => {
    const at = Date.parse(a.createdAt || '') || 0;
    const bt = Date.parse(b.createdAt || '') || 0;
    return bt - at;
  });
}

async function fetchLatestShopifySale() {
  const { token, store, apiVersion } = shopifyConfig();
  if (!token || !store) return { ok: false, configured: false, error: 'Shopify token or store is not configured', sale: null };

  const reportingDay = dateInTimezone(new Date(), shopifyReportingTimezone);
  let url = new URL(`https://${store}/admin/api/${apiVersion}/orders.json`);
  url.searchParams.set('status', 'any');
  url.searchParams.set('limit', '250');
  url.searchParams.set('created_at_min', zonedDateTimeToUtcIso(reportingDay, shopifyReportingTimezone, false));
  url.searchParams.set('created_at_max', zonedDateTimeToUtcIso(reportingDay, shopifyReportingTimezone, true));
  url.searchParams.set('order', 'created_at desc');
  url.searchParams.set('fields', 'id,name,created_at,cancelled_at,financial_status,current_total_price,total_price,total_tip_received,current_total_tip_received,currency,presentment_currency,line_items,shipping_address,billing_address,landing_site,landing_site_ref,referring_site,source_name,source_identifier,note_attributes,tags');

  const orders = [];
  let pages = 0;
  while (url && pages < 20) {
    pages += 1;
    const response = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    const text = await response.text();
    if (!response.ok) throw new Error(`Shopify latest-sale ${response.status}: ${text.slice(0, 600)}`);
    const data = JSON.parse(text);
    orders.push(...(data.orders || []));
    url = nextLinkUrl(response.headers.get('link') || '');
  }

  const includeStatus = new Set(['paid', 'partially_paid', 'partially_refunded']);
  const paidOrders = orders.filter((order) => !order.cancelled_at && includeStatus.has(order.financial_status));
  const sale = paidOrders[0];
  const purchases = await buildDayPurchases(paidOrders, reportingDay);
  return {
    ok: true,
    configured: true,
    checked_at: new Date().toISOString(),
    reporting_day: reportingDay,
    pages_fetched: pages,
    sale: sale ? summarizeOrder(sale) : null,
    today_summary: summarizeCurrentDayOrders(paidOrders),
    purchases,
  };
}

function streamJsonFile(res, file) {
  if (!fs.existsSync(file)) {
    send(res, 404, JSON.stringify({ ok: false, error: 'file not found' }));
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  const stream = fs.createReadStream(file);
  // Without an error listener a mid-read failure throws and crashes the process.
  stream.on('error', (err) => {
    console.error('Error streaming data file:', file, err.message);
    res.destroy(err);
  });
  stream.pipe(res);
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

  const behaviorStale = script === 'fetch:behavior' && !force && behaviorNeedsRefresh(file);
  const dataStale = !force && script !== 'fetch:behavior' && fs.existsSync(file) && dataCacheNeedsRefresh(file, script);

  // Behavior: never block the HTTP response on a full regeneration (it hits Meta +
  // Shopify and parses the entire session-event log, which can take minutes). When a
  // snapshot already exists (restored from the durable volume / committed seed), stream
  // it immediately and kick off a throttled background refresh; the dashboard polls and
  // picks up fresh data on the next cycle. This prevents the Behaviour tab from hanging
  // (and appearing to reset) while a rebuild is in flight.
  if (script === 'fetch:behavior' && !force && fs.existsSync(file)) {
    if (behaviorStale) requestBehaviorRefresh();
    streamJsonFile(res, file);
    return;
  }

  if (force || !fs.existsSync(file) || behaviorStale || dataStale) {
    const env = script === 'fetch:behavior'
      ? behaviorBackfillEnv(dateEnvFromUrl(url))
      : dateEnvFromUrl(url);
    const result = script === 'fetch:shopify'
      ? await runShopifyFetch(env)
      : script === 'fetch:meta'
        ? await runMetaFetch(env)
        : await runScript(script, env);
    if (result?.code !== 0) {
      console.warn(result?.output || `${script} failed`);
      if (!fs.existsSync(file)) {
        send(res, 500, JSON.stringify({ ok: false, error: 'refresh failed', detail: String(result?.output || '').slice(0, 2000) }));
        return;
      }
    }
  }

  streamJsonFile(res, file);
}

// These must mirror what the fetch scripts themselves accept. fetch-meta-insights.mjs
// falls back to META_ACCESS_TOKEN / META_AD_ACCOUNT_ID, and fetch-shopify-products.mjs
// defaults the store when it is unset — so gating the boot fetch on the SHAWQ_ names
// alone skipped credentials the scripts could have used, with nothing logged to say why.
function metaCredentials() {
  return {
    token: process.env.SHAWQ_META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '',
    account: process.env.SHAWQ_META_AD_ACCOUNT_ID || process.env.META_AD_ACCOUNT_ID || '',
  };
}

function shopifyCredentials() {
  return { token: process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN || '' };
}

async function warmData() {
  if (!refreshOnStart) {
    console.warn('Startup data refresh disabled (REFRESH_ON_START=false).');
    return;
  }
  const meta = metaCredentials();
  const shopify = shopifyCredentials();
  const jobs = [];

  if (meta.token && meta.account) {
    jobs.push(runScript('fetch:meta'));
  } else {
    const missing = [!meta.token && 'SHAWQ_META_ACCESS_TOKEN', !meta.account && 'SHAWQ_META_AD_ACCOUNT_ID']
      .filter(Boolean)
      .join(' and ');
    console.warn(`Skipping Meta warm fetch: ${missing} not set.`);
  }

  if (shopify.token) {
    jobs.push(runShopifyFetch());
  } else {
    console.warn('Skipping Shopify warm fetch: SHAWQ_SHOPIFY_ACCESS_TOKEN not set.');
  }

  const results = jobs.length ? await Promise.all(jobs) : [];
  if (meta.token || shopify.token) {
    results.push(await runScript('fetch:behavior', behaviorBackfillEnv()));
  }
  results.forEach((r) => { if (r.code !== 0) console.warn(r.output); });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
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
    const shopifyFile = publicDataPath('shopify-products.json');
    const urlObj = new URL(req.url || '/', `http://${req.headers.host}`);
    const force = urlObj.searchParams.get('refresh') === '1';
    if (!force && fs.existsSync(shopifyFile)) {
      scheduleShopifyHistoricalBackfill(shopifyFile, dateEnvFromUrl(urlObj));
    }
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

  if (url.pathname === '/shopify/session-recorder.js') {
    serveHostedSessionRecorder(req, res);
    return;
  }

  if (url.pathname === '/api/shopify/recorder/status') {
    await serveShopifyRecorderStatus(req, res);
    return;
  }

  if (url.pathname === '/api/shopify/recorder/install' && req.method === 'POST') {
    await installShopifyRecorder(req, res);
    return;
  }

  if (url.pathname === '/api/session-replay/status') {
    send(res, 200, JSON.stringify({ ok: true, ...sessionReplayStatus(sessionReplayPath, sessionReplayIndexPath) }));
    return;
  }

  if (url.pathname === '/api/session-replay/index') {
    serveSessionReplayIndex(req, res, url);
    return;
  }

  const replaySessionMatch = url.pathname.match(/^\/api\/session-replay\/([a-f0-9]{16})$/);
  if (replaySessionMatch && req.method === 'GET') {
    serveSessionReplaySession(req, res, replaySessionMatch[1], url);
    return;
  }

  if (url.pathname === '/api/session-replay' && req.method === 'POST') {
    res.setHeader('access-control-allow-origin', '*');
    await recordSessionReplay(req, res, url);
    return;
  }

  if (url.pathname === '/api/shopify/webhook' || url.pathname === '/webhooks/shopify/orders-create') {
    if (req.method !== 'POST') {
      send(res, 405, JSON.stringify({ ok: false, error: 'method not allowed' }));
      return;
    }
    await handleShopifyWebhook(req, res);
    return;
  }

  if (url.pathname === '/api/shopify/orders-map') {
    if (req.method !== 'GET') {
      send(res, 405, JSON.stringify({ ok: false, error: 'method not allowed' }));
      return;
    }
    try {
      const payload = await fetchLatestShopifySale();
      send(res, payload.ok ? 200 : 503, JSON.stringify({
        ok: payload.ok,
        configured: payload.configured,
        checked_at: payload.checked_at,
        reporting_day: payload.reporting_day,
        purchases: payload.purchases || [],
      }));
    } catch (error) {
      send(res, 500, JSON.stringify({ ok: false, configured: true, error: error.message, purchases: [] }));
    }
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

  if (url.pathname === '/api/meta/live-spend') {
    if (req.method !== 'GET') {
      send(res, 405, JSON.stringify({ ok: false, error: 'method not allowed' }));
      return;
    }
    try {
      const payload = await fetchLiveMetaSpend();
      send(res, payload.ok ? 200 : 503, JSON.stringify(payload));
    } catch (error) {
      const date = dateInTimezone(new Date(), metaReportingTimezone);
      const accountCurrency = normalizeCurrency(process.env.META_ACCOUNT_CURRENCY || 'TRY', 'TRY');
      send(res, 502, JSON.stringify(emptyLiveMetaPayload({
        configured: true,
        status: 'meta_api_error',
        error: error.message,
        accountCurrency,
        date,
      })));
    }
    return;
  }

  if (url.pathname === '/api/refresh') {
    if (!isAuthorized(req)) {
      send(res, 401, JSON.stringify({ ok: false, error: 'unauthorized' }));
      return;
    }
    const dateEnv = dateEnvFromUrl(url);
    const metaEnv = { ...shopifyBackfillEnv(), ...dateEnv };
    const [meta, shopify] = await Promise.all([runScript('fetch:meta', metaEnv), runShopifyFetch(dateEnv)]);
    const behavior = await runScript('fetch:behavior', metaEnv);
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
  restoreBehaviorFromVolume();
  warmData().catch((error) => console.warn(error));
});
