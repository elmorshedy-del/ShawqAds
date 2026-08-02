# ShawQ domain map (read before grepping)

**Last Updated:** 2026-06-15

Use this file to find code by feature. Open the listed paths directly instead of searching the whole repo.

## Dashboard tabs → components

| Tab | Section IDs | Primary files |
|-----|-------------|---------------|
| Overview | ordersMap, kpis, keyFindings, orderDrop, revenue | `src/App.jsx`, `KpiCard.tsx`, `KeyFindings.tsx`, `analyticsInsights.js`, `RevenueChart.tsx`, `OrdersMap.tsx` |
| Ads | tree, emailCampaign, leaders, edits, decision | `CampaignRoasTree.tsx`, `EmailCampaign.tsx`, `App.jsx` |
| Launch | salesBench, product, country | `ProductDemand.tsx`, `CountrySalesPanel.tsx`, `adapt.js` |
| Market | (same as Launch group) | `launchProductData`, `launchDateRange` in `App.jsx` |
| Historical | historicalInsights | `historicalInsights.js`, `HistoricalInsights.tsx` |
| Behavior | behavior, data | `BehaviorAnalytics.tsx`, `dwellStats.js`, `fetch-behavior-intelligence.mjs` |

## Date scopes (do not confuse)

| UI area | Default scope | Toggle |
|---------|---------------|--------|
| Main date picker | User preset (Today, Last week, …) | Sidebar |
| Email campaign | **Since launch** (`2026-06-03`) | `PanelScopeToggle` in `EmailCampaign.tsx` |
| Behavior tab | **Since launch** | `PanelScopeToggle` in `BehaviorAnalytics.tsx` |
| Product demand / country ROAS | Launch window | Country panel: Today / 3D / 7D / 14D / All |
| KPI record badges | Launch window only | — |
| Performance trend chart | Launch window, excludes reporting today | — |
| Historical insights | User scope (All time, Launch, …) | In panel |

## Data & storage (Railway)

| Artifact | Path / API | Notes |
|----------|------------|-------|
| Meta insights cache | `public/data/adset-radar.json` | `fetch:meta`, `BACKFILL_START_DATE=2026-06-03` |
| Shopify products/orders | `public/data/shopify-products.json` | `SHOPIFY_BACKFILL_START_DATE=2026-02-01` |
| Behavior intelligence | `public/data/behavior-intelligence.json` | `fetch:behavior`; page_facts from full `session-events.ndjson` |
| Session events (append-only) | `data/session-events.ndjson` | `POST /api/session-events`; not in git |
| Session replay (append-only) | `data/session-replay.ndjson` | `POST /api/session-replay`; theme script `shopify/theme-session-replay.js` |
| Session replay index | `data/session-replay-index.json` | Built from replay chunks + pixel checkout sessions |
| Reporting timezone | `Europe/Istanbul` | `REPORTING_TIMEZONE` in `App.jsx` |
| Production | https://shawq-ads-production.up.railway.app/ | `/health` |

## Subsystem boundaries (stay in lane)

| Task | Edit these | Do not touch unless asked |
|------|------------|---------------------------|
| Key findings / anomalies | `analyticsInsights.js`, `KeyFindings.tsx`, `metricDefinitions.js` | KPI record logic, behavior rollups |
| Per-tab findings | `tabInsights.js`, `PanelFindings` in `KeyFindings.tsx` | `analyticsInsights.js` (Overview only) |
| Behavior / dwell | `dwellStats.js`, `pagePath.js`, `BehaviorAnalytics.tsx`, `SessionReplayPanel.tsx`, `sessionReplay.js`, `fetch-behavior-intelligence.mjs`, `shopify/theme-session-replay.js` | KPI cards, `RevenueChart`, unrelated `App.jsx` |
| KPI badges | `businessKpiInsights.js`, `KpiCard.tsx`, `kpiRecord*` in `App.jsx` | Behavior rollups |
| Location labels | `orderLocality.js`, `orderResolver.mjs` | KPI, charts |
| Email campaign | `emailCampaignSummary.js`, `EmailCampaign.tsx`, `orderChannel.mjs` | KPI logic |

## Known incidents (mistakes to avoid)

1. **Bundled unrelated App.jsx edits** — behavior/dwell PRs must not change KPI projection, trend filters, or polling.
2. **KPI all-time highs** — intraday requires strict beat (`>`); confetti only on `strictBeat`; records scoped to launch date.
3. **Item count** — use `orderMerchandise.js` / `merchandiseItemCount()`; tips excluded from merchandise count.
4. **UAE/EU locations** — `orderLocality.js`: compound city strings fall back to province; country-as-city falls back to province.
5. **Merge without Gemini review** — always poll `gemini-code-assist` before merge (see `AGENTS.md`).
6. **Unwindowed fallback series** — every series returned by `filterMetaDataByDateRange` must be
   date-filtered. `daily_metrics` was not, so a window with no Meta rows fell through to
   full-history spend and reported it as that window's spend.
7. **Anchoring a single-day view on the range end** — use the last day in the window that has
   rows (`movesAnchorDay`), not `range.until`, or every leader card reads "No sale captured"
   whenever the range ends past the latest data.

## Tests by area

```bash
npm run test:order-merchandise
npm run test:order-locality
npm run test:session-events
npm run test:session-replay
npm run test:dwell-stats
npm run test:kpi-insights
npm run test:insights
npm run test:tab-insights
npm run test:dashboard
npm run build
```
