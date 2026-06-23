import fs from 'node:fs';

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const metaFetch = fs.readFileSync(new URL('../scripts/fetch-meta-insights.mjs', import.meta.url), 'utf8');

assertIncludes(
  server,
  'dataCacheNeedsRefresh',
  'Server must refresh stale Meta/Shopify JSON before serving date-sensitive dashboard data.',
);

assertIncludes(
  server,
  'metaCacheNeedsRefresh',
  'Server must detect stale Meta cache windows so Yesterday is not served from old data.',
);

assertIncludes(
  server,
  'runMetaFetch',
  'Server must de-duplicate stale Meta refreshes so concurrent dashboard requests cannot race the cache.',
);

assertIncludes(
  server,
  'dataRefreshCooldownMs',
  'Server must throttle failed stale-cache refresh retries to avoid fetch storms.',
);

assertIncludes(
  server,
  'lastMetaFetchAttemptAt = Date.now()',
  'Meta stale-cache refresh attempts must record a cooldown timestamp.',
);

assertIncludes(
  server,
  'lastShopifyFetchAttemptAt = Date.now()',
  'Shopify stale-cache refresh attempts must record a cooldown timestamp.',
);

assertIncludes(
  server,
  'shopifyCacheNeedsRefresh',
  'Server must detect stale Shopify cache windows so ROAS uses current overlapping data.',
);

assertIncludes(
  metaFetch,
  'ad_daily',
  'Meta fetch must persist no-breakdown ad daily rows so the campaign tree can match Ad Manager.',
);

assertIncludes(
  app,
  'const metricAdRows = adDailyRows.length ? adDailyRows : adRows',
  'Frontend Meta range filtering must prefer no-breakdown ad rows and fall back to country rows.',
);

assertIncludes(
  app,
  'const countryRoasDateRange',
  'Country ROAS must use an explicit overlapping Meta+Shopify range.',
);

assertIncludes(
  app,
  'function yesterdayPresetDay',
  'Yesterday preset must not select an unloaded calendar day when the data cache is behind.',
);

assertIncludes(
  app,
  'Yesterday (latest loaded)',
  'Dashboard label must disclose when Yesterday falls back to the latest loaded completed day.',
);

console.log('reporting data contract checks passed');
