import { buildCheckoutTheaterScript, theaterStepForEvent } from '../src/lib/checkoutTheater.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const step = theaterStepForEvent('checkout_shipping_info_submitted');
assert(step?.id === 'shipping', 'shipping event must map to shipping theater step');

const script = buildCheckoutTheaterScript([
  { event_name: 'product_viewed', timestamp: '2026-06-26T10:00:00.000Z', path: '/products/skirt' },
  { event_name: 'checkout_started', timestamp: '2026-06-26T10:01:00.000Z', path: '/checkout', line_items: [{ title: 'Skirt', quantity: 1 }] },
  { event_name: 'payment_info_submitted', timestamp: '2026-06-26T10:03:00.000Z', path: '/checkout' },
]);

assert(script.frames.length === 3, 'theater must include browse/checkout/payment frames');
assert(script.reached_steps.includes('checkout'), 'theater must mark checkout reached');
assert(script.outcome === 'payment_abandoned', 'payment without completion must be payment_abandoned');
assert(script.duration_ms === 180000, 'theater duration must span first to last frame');

console.log('checkout theater checks passed');
