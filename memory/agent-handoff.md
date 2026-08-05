# Agent Handoff

**Last Updated:** 2026-08-05

---

## Current State

- Last agent: cursor
- Last event: checkpoint
- Last message: Restored the Overview data-first hierarchy with live orders and KPIs before narrative findings

## Recent Events

- 2026-08-05T01:53:17.759Z | cursor | checkpoint: Restored the Overview data-first hierarchy with live orders and KPIs before narrative findings
- 2026-08-05T00:15:16.712Z | cursor | checkpoint: Overhauled dashboard into four decision areas; unified matched source/date scopes; replaced monthly spend model with Meta campaign pacing; added mounted tab tests; simplified behavior into plain-language actions without replacing accumulated snapshots
- 2026-06-26T06:53:01.719Z | cursor | checkpoint: Added Clarity-style checkout session replay: theme rrweb recorder, /api/session-replay ingest+index APIs, SessionReplayPanel in Behavior tab.
- 2026-06-15T17:20:59.800Z | cursor | checkpoint: Initialize RavByte AMS memory/ + Railway agentmemory deploy docs; ams-memory rule, npm scripts, AGENTS.md stack update

## Next Steps

- [INCOMPLETE] Add next steps during checkpoints or handoffs.

## Files Mentioned

- `src/App.jsx`
- `memory/11-shawq-domain-map.md`
- `src/lib/dashboardScope.js`
- `src/lib/campaignPacing.js`
- `src/components/dashboard/CampaignPacing.tsx`
- `src/lib/behaviorActions.js`
- `src/components/dashboard/BehaviorAnalytics.tsx`
- `scripts/fetch-meta-insights.mjs`
- `server.mjs`
- `memory/`
- `src/lib/sessionReplay.js`
- `src/components/dashboard/SessionReplayPanel.tsx`
- `shopify/theme-session-replay.js`
- `scripts/session-replay-smoke-test.mjs`
- `AGENTS.md`
- `.cursor/rules/ams-memory.mdc`
- `deploy/agentmemory/RAILWAY.md`
## Graph Context for Mentioned Files

- `src/App.jsx` — layer: utils, importedBy: 1, health: 50/100
- `memory/11-shawq-domain-map.md` — layer: utils, importedBy: 0, health: 100/100
- `src/lib/dashboardScope.js` — layer: utils, importedBy: 2, health: 80/100
- `src/lib/campaignPacing.js` — layer: utils, importedBy: 2, health: 65/100
- `src/components/dashboard/CampaignPacing.tsx` — layer: components, importedBy: 1, health: 85/100
- `src/lib/behaviorActions.js` — layer: utils, importedBy: 1, health: 80/100
- `src/components/dashboard/BehaviorAnalytics.tsx` — layer: components, importedBy: 1, health: 50/100
- `scripts/fetch-meta-insights.mjs` — layer: utils, importedBy: 0, health: 44/100
- `server.mjs` — layer: utils, importedBy: 1, health: 44/100
- `src/lib/sessionReplay.js` — layer: utils, importedBy: 2, health: 57/100
- `src/components/dashboard/SessionReplayPanel.tsx` — layer: components, importedBy: 0, health: 57/100
- `shopify/theme-session-replay.js` — layer: utils, importedBy: 0, health: 85/100
- `scripts/session-replay-smoke-test.mjs` — layer: utils, importedBy: 0, health: 63/100
- `AGENTS.md` — layer: utils, importedBy: 0, health: 100/100
- `deploy/agentmemory/RAILWAY.md` — layer: utils, importedBy: 0, health: 100/100
