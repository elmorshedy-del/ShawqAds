# ShawQ Ads on Railway (main service)

Production: https://shawq-ads-production.up.railway.app/

## Service layout

| Service | Config | Volume mount |
|---------|--------|--------------|
| **shawq-ads** | repo root `railway.json` | `/app/data` (required) |
| **agentmemory** | `deploy/agentmemory/railway.json` | `/data` — see `deploy/agentmemory/RAILWAY.md` |

## Volume (required for cumulative behavior)

Attach a Railway volume to **shawq-ads** mounted at **`/app/data`**.

The app auto-detects `/app/data` and persists:

| File | Env override | Purpose |
|------|--------------|---------|
| `session-events.ndjson` | `SESSION_EVENTS_PATH` | Session pixel append log |
| `behavior-intelligence.json` | `BEHAVIOR_SNAPSHOT_PATH` | Cumulative behavior rollup snapshot |
| `location-cache.json` | `LOCATION_CACHE_PATH` | Geocoder cache |
| `orders-map.json` | `ORDERS_MAP_STORE_PATH` | Webhook order map store |

Without the volume, session dwell/journey history resets on redeploy.

## Required variables (shawq-ads → Variables)

| Variable | Value |
|----------|--------|
| `SHAWQ_META_ACCESS_TOKEN` | Meta API token (**secret**) |
| `SHAWQ_META_AD_ACCOUNT_ID` | `1026963365133388` |
| `SHAWQ_SHOPIFY_ACCESS_TOKEN` | Shopify Admin token (**secret**) |
| `SHAWQ_SHOPIFY_STORE` | `f3e7e9-2.myshopify.com` |
| `SHOPIFY_API_VERSION` | `2025-10` |
| `BACKFILL_START_DATE` | `2026-06-03` |
| `SHOPIFY_BACKFILL_START_DATE` | `2026-02-01` |
| `REFRESH_ON_START` | `true` |

## Recommended variables

| Variable | Value | Why |
|----------|--------|-----|
| `DATA_DIR` | `/app/data` | Explicit volume root (auto-detected if mount exists) |
| `SESSION_EVENTS_PATH` | `/app/data/session-events.ndjson` | Session pixel persistence |
| `BEHAVIOR_SNAPSHOT_PATH` | `/app/data/behavior-intelligence.json` | Cumulative behavior snapshot on volume |
| `LOCATION_CACHE_PATH` | `/app/data/location-cache.json` | Geocoder cache survives redeploy |
| `ORDERS_MAP_STORE_PATH` | `/app/data/orders-map.json` | Live orders map webhook store |
| `SHOPIFY_REPORTING_TIMEZONE` | `Europe/Istanbul` | Align day boundaries with dashboard |
| `META_REPORTING_TIMEZONE` | `Europe/Istanbul` | Meta day alignment |
| `REFRESH_API_KEY` | random secret | Protect `/api/refresh` |
| `SESSION_EVENT_INGEST_KEY` | random secret | Optional pixel ingest auth |
| `SHOPIFY_WEBHOOK_SECRET` | Shopify webhook secret | Live orders map push |

## Verify after deploy

```bash
curl -sS https://shawq-ads-production.up.railway.app/health
curl -sS https://shawq-ads-production.up.railway.app/api/session-events/status
curl -sS https://shawq-ads-production.up.railway.app/api/data/behavior-intelligence.json | \
  python3 -c "import json,sys; b=json.load(sys.stdin); pf=b.get('page_facts') or []; print('page_fact_days', len(set(r['date'] for r in pf)), 'facts_days', len(set(r['date'] for r in b.get('facts') or [])))"
```

`page_fact_days` should grow over time (not stay at 1 after multi-day pixel traffic).

## Redeploy via GraphQL

Project token can trigger deploy when you have the service ID:

```bash
export RAILWAY_TOKEN=<project-token>
export RAILWAY_ENVIRONMENT_ID=34983be2-13d3-444c-9386-fa5123eb45aa
export RAILWAY_SHAWQ_SERVICE_ID=<shawq-ads-service-uuid>
npm run railway:deploy-shawq
```

Find `shawq-ads` service ID in Railway → faithful-compassion → shawq-ads → Settings.

Account tokens are required for `variableUpsert` (setting variables via API).
