import { comparabilityTier, MIN_COMPARABLE_SESSIONS } from '../src/lib/sampleTiers.js';
import { isBrandPage, pageCategory } from '../src/lib/pageCategory.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Sample tiers (plain-language comparability).
assert(comparabilityTier(500).key === 'reliable' && comparabilityTier(500).comparable, 'reliable at 500');
assert(comparabilityTier(150).key === 'comparable', 'comparable at 150');
assert(comparabilityTier(40).key === 'early' && comparabilityTier(40).comparable, 'early at 40');
assert(comparabilityTier(10).key === 'too_few' && comparabilityTier(10).comparable === false, 'too few at 10');
assert(MIN_COMPARABLE_SESSIONS === 30, 'min comparable is 30');

// Brand/mission page detection.
assert(isBrandPage('/pages/about') === true, 'about is brand');
assert(isBrandPage('/pages/impact') === true, 'impact is brand');
assert(isBrandPage('/pages/donations') === true, 'donations is brand');
assert(isBrandPage('/pages/shawq-story') === true, 'shawq is brand');
assert(isBrandPage('/products/shawq-tatreez-top') === false, 'product is never brand even with keyword');
assert(isBrandPage('/collections/impact-drop') === false, 'collection is never brand even with keyword');
assert(isBrandPage('/blogs/news/our-story-from-gaza') === false, 'blog post is never brand even with keyword');
assert(isBrandPage('/') === false, 'home is not brand');

// Page categories.
assert(pageCategory('/') === 'home', 'home');
assert(pageCategory('/products/x') === 'product', 'product');
assert(pageCategory('/collections/x') === 'collection', 'collection');
assert(pageCategory('/checkout') === 'checkout', 'checkout');
assert(pageCategory('/cart') === 'checkout', 'cart counts as checkout');
assert(pageCategory('/pages/donations') === 'brand', 'donations brand');
assert(pageCategory('/pages/contact') === 'other', 'contact is other');
assert(pageCategory('/blogs/news/our-story-from-gaza') === 'blog', 'brand-keyword blog is classified blog, not brand');

console.log('behavior tiers + page category checks passed');
