import fs from 'node:fs';
import { productTaxonomyForName } from '../src/lib/productMapping.js';

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
  'elapsedReportingDayShare',
  'Business card deltas for a developing day must compare against the same elapsed reporting-day share of the previous day.'
);

assertIncludes(
  app,
  'vs same time previous day',
  'Business card delta labels must say same time previous day for the developing day comparison.'
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

assertIncludes(
  server,
  'total_tip_received,current_total_tip_received',
  'Live Shopify order polling must request tip fields so today overlays do not hide tips inside product revenue.'
);

assertIncludes(
  server,
  'merchandiseRevenue',
  'Live Shopify order summaries must allocate only merchandise revenue across product lines.'
);

assertIncludes(
  server,
  'tips: tipSummary',
  'Live Shopify today summary must return tips separately from merchandise order lines.'
);

assertIncludes(
  app,
  "CAMPAIGN_LAUNCH_DATE = '2026-06-03'",
  'Launch analysis sections must use a fixed June 3 campaign-launch floor, not the currently selected date window.'
);

assertIncludes(
  app,
  'launchProductData',
  'Product demand after launch must be backed by a launch-window Shopify dataset, not the selected daily productData.'
);

assertIncludes(
  app,
  "useState('launch')",
  'Email and behavior panels must default to launch scope, not the dashboard date picker.'
);

assertIncludes(
  app,
  'emailPanelScope === \'launch\' ? launchDateRange : activeDateRange',
  'Email campaign must use launch window by default with an option to follow the dashboard range.'
);

assertIncludes(
  app,
  'behaviorPanelScope === \'launch\' ? launchDateRange : activeDateRange',
  'Behavior panel must use launch window by default with an option to follow the dashboard range.'
);

assertIncludes(
  app,
  'behaviorCoverageMeta',
  'Behavior filtering must detect developing-day cache lag instead of showing misleading 0% abandon rates.'
);

assertIncludes(
  app,
  'behaviorPanelRangeLabel',
  'Behavior range label must disclose when cached aggregates trail the Istanbul reporting day.'
);

assertIncludes(
  fs.readFileSync(new URL('../src/components/dashboard/BehaviorAnalytics.tsx', import.meta.url), 'utf8'),
  'BehaviorDevelopingBanner',
  'Behavior tab must explain the developing-day empty state at Istanbul day rollover.'
);

assertIncludes(
  app,
  'onScopeChange={setEmailPanelScope}',
  'Email campaign panel must expose a scope toggle.'
);

assertIncludes(
  app,
  'onScopeChange={setBehaviorPanelScope}',
  'Behavior panel must expose a scope toggle.'
);

assertIncludes(
  app,
  'productGrowthOption(launchProductData)',
  'Developing growth chart must use Shopify product data from campaign launch onward.'
);

assertIncludes(
  app,
  'trendOption(deliveryTrendRows, march, launchSelectedChanges, launchProductData.daily || [])',
  'Daily delivery shape must use the fixed launch window and launch-window Shopify sales series.'
);

assertIncludes(
  app,
  'isTipLine',
  'Tips must be detected and excluded from merchandise product demand.'
);

assertIncludes(
  app,
  'TipSummary',
  'Tips should be shown as a small separate summary instead of product inventory.'
);

assertIncludes(
  app,
  'todaySummary.tips',
  'Frontend must merge live Shopify today tips into the launch-window product demand summary.'
);

const tipsTaxonomy = productTaxonomyForName('Tips');
if (tipsTaxonomy.family !== null) {
  throw new Error('Shopify Tips must be classified as non-merchandise before product demand aggregation.');
}

assertIncludes(
  app,
  "projection={kpiProjection('revenue_usd')}",
  'KPI cards must show month projection transferred from production-2289.'
);

assertIncludes(
  app,
  "record={kpiRecord('revenue_usd')}",
  'KPI cards must show record badges transferred from production-2289.'
);

assertIncludes(
  fs.readFileSync(new URL('../src/lib/businessKpiInsights.js', import.meta.url), 'utf8'),
  'buildMonthProjection',
  'Month projection logic must live in businessKpiInsights.js from production-2289.'
);

assertIncludes(
  fs.readFileSync(new URL('../scripts/fetch-shopify-products.mjs', import.meta.url), 'utf8'),
  'SHOPIFY_BACKFILL_START_DATE',
  'Shopify fetch must use SHOPIFY_BACKFILL_START_DATE so Meta BACKFILL_START_DATE does not block historical insights.'
);

assertIncludes(
  fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8'),
  'scheduleShopifyHistoricalBackfill',
  'Server must schedule Shopify historical backfill without blocking data responses.'
);

assertIncludes(
  fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8'),
  'readShopifyPeriodSince',
  'Server must read Shopify period.since without parsing the full cache file on every request.'
);

console.log('dashboard regression checks passed');
