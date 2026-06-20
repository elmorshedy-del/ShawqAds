/* Classify storefront pages and identify the brand & mission pages.
 *
 * "Brand & mission pages" are the storytelling surfaces: the curated About Us and Donations pages the
 * storefront navigation links to, PLUS the Shawq Journal blog (index + every post) — the brand's
 * activist/editorial voice. We do NOT keyword-match (that mis-tagged locale-prefixed commerce URLs
 * like /fr/products/…-shawq as brand pages). Paths are matched AFTER normalizePagePath() (locale
 * stripped, query dropped), so every locale/ad-param variant rolls up to one canonical page.
 *
 * Verified on shawq.co (2026-06-20): nav links to /pages/about-us-2 ("About Us") and
 * /pages/copy-of-donations ("Our Donations and Impact"); the Shawq Journal lives at /blogs/shawq-journal.
 * The orphaned /pages/about-us and /pages/donations (no nav link, no traffic) are NOT tracked.
 */

import { normalizePagePath } from './pagePath.js';

export const BRAND_PAGES_LABEL = 'Brand & mission pages';

// Exact curated brand/mission pages -> display name exactly as shown on the website.
export const BRAND_MISSION_PAGES = Object.freeze({
  '/pages/about-us-2': 'About Us',
  '/pages/copy-of-donations': 'Our Donations and Impact',
});

// The Shawq Journal blog (index + all posts) is brand/mission storytelling.
export const SHAWQ_BLOG_PREFIX = '/blogs/shawq-journal';

function canonicalPath(path = '') {
  return normalizePagePath(path).toLowerCase();
}

function humanizeSlug(slug = '') {
  let value = slug;
  try {
    value = decodeURIComponent(slug);
  } catch {
    /* keep raw slug on malformed percent-encoding */
  }
  return value
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function isShawqBlog(p) {
  return p === SHAWQ_BLOG_PREFIX || p.startsWith(`${SHAWQ_BLOG_PREFIX}/`);
}

export function isBrandPage(path = '') {
  const p = canonicalPath(path);
  return Object.prototype.hasOwnProperty.call(BRAND_MISSION_PAGES, p) || isShawqBlog(p);
}

// Display name (website name) for a brand/mission page, or null if it is not a brand page.
export function brandPageName(path = '') {
  const p = canonicalPath(path);
  if (BRAND_MISSION_PAGES[p]) return BRAND_MISSION_PAGES[p];
  if (p === SHAWQ_BLOG_PREFIX) return 'Shawq Journal';
  if (p.startsWith(`${SHAWQ_BLOG_PREFIX}/`)) {
    return `Shawq Journal · ${humanizeSlug(p.slice(`${SHAWQ_BLOG_PREFIX}/`.length))}`;
  }
  return null;
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
