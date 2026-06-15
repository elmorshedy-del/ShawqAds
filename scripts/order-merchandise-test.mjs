import assert from 'node:assert/strict';
import { merchandiseItemCount, merchandiseLineItems, isTipTitle } from '../src/lib/orderMerchandise.js';

assert.equal(isTipTitle('Tip'), true);
assert.equal(isTipTitle('Driver Tip'), true);
assert.equal(isTipTitle('ShawQ Hoodie'), false);

const jeansAndTip = [
  { title: 'Never Forgotten Denim Jeans (Unisex)', quantity: 1, price: '89.00' },
  { title: 'Tip', quantity: 1, price: '9.99' },
];

assert.equal(merchandiseItemCount(jeansAndTip), 1);
assert.equal(merchandiseLineItems(jeansAndTip).length, 1);
assert.equal(merchandiseLineItems(jeansAndTip)[0].item.title.includes('Jeans'), true);

const multiMerch = [
  { title: 'ShawQ Signature Hoodie', quantity: 2, price: '71.00' },
  { title: 'ShawQ Tee', quantity: 1, price: '35.00' },
];

assert.equal(merchandiseItemCount(multiMerch), 3);

console.log('order-merchandise-test: ok');
