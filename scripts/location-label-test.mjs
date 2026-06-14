import { locationLabel } from '../src/lib/orderResolver.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  locationLabel('US', 'NY', 'Brooklyn') === 'Brooklyn, New York, USA',
  'Brooklyn should be City, State, USA without an extra New York',
);
assert(
  locationLabel('US', 'NY', 'Queens') === 'Queens, New York, USA',
  'Queens should be City, State, USA',
);
assert(
  locationLabel('US', 'NY', 'New York') === 'New York, New York, USA',
  'Manhattan-style New York city from Shopify should read New York, New York, USA',
);
assert(
  locationLabel('US', 'CA', 'Los Angeles') === 'Los Angeles, California, USA',
  'Non-NY US cities unchanged',
);
assert(
  locationLabel('FR', '', 'Paris') === 'Paris, France',
  'International format unchanged',
);

console.log('location label checks passed');
