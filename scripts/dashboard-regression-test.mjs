import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message);
  }
}

assertIncludes(
  app,
  '<BusinessMetricPanel rows={allBusinessRows}',
  'Business unfold chart must receive allBusinessRows so Week/2W/Month buttons can expand beyond the selected date.'
);

assertIncludes(
  app,
  'Developing today',
  'Business unfold chart must mark the current Istanbul day as a developing/dashed point instead of a misleading solid zero drop.'
);

assertIncludes(
  app,
  'mergeLiveTodayMeta',
  'Frontend must merge live Meta current-day spend into dashboard data between full backfills.'
);

assertIncludes(
  server,
  "url.pathname === '/api/meta/live-spend'",
  'Server must expose /api/meta/live-spend for low-frequency current-day Meta polling.'
);

assertIncludes(
  server,
  'frankfurterRateWithBackoff',
  'Frankfurter conversion must explicitly walk backward to the previous available rate for holidays/missing days.'
);

console.log('dashboard regression checks passed');
