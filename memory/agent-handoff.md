# Agent Handoff

**Last Updated:** 2026-08-05

---

## Current State

- Last agent: cursor
- Last event: checkpoint
- Last message: Prevented customer timing and product growth charts from inferring patterns from undersized windows

## Recent Events

- 2026-08-05T01:57:02.754Z | cursor | checkpoint: Prevented customer timing and product growth charts from inferring patterns from undersized windows
- 2026-08-05T00:15:16.712Z | cursor | checkpoint: Overhauled dashboard into four decision areas; unified matched source/date scopes; replaced monthly spend model with Meta campaign pacing; added mounted tab tests; simplified behavior into plain-language actions without replacing accumulated snapshots
- 2026-06-26T06:53:01.719Z | cursor | checkpoint: Added Clarity-style checkout session replay: theme rrweb recorder, /api/session-replay ingest+index APIs, SessionReplayPanel in Behavior tab.
- 2026-06-15T17:20:59.800Z | cursor | checkpoint: Initialize RavByte AMS memory/ + Railway agentmemory deploy docs; ams-memory rule, npm scripts, AGENTS.md stack update

## Next Steps

- [INCOMPLETE] Add next steps during checkpoints or handoffs.

## Files Mentioned

- `src/components/dashboard/CustomerClock.tsx`
- `src/components/dashboard/DevelopingGrowth.tsx`
- `src/lib/customerClock.js`
- `scripts/customer-clock-test.mjs`
- `src/App.jsx`
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

- `src/components/dashboard/CustomerClock.tsx` — layer: components, importedBy: 1, health: 90/100
- `src/components/dashboard/DevelopingGrowth.tsx` — layer: components, importedBy: 1, health: 100/100
- `src/lib/customerClock.js` — layer: utils, importedBy: 2, health: 80/100
- `scripts/customer-clock-test.mjs` — layer: utils, importedBy: 0, health: 98/100
- `src/App.jsx` — layer: utils, importedBy: 1, health: 50/100
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
