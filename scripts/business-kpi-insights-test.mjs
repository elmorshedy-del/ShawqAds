import {
  buildMonthProjection,
  detectKpiRecord,
} from '../src/lib/businessKpiInsights.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const paceProjection = buildMonthProjection(
  [{ date: '2026-06-03', revenue_usd: 10, spend_usd: 1, orders: 1, units: 1 }],
  { today: '2026-06-03', elapsedShare: 0.1 },
);
assert(
  paceProjection?.projected?.revenue_usd === 100,
  `Null-baseline pace projection should extrapolate to 100, got ${paceProjection?.projected?.revenue_usd}`,
);

const historyRows = [
  { date: '2026-06-11', revenue_usd: 500, spend_usd: 100, orders: 10, units: 10 },
  { date: '2026-06-12', revenue_usd: 800, spend_usd: 100, orders: 10, units: 10 },
  { date: '2026-06-13', revenue_usd: 1200, spend_usd: 100, orders: 10, units: 10 },
];
const record = detectKpiRecord(historyRows, 'revenue_usd', { today: '2026-06-14' });
assert(record?.kind === 'all-high', 'Yesterday record should remain visible before today row lands');
assert(record?.date === '2026-06-13', `Expected 2026-06-13 record, got ${record?.date}`);

console.log('business KPI insights checks passed');
