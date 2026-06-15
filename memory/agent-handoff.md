# Agent Handoff

**Last Updated:** 2026-06-15

---

## Current State

- **agentmemory on Railway:** live at https://agentmemory-production-dcdc.up.railway.app (`GET /agentmemory/livez`).
- **Cursor MCP:** set `AGENTMEMORY_URL` + `AGENTMEMORY_SECRET` in project MCP env (secret from Railway deploy logs once).
- **Deploy bundle:** `deploy/agentmemory/` — use `deploy/agentmemory/railway.json`, not repo root `railway.json`.

## Recent Events

- 2026-06-15T17:20:59.800Z | cursor | checkpoint: Initialize RavByte AMS memory/ + Railway agentmemory deploy docs; ams-memory rule, npm scripts, AGENTS.md stack update

## Next Steps

1. Add `AGENTMEMORY_URL` and `AGENTMEMORY_SECRET` to Cursor project MCP env (phone/cloud agents).
2. Merge `cursor/agentmemory-railway-deploy-d573` to `main` and point Railway service at `main`.

## Files Mentioned

- `memory/`
- `AGENTS.md`
- `.cursor/rules/ams-memory.mdc`
- `deploy/agentmemory/RAILWAY.md`
## Graph Context for Mentioned Files

- `AGENTS.md` — layer: utils, importedBy: 0, health: 100/100
