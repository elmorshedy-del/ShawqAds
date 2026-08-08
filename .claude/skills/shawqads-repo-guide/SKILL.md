---
name: shawqads-repo-guide
description: Onboarding map and debugging playbook for the ShawqAds repo ("ShawQ Business Monitoring", a React+Vite operator dashboard at elmorshedy-del/shawqads). Load this whenever you're about to work in this specific repository — bug fixes, new panels/features, "what does X do / where is X" questions, crash or performance investigations, or anything touching src/App.jsx, server.mjs, or the dashboard panels — even if the user doesn't say "skill" or name a file. Saves re-discovering the architecture, file map, and known-issue history from scratch every session. Not relevant to other repos.
---

# ShawQ Business Monitoring — repo guide

This is the onboarding doc a senior engineer on this specific codebase would hand a new
teammate. It exists so you don't have to re-read `src/App.jsx` (2500 lines) and grep blind
through 25+ panel components every time someone reports a bug. Skim the section you need;
don't read this whole file if you already know where you're going.

**Keep this file current.** When you land a non-obvious fix or learn something that would
have saved you time, add it to "Known issue history" below (append, don't delete — it's a
timeline) or fix a stale fact elsewhere in this doc. The next session's speed depends on
what you leave behind. This is the architecture/debugging counterpart to `AGENTS.md`, which
owns process (PR workflow, review gates) — see the last section for the split.

## Orient yourself

**What it is:** an internal ops dashboard for the ShawQ Shopify store, blending Meta ads
spend, Shopify orders, and first-party session/behavior analytics into one page. Not a
customer-facing storefront — "the front page" means this dashboard's own landing view.

**Tab structure** — one React tree, four tabs, each a different slice of the same computed
data (`dashboardGroups` in `App.jsx`, ~line 2351):
- **Overview** (`key: 'overview'`, the default/"front page") — live orders map, KPI strip,
  order drop/lift rankings, revenue trend, top movers, key findings.
- **Media** — spend pacing, ad set decisions, campaign ROAS tree, delivery, benchmarks.
- **Conversion** — funnel, behavior analytics.
- **Demand** — product/country/growth breakdowns, sales leaders, email, historical, customer clock.

**The three-tier data fallback** every fetch in `App.jsx` follows
(`fetchJsonWithFallback`): try `/api/data/<name>.json` (server-computed, live) → fall back to
`/data/<name>.json` (a static snapshot checked into `public/data/`, ~3-5MB each) → fall back
to an in-code `fallbackData()`/`fallbackShopify()`/`fallbackBehavior()` generator (small
synthetic sample data). This means the dashboard always renders *something*, even with no
backend configured — useful for local dev, but it also means "did the bug reproduce with
real data or the synthetic fallback" is always worth checking early.

**Constants worth knowing:** reporting timezone is `Europe/Istanbul` everywhere (dates,
"today", polling). `CAMPAIGN_LAUNCH_DATE = '2026-06-03'` anchors the "since launch" scope
used across KPI records and trend charts — a lot of "why does this number look wrong"
reports trace back to a panel using full history instead of the launch window, or vice versa.

**Running it locally:**
- `npm install` (no `node_modules` checked in).
- `npm run dev` → Vite only on :5177, frontend alone, no live `/api/*` (those 404, so
  everything falls to the static-JSON or in-code tier above). Fastest loop for UI work.
- `npm run build && npm start` → full stack on :3000 (`node server.mjs` serves `dist/` +
  real `/api/*` routes, including Shopify/Meta polling endpoints). Use this when the bug
  might involve the server, live polling, or anything env-var-gated. Without Shopify/Meta
  credentials set, those endpoints correctly report `configured:false` rather than erroring.

## File map

| Area | File(s) | Notes |
|---|---|---|
| Entry point | `src/main.jsx` | Mounts `<App/>` inside `<AppErrorBoundary>`. |
| The dashboard | `src/App.jsx` (~2500 lines) | Fallback/demo data generators, **every** data-fetch `useEffect`/poll (`SALE_POLL_MS=30000`, `META_POLL_MS=120000`, `BEHAVIOR_POLL_MS=60000`, all `window.setInterval` with cleanup), pure data-transform helpers (`aggregateMetaRows`, `filterShopifyByDateRange`, `loadedDateRange`, `mergeLiveTodayMeta`, …), then `sectionEls` (~line 2194, one JSX element per panel) and `dashboardGroups` (~line 2351, partitions panel ids into the four tabs). |
| Panels | `src/components/dashboard/*.tsx` | One component per card: `OrdersMap.tsx` (live world-map hero on Overview), `Sidebar`, `KpiCard`, `RevenueChart`, `SalesLeaders`, `Benchmarks`, `CampaignRoasTree`, `UsaComparison`, `DailyDelivery`, `DevelopingGrowth`, `AdSetDecisionTable`, `ProductDemand`, `CountrySalesPanel`, `TopMovers`, `EmailCampaign`, `BehaviorAnalytics` (has its **own** independent 30s poll of `/api/session-events/status`, separate from `App.jsx`'s 60s `behaviorRaw` poll — easy to forget there are two), `DataTable`, `OrderDropRankings`, `HistoricalInsights`, `FunnelAnalytics`, `CampaignPacing`, `CustomerClock`, `KeyFindings`, `DashboardScopeBar`, `CheckoutTheater`, `ErrorBoundary.jsx`. |
| Pure logic | `src/lib/*.{js,mjs}` | One concern per file: `format.js`, `campaignAttribution.js`, `businessKpiInsights.js`, `metricDefinitions.js`, `analyticsInsights.js`, `tabInsights.js`, `customerClock.js`, `campaignPacing.js`, `historicalInsights.js`, `funnelAnalytics.js`, `revenueScope.js`, `pagePath.js`, `dwellStats.js`, `reportingBounds.js`, `dashboardScope.js`, `orderLocations.mjs` (city/region/country coordinate tables), `orderResolver.mjs` (server-only Shopify order → sanitized `Purchase`), `kpiConfetti.js` (canvas confetti, bounded to 600 particles, self-stopping rAF loop), `sessionRecorderInstall.js`, `adapt.js`, `utils.js`. |
| Server | `server.mjs` | Plain Node `http`, no framework. Serves `dist/` + `/api/data/*.json`, `/api/shopify/latest-sale`, `/api/meta/live-spend`, `/api/shopify/orders-map`, the Shopify `orders/create` webhook (HMAC-verified), `/api/session-events*`, historical backfill. Env vars for Shopify/Meta credentials are listed in `AI_HANDOFF_LIVE_ORDERS_MAP.md`. |
| Live orders map deep-dive | `AI_HANDOFF_LIVE_ORDERS_MAP.md` (repo root) | Data model, endpoints, geocoding, exact env vars to flip it from demo to live data. Read this before touching `OrdersMap.tsx` or order geocoding. |
| Process rules | `AGENTS.md` (repo root) | See "Process vs. architecture" below — this is the *other* force-loaded doc, and it owns different territory. |
| Older memory system | `memory/*.md`, `agent-worklog.jsonl` | A separate, auto-generated "Agent Memory System" (`npm run memory:maintain`/`memory:graph`/`memory:worklog`, the `@ravbyte/agent-memory-system` devDependency). Worth checking for domain notes, but this skill and `AGENTS.md` are the primary, human-curated sources — the auto-generated memory files skew generic/inferred. |
| Cursor-specific equivalents | `.cursor/rules/*.mdc`, `.cursor/skills/` | Rules mirror parts of `AGENTS.md` for Cursor Cloud Agents specifically; skills are mostly thin wrappers around the agent-memory-system CLI. Not Claude Code's mechanism — informational only. |
| Tests | `package.json` `test:*` scripts | ~35 scripts, mostly `node scripts/<name>-test.mjs` (plain assertion scripts, no framework) plus two real Vitest suites: `test:render` (`src/App.render.test.jsx`) and `test:error-boundary` (`src/components/ErrorBoundary.test.jsx`). **There is no single `npm test` aggregator** — see the playbook below for how to run everything. |

## Debugging playbook

**Reproducing "it broke in the browser" bugs.** This repo has no project Playwright
dependency, but the sandbox has Chromium pre-installed and a global Playwright driver. Don't
run `playwright install`. Import it directly instead of via a project `node_modules`:

```js
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch(); // finds /opt/pw-browsers automatically
const page = await browser.newPage();
page.on('console', (msg) => console.log(`[console.${msg.type()}]`, msg.text()));
page.on('pageerror', (err) => console.log('[pageerror]', err.message));
page.on('crash', () => console.log('[CRASH] renderer crashed'));
await page.goto('http://127.0.0.1:3000/'); // or :5177 for vite-only dev
```

For anything described as a "crash", "freeze", "white screen", or "hang" — not just a wrong
number — poll `performance.memory` (`usedJSHeapSize`/`totalJSHeapSize`/`jsHeapSizeLimit`)
every few seconds for at least 60-90s alongside the console/pageerror/crash listeners above.
A one-shot screenshot won't catch a problem that only shows up after sustained polling.

**A subtlety specific to this codebase: "blank/white page" and "shows an error card" are
different failure classes, and which one you get tells you where to look.** `main.jsx` wraps
`<App/>` in `AppErrorBoundary` (`src/components/ErrorBoundary.jsx`), and every rendered
section in `App.jsx` is individually wrapped too (`<ErrorBoundary key={id}
label={SECTION_LABELS[id]}>{sectionEls[id]}</ErrorBoundary>`). React error boundaries catch
**synchronous throws during render** and replace just that subtree with a labeled fallback
card — so a caught render exception now shows *a card naming the panel and the error
message*, never a silent blank page. If you're chasing a report of a genuinely blank/white
page (not a card), the cause is very likely something React's error boundaries cannot catch
by design: an error thrown inside a `.then()`/`async` callback, a `setInterval`/`setTimeout`
callback, or a native DOM event handler (all asynchronous, outside the render phase) — or a
real browser renderer crash from excessive memory or a long synchronous computation blocking
the main thread. Don't spend time assuming it's an uncaught render exception; that class of
bug is already handled here. Go looking for polling loops, unbounded state growth, and
expensive synchronous work over the large `public/data/*.json` snapshots instead.

**Running the test suite** (no single aggregator command):

```bash
npx vitest run                                   # the 2 real Vitest suites
for f in scripts/*-test.mjs; do node "$f" || echo "FAIL: $f"; done   # ~35 plain-assertion scripts
```

**Working offline / without credentials:** the `public/data/*.json` static snapshots
(`adset-radar.json` ~3.1MB, `behavior-intelligence.json` ~5.3MB, `shopify-products.json`
~485KB) are real-shaped production data checked into the repo specifically so the dashboard
has something substantial to render without any backend configured — useful both for UI work
and for reproducing bugs that only show up with realistically large datasets (the in-code
`fallbackData()`-family generators are much smaller and won't surface size-related issues).

## Known issue history

Append new entries here; don't delete old ones — this is a timeline future sessions read
before touching the same code.

**2026-08-05 — "page blank after open".** Any uncaught React render throw anywhere in the
tree unmounted the entire app: the page painted once, then went fully blank, with the cause
visible only in the devtools console. Fixed in commit `95af21e` ("Contain render failures
instead of blanking the dashboard", merged via `38f19af`) by adding the `ErrorBoundary`/
`AppErrorBoundary` pair described in the playbook above. Tests:
`src/components/ErrorBoundary.test.jsx`.

**2026-08-08 — "front page whites out, like a crash, after seconds of opening" (open at time
of writing).** Reported three days after the fix above, on the same `38f19af` HEAD with no
commits in between. Because `ErrorBoundary` correctly turns a caught render exception into a
fallback *card* rather than a blank page, a genuinely blank/white report points away from
that class of bug — see the playbook subtlety above. Investigation so far: Playwright +
headless Chromium against both `npm run dev` and the full `npm run build && node server.mjs`
stack, watched 25-90s with `performance.memory` sampled every 3s, did **not** reproduce a
crash or memory growth (flat 16-37MB against a 3.7GB heap limit) — the sandbox's generous
heap and lack of mobile/GPU memory pressure plausibly just doesn't match whatever device the
report came from. All test scripts pass except one pre-existing, unrelated cosmetic
assertion in `page-path-test.mjs` (expects a `"p="` pattern in a copy string — not a crash).
Hypotheses raised but **not yet confirmed** — treat as a starting point, not a diagnosis:
(1) `App.jsx` computes derived data via `useMemo` for all four tabs' panels on every render
regardless of which tab is active (hooks can't be conditional), multiplying the cost of
processing the large `public/data/*.json` snapshots even though only Overview's ~7 panels
actually mount; (2) `BehaviorAnalytics.tsx` runs its own independent 30s poll in addition to
`App.jsx`'s separate 60s poll touching the same ~5MB behavior dataset; (3) not yet fully
audited for O(n²) loops over the large behavior dataset: `dwellStats.js`, `pagePath.js`,
`funnelAnalytics.js`, `customerClock.js`. *(Next agent: update this entry with the actual
root cause and fix once found, rather than leaving the hypothesis list as the final word.)*

## Process vs. architecture — don't duplicate `AGENTS.md`

`AGENTS.md` (repo root) is the other file that's force-loaded on every task, and it owns a
different layer: PR workflow (branch naming, draft PRs against `main`, the mandatory
Gemini-review wait before merging), a "Scope discipline" section with real incident
postmortems (a KPI all-time-high tie bug, an unwindowed-fallback-series bug) worth reading
before touching `businessKpiInsights.js` or `filterMetaDataByDateRange`, and a subsystem
"stay in your lane" table. Read it for *how to ship a change here*; this skill is for
*understanding what the code does and how to debug it*. If you learn a process lesson, it
belongs in `AGENTS.md`'s Scope discipline section, not here.
