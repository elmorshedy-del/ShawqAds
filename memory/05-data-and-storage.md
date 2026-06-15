# Data and Storage

**Last Updated:** 2026-06-15

---

## Persistence model

ShawQ Ads has **no SQL database**. Data lives in JSON caches (git or Railway volume) and an append-only NDJSON event log.

| Artifact | Path | Source | In git? |
|----------|------|--------|---------|
| Meta adset insights | `public/data/adset-radar.json` | `npm run fetch:meta` | Yes (cached snapshot) |
| Shopify products/orders | `public/data/shopify-products.json` | `npm run fetch:shopify` | Yes |
| Behavior intelligence rollup | `public/data/behavior-intelligence.json` | `npm run fetch:behavior` | Yes |
| Session events (pixel) | `data/session-events.ndjson` | `POST /api/session-events` | **No** — Railway volume |
| Static fallbacks | `public/data/*.json` | Committed defaults for offline dev | Yes |

## Session events

- **Server path:** `SESSION_EVENTS_PATH` env or `data/session-events.ndjson` (see `server.mjs`).
- **API:** `POST /api/session-events`, status at `GET /api/session-events/status`.
- **Pixel:** `shopify/customer-events-pixel.js` posts to production `/api/session-events`.
- **Rollup:** `scripts/fetch-behavior-intelligence.mjs` reads the full NDJSON file to build `behavior-intelligence.json`.

## Backfill date env vars

| Variable | Default / typical | Affects |
|----------|-------------------|---------|
| `BACKFILL_START_DATE` | `2026-06-03` | Meta insights fetch |
| `SHOPIFY_BACKFILL_START_DATE` | `2026-02-01` | Shopify historical orders (Historical tab) |
| `REPORTING_TIMEZONE` | `Europe/Istanbul` | Day boundaries in `App.jsx` and server |

## API data routes

Server serves cached JSON at `/api/data/*.json` (mirrors `public/data/`). See `memory/11-shawq-domain-map.md` for tab-level consumption.

## Config files

- `.env.example` — local env template
- Railway env — production secrets and backfill dates

## Notes

- Never commit live session event files or credentials.
- After deploy, session events persist on the Railway volume attached to the main ShawQ service (separate from agentmemory volume).
