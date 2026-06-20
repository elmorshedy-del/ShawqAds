/* Classify storefront pages and identify the brand & mission pages.
 *
 * "Brand & mission pages" are an explicit, curated set — the REAL About Us and Donations pages the
 * storefront navigation actually links to — mapped to the names the website uses. We do NOT
 * keyword-match: keyword matching mis-tagged locale-prefixed commerce URLs (e.g. /fr/products/…-shawq)
 * as brand pages and fragmented one page across locales. Paths are matched AFTER normalizePagePath()
 * (locale stripped, query dropped), so every locale/ad-param variant rolls up to one canonical page.
 *
 * Verified on shawq.co (2026-06-20): the live nav links to /pages/about-us-2 ("About Us") and
 * /pages/copy-of-donations ("Our Donations and Impact"). The plain /pages/about-us and
 * /pages/donations also exist but are orphaned (no nav link, no traffic) — so they are NOT tracked.
 */

import { normalizePagePath } from './pagePath.js';

export const BRAND_PAGES_LABEL = 'Brand & mission pages';

// Canonical brand/mission page path -> display name exactly as shown on the website.
export const BRAND_MISSION_PAGES = Object.freeze({
  '/pages/about-us-2': 'About Us',
  '/pages/copy-of-donations': 'Our Donations and Impact',
});

function canonicalPath(path = '') {
  return normalizePagePath(path).toLowerCase();
}

export function isBrandPage(path = '') {
  return Object.prototype.hasOwnProperty.call(BRAND_MISSION_PAGES, canonicalPath(path));
}

// Display name (website name) for a brand/mission page, or null if it is not a curated brand page.
export function brandPageName(path = '') {
  return BRAND_MISSION_PAGES[canonicalPath(path)] || null;
}

export function pageCategory(path = '') {
  const p = canonicalPath(path) || '/';
  if (isBrandPage(p)) return 'brand';
  if (p === '/' || p === '') return 'home';
  if (p.startsWith('/products/')) return 'product';
  if (p.startsWith('/collections/')) return 'collection';
  if (p.startsWith('/checkout') || p === '/cart') return 'checkout';
  if (p.startsWith('/blogs/')) return 'blog';
  return 'other';
}
