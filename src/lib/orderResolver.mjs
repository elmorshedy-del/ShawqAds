// Server-only order coordinate resolver + sanitizer.
//
// Wraps the static location tables with optional server-side geocoding
// and a persistent on-disk cache, and converts raw Shopify orders into
// the safe `Purchase` shape sent to the browser (no customer PII).

import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeAddress,
  lookupKey,
  resolveStaticCoordinates,
  regionCentroids,
  countryCentroids,
  cityCoordinates,
  countryNames,
  countryFlag,
  countryDisplayName,
  normalizeCountry,
  normalizeRegion,
  normalize,
  US_STATE_CODE_TO_NAME,
} from './orderLocations.mjs';
import { merchandiseItemCount } from './orderMerchandise.js';

function isValidCoord(value) {
  return Array.isArray(value)
    && value.length === 2
    && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180
    && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90;
}

export function createLocationStore({ cachePath, geocoder } = {}) {
  const cache = new Map();
  let dirty = false;

  if (cachePath && fs.existsSync(cachePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      for (const [key, coord] of Object.entries(raw)) {
        if (isValidCoord(coord)) cache.set(key, coord);
      }
    } catch {
      // Corrupt cache is non-fatal; we just start empty.
    }
  }

  async function persist() {
    if (!cachePath || !dirty) return;
    try {
      await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.promises.writeFile(cachePath, JSON.stringify(Object.fromEntries(cache.entries())));
      dirty = false;
    } catch {
      // Best-effort persistence only.
    }
  }

  async function cacheLocation(key, coord) {
    if (!key || !isValidCoord(coord)) return;
    cache.set(key, coord);
    dirty = true;
    // Fire-and-forget so the request path is not blocked on disk I/O.
    void persist();
  }

  // Implements the documented resolution priority:
  //   exact city -> geocode (cached) -> region centroid -> country centroid -> null
  async function resolveOrderCoordinates(address) {
    const norm = normalizeAddress(address);
    const { country, region, city } = norm;
    if (!country) return null;

    const exactKey = lookupKey(norm);

    if (cache.has(exactKey)) return cache.get(exactKey);
    const exact = cityCoordinates[exactKey];
    if (exact) return exact;

    if (city && geocoder) {
      try {
        const geocoded = await geocoder(`${city}, ${region}, ${country}`, norm);
        if (isValidCoord(geocoded)) {
          await cacheLocation(exactKey, geocoded);
          return geocoded;
        }
      } catch {
        // Fall through to centroid fallbacks on geocoder failure.
      }
    }

    const regionFallback = regionCentroids[`${country}|${region}`];
    if (regionFallback) return regionFallback;

    return countryCentroids[country] || null;
  }

  return { resolveOrderCoordinates, cacheLocation, persist, cache };
}

// Fetch with an abort timeout so a slow/hanging geocoding provider never keeps
// a webhook request open (which would risk socket exhaustion and Shopify
// retries). Returns null instead of throwing on timeout/network error.
async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Builds an HTTP geocoder function from env config. Returns null when no
// provider/key is configured (the resolver then relies on static tables).
export function createGeocoder(env = process.env) {
  const provider = String(env.GEOCODER_PROVIDER || '').toLowerCase().trim();
  const mapboxKey = env.MAPBOX_GEOCODING_TOKEN || env.MAPBOX_TOKEN || '';
  const openCageKey = env.OPENCAGE_API_KEY || '';
  const googleKey = env.GOOGLE_GEOCODING_API_KEY || '';
  const timeoutMs = Math.max(1000, Number(env.GEOCODER_TIMEOUT_MS) || 4000);

  const effective = provider
    || (mapboxKey && 'mapbox')
    || (openCageKey && 'opencage')
    || (googleKey && 'google')
    || '';

  if (!effective) return null;

  return async function geocode(query, norm) {
    if (effective === 'mapbox' && mapboxKey) {
      const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
      url.searchParams.set('access_token', mapboxKey);
      url.searchParams.set('limit', '1');
      url.searchParams.set('types', 'place,region,locality');
      if (norm?.country) url.searchParams.set('country', norm.country);
      const res = await fetchWithTimeout(url, timeoutMs);
      if (!res || !res.ok) return null;
      const data = await res.json();
      const center = data?.features?.[0]?.center;
      return isValidCoord(center) ? [center[0], center[1]] : null;
    }
    if (effective === 'opencage' && openCageKey) {
      const url = new URL('https://api.opencagedata.com/geocode/v1/json');
      url.searchParams.set('q', query);
      url.searchParams.set('key', openCageKey);
      url.searchParams.set('limit', '1');
      url.searchParams.set('no_annotations', '1');
      const res = await fetchWithTimeout(url, timeoutMs);
      if (!res || !res.ok) return null;
      const data = await res.json();
      const geo = data?.results?.[0]?.geometry;
      return geo && Number.isFinite(geo.lng) && Number.isFinite(geo.lat) ? [geo.lng, geo.lat] : null;
    }
    if (effective === 'google' && googleKey) {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', query);
      url.searchParams.set('key', googleKey);
      const res = await fetchWithTimeout(url, timeoutMs);
      if (!res || !res.ok) return null;
      const data = await res.json();
      const loc = data?.results?.[0]?.geometry?.location;
      return loc && Number.isFinite(loc.lng) && Number.isFinite(loc.lat) ? [loc.lng, loc.lat] : null;
    }
    return null;
  };
}

function pickAddress(order = {}) {
  const shipping = order.shipping_address;
  const billing = order.billing_address;
  const hasShipping = shipping && (shipping.country_code || shipping.country);
  return hasShipping ? shipping : (billing || shipping || {});
}

function regionLabel(country, region) {
  if (!region) return '';
  if (country === 'US') return US_STATE_CODE_TO_NAME[region] || region;
  return region;
}

function cityLabel(rawCity) {
  const trimmed = String(rawCity || '').trim();
  if (!trimmed) return '';
  return trimmed
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// Builds the full display location from Shopify address fields:
//   non-US -> "City, Country"     (e.g. "Paris, France")
//   US     -> "City, State, USA"  (e.g. "Brooklyn, New York, USA" or "New York, New York, USA")
function locationLabel(country, region, cityTitle) {
  const countryName = countryDisplayName(country);
  if (country === 'US') {
    const stateName = US_STATE_CODE_TO_NAME[region] || region || '';
    const parts = [];
    if (cityTitle) parts.push(cityTitle);
    if (stateName) parts.push(stateName);
    parts.push('USA');
    return parts.join(', ');
  }
  return [cityTitle, countryName].filter(Boolean).join(', ');
}

export function relativeTime(value, now = Date.now()) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

// Converts a raw Shopify order into the safe Purchase shape, or null when
// no reliable location is available. Never includes customer PII.
//
// `opts` may carry { now, source, product } so the same non-PII context the
// existing live sales monitor surfaced (order name, product, ad/source) is
// preserved in the map's recents.
export async function buildPurchase(order, store, opts = {}) {
  const isOptsObject = Boolean(opts) && typeof opts === 'object';
  const now = typeof opts === 'number' ? opts : (isOptsObject ? (opts.now || Date.now()) : Date.now());
  const source = isOptsObject ? (opts.source || '') : '';
  const productHint = isOptsObject ? (opts.product || '') : '';
  const channel = isOptsObject ? (opts.channel || '') : '';

  const address = pickAddress(order);
  const norm = normalizeAddress(address);
  if (!norm.country) return null;

  const coordinates = await store.resolveOrderCoordinates(address);
  if (!Array.isArray(coordinates)) return null;

  const region = norm.region || '';
  const cityTitle = cityLabel(address.city);
  const city = cityTitle || regionLabel(norm.country, region) || countryDisplayName(norm.country);
  const location = locationLabel(norm.country, region, cityTitle);
  const amount = Number(order.current_total_price || order.total_price || 0) || 0;
  const currency = order.currency || order.presentment_currency || 'USD';
  const items = merchandiseItemCount(order.line_items);
  const id = String(order.id || '');
  const product = productHint || (order.line_items || []).find((item) => item?.title)?.title || '';

  return {
    id,
    name: order.name || (id ? `#${id}` : ''),
    country: countryDisplayName(norm.country),
    location: location || countryDisplayName(norm.country),
    city,
    region: region || undefined,
    countryCode: norm.country,
    flag: countryFlag(norm.country),
    amount,
    currency,
    items,
    product: product || undefined,
    source: source || undefined,
    channel: channel || undefined,
    coordinates: [Number(coordinates[0]), Number(coordinates[1])],
    time: relativeTime(order.created_at, now),
    createdAt: order.created_at || '',
  };
}

export { normalizeAddress, normalizeCountry, normalizeRegion, normalize, locationLabel };
