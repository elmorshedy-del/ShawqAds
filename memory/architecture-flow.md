# Architecture Flow

**Last Updated:** 2026-06-15
**Graph Commit:** 279e713
**Health:** F (21/100)
**Files:** 120 | **Edges:** 68 | **Functions:** 860

---

## Architectural Layers

| Layer | Summary |
|---|---|
| `utils` | 93 files | `.gitignore`, `AGENTS.md` +91 more |
| `config` | 2 files | `package.json`, `tsconfig.json` |
| `ui` | 2 files | `src/components/ui/input.tsx`, `src/components/ui/select.tsx` |
| `components` | 23 files | `src/components/dashboard/AdSetDecisionTable.tsx`, `src/components/dashboard/BehaviorAnalytics.tsx` +21 more |

## Critical Paths

_No multi-hop paths detected._

## High-Coupling Files

Files with the most dependents — changes here have the widest blast radius.

| File | Dependents | Risk |
|---|---|---|
| `src/lib/productMapping.js` | 6 | High |
| `src/lib/dwellStats.js` | 4 | Medium |
| `src/lib/orderChannel.mjs` | 4 | Medium |
| `src/lib/pagePath.js` | 4 | Medium |
| `src/lib/statsTests.js` | 4 | Medium |
| `src/lib/orderLocality.js` | 3 | Medium |
| `src/lib/orderMerchandise.js` | 3 | Medium |
| `src/lib/businessKpiInsights.js` | 2 | Medium |

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
- `memory/README.md`
- `memory/context-index.json`
- `scripts/business-kpi-insights-test.mjs`
- `scripts/dashboard-regression-test.mjs`
- `scripts/dwell-stats-test.mjs`
- `scripts/email-channel-smoke-test.mjs`
- `scripts/export-tiktok-us-purchasers.mjs`
- `scripts/fetch-behavior-intelligence.mjs`
- `scripts/fetch-meta-insights.mjs`
- `scripts/fetch-shopify-products.mjs`
- `scripts/historical-insights-test.mjs`
- `scripts/inspect-live-order.mjs`
- `scripts/location-label-test.mjs`
- `scripts/order-locality-test.mjs`
- `scripts/order-merchandise-test.mjs`
- `scripts/page-path-test.mjs`
- `scripts/session-events-smoke-test.mjs`
- `scripts/stats-tests.mjs`
- `shopify/customer-events-pixel.js`
- `src/main.jsx`
- `.cursor/skills/agentmemory-agents/REFERENCE.md`
- `.cursor/skills/agentmemory-agents/SKILL.md`
- `.cursor/skills/agentmemory-architecture/SKILL.md`
- `src/lib/kpiConfetti.js`
- `src/lib/utils.ts`
- `.cursor/skills/agentmemory-config/REFERENCE.md`
- `.cursor/skills/agentmemory-config/SKILL.md`
- `.cursor/skills/agentmemory-hooks/REFERENCE.md`
- `.cursor/skills/agentmemory-hooks/SKILL.md`
- `.cursor/skills/agentmemory-mcp-tools/REFERENCE.md`
- `.cursor/skills/agentmemory-mcp-tools/SKILL.md`
- `.cursor/skills/agentmemory-rest-api/REFERENCE.md`
- `.cursor/skills/agentmemory-rest-api/SKILL.md`
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
- `src/components/ui/input.tsx`
- `src/components/ui/select.tsx`
- `src/components/dashboard/LiveMonitor.tsx`
- `src/components/dashboard/PanelScopeToggle.tsx`

## Circular Dependencies

None detected. ✅

## Layer Violations

- `src/App.jsx` (utils) → `src/components/dashboard/Sidebar.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/OrdersMap.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/KpiCard.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/RevenueChart.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/SalesLeaders.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/Benchmarks.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/CampaignRoasTree.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/LeadershipTables.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/UsaComparison.tsx` (components)
- `src/App.jsx` (utils) → `src/components/dashboard/DailyDelivery.tsx` (components)

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

- `server.mjs` line 1486: **debug-statement** (low)
- `skills-lock.json` line 8: **hardcoded-secret** (medium)
- `skills-lock.json` line 14: **hardcoded-secret** (medium)
- `skills-lock.json` line 20: **hardcoded-secret** (medium)
- `skills-lock.json` line 26: **hardcoded-secret** (medium)
- `skills-lock.json` line 32: **hardcoded-secret** (medium)
- `skills-lock.json` line 38: **hardcoded-secret** (medium)
- `skills-lock.json` line 44: **hardcoded-secret** (medium)
- `skills-lock.json` line 50: **hardcoded-secret** (medium)
- `skills-lock.json` line 56: **hardcoded-secret** (medium)

## Agent Navigation Hints

- To understand the overall structure → start at the entry points listed above
- To find what breaks when changing a file → run `agent-memory graph blast-radius --file <path>`
- To understand a file's role → run `agent-memory graph query --file <path>`
- To see all files in a layer → run `agent-memory graph query --layer <layer>`
- Full graph data → `memory/repository-graph.json`
