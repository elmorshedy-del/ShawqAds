import { productTaxonomyForName } from './productMapping.js';

export function isTipTitle(value = '') {
  return /(^|\s)(tip|tips|gratuity)(\s|$)/i.test(String(value || '').replace(/[^a-z0-9]+/gi, ' '));
}

export function merchandiseLineItems(lineItems = []) {
  return (lineItems || [])
    .map((item) => ({ item, taxonomy: productTaxonomyForName(item.title) }))
    .filter(({ item, taxonomy }) => taxonomy.family && !isTipTitle(item.title));
}

export function merchandiseItemCount(lineItems = []) {
  return merchandiseLineItems(lineItems).reduce(
    (total, { item }) => total + Number(item.quantity || 0),
    0,
  );
}
