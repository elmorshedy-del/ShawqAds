import { canonicalCreativeName } from './logicalCreative.js';

/**
 * Client data-contract normalization.
 *
 * The dashboard consumes the same Meta/Shopify payloads in many panels. Fixing
 * duplicate creative identity inside individual cards creates drift, so the
 * normalization belongs at the boundary: every downstream calculation sees the
 * same canonical creative name before it aggregates anything.
 *
 * We preserve Meta ad IDs and campaign/ad-set placement. Only recognized trailing
 * Copy suffixes on creative-name attribution fields are canonicalized. Existing
 * rollups then sum additive metrics and recompute their own ratios normally.
 */
const META_JSON_PATHS = new Set([
  '/api/data/adset-radar.json',
  '/data/adset-radar.json',
  '/api/meta/live-spend',
]);

const SHOPIFY_JSON_PATHS = new Set([
  '/api/data/shopify-products.json',
  '/data/shopify-products.json',
  '/api/shopify/latest-sale',
]);

function normalizeCreativeField(value) {
  return typeof value === 'string' ? canonicalCreativeName(value) : value;
}

function normalizeMetaNode(value) {
  if (Array.isArray(value)) {
    value.forEach(normalizeMetaNode);
    return value;
  }
  if (!value || typeof value !== 'object') return value;

  if (typeof value.ad_name === 'string') value.ad_name = normalizeCreativeField(value.ad_name);
  Object.values(value).forEach(normalizeMetaNode);
  return value;
}

function normalizeShopifyNode(value, parentKey = '') {
  if (Array.isArray(value)) {
    value.forEach((child) => normalizeShopifyNode(child, parentKey));
    return value;
  }
  if (!value || typeof value !== 'object') return value;

  // These are attribution identifiers, not merchandising copy. Restricting the
  // rewrite to attribution-shaped objects avoids ever touching a product/title
  // that legitimately ends in the word "Copy".
  if (parentKey === 'match_hints' && typeof value.ad_name === 'string') {
    value.ad_name = normalizeCreativeField(value.ad_name);
  }
  if (parentKey === 'attribution' && typeof value.ad_hint === 'string') {
    value.ad_hint = normalizeCreativeField(value.ad_hint);
  }
  if (parentKey === 'utm') {
    if (typeof value.utm_content === 'string') value.utm_content = normalizeCreativeField(value.utm_content);
    if (typeof value.ad === 'string') value.ad = normalizeCreativeField(value.ad);
  }

  Object.entries(value).forEach(([key, child]) => normalizeShopifyNode(child, key));
  return value;
}

export function normalizeDashboardPayload(pathname, payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (META_JSON_PATHS.has(pathname)) return normalizeMetaNode(payload);
  if (SHOPIFY_JSON_PATHS.has(pathname)) return normalizeShopifyNode(payload);
  return payload;
}

function requestPath(input) {
  try {
    const raw = input instanceof Request ? input.url : String(input || '');
    return new URL(raw, window.location.origin).pathname;
  } catch {
    return '';
  }
}

function jsonResponse(response, payload) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

let installed = false;

export function installDashboardDataContractNormalizer() {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const pathname = requestPath(args[0]);
    if (!META_JSON_PATHS.has(pathname) && !SHOPIFY_JSON_PATHS.has(pathname)) return response;

    try {
      const payload = await response.clone().json();
      return jsonResponse(response, normalizeDashboardPayload(pathname, payload));
    } catch {
      // Never turn a network/parser failure into a normalization failure. The
      // caller retains the original response and its existing error handling.
      return response;
    }
  };
}
