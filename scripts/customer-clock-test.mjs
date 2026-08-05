import {
  buildCustomerClock,
  buildCustomerClockFindings,
  distinctOrders,
  formatHourWindow,
  peakHourWindow,
  zoneForCountry,
} from '../src/lib/customerClock.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/* --- country mapping ---------------------------------------------------- */

assert(zoneForCountry('us').zone === 'America/New_York', 'country codes should be case-insensitive');
assert(zoneForCountry('US').approximate === true, 'multi-zone countries must be marked approximate');
assert(zoneForCountry('GB').approximate === false, 'single-zone countries are exact');
assert(zoneForCountry('ZZ') === null, 'unknown countries map to null rather than a guess');

/* --- order dedupe ------------------------------------------------------- */

const lines = [
  { order_id: '1', created_at: '2026-06-03T20:00:00+03:00', country_code: 'US', line_revenue_usd: 50 },
  { order_id: '1', created_at: '2026-06-03T20:00:00+03:00', country_code: 'US', line_revenue_usd: 30 },
  { order_id: '2', created_at: '2026-06-04T10:00:00+03:00', country_code: 'GB', line_revenue_usd: 20 },
  { order_id: '3', created_at: '', country_code: 'GB', line_revenue_usd: 20 },
];
const orders = distinctOrders(lines);
assert(orders.length === 2, 'multi-line orders collapse to one order; timestampless lines are dropped');
assert(orders.find((o) => o.id === '1').revenue === 80, 'line revenue accumulates onto the order');

/* --- timezone re-bucketing --------------------------------------------- */

// 2026-06-03 03:19 Istanbul is 2026-06-02 20:19 in New York: previous day, evening.
const shifted = buildCustomerClock(
  [{ order_id: 'a', created_at: '2026-06-03T03:19:00+03:00', country_code: 'US', line_revenue_usd: 10 }],
  { merchantZone: 'Europe/Istanbul' },
);
assert(shifted.mapped === 1, 'the order should map');
assert(shifted.hours[20].orders === 1, 'a 03:19 Istanbul order is a 20:00 New York order');
assert(shifted.weekdayDisagreements === 1, 'it also falls on the previous weekday for the customer');
assert(Math.abs(shifted.disagreementRate - 1) < 1e-9, 'disagreement rate is per mapped order');

// A Turkish order cannot disagree with the merchant clock — same zone.
const local = buildCustomerClock(
  [{ order_id: 'b', created_at: '2026-06-03T03:19:00+03:00', country_code: 'TR', line_revenue_usd: 10 }],
  { merchantZone: 'Europe/Istanbul' },
);
assert(local.weekdayDisagreements === 0, 'same-zone orders never disagree');
assert(local.hours[3].orders === 1, 'a Turkish order stays at 03:00');

const unmapped = buildCustomerClock([
  { order_id: 'c', created_at: '2026-06-03T03:19:00+03:00', country_code: 'ZZ', line_revenue_usd: 10 },
]);
assert(unmapped.mapped === 0 && unmapped.unmapped === 1, 'unknown countries are counted, not silently dropped');
assert(unmapped.unmappedCountries.includes('ZZ'), 'unmapped countries are reported so the gap is visible');

/* --- peak window -------------------------------------------------------- */

const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));
// Cluster that wraps past midnight: 22, 23, 0, 1.
[22, 23, 0, 1].forEach((h) => { hours[h].orders = 10; });
hours[12].orders = 9; // a decoy single hour that must not beat the contiguous block
const window = peakHourWindow(hours, 4);
assert(window.start === 22, 'the peak window must wrap past midnight');
assert(window.orders === 40, 'the window sums its four hours');
assert(formatHourWindow(window) === '22:00–02:00', 'window formatting wraps correctly');
assert(peakHourWindow([], 4) === null, 'no hours yields no window');
assert(peakHourWindow(hours.map((h) => ({ ...h, orders: 0 })), 4) === null, 'an all-zero day yields no window');

/* --- findings restraint -------------------------------------------------- */

const tiny = buildCustomerClock([
  { order_id: 'x', created_at: '2026-06-03T20:00:00+03:00', country_code: 'US', line_revenue_usd: 10 },
]);
assert(
  buildCustomerClockFindings(tiny).length === 0,
  'a single order must not produce a scheduling recommendation',
);

// A concentrated, high-volume day set should produce a peak finding.
const many = [];
for (let i = 0; i < 60; i += 1) {
  many.push({
    order_id: `o${i}`,
    created_at: `2026-06-0${(i % 5) + 1}T23:30:00+03:00`,
    country_code: 'TR',
    line_revenue_usd: 10,
  });
}
const clock = buildCustomerClock(many);
const findings = buildCustomerClockFindings(clock);
assert(findings.some((f) => f.id === 'clock-peak'), 'a concentrated buying window should be reported');
assert(
  !findings.some((f) => f.id === 'clock-drift'),
  'same-zone orders must not trigger a clock-drift warning',
);

console.log('customer clock tests passed');
