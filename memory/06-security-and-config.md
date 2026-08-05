# Security and Config

**Last Updated:** 2026-08-05

---

## Environment Variable Names

- `BACKFILL_START_DATE`
- `GEOCODER_PROVIDER`
- `GEOCODER_TIMEOUT_MS`
- `GOOGLE_GEOCODING_API_KEY`
- `LOCATION_CACHE_PATH`
- `MAPBOX_GEOCODING_TOKEN`
- `META_GRAPH_VERSION`
- `META_REPORTING_TIMEZONE`
- `META_SINCE`
- `META_UNTIL`
- `OPENCAGE_API_KEY`
- `ORDERS_MAP_STORE_PATH`
- `REFRESH_API_KEY`
- `REFRESH_ON_START`
- `SESSION_EVENTS_PATH`
- `SESSION_EVENT_INGEST_KEY`
- `SHAWQ_META_ACCESS_TOKEN`
- `SHAWQ_META_AD_ACCOUNT_ID`
- `SHAWQ_SHOPIFY_ACCESS_TOKEN`
- `SHAWQ_SHOPIFY_STORE`
- `SHOPIFY_API_VERSION`
- `SHOPIFY_BACKFILL_START_DATE`
- `SHOPIFY_REPORTING_TIMEZONE`
- `SHOPIFY_SINCE`
- `SHOPIFY_UNTIL`
- `SHOPIFY_WEBHOOK_SECRET`
- `SINCE`
- `UNTIL`

## Config Files

- `.env.example`
- `tsconfig.json`

## Secret Handling Rules

- Document environment variable names only, never values.
- Do not paste API keys, tokens, passwords, private keys, or signing secrets into memory files.
- If a secret appears in generated memory, delete it and rotate the credential.
