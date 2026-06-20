/* Classify a session's ENTRY traffic source from its landing URL + document.referrer.
 *
 * Purpose: answer "is the Shawq Journal (especially the keffiyah post) pulling Google SEARCH
 * traffic?" Organic search carries no UTM/click-id, so document.referrer is the only signal — the
 * customer-events pixel must send it. Paid clicks (gclid / fbclid / utm_medium=cpc) take precedence
 * over the referring host so an ad click from a search engine isn't miscounted as organic.
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
  google_ads: 'Google Ads',
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

  const googleAdsClick = Boolean(get('gclid') || get('gbraid') || get('wbraid'));
  const metaClick = Boolean(get('fbclid'));
  const paidMedium = /(cpc|ppc|paid|display|cpm)/.test(utmMedium);

  // Paid takes precedence over the referring host.
  if (googleAdsClick || (utmSource.includes('google') && paidMedium)) return 'google_ads';
  if (metaClick || (/facebook|instagram|meta/.test(utmSource) && (paidMedium || utmMedium.includes('social')))) {
    return 'meta_ads';
  }
  if (paidMedium) return 'other_paid';

  // Organic search — the Shawq Journal / keffiyah SEO goal.
  if (/(^|\.)google\./.test(refHost) || (utmSource.includes('google') && (utmMedium === 'organic' || !utmMedium))) {
    return 'google_search';
  }
  if (/(^|\.)(bing|duckduckgo|yahoo|ecosia|brave|baidu|yandex|qwant)\./.test(refHost) || utmMedium === 'organic') {
    return 'other_search';
  }

  // Social / referral / direct.
  if (
    /(^|\.)(instagram|facebook|tiktok|pinterest|snapchat|youtube|linkedin|reddit|twitter)\./.test(refHost)
    || refHost === 't.co'
    || /facebook|instagram|tiktok|pinterest|snapchat|twitter/.test(utmSource)
  ) {
    return 'social';
  }
  if (refHost && !refHost.includes('shawq') && !refHost.includes('myshopify')) return 'referral';
  return 'direct';
}
