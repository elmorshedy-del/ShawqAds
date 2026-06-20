/* Classify storefront pages and flag the brand/mission pages.
 *
 * "Brand & mission pages" are ShawQ's non-product, storytelling pages (About, Impact,
 * Donations, the Shawq story, etc.) — central to the brand's activist heritage. They are
 * always surfaced in the most-visited panel even when product/collection pages out-rank
 * them, so their reach is never hidden behind commerce traffic.
 */

import { normalizePagePath } from './pagePath.js';

export const BRAND_PAGES_LABEL = 'Brand & mission pages';

const BRAND_KEYWORDS = [
  'about', 'our-story', 'story', 'shawq', 'impact', 'donat', 'mission',
  'cause', 'gaza', 'palestin', 'keffiyeh', 'handala', 'heritage', 'tatreez',
];

export function isBrandPage(path = '') {
  const p = normalizePagePath(path).split('?')[0].toLowerCase();
  // Never treat commerce surfaces as brand pages, even if a slug contains a keyword.
  if (p.startsWith('/products/') || p.startsWith('/collections/') || p.startsWith('/checkout') || p === '/cart') {
    return false;
  }
  return BRAND_KEYWORDS.some((kw) => p.includes(kw));
}

export function pageCategory(path = '') {
  const p = normalizePagePath(path).split('?')[0] || '/';
  if (p === '/' || p === '') return 'home';
  if (p.startsWith('/products/')) return 'product';
  if (p.startsWith('/collections/')) return 'collection';
  if (p.startsWith('/checkout') || p === '/cart') return 'checkout';
  if (isBrandPage(p)) return 'brand';
  if (p.startsWith('/blogs/')) return 'blog';
  return 'other';
}
