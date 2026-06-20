// Normalize storefront URLs for behavior analytics. Page identity is the PATH only:
//  - Drop the query string entirely. On this storefront query params are tracking / variant /
//    recommendation tokens (utm_*, fbclid, adset_id, ad_id, campaign_id, _su_rec, srsltid, brid,
//    _gl, variant, …), never a distinct page — keeping them fragments one page into many.
//  - Strip a leading locale segment (/fr, /de, /en-ca, …) so the same page under different
//    storefront locales rolls up to one identity (and locale-prefixed product/collection URLs
//    are correctly recognised as commerce, not brand pages).

// Locale prefixes are ISO-639 language codes, optionally with a region (e.g. fr, de, en-ca).
// Storefront route roots (products, collections, pages, blogs, cart, checkout, account, search)
// are never two-letter codes, so a leading locale segment is unambiguous and safe to strip.
const LOCALE_SEGMENT = /^[a-z]{2}(-[a-z]{2})?$/;
const LOCALE_CODES = new Set([
  'af', 'ar', 'az', 'be', 'bg', 'bn', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'es', 'et',
  'eu', 'fa', 'fi', 'fr', 'ga', 'gl', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'ka',
  'kk', 'km', 'kn', 'ko', 'lt', 'lv', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'nb', 'ne', 'nl', 'nn',
  'no', 'pa', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sq', 'sr', 'sv', 'sw', 'ta', 'te', 'th', 'tr',
  'uk', 'ur', 'vi', 'zh',
]);

function stripLocalePrefix(pathname = '/') {
  const segments = pathname.split('/');
  const first = (segments[1] || '').toLowerCase();
  if (first && LOCALE_SEGMENT.test(first) && LOCALE_CODES.has(first.split('-')[0])) {
    segments.splice(1, 1);
    return segments.join('/') || '/';
  }
  return pathname;
}

export function normalizePagePath(href = '') {
  const raw = String(href || '').trim();
  if (!raw) return '/';
  let pathname;
  try {
    pathname = new URL(raw, 'https://shawq.co').pathname || '/';
  } catch {
    pathname = raw.split('?')[0].split('#')[0] || '/';
  }
  pathname = stripLocalePrefix(pathname);
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.replace(/\/+$/, '') || '/';
  }
  return (pathname || '/').slice(0, 200);
}

function titleWords(value = '') {
  return String(value || '')
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function pagePathLabel(path = '') {
  const normalized = normalizePagePath(path);
  const pathname = normalized.split('?')[0] || '/';

  if (pathname === '/' || pathname === '') return 'Homepage';
  if (pathname === '/cart') return 'Cart';
  if (pathname.startsWith('/checkout')) return 'Checkout';
  if (pathname.startsWith('/collections/')) {
    const slug = decodeURIComponent(pathname.slice('/collections/'.length));
    return `Collection · ${titleWords(slug)}`;
  }
  if (pathname.startsWith('/products/')) {
    const slug = decodeURIComponent(pathname.slice('/products/'.length));
    return titleWords(slug);
  }
  if (pathname.startsWith('/pages/')) {
    const slug = decodeURIComponent(pathname.slice('/pages/'.length));
    return titleWords(slug);
  }
  if (pathname.startsWith('/blogs/')) {
    const slug = decodeURIComponent(pathname.replace(/^\/blogs\//, ''));
    return `Blog · ${titleWords(slug)}`;
  }
  return pathname;
}

export function formatDwellSeconds(seconds = 0) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value >= 60) return `${(value / 60).toFixed(1)} min`;
  return `${value.toFixed(2)}s`;
}

export function journeyStepInsight(row = {}) {
  const label = pagePathLabel(row.path);
  const purchaserPct = Math.round(Number(row.purchaser_support || 0) * 100);
  const nonPurchaserPct = Math.round(Number(row.non_purchaser_support || 0) * 100);
  if (row.purchasers > 0 && row.non_purchasers > 0) {
    const lift = Number(row.lift || 0);
    if (lift >= 1.4) return `${purchaserPct}% of buyers hit ${label} vs ${nonPurchaserPct}% of non-buyers — stronger buyer signal.`;
    if (lift <= 0.7) return `${nonPurchaserPct}% of non-buyers reach ${label} but only ${purchaserPct}% of buyers — possible detour.`;
    return `${purchaserPct}% buyer / ${nonPurchaserPct}% non-buyer reach — similar traffic at step ${row.step}.`;
  }
  if (row.purchasers > 0) return `${purchaserPct}% of buyers pass through ${label} at step ${row.step}.`;
  return `${nonPurchaserPct}% of non-buyers pass through ${label} at step ${row.step}.`;
}
