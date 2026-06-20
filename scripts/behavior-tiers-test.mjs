import { comparabilityTier, MIN_COMPARABLE_SESSIONS } from '../src/lib/sampleTiers.js';
import {
  isBrandPage,
  brandPageName,
  pageCategory,
  BRAND_MISSION_PAGES,
} from '../src/lib/pageCategory.js';
import { normalizePagePath } from '../src/lib/pagePath.js';
import { classifyTrafficSource } from '../src/lib/trafficSource.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Sample tiers (plain-language comparability).
assert(comparabilityTier(500).key === 'reliable' && comparabilityTier(500).comparable, 'reliable at 500');
assert(comparabilityTier(150).key === 'comparable', 'comparable at 150');
assert(comparabilityTier(40).key === 'early' && comparabilityTier(40).comparable, 'early at 40');
assert(comparabilityTier(10).key === 'too_few' && comparabilityTier(10).comparable === false, 'too few at 10');
assert(MIN_COMPARABLE_SESSIONS === 30, 'min comparable is 30');

// Page-identity normalization: drop query string and strip locale prefix so duplicates unite.
assert(normalizePagePath('/products/skirt?utm_source=fb&fbclid=x') === '/products/skirt', 'drops utm/fbclid');
assert(
  normalizePagePath('/products/kuffiyah-engraved-denim-skirt?adset_id=1&ad_id=2&campaign_id=3')
    === '/products/kuffiyah-engraved-denim-skirt',
  'drops Meta ad params — unites the two Kuffiyah rows',
);
assert(normalizePagePath('/products/skirt?_su_rec=abc&srsltid=z&variant=99') === '/products/skirt', 'drops shopify/google/variant tokens');
assert(normalizePagePath('/fr/products/skirt') === '/products/skirt', 'strips fr locale');
assert(normalizePagePath('/de/pages/about-us-2') === '/pages/about-us-2', 'strips de locale');
assert(normalizePagePath('/en-ca/collections/tops') === '/collections/tops', 'strips lang-region locale');
assert(normalizePagePath('/ar/') === '/', 'locale-only path is the homepage');
assert(normalizePagePath('/') === '/', 'root stays root');
assert(normalizePagePath('/products/skirt/') === '/products/skirt', 'collapses trailing slash');
assert(normalizePagePath('/products/ar-blend-top') === '/products/ar-blend-top', 'does not strip a non-locale route segment');
assert(
  normalizePagePath('/Products/Kuffiyah-Engraved-Denim-Skirt?Ad_Id=5') === '/products/kuffiyah-engraved-denim-skirt',
  'case-insensitive page identity',
);

// Brand & mission pages: curated allowlist of the REAL About Us + Donations pages only.
assert(isBrandPage('/pages/about-us-2') === true, 'about-us-2 is the real About Us');
assert(isBrandPage('/pages/copy-of-donations') === true, 'copy-of-donations is the real Donations');
assert(isBrandPage('/fr/pages/about-us-2') === true, 'locale variant of About Us unites to brand');
assert(isBrandPage('/pages/copy-of-donations?adset_id=1') === true, 'query variant of Donations unites to brand');
assert(isBrandPage('/pages/about-us') === false, 'orphaned about-us is not tracked');
assert(isBrandPage('/pages/donations') === false, 'orphaned donations is not tracked');
assert(isBrandPage('/pages/about') === false, 'no keyword matching');
assert(isBrandPage('/products/kuffiyah-engraved-denim-skirt') === false, 'product is never brand');
assert(isBrandPage('/fr/products/ghalabany-al-shawq-t-shirt') === false, 'locale product is never brand');
assert(isBrandPage('/collections/palestine-culture-inspired') === false, 'collection is never brand');
assert(isBrandPage('/blogs/shawq-journal') === true, 'Shawq Journal blog index is brand');
assert(isBrandPage('/blogs/shawq-journal/keffiyeh-thread-of-resistance') === true, 'Shawq Journal post is brand');
assert(isBrandPage('/fr/blogs/shawq-journal/keffiyeh-thread-of-resistance') === true, 'locale Shawq Journal post is brand');
assert(isBrandPage('/blogs/news/sale-announcement') === false, 'other blogs are not brand');
assert(isBrandPage('/') === false, 'home is not brand');
assert(Object.keys(BRAND_MISSION_PAGES).length === 2, 'exactly two curated exact-match brand pages');

// Brand display names = the names used on the website.
assert(brandPageName('/pages/about-us-2') === 'About Us', 'about us website name');
assert(brandPageName('/fr/pages/copy-of-donations') === 'Our Donations and Impact', 'donations website name (locale united)');
assert(brandPageName('/products/skirt') === null, 'non-brand has no brand name');
assert(brandPageName('/blogs/shawq-journal') === 'Shawq Journal', 'blog index name');
assert(brandPageName('/blogs/shawq-journal/keffiyeh-thread-of-resistance') === 'Shawq Journal · Keffiyeh Thread Of Resistance', 'blog post name');

// Page categories.
assert(pageCategory('/') === 'home', 'home');
assert(pageCategory('/products/x') === 'product', 'product');
assert(pageCategory('/fr/products/x') === 'product', 'locale product is product, not brand');
assert(pageCategory('/collections/x') === 'collection', 'collection');
assert(pageCategory('/checkout') === 'checkout', 'checkout');
assert(pageCategory('/cart') === 'checkout', 'cart counts as checkout');
assert(pageCategory('/pages/copy-of-donations') === 'brand', 'real donations is brand');
assert(pageCategory('/pages/donations') === 'other', 'orphaned donations is other');
assert(pageCategory('/pages/contact') === 'other', 'contact is other');
assert(pageCategory('/blogs/news/olive-tree') === 'blog', 'other blog is blog');
assert(pageCategory('/blogs/shawq-journal/keffiyeh-thread-of-resistance') === 'brand', 'Shawq Journal post is brand');

// Traffic-source classification (Shawq Journal / keffiyah search reach).
assert(classifyTrafficSource({ referrer: 'https://www.google.com/' }) === 'google_search', 'organic Google is google_search');
assert(classifyTrafficSource({ referrer: 'https://www.google.com/', href: '/blogs/shawq-journal/keffiyeh?gclid=1' }) === 'google_ads', 'gclid is paid, not organic');
assert(classifyTrafficSource({ href: '/?utm_source=google&utm_medium=cpc' }) === 'google_ads', 'google cpc is paid');
assert(classifyTrafficSource({ referrer: 'https://www.bing.com/search?q=keffiyeh' }) === 'other_search', 'bing organic is other_search');
assert(classifyTrafficSource({ referrer: 'https://l.instagram.com/' }) === 'social', 'instagram referral is social');
assert(classifyTrafficSource({ href: '/?utm_source=instagram&utm_medium=paid_social' }) === 'meta_ads', 'instagram paid_social is meta');
assert(classifyTrafficSource({ href: '/?utm_source=instagram&utm_medium=social' }) === 'social', 'instagram organic social is social, not paid');
assert(classifyTrafficSource({ href: '/?fbclid=abc' }) === 'meta_ads', 'fbclid is meta');
assert(classifyTrafficSource({ referrer: 'https://shawq.co/collections/tops' }) === 'direct', 'internal referrer is direct');
assert(classifyTrafficSource({}) === 'direct', 'no signal is direct');

console.log('behavior tiers + page identity + brand allowlist + traffic source checks passed');
