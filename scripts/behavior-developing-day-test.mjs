import fs from 'node:fs';
import {
  behaviorCachedUntil,
  behaviorCoverageMeta,
  behaviorHasReportingDayData,
  currentReportingDay,
  isDevelopingReportingDayRange,
} from '../src/lib/reportingBounds.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const behavior = JSON.parse(fs.readFileSync(new URL('../public/data/behavior-intelligence.json', import.meta.url), 'utf8'));
const cachedUntil = behaviorCachedUntil(behavior);
assert(cachedUntil, 'behaviorCachedUntil must read cached behavior until date');

const reportingToday = '2099-01-02';
const todayRange = { since: reportingToday, until: reportingToday };
assert(isDevelopingReportingDayRange(todayRange, reportingToday), 'single-day today range must be developing');
assert(!isDevelopingReportingDayRange({ since: '2026-06-03', until: reportingToday }, reportingToday), 'multi-day launch range must not be developing');

const coverage = behaviorCoverageMeta(behavior, todayRange, reportingToday);
assert(coverage.developing_day, 'today-only query with stale cache must flag developing_day');
assert(coverage.cached_until === cachedUntil, 'coverage must expose cached_until');

const launchRange = { since: '2026-06-03', until: reportingToday };
const launchCoverage = behaviorCoverageMeta(behavior, launchRange, reportingToday);
assert(!launchCoverage.developing_day, 'launch window must not be treated as empty developing day');

assert(!behaviorHasReportingDayData(behavior, reportingToday), 'fixture must not contain synthetic future-day rows');

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
assert(app.includes('behaviorCoverageMeta'), 'App must use shared behavior coverage helper');
assert(app.includes('behaviorPanelRangeLabel'), 'App must label behavior range with cache lag honesty');
assert(app.includes('emptyBehaviorGlobal'), 'App must avoid misleading 0% behavior globals on developing day');

const ui = fs.readFileSync(new URL('../src/components/dashboard/BehaviorAnalytics.tsx', import.meta.url), 'utf8');
assert(ui.includes('BehaviorDevelopingBanner'), 'Behavior tab must show developing-day banner');
assert(ui.includes('not 0% abandon'), 'Behavior banner must explain the false-zero regression');

console.log('behavior developing-day checks passed');
