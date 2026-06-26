// ShawQ Session Intelligence — Shopify Custom Pixel (v4, dashboard-native)
// Paste into Shopify Admin -> Settings -> Customer events -> your "Session Intelligence" pixel.
// Keeps the persistent client/session/tab stitching; sends the fields the ShawQ dashboard reads
// (event_name, path, referrer, country_code, line_items) at the TOP LEVEL, and posts to /api/session-events.
const ENDPOINT = 'https://shawq-ads-production.up.railway.app/api/session-events';
const INGEST_KEY = '';
const STORE = 'shawq';
const SOURCE = 'shopify_custom_pixel_v4';
const STANDARD_EVENTS = [
  "page_viewed",
  "collection_viewed",
  "product_viewed",
  "search_submitted",
  "product_added_to_cart",
  "product_removed_from_cart",
  "cart_viewed",
  "checkout_started",
  "checkout_contact_info_submitted",
  "checkout_address_info_submitted",
  "checkout_shipping_info_submitted",
  "payment_info_submitted",
  "checkout_completed"
];
const SESSION_IDLE_MS = 30 * 60 * 1000;
const CLIENT_ID_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;
const SESSION_BRIDGE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const MAX_STRING = 240;
const BROWSER_API = typeof browser !== 'undefined' ? browser : null;
const INIT_API = typeof init !== 'undefined' ? init : null;
const ANALYTICS_API = typeof analytics !== 'undefined' ? analytics : null;
const memoryStore = Object.create(null);
let localEventSequence = 0;
function safeString(value, max = MAX_STRING) {
  try {
    const str = value == null ? '' : String(value).trim();
    if (!str) return '';
    return str.length > max ? str.slice(0, max) : str;
  } catch (_error) {
    return '';
  }
}
function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function moneyAmount(value) {
  if (value && typeof value === 'object' && 'amount' in value) return Number(value.amount || 0);
  return Number(value || 0);
}
function cleanId(value) {
  return safeString(String(value || '').replace(/^gid:\/\/shopify\//, ''), 90);
}
function uuid() {
  try {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_error) {}
  let raw = '';
  for (let index = 0; index < 32; index += 1) {
    raw += Math.floor(Math.random() * 16).toString(16);
  }
  return raw.slice(0, 8) + '-' + raw.slice(8, 12) + '-' + '4' + raw.slice(13, 16) + '-' + 'a' + raw.slice(17, 20) + '-' + raw.slice(20);
}
function storageKey(base) {
  return base + ':' + STORE;
}
function cookieKey(base) {
  return (base + '__' + STORE).replace(/[^a-zA-Z0-9_-]/g, '_');
}
async function readBrowserStorage(area, key) {
  try {
    if (!area) return null;
    if (typeof area.getItem === 'function') {
      const value = await area.getItem(key);
      return safeString(value, 320) || null;
    }
    if (typeof area.get === 'function') {
      const value = await area.get(key);
      return safeString(value, 320) || null;
    }
  } catch (_error) {}
  if (Object.prototype.hasOwnProperty.call(memoryStore, key)) {
    return safeString(memoryStore[key], 320) || null;
  }
  return null;
}
async function writeBrowserStorage(area, key, value) {
  try {
    if (area && typeof area.setItem === 'function') {
      await area.setItem(key, value);
      memoryStore[key] = value;
      return true;
    }
    if (area && typeof area.set === 'function') {
      await area.set(key, value);
      memoryStore[key] = value;
      return true;
    }
  } catch (_error) {}
  memoryStore[key] = value;
  return false;
}
async function readBrowserCookie(name) {
  try {
    if (BROWSER_API && BROWSER_API.cookie) {
      if (typeof BROWSER_API.cookie.get === 'function') {
        const value = await BROWSER_API.cookie.get(name);
        if (typeof value === 'string') return safeString(value, 320) || null;
        if (value && typeof value.value === 'string') return safeString(value.value, 320) || null;
      }
      if (typeof BROWSER_API.cookie.getItem === 'function') {
        const value = await BROWSER_API.cookie.getItem(name);
        return safeString(value, 320) || null;
      }
    }
  } catch (_error) {}
  if (Object.prototype.hasOwnProperty.call(memoryStore, 'cookie:' + name)) {
    return safeString(memoryStore['cookie:' + name], 320) || null;
  }
  return null;
}
async function writeBrowserCookie(name, value, _maxAgeSeconds) {
  try {
    if (BROWSER_API && BROWSER_API.cookie) {
      if (typeof BROWSER_API.cookie.set === 'function') {
        await BROWSER_API.cookie.set(name, value);
        memoryStore['cookie:' + name] = value;
        return true;
      }
      if (typeof BROWSER_API.cookie.setItem === 'function') {
        await BROWSER_API.cookie.setItem(name, value);
        memoryStore['cookie:' + name] = value;
        return true;
      }
    }
  } catch (_error) {}
  memoryStore['cookie:' + name] = value;
  return false;
}
function resolveKnownUserId(event) {
  const candidates = [
    event && event.data && event.data.customer && event.data.customer.id,
    event && event.data && event.data.checkout && event.data.checkout.customer && event.data.checkout.customer.id,
    INIT_API && INIT_API.data && INIT_API.data.customer && INIT_API.data.customer.id,
    INIT_API && INIT_API.data && INIT_API.data.checkout && INIT_API.data.checkout.customer && INIT_API.data.checkout.customer.id
  ];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = safeString(candidates[index], 160);
    if (candidate) return candidate;
  }
  return '';
}
function buildContext(event, identity) {
  const base = event && event.context && typeof event.context === 'object' ? event.context : null;
  let context = {};
  if (base) {
    try {
      context = JSON.parse(JSON.stringify(base));
    } catch (_error) {
      context = {};
    }
  }
  context.clientId = identity.clientId;
  context.client_id = identity.clientId;
  context.sessionId = identity.sessionId;
  context.session_id = identity.sessionId;
  context.tabId = identity.tabId;
  context.tab_id = identity.tabId;
  if (identity.userId) {
    context.userId = identity.userId;
    context.user_id = identity.userId;
  }
  const shopifyClientId = safeString(event && (event.clientId || event.client_id), 160);
  if (shopifyClientId) context.shopifyClientId = shopifyClientId;
  return context;
}
// Fields the ShawQ dashboard ingest reads — extracted to the top level of the payload.
function extractHref(event) {
  return safeString(event && event.context && event.context.document && event.context.document.location && event.context.document.location.href, 500);
}
function extractReferrer(event) {
  return safeString(event && event.context && event.context.document && event.context.document.referrer, 500);
}
function extractCountry(event) {
  const checkout = (event && event.data && event.data.checkout) || {};
  return safeString(
    (checkout.localization && checkout.localization.country && checkout.localization.country.isoCode) ||
    (checkout.shippingAddress && checkout.shippingAddress.countryCode) ||
    (checkout.billingAddress && checkout.billingAddress.countryCode) ||
    '',
    8
  ).toUpperCase();
}
function lineFromMerchandise(item) {
  item = item || {};
  const merchandise = item.merchandise || item.variant || item.productVariant || {};
  const product = merchandise.product || item.product || {};
  const title = item.title || product.title || merchandise.title || item.name || 'Unknown product';
  return {
    product_id: cleanId(product.id || item.productId || item.product_id || ''),
    variant_id: cleanId(merchandise.id || item.variantId || item.variant_id || ''),
    title: safeString(title, 180),
    quantity: Number(item.quantity || 1),
    price: moneyAmount(item.finalLinePrice || item.price || merchandise.price || 0)
  };
}
function extractLineItems(event) {
  const data = (event && event.data) || {};
  const checkout = data.checkout || {};
  const cartLine = data.cartLine || data.cartLineItem || {};
  const productVariant = data.productVariant || {};
  const checkoutLines = checkout.lineItems || checkout.line_items || [];
  if (checkoutLines.length) return checkoutLines.map(lineFromMerchandise);
  if (cartLine.merchandise || cartLine.variant || cartLine.productVariant || cartLine.title) return [lineFromMerchandise(cartLine)];
  if (productVariant.id || (productVariant.product && productVariant.product.title)) {
    return [lineFromMerchandise({ merchandise: productVariant, quantity: 1 })];
  }
  return [];
}
async function getOrCreateClientId(event) {
  const shopifyClientId = safeString(event && (event.clientId || event.client_id), 160);
  if (shopifyClientId) {
    const storageName = storageKey('virona_si_client_id');
    const cookieName = cookieKey('virona_si_client_id');
    await writeBrowserStorage(BROWSER_API && BROWSER_API.localStorage, storageName, shopifyClientId);
    await writeBrowserCookie(cookieName, shopifyClientId, CLIENT_ID_COOKIE_MAX_AGE_SECONDS);
    return shopifyClientId;
  }
  const storageName = storageKey('virona_si_client_id');
  const cookieName = cookieKey('virona_si_client_id');
  const fromStorage = await readBrowserStorage(BROWSER_API && BROWSER_API.localStorage, storageName);
  if (fromStorage) {
    await writeBrowserCookie(cookieName, fromStorage, CLIENT_ID_COOKIE_MAX_AGE_SECONDS);
    return fromStorage;
  }
  const fromCookie = await readBrowserCookie(cookieName);
  if (fromCookie) {
    await writeBrowserStorage(BROWSER_API && BROWSER_API.localStorage, storageName, fromCookie);
    return fromCookie;
  }
  const id = uuid();
  await writeBrowserStorage(BROWSER_API && BROWSER_API.localStorage, storageName, id);
  await writeBrowserCookie(cookieName, id, CLIENT_ID_COOKIE_MAX_AGE_SECONDS);
  return id;
}
async function getOrCreateSessionId() {
  const idStorageName = storageKey('virona_si_session_id');
  const tsStorageName = storageKey('virona_si_session_last_ts');
  const idCookieName = cookieKey('virona_si_session_id');
  const tsCookieName = cookieKey('virona_si_session_last_ts');
  const now = Date.now();
  const fromStorage = await readBrowserStorage(BROWSER_API && BROWSER_API.sessionStorage, idStorageName);
  const fromStorageTs = safeNumber(await readBrowserStorage(BROWSER_API && BROWSER_API.sessionStorage, tsStorageName));
  if (fromStorage && fromStorageTs != null && (now - fromStorageTs) < SESSION_IDLE_MS) {
    await writeBrowserStorage(BROWSER_API && BROWSER_API.sessionStorage, tsStorageName, String(now));
    await writeBrowserCookie(idCookieName, fromStorage, SESSION_BRIDGE_COOKIE_MAX_AGE_SECONDS);
    await writeBrowserCookie(tsCookieName, String(now), SESSION_BRIDGE_COOKIE_MAX_AGE_SECONDS);
    return fromStorage;
  }
  const fromCookie = await readBrowserCookie(idCookieName);
  const fromCookieTs = safeNumber(await readBrowserCookie(tsCookieName));
  if (fromCookie && fromCookieTs != null && (now - fromCookieTs) < SESSION_IDLE_MS) {
    await writeBrowserStorage(BROWSER_API && BROWSER_API.sessionStorage, idStorageName, fromCookie);
    await writeBrowserStorage(BROWSER_API && BROWSER_API.sessionStorage, tsStorageName, String(now));
    await writeBrowserCookie(idCookieName, fromCookie, SESSION_BRIDGE_COOKIE_MAX_AGE_SECONDS);
    await writeBrowserCookie(tsCookieName, String(now), SESSION_BRIDGE_COOKIE_MAX_AGE_SECONDS);
    return fromCookie;
  }
  const id = uuid();
  await writeBrowserStorage(BROWSER_API && BROWSER_API.sessionStorage, idStorageName, id);
  await writeBrowserStorage(BROWSER_API && BROWSER_API.sessionStorage, tsStorageName, String(now));
  await writeBrowserCookie(idCookieName, id, SESSION_BRIDGE_COOKIE_MAX_AGE_SECONDS);
  await writeBrowserCookie(tsCookieName, String(now), SESSION_BRIDGE_COOKIE_MAX_AGE_SECONDS);
  return id;
}
async function getOrCreateTabId() {
  const storageName = storageKey('virona_si_tab_id');
  const existing = await readBrowserStorage(BROWSER_API && BROWSER_API.sessionStorage, storageName);
  if (existing) return existing;
  const id = uuid();
  await writeBrowserStorage(BROWSER_API && BROWSER_API.sessionStorage, storageName, id);
  return id;
}
async function resolveIdentity(event) {
  const clientId = await getOrCreateClientId(event);
  const sessionId = await getOrCreateSessionId();
  const tabId = await getOrCreateTabId();
  const userId = resolveKnownUserId(event) || null;
  localEventSequence += 1;
  return { clientId, sessionId, tabId, userId, eventSequence: localEventSequence };
}
async function send(name, event) {
  try {
    const identity = await resolveIdentity(event);
    const context = buildContext(event, identity);
    fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(INGEST_KEY ? { 'x-session-event-key': INGEST_KEY } : {}),
      },
      keepalive: true,
      body: JSON.stringify({
        store: STORE,
        source: SOURCE,
        // Top-level fields the ShawQ dashboard ingest reads:
        event_name: safeString(name, 120),
        event_id: safeString(event && event.id, 180) || null,
        client_id: identity.clientId,
        session_id: identity.sessionId,
        user_id: identity.userId,
        tab_id: identity.tabId,
        seq: identity.eventSequence,
        timestamp: event && event.timestamp ? event.timestamp : new Date().toISOString(),
        path: extractHref(event),
        referrer: extractReferrer(event),
        country_code: extractCountry(event),
        line_items: extractLineItems(event),
        context
      })
    }).catch(() => {});
  } catch (_error) {}
}
if (ANALYTICS_API && typeof ANALYTICS_API.subscribe === 'function') {
  STANDARD_EVENTS.forEach((name) => {
    ANALYTICS_API.subscribe(name, async (event) => {
      await send(name, event);
    });
  });
}
