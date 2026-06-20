/*
  ShawQ Session Intelligence Pixel

  Paste this into Shopify Admin > Settings > Customer events > Custom pixel.
  Connected dashboard: https://shawq-ads-production.up.railway.app/
*/

const SHAWQ_SESSION_ENDPOINT = 'https://shawq-ads-production.up.railway.app/api/session-events';
const SHAWQ_SESSION_KEY = '';

const SHAWQ_EVENTS = [
  'page_viewed',
  'product_viewed',
  'product_added_to_cart',
  'checkout_started',
  'checkout_contact_info_submitted',
  'checkout_address_info_submitted',
  'checkout_shipping_info_submitted',
  'payment_info_submitted',
  'checkout_completed',
];

let shawqCurrentPath = '';
let shawqHeartbeatTimer = null;
let shawqHeartbeatCount = 0;
let shawqLastEvent = null;

function shawqCleanId(value) {
  return String(value || '').replace(/^gid:\/\/shopify\//, '').slice(0, 90);
}

function shawqMoneyAmount(value) {
  if (value && typeof value === 'object' && 'amount' in value) return Number(value.amount || 0);
  return Number(value || 0);
}

function shawqCountry(event) {
  const checkout = event?.data?.checkout || {};
  return String(
    checkout?.localization?.country?.isoCode ||
    checkout?.shippingAddress?.countryCode ||
    checkout?.billingAddress?.countryCode ||
    ''
  ).toUpperCase();
}

function shawqLineFromMerchandise(item = {}) {
  const merchandise = item.merchandise || item.variant || item.productVariant || {};
  const product = merchandise.product || item.product || {};
  const title = item.title || product.title || merchandise.title || item.name || 'Unknown product';
  return {
    product_id: shawqCleanId(product.id || item.productId || item.product_id || ''),
    variant_id: shawqCleanId(merchandise.id || item.variantId || item.variant_id || ''),
    title,
    quantity: Number(item.quantity || 1),
    price: shawqMoneyAmount(item.finalLinePrice || item.price || merchandise.price || 0),
  };
}

function shawqLineItems(event) {
  const data = event?.data || {};
  const checkout = data.checkout || {};
  const cartLine = data.cartLine || data.cartLineItem || {};
  const productVariant = data.productVariant || {};
  const checkoutLines = checkout.lineItems || checkout.line_items || [];

  if (checkoutLines.length) return checkoutLines.map(shawqLineFromMerchandise);
  if (cartLine.merchandise || cartLine.variant || cartLine.productVariant || cartLine.title) return [shawqLineFromMerchandise(cartLine)];
  if (productVariant.id || productVariant.product?.title) {
    return [shawqLineFromMerchandise({ merchandise: productVariant, quantity: 1 })];
  }
  return [];
}

function shawqPath(event) {
  return String(event?.context?.document?.location?.href || '').slice(0, 500);
}

// Referrer of the page the visitor arrived on. For the landing page this is the EXTERNAL referrer
// (e.g. https://www.google.com/) — the only reliable signal for organic search traffic, which has
// no UTM/click-id. Used by the dashboard to attribute Shawq Journal / keffiyah-blog reach to search.
function shawqReferrer(event) {
  return String(event?.context?.document?.referrer || '').slice(0, 500);
}

function shawqPayload(event, override = {}) {
  return {
    event_name: override.event_name || event?.name || '',
    event_id: event?.id || '',
    seq: event?.seq || '',
    client_id: event?.clientId || '',
    session_id: `${event?.clientId || 'anon'}:${String(event?.timestamp || '').slice(0, 10)}`,
    timestamp: override.timestamp || event?.timestamp || new Date().toISOString(),
    path: override.path || shawqPath(event),
    referrer: override.referrer !== undefined ? override.referrer : shawqReferrer(event),
    country_code: shawqCountry(event),
    line_items: override.line_items || shawqLineItems(event),
    checkout: event?.data?.checkout ? {
      token: shawqCleanId(event.data.checkout.token || event.data.checkout.id || ''),
      totalPrice: shawqMoneyAmount(event.data.checkout.totalPrice || 0),
      currencyCode: event.data.checkout.currencyCode || event.data.checkout.totalPrice?.currencyCode || '',
    } : undefined,
  };
}

function shawqSend(payload) {
  if (!SHAWQ_SESSION_ENDPOINT || SHAWQ_SESSION_ENDPOINT.includes('YOUR_DASHBOARD_DOMAIN')) return;
  const endpoint = SHAWQ_SESSION_KEY
    ? `${SHAWQ_SESSION_ENDPOINT}${SHAWQ_SESSION_ENDPOINT.includes('?') ? '&' : '?'}key=${encodeURIComponent(SHAWQ_SESSION_KEY)}`
    : SHAWQ_SESSION_ENDPOINT;

  fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

function shawqStopHeartbeat() {
  if (shawqHeartbeatTimer) clearInterval(shawqHeartbeatTimer);
  shawqHeartbeatTimer = null;
}

function shawqStartHeartbeat(event) {
  const path = shawqPath(event);
  if (!path || path === shawqCurrentPath) return;
  shawqCurrentPath = path;
  shawqHeartbeatCount = 0;
  shawqStopHeartbeat();
  shawqHeartbeatTimer = setInterval(() => {
    shawqHeartbeatCount += 1;
    shawqSend(shawqPayload(event, {
      event_name: 'session_heartbeat',
      timestamp: new Date().toISOString(),
      path: shawqCurrentPath,
      line_items: [],
    }));
    if (shawqHeartbeatCount >= 24) shawqStopHeartbeat();
  }, 15000);
}

SHAWQ_EVENTS.forEach((eventName) => {
  analytics.subscribe(eventName, (event) => {
    shawqLastEvent = event;
    shawqSend(shawqPayload(event));
    if (eventName === 'page_viewed') shawqStartHeartbeat(event);
  });
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    shawqStopHeartbeat();
    if (!shawqLastEvent) return;
    shawqSend(shawqPayload(shawqLastEvent, {
      event_name: 'visibility_hidden',
      timestamp: new Date().toISOString(),
      path: shawqCurrentPath || shawqPath(shawqLastEvent),
      line_items: [],
    }));
  });
}
