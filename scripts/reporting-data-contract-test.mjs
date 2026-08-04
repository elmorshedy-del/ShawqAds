import fs from 'node:fs';

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const metaFetch = fs.readFileSync(new URL('../scripts/fetch-meta-insights.mjs', import.meta.url), 'utf8');
const topMovers = fs.readFileSync(new URL('../src/components/dashboard/TopMovers.tsx', import.meta.url), 'utf8');

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
  metaFetch,
  "'campaigns'",
  'Meta fetch must load campaign budget owners for campaign-flight pacing.',
);

assertIncludes(
  metaFetch,
  'hourly_stats_aggregated_by_advertiser_time_zone',
  'Meta fetch must persist advertiser-timezone hourly spend for intraday pacing.',
);

assertIncludes(
  server,
  'pacing_hourly',
  'Live Meta polling must refresh hourly pacing data between full backfills.',
);

assertIncludes(
  app,
  'const metricAdRows = adDailyRows.length ? adDailyRows : adRows',
  'Frontend Meta range filtering must prefer no-breakdown ad rows and fall back to country rows.',
);

assertIncludes(
  app,
  'const matchedDateRange',
  'Country ROAS and blended metrics must use the row-backed overlapping Meta+Shopify range.',
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

// The anchor still comes from the selected window (never from loadedBounds), but it now
// resolves to the last day *inside* that window carrying rows. Anchoring on the raw end
// date made every card read "No sale captured" whenever the range ran past the data —
// which the launch preset always does, since it ends on today.
assertIncludes(
  app,
  'const anchor = movesAnchorDay',
  'Top movers must use the active business-card date instead of an independent loaded-data anchor.',
);

assertIncludes(
  app,
  'withData.at(-1) || activeDateRange?.until || reportingToday',
  'Top movers anchor must fall back to the active date range, not to an independent loaded-data bound.',
);

assertIncludes(
  app,
  'function pickTopCountryByUnits',
  'Top movers country winner must be selected by units sold, not revenue or ROAS.',
);

assertIncludes(
  app,
  'function pickTopAdBySales',
  'Top movers ad winner must be selected by Shopify sales count, not ROAS.',
);

assertIncludes(
  app,
  'products tied',
  'Top movers product winner must disclose count ties instead of crowning one product by revenue.',
);

assertIncludes(
  app,
  'Number(b.shopify_revenue_usd || 0)',
  'Top movers ad count ties should break on Shopify revenue before Meta spend.',
);

assertIncludes(
  topMovers,
  'return fmtX(e.roas ?? 0)',
  'Top movers should still surface ROAS for ad and country cards even though ranking is count-based.',
);

console.log('reporting data contract checks passed');
