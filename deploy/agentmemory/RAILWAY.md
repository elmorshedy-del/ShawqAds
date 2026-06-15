# Deploy agentmemory on Railway (separate service)

ShawQ Ads runs on Railway at https://shawq-ads-production.up.railway.app/. **agentmemory is a second service** — do not run it inside the main ShawQ container.

Upstream template: [rohitg00/agentmemory deploy/railway](https://github.com/rohitg00/agentmemory/tree/main/deploy/railway)

## Deploy via Railway CLI (ShawQ project)

The `agentmemory` service in project **faithful-compassion** deploys from this repo:

- **Root directory:** `deploy/agentmemory`
- **Config:** `railway.json`
- **Public URL:** `https://agentmemory-production-dcdc.up.railway.app`

```bash
# From repo root (requires Railway project token)
export RAILWAY_TOKEN=<project-token>
railway link -p <project-id> -e production -s agentmemory
cd deploy/agentmemory && railway up
railway volume add --mount-path /data --service agentmemory
railway redeploy --service agentmemory
railway logs --service agentmemory | grep AGENTMEMORY_SECRET=
```

## One-time setup (dashboard)

1. In [Railway dashboard](https://railway.app), create a **new service** in the same project (or a dedicated project).
2. **Deploy from GitHub** → repository: `rohitg00/agentmemory`
3. Service **Settings → Config-as-Code Path:** `deploy/railway/railway.json`
4. **Volumes** → add volume mounted at `/data` (required — deploy fails without it).
5. Deploy. Wait for healthcheck on `/agentmemory/livez`.

## Capture credentials

From deploy logs (once only):

```bash
railway logs --service agentmemory | grep AGENTMEMORY_SECRET=
```

Save the secret securely.

Verify:

```bash
curl https://<your-agentmemory-service>.up.railway.app/agentmemory/livez
```

## Wire Cursor / Cloud Agents

In Cursor **Project MCP settings** (or user env), set:

| Variable | Value |
|----------|--------|
| `AGENTMEMORY_URL` | `https://<your-agentmemory-service>.up.railway.app` |
| `AGENTMEMORY_SECRET` | (from deploy logs) |

The repo `.cursor/mcp.json` already points at `@agentmemory/mcp`; it inherits these env vars when set.

Cloud Agents on phone cannot use `localhost:3111` — they **must** use the Railway URL above.

## Connect ShawQ repo to memory

After the server is live, agents should:

1. Read `memory/` (repo map, domain map, handoff) — always in git.
2. Use agentmemory MCP `memory_smart_search` / `recall` for past sessions and mistakes.

Optional: run locally against Railway:

```bash
export AGENTMEMORY_URL=https://<service>.up.railway.app
export AGENTMEMORY_SECRET=<secret>
npx @agentmemory/mcp
```

## Cost

Railway Hobby ~$5/mo flat; agentmemory + 1GB volume typically stays near that floor. See upstream README for current rates.

## Backup

```bash
railway ssh --service agentmemory -- "tar czf - /data" > agentmemory-backup.tar.gz
```
