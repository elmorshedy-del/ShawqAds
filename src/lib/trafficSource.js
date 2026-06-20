/* Classify a session's ENTRY traffic source from its landing URL + document.referrer.
 *
 * Purpose: answer "is the Shawq Journal (especially the keffiyah post) pulling Google SEARCH
 * traffic?" ShawQ runs NO Google Ads, so Google traffic is organic search, identified purely by the
 * REFERRER host — we deliberately do not rely on UTM/gclid for Google. Meta (paid social) ads DO run,
 * so an fbclid or a Meta source with a paid medium is classified as meta_ads.
 */

function safeUrl(value) {
  try {
    return new URL(String(value || ''), 'https://shawq.co');
  } catch {
    return null;
  }
}

function hostOf(value) {
  const url = safeUrl(value);
  return url ? url.hostname.toLowerCase() : '';
}

export const TRAFFIC_SOURCE_LABELS = Object.freeze({
  google_search: 'Google search',
  other_search: 'Other search',
  meta_ads: 'Meta ads',
  other_paid: 'Other paid',
  social: 'Social',
  referral: 'Referral',
  direct: 'Direct',
});

export function classifyTrafficSource({ href = '', referrer = '' } = {}) {
  const landing = safeUrl(href);
  const get = (key) => (landing ? landing.searchParams.get(key) || '' : '');
  const utmSource = get('utm_source').toLowerCase();
  const utmMedium = get('utm_medium').toLowerCase();
  const refHost = hostOf(referrer);

  // Search is identified by the REFERRER host only. ShawQ runs no Google Ads, so a Google referrer
  // is always organic search — we deliberately do not rely on UTM/gclid for Google attribution.
  if (/(^|\.)google\./.test(refHost)) return 'google_search';
  if (/(^|\.)(bing|duckduckgo|yahoo|ecosia|brave|baidu|yandex|qwant)\./.test(refHost)) return 'other_search';

  // Meta paid social (ShawQ does run Meta ads): an fbclid, or a Meta source with a paid medium.
  const paidMedium = /(cpc|ppc|paid|display|cpm)/.test(utmMedium);
  if (get('fbclid') || (/facebook|instagram|meta/.test(utmSource) && paidMedium)) return 'meta_ads';

  // Organic social, other paid, referral, direct.
  if (
    /(^|\.)(instagram|facebook|tiktok|pinterest|snapchat|youtube|linkedin|reddit|twitter)\./.test(refHost)
    || refHost === 't.co'
    || /facebook|instagram|tiktok|pinterest|snapchat|twitter/.test(utmSource)
  ) {
    return 'social';
  }
  if (paidMedium) return 'other_paid';
  if (refHost && !refHost.includes('shawq') && !refHost.includes('myshopify')) return 'referral';
  return 'direct';
}
