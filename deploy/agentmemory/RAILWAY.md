# Deploy agentmemory on Railway (separate service)

ShawQ Ads runs on Railway at https://shawq-ads-production.up.railway.app/. **agentmemory is a second service** in the same project — do not run it inside the main ShawQ container.

## Live service (deployed)

| Item | Value |
|------|--------|
| **URL** | https://agentmemory-production-dcdc.up.railway.app |
| **Health** | `GET /agentmemory/livez` → `{"service":"agentmemory","status":"ok"}` |
| **Railway project** | `faithful-compassion` |
| **Service name** | `agentmemory` |
| **Repo / path** | `elmorshedy-del/ShawqAds` → `deploy/agentmemory/` |
| **Config file** | `deploy/agentmemory/railway.json` (must **not** use repo root `railway.json`) |
| **Volume** | `/data` (required) |
| **PORT** | `3111` (service variable) |

## Critical config (learned from deploy)

1. **`railwayConfigFile`** must be `deploy/agentmemory/railway.json` — the repo root `railway.json` is for `shawq-ads` and will override startCommand/healthcheck if used.
2. **Do not set `rootDirectory`** on the agentmemory service — it breaks Docker COPY paths. Build context is repo root; Dockerfile uses `deploy/agentmemory/entrypoint.sh`.
3. **`PORT=3111`** service variable — agentmemory listens on Railway's `PORT`; healthcheck and public routing must match.

## Capture the HMAC secret (one time)

After first successful boot, read deploy logs:

```bash
railway logs --service agentmemory | grep AGENTMEMORY_SECRET=
```

The secret is persisted in the volume at `/data/.hmac` and is **not** printed again on later boots.

## Wire Cursor / Cloud Agents

In Cursor **Project MCP settings**:

| Variable | Value |
|----------|--------|
| `AGENTMEMORY_URL` | `https://agentmemory-production-dcdc.up.railway.app` |
| `AGENTMEMORY_SECRET` | (from deploy logs, once) |

`.cursor/mcp.json` uses `${env:AGENTMEMORY_URL}` and `${env:AGENTMEMORY_SECRET}`.

## Verify

```bash
curl https://agentmemory-production-dcdc.up.railway.app/agentmemory/livez
```

## Redeploy via GraphQL (project token)

```bash
export RAILWAY_TOKEN=<project-token>
# serviceId agentmemory: d5ad39b3-2ee4-40ea-aa02-d79cc486b8db
# environmentId production: 34983be2-13d3-444c-9386-fa5123eb45aa
curl -sS -H "Authorization: Bearer $RAILWAY_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"mutation { serviceInstanceDeployV2(environmentId: \"34983be2-13d3-444c-9386-fa5123eb45aa\", serviceId: \"d5ad39b3-2ee4-40ea-aa02-d79cc486b8db\") }"}' \
  https://backboard.railway.com/graphql/v2
```

## Backup

```bash
railway ssh --service agentmemory -- "tar czf - /data" > agentmemory-backup.tar.gz
```
