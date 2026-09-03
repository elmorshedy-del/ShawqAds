import assert from 'node:assert/strict';
import {
  buildCustomerSpendingPowerAnalysis,
  linearRegression,
  weightedIncomePercentiles,
} from '../src/lib/customerSpendingPower.js';

const pct = weightedIncomePercentiles([
  { postal_code: '10001', area_income_usd: 50000, households: 100 },
  { postal_code: '10002', area_income_usd: 100000, households: 100 },
]);
assert.equal(pct.length, 2);
assert.equal(Math.round(pct[0].spending_power_percentile), 25);
assert.equal(Math.round(pct[1].spending_power_percentile), 75);

const regression = linearRegression([
  { x: 1, y: 2 },
  { x: 2, y: 4 },
  { x: 3, y: 6 },
]);
assert.equal(regression.slope, 2);
assert.equal(regression.intercept, 0);
assert.equal(regression.r2, 1);

const analysis = buildCustomerSpendingPowerAnalysis({
  lifetimeSince: '2020-01-01',
  lifetimeUntil: '2026-09-03',
  shopCurrency: 'USD',
  usReference: [
    { postal_code: '10001', area_income_usd: 50000, households: 100 },
    { postal_code: '10002', area_income_usd: 100000, households: 100 },
    { postal_code: '10003', area_income_usd: 150000, households: 100 },
    { postal_code: '10004', area_income_usd: 200000, households: 100 },
    { postal_code: '10005', area_income_usd: 250000, households: 100 },
  ],
  orders: [
    { order_id: '1', customer_id: 'a', created_at: '2021-01-01', country_code: 'US', postal_code: '10001', revenue: 50 },
    { order_id: '2', customer_id: 'a', created_at: '2022-01-01', country_code: 'US', postal_code: '10005', revenue: 75 },
    { order_id: '3', customer_id: 'b', created_at: '2021-02-01', country_code: 'US', postal_code: '10005', revenue: 200 },
    { order_id: '4', customer_id: '', created_at: '2021-03-01', country_code: 'US', postal_code: '10002', revenue: 30 },
    { order_id: '5', customer_id: 'c', created_at: '2021-04-01', country_code: 'GB', postal_code: 'SW1A 1AA', revenue: 90 },
    // Moving later to a supported US ZIP must not redefine the acquisition area.
    { order_id: '6', customer_id: 'd', created_at: '2020-02-01', country_code: 'GB', postal_code: 'W1A 1AA', revenue: 40 },
    { order_id: '7', customer_id: 'd', created_at: '2022-02-01', country_code: 'US', postal_code: '10005', revenue: 60 },
    // Input order need not be sorted; earliest paid order still owns the area.
    { order_id: '8', customer_id: 'e', created_at: '2022-03-01', country_code: 'US', postal_code: '10005', revenue: 55 },
    { order_id: '9', customer_id: 'e', created_at: '2020-03-01', country_code: 'US', postal_code: '10002', revenue: 45 },
    // Guest address HMACs are stable internal keys but never emitted to the UI.
    { order_id: '10', customer_id: 'guest:abc', customer_key_basis: 'address_hmac', created_at: '2021-05-01', country_code: 'US', postal_code: '10003', revenue: 80 },
  ],
});

assert.equal(analysis.status, 'ready');
assert.equal(analysis.scope, 'lifetime');
assert.equal(analysis.coverage.included_orders, 10);
assert.equal(analysis.coverage.identified_customers, 6);
assert.equal(analysis.coverage.supported_first_order_customers, 4);
assert.equal(analysis.coverage.matched_customers, 4);
assert.equal(analysis.coverage.supported_customer_match_rate, 1);
assert.equal(analysis.points.length, 4);

const byIncome = new Map(analysis.points.map((point) => [point.area_income_usd, point]));
assert.equal(byIncome.get(50000)?.lifetime_spend, 125, 'repeat spend stays on the first observed area');
assert.equal(byIncome.get(250000)?.lifetime_spend, 200);
assert.equal(byIncome.get(100000)?.lifetime_spend, 100, 'out-of-order rows use the actual earliest order');
assert.equal(byIncome.get(150000)?.lifetime_spend, 80, 'guest HMAC cohort is included without exposing its key');
assert.equal(analysis.points.some((point) => point.lifetime_spend === 100 && point.area_income_usd === 250000), false, 'later US move did not overwrite an earlier acquisition area');
assert.equal(analysis.methodology.privacy.includes('postal codes'), true);
assert.equal(Object.hasOwn(analysis.points[0], 'postal_code'), false, 'public points do not expose postcode');
assert.equal(Object.hasOwn(analysis.points[0], 'customer_id'), false, 'public points do not expose customer id');
assert.equal(Object.values(analysis.coverage.customer_key_basis_orders).reduce((a, b) => a + b, 0), 9, 'identified-order basis counts exclude unidentified orders');

console.log('customer spending power tests passed');
