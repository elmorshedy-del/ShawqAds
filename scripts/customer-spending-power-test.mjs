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
    { order_id: '5', customer_id: 'c', created_at: '2021-04-01', country_code: 'GB', postal_code: '', revenue: 90 },
  ],
});

assert.equal(analysis.status, 'ready');
assert.equal(analysis.scope, 'lifetime');
assert.equal(analysis.coverage.included_orders, 5);
assert.equal(analysis.coverage.identified_customers, 3);
assert.equal(analysis.coverage.matched_customers, 2);
assert.equal(analysis.points.length, 2);
assert.equal(analysis.points[0].lifetime_spend, 125, 'repeat spend is aggregated onto the first observed area');
assert.equal(analysis.points[1].lifetime_spend, 200);
assert.equal(analysis.methodology.privacy.includes('postal codes'), true);
assert.equal(Object.hasOwn(analysis.points[0], 'postal_code'), false, 'public points do not expose postcode');
assert.equal(Object.hasOwn(analysis.points[0], 'customer_id'), false, 'public points do not expose customer id');

console.log('customer spending power tests passed');
