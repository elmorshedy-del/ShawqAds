import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildCustomerSpendingPowerAnalysis,
  linearRegression,
  weightedIncomePercentiles,
} from '../src/lib/customerSpendingPower.js';
import {
  buildCensusApiUrl,
  buildCensusReporterUrls,
  loadUsAcsReference,
  parseCensusAcsRows,
  parseCensusReporterRows,
} from './lib/us-acs-reference.mjs';
import {
  buildWorldBankIndicatorUrl,
  loadWorldBankCountryReference,
  parseWorldBankIndicator,
} from './lib/world-bank-country-reference.mjs';

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

const officialRows = parseCensusAcsRows([
  ['NAME', 'B19013_001E', 'B11001_001E', 'zip code tabulation area'],
  ['ZCTA5 10001', '101234', '12000', '10001'],
  ['ZCTA5 00000', '-666666666', '10', '00000'],
]);
assert.deepEqual(officialRows, [
  { postal_code: '10001', area_income_usd: 101234, households: 12000 },
]);

const reporterPayload = {
  data: {
    '86000US10001': {
      B19013: { estimate: { B19013001: 101234 } },
      B11001: { estimate: { B11001001: 12000 } },
    },
  },
};
assert.deepEqual(parseCensusReporterRows(reporterPayload), officialRows);

const keyedCensusUrl = new URL(buildCensusApiUrl('2024', 'test-key'));
assert.equal(keyedCensusUrl.searchParams.get('key'), 'test-key');
assert.equal(keyedCensusUrl.searchParams.get('for'), 'zip code tabulation area:*');
const reporterUrls = buildCensusReporterUrls('2024', ['36', '34']);
assert.equal(reporterUrls.length, 2, 'fallback requests one state expansion per URL');
assert.equal(new URL(reporterUrls[0]).searchParams.get('geo_ids'), '860|04000US36');
assert.equal(reporterUrls[0].includes('/acs2024_5yr?'), true);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shawq-acs-test-'));
try {
  const cachePath = path.join(tempDir, 'acs.json');
  const calls = [];
  const fallback = await loadUsAcsReference({
    vintage: '2024',
    cachePath,
    reporterStateFips: ['36'],
    fetchImpl: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(reporterPayload),
      };
    },
  });
  assert.equal(fallback.access, 'census_reporter');
  assert.equal(fallback.rows.length, 1);
  assert.equal(calls.length, 1, 'no Census API request is made when no key is configured');
  assert.equal(calls[0].includes('api.censusreporter.org'), true);

  const cached = await loadUsAcsReference({
    vintage: '2024',
    cachePath,
    reporterStateFips: ['36'],
    fetchImpl: async () => { throw new Error('network should not be used when durable cache exists'); },
  });
  assert.equal(cached.access, 'durable_cache');
  assert.deepEqual(cached.rows, fallback.rows);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const wbUrl = new URL(buildWorldBankIndicatorUrl('NY.GNP.PCAP.PP.CD', ['US', 'GB'], {
  startYear: 2024,
  endYear: 2026,
}));
assert.equal(wbUrl.pathname.includes('/country/GB;US/indicator/NY.GNP.PCAP.PP.CD'), true);
assert.equal(wbUrl.searchParams.get('format'), 'json');
assert.equal(wbUrl.searchParams.get('date'), '2024:2026');

const wbPayload = [
  { page: 1, pages: 1, per_page: 1000, total: 4 },
  [
    { indicator: { id: 'NY.GNP.PCAP.PP.CD' }, country: { id: 'US', value: 'United States' }, date: '2025', value: 89490 },
    { indicator: { id: 'NY.GNP.PCAP.PP.CD' }, country: { id: 'US', value: 'United States' }, date: '2024', value: 85000 },
    { indicator: { id: 'NY.GNP.PCAP.PP.CD' }, country: { id: 'GB', value: 'United Kingdom' }, date: '2025', value: 64210 },
    { indicator: { id: 'NY.GNP.PCAP.PP.CD' }, country: { id: 'GB', value: 'United Kingdom' }, date: '2024', value: null },
  ],
];
const parsedWb = parseWorldBankIndicator(wbPayload, 'NY.GNP.PCAP.PP.CD');
assert.equal(parsedWb.get('US')?.value, 89490);
assert.equal(parsedWb.get('US')?.year, 2025);
assert.equal(parsedWb.get('GB')?.value, 64210);

const wbTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shawq-world-bank-test-'));
try {
  const cachePath = path.join(wbTempDir, 'world-bank.json');
  const calls = [];
  const gdpPayload = [
    { page: 1, pages: 1, per_page: 1000, total: 2 },
    [
      { indicator: { id: 'NY.GDP.PCAP.PP.CD' }, country: { id: 'US', value: 'United States' }, date: '2025', value: 90026.5 },
      { indicator: { id: 'NY.GDP.PCAP.PP.CD' }, country: { id: 'GB', value: 'United Kingdom' }, date: '2025', value: 64606.5 },
    ],
  ];
  const loaded = await loadWorldBankCountryReference({
    countryCodes: ['US', 'GB'],
    cachePath,
    startYear: 2024,
    endYear: 2026,
    fetchImpl: async (url) => {
      calls.push(String(url));
      const payload = String(url).includes('NY.GNP.PCAP.PP.CD') ? wbPayload : gdpPayload;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(payload),
      };
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(loaded.rows.length, 2);
  assert.equal(loaded.rows.find((row) => row.country_code === 'GB')?.purchasing_power_ppp, 64210);
  assert.equal(loaded.rows.find((row) => row.country_code === 'GB')?.gdp_per_capita_ppp, 64606.5);

  const cached = await loadWorldBankCountryReference({
    countryCodes: ['US', 'GB'],
    cachePath,
    fetchImpl: async () => { throw new Error('network should not be used when World Bank cache is fresh'); },
  });
  assert.equal(cached.access, 'durable_cache');
  assert.equal(cached.rows.length, 2);
} finally {
  fs.rmSync(wbTempDir, { recursive: true, force: true });
}

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
  countryReference: [
    {
      country_code: 'US',
      country: 'United States',
      purchasing_power_ppp: 89490,
      purchasing_power_metric: 'GNI per capita, PPP',
      purchasing_power_year: 2025,
      gni_per_capita_ppp: 89490,
      gni_year: 2025,
      gdp_per_capita_ppp: 90026.5,
      gdp_year: 2025,
    },
    {
      country_code: 'GB',
      country: 'United Kingdom',
      purchasing_power_ppp: 64210,
      purchasing_power_metric: 'GNI per capita, PPP',
      purchasing_power_year: 2025,
      gni_per_capita_ppp: 64210,
      gni_year: 2025,
      gdp_per_capita_ppp: 64606.5,
      gdp_year: 2025,
    },
  ],
  countrySource: {
    provider: 'World Bank',
    dataset: 'World Development Indicators',
    access: 'test',
    source_url: 'https://data.worldbank.org/',
  },
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
assert.equal(analysis.country_power.status, 'ready');
assert.equal(analysis.country_power.summary.matched_countries, 2);
assert.equal(analysis.country_power.summary.matched_customers, 6);
const byCountry = new Map(analysis.country_power.rows.map((row) => [row.country_code, row]));
assert.equal(byCountry.get('US')?.customers, 4);
assert.equal(byCountry.get('US')?.lifetime_revenue, 505);
assert.equal(byCountry.get('GB')?.customers, 2);
assert.equal(byCountry.get('GB')?.lifetime_revenue, 190);
assert.equal(Math.round(byCountry.get('US')?.market_power_percentile), 75);
assert.equal(Math.round(byCountry.get('GB')?.market_power_percentile), 25);
assert.equal(Object.hasOwn(byCountry.get('US') || {}, 'customer_spend'), false, 'country cohort payload does not expose customer-level arrays');

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
