# Architecture Flow

**Last Updated:** 2026-08-05
**Graph Commit:** 1b4031f
**Health:** F (9/100)
**Files:** 173 | **Edges:** 110 | **Functions:** 1229

---

## Architectural Layers

| Layer | Summary |
|---|---|
| `utils` | 139 files | `.gitignore`, `AGENTS.md` +137 more |
| `config` | 2 files | `package.json`, `tsconfig.json` |
| `components` | 30 files | `src/components/dashboard/AdSetDecisionTable.tsx`, `src/components/dashboard/BehaviorAnalytics.tsx` +28 more |
| `ui` | 2 files | `src/components/ui/input.tsx`, `src/components/ui/select.tsx` |

## Critical Paths

_No multi-hop paths detected._

## High-Coupling Files

Files with the most dependents — changes here have the widest blast radius.

| File | Dependents | Risk |
|---|---|---|
| `src/lib/pagePath.js` | 8 | High |
| `src/lib/productMapping.js` | 6 | High |
| `src/lib/dwellStats.js` | 4 | Medium |
| `src/lib/orderChannel.mjs` | 4 | Medium |
| `src/lib/statsTests.js` | 4 | Medium |
| `src/lib/orderLocality.js` | 3 | Medium |
| `src/lib/orderMerchandise.js` | 3 | Medium |
| `src/lib/reportingBounds.js` | 3 | Medium |

## Entry Points

Public surface — files that no other file imports:

- `.gitignore`
- `AGENTS.md`
- `AI_HANDOFF_LIVE_ORDERS_MAP.md`
- `README.md`
- `package-lock.json`
- `railway.json`
- `render.yaml`
- `skills-lock.json`
- `vite.config.js`
- `.cursor/mcp.json`
- `scripts/analytics-insights-test.mjs`
- `scripts/behavior-actions-test.mjs`
- `scripts/behavior-developing-day-test.mjs`
- `scripts/behavior-persistence-test.mjs`
- `scripts/behavior-tiers-test.mjs`
- `scripts/business-kpi-insights-test.mjs`
- `scripts/campaign-attribution-test.mjs`
- `scripts/campaign-pacing-test.mjs`
- `scripts/checkout-theater-test.mjs`
- `scripts/customer-clock-test.mjs`
- `scripts/dashboard-regression-test.mjs`
- `scripts/dashboard-scope-test.mjs`
- `scripts/dwell-stats-test.mjs`
- `scripts/email-channel-smoke-test.mjs`
- `scripts/export-tiktok-us-purchasers.mjs`
- `scripts/fetch-behavior-intelligence.mjs`
- `scripts/fetch-meta-insights.mjs`
- `scripts/fetch-shopify-products.mjs`
- `scripts/funnel-analytics-test.mjs`
- `scripts/historical-insights-test.mjs`
- `scripts/inspect-live-order.mjs`
- `scripts/install-shopify-session-recorder.mjs`
- `scripts/location-label-test.mjs`
- `scripts/order-drop-rankings-test.mjs`
- `scripts/order-locality-test.mjs`
- `scripts/order-merchandise-test.mjs`
- `scripts/page-path-test.mjs`
- `scripts/reporting-data-contract-test.mjs`
- `scripts/revenue-scope-test.mjs`
- `scripts/session-events-smoke-test.mjs`
- `scripts/session-replay-index-test.mjs`
- `scripts/session-replay-smoke-test.mjs`
- `scripts/stats-tests.mjs`
- `scripts/tab-insights-test.mjs`
- `memory/00-project-overview.md`
- `memory/01-repository-map.md`
- `memory/02-system-architecture.md`
- `memory/03-development-workflow.md`
- `memory/04-api-and-interfaces.md`
- `memory/05-data-and-storage.md`
- `memory/06-security-and-config.md`
- `memory/07-testing-and-quality.md`
- `memory/08-known-issues-and-tech-debt.md`
- `memory/09-agent-guidelines.md`
- `memory/10-agent-worklog.md`
- `memory/11-shawq-domain-map.md`
- `memory/12-checkout-replay-research.md`
- `memory/README.md`
- `memory/agent-handoff.md`
- `memory/architecture-flow.md`
- `memory/context-index.json`
- `memory/cross-repo-links.json`
- `shopify/customer-events-pixel.js`
- `shopify/pdp-intelligence-probe.js`
- `shopify/theme-session-replay.js`
- `src/main.jsx`
- `deploy/agentmemory/RAILWAY.md`
- `deploy/agentmemory/entrypoint.sh`
- `deploy/agentmemory/railway.json`
- `extensions/shawq-advanced-dom-pixel/README.md`
- `src/lib/kpiConfetti.js`
- `src/lib/utils.ts`
- `.cursor/skills/agentmemory-agents/REFERENCE.md`
- `.cursor/skills/agentmemory-agents/SKILL.md`
- `.cursor/skills/agentmemory-architecture/SKILL.md`
- `.cursor/skills/agentmemory-config/REFERENCE.md`
- `.cursor/skills/agentmemory-config/SKILL.md`
- `.cursor/skills/agentmemory-rest-api/REFERENCE.md`
- `.cursor/skills/agentmemory-rest-api/SKILL.md`
- `.cursor/skills/agentmemory-hooks/REFERENCE.md`
- `.cursor/skills/agentmemory-hooks/SKILL.md`
- `.cursor/skills/agentmemory-mcp-tools/REFERENCE.md`
- `.cursor/skills/agentmemory-mcp-tools/SKILL.md`
- `.cursor/skills/commit-context/EXAMPLES.md`
- `.cursor/skills/commit-context/SKILL.md`
- `.cursor/skills/commit-history/EXAMPLES.md`
- `.cursor/skills/commit-history/SKILL.md`
- `.cursor/skills/forget/EXAMPLES.md`
- `.cursor/skills/forget/SKILL.md`
- `.cursor/skills/handoff/EXAMPLES.md`
- `.cursor/skills/handoff/SKILL.md`
- `.cursor/skills/karpathy-guidelines/SKILL.md`
- `.cursor/skills/recap/EXAMPLES.md`
- `.cursor/skills/recap/SKILL.md`
- `.cursor/skills/recall/EXAMPLES.md`
- `.cursor/skills/recall/SKILL.md`
- `.cursor/skills/remember/EXAMPLES.md`
- `.cursor/skills/remember/SKILL.md`
- `.cursor/skills/session-history/EXAMPLES.md`
- `.cursor/skills/session-history/SKILL.md`
- `.cursor/skills/write-agentmemory-skill/SKILL.md`
- `src/components/dashboard/CheckoutTheater.tsx`
- `src/components/dashboard/EmptyState.tsx`
- `src/components/dashboard/LiveMonitor.tsx`
- `src/components/dashboard/PanelScopeToggle.tsx`
- `src/components/dashboard/SessionReplayPanel.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/select.tsx`
- `src/features/product-demand/constants.js`

## Circular Dependencies

None detected. ✅

## Layer Violations

- `src/App.jsx` (utils) → `src/components/dashboard/CampaignPacing.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/CustomerClock.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/KeyFindings.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/Sidebar.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/OrdersMap.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/KpiCard.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/RevenueChart.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/SalesLeaders.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/Benchmarks.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/CampaignRoasTree.tsx` (components)

## Potentially Dead Code

- `.gitignore` (layer: utils)
- `AGENTS.md` (layer: utils)
- `AI_HANDOFF_LIVE_ORDERS_MAP.md` (layer: utils)
- `README.md` (layer: utils)
- `package-lock.json` (layer: utils)
- `railway.json` (layer: utils)
- `render.yaml` (layer: utils)
- `skills-lock.json` (layer: utils)
- `vite.config.js` (layer: utils)
- `.cursor/mcp.json` (layer: utils)

## Security Issues

- `server.mjs` line 235: **debug-statement** (low)
- `server.mjs` line 238: **debug-statement** (low)
- `server.mjs` line 1956: **debug-statement** (low)
- `skills-lock.json` line 8: **hardcoded-secret** (medium)
- `skills-lock.json` line 14: **hardcoded-secret** (medium)
- `skills-lock.json` line 20: **hardcoded-secret** (medium)
- `skills-lock.json` line 26: **hardcoded-secret** (medium)
- `skills-lock.json` line 32: **hardcoded-secret** (medium)
- `skills-lock.json` line 38: **hardcoded-secret** (medium)
- `skills-lock.json` line 44: **hardcoded-secret** (medium)

## Agent Navigation Hints

- To understand the overall structure → start at the entry points listed above
- To find what breaks when changing a file → run `agent-memory graph blast-radius --file <path>`
- To understand a file's role → run `agent-memory graph query --file <path>`
- To see all files in a layer → run `agent-memory graph query --layer <layer>`
- Full graph data → `memory/repository-graph.json`
