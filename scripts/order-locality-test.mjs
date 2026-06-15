import assert from 'node:assert/strict';
import { buildPublicLocation, isCompoundLocality, pickPublicLocality } from '../src/lib/orderLocality.js';

const uaeCompound = {
  city: 'Jumairah 1, Port De La Mer, La Cote 3, Apartment 311',
  province: 'Dubai',
  province_code: 'DU',
  country_code: 'AE',
};

assert.equal(isCompoundLocality(uaeCompound.city), true);
assert.equal(pickPublicLocality(uaeCompound, 'AE'), 'Dubai');
assert.equal(
  buildPublicLocation(uaeCompound, 'AE', 'DU'),
  'Dubai, United Arab Emirates',
  'compound city should fall back to Shopify province name',
);

assert.equal(pickPublicLocality({ city: 'Paris', country_code: 'FR' }, 'FR'), 'Paris');
assert.equal(
  buildPublicLocation({ city: 'Paris', country_code: 'FR' }, 'FR'),
  'Paris, France',
);

assert.equal(
  pickPublicLocality({ city: 'Santa Clara', province_code: 'CA', country_code: 'US' }, 'US'),
  'Santa Clara',
);
assert.equal(
  buildPublicLocation(
    { city: 'Santa Clara', province: 'California', province_code: 'CA', country_code: 'US' },
    'US',
    'CA',
  ),
  'Santa Clara, California, USA',
);

assert.equal(
  buildPublicLocation(
    {
      city: 'Building 5, Apartment 12',
      province_code: 'DU',
      country_code: 'AE',
    },
    'AE',
    'DU',
  ),
  'United Arab Emirates',
  'compound city without a readable province name should collapse to country only',
);

console.log('order-locality-test: ok');
