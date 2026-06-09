# ShawQ Ads

Standalone ShawQ advertising dashboard for the June 3 campaign launch window. It combines Meta delivery/attribution data with Shopify order/product data.

## What It Shows

- Meta delivery: frequency, CPM, reach, spend, and ad set change markers.
- Budget/change markers: dark red dots are reserved for budget or bid edits; red dots are other ad set edits.
- Business metrics: Shopify revenue, Meta spend converted to USD daily, CAC, and ROAS.
- Live sale monitor: polls Shopify for the latest paid order and plays the bundled Shopify sale sound after sound is enabled.
- Product leadership: Shopify product units sold and product revenue.
- Ads leadership: one overall Meta rollup per ad across all countries with CTR (all), add to cart, initiated checkout, purchases, spend, and ROAS.
- Country coverage: Meta country ROAS beside Shopify units sold, plus Shopify product mix by country.
- Behavior friction: Shopify abandoned checkouts, Meta AddPaymentInfo, and optional Shopify Customer Events session/pixel data for payment-submit, dwell, and journey views.

## Data Windows

Default backfill starts on June 3, 2026:

```bash
BACKFILL_START_DATE=2026-06-03
```

You can override with:

```bash
SINCE=2026-06-03 UNTIL=2026-06-04 npm run fetch:all
```

The March USA benchmark is fetched separately and only applies to the USA frequency/ad-set delivery view.

## Currency Handling

Meta spend is kept in the original account currency and converted per day using Frankfurter FX rates:

- `spend` and `spend_currency`: original Meta account spend.
- `spend_usd`: daily converted USD spend for CAC/ROAS.
- `spend_try`: daily converted lira spend.
- `fx_to_usd` and `fx_to_try`: the rate used for that row/date.
- `fx_to_usd_source` and `fx_to_usd_rate_date`: proof of whether the rate came from exact daily Frankfurter v2 data or a labeled fallback.

The fetcher tries the exact-date Frankfurter v2 rate first. Latest/v1 endpoints are only fallbacks and are stored as such in `fx_rates.rates`.

## Local Run

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5177/
```

## Live Data Refresh

Required env vars:

```bash
SHAWQ_META_ACCESS_TOKEN=
SHAWQ_META_AD_ACCOUNT_ID=1026963365133388
SHAWQ_SHOPIFY_ACCESS_TOKEN=
SHAWQ_SHOPIFY_STORE=f3e7e9-2.myshopify.com
SHOPIFY_API_VERSION=2025-10
BACKFILL_START_DATE=2026-06-03
REFRESH_API_KEY=
```

Refresh locally:

```bash
npm run fetch:meta
npm run fetch:shopify
npm run fetch:behavior
```

Or refresh both:

```bash
npm run fetch:all
```

Generated JSON is written to `public/data/` and intentionally ignored by git because it contains business performance data.

## Production Server

Build and start:

```bash
npm run build
npm start
```

Endpoints:

```text
GET /health
GET /api/data/adset-radar.json
GET /api/data/shopify-products.json
GET /api/data/behavior-intelligence.json
GET /api/session-events/status
POST /api/session-events
GET /api/shopify/latest-sale
GET /api/refresh
```

The live sale sound requires one browser click on `Enable sound`; browsers block automatic audio until the user has interacted with the page.

Manual refresh requires:

```bash
Authorization: Bearer $REFRESH_API_KEY
```

Example backfill refresh:

```bash
curl -H "Authorization: Bearer $REFRESH_API_KEY" \
  "https://YOUR_APP/api/refresh?since=2026-06-03&until=2026-06-04"
```

## Shopify Session Events

The dashboard can ingest first-party Shopify Customer Events at:

```text
POST https://YOUR_APP/api/session-events
```

Local `127.0.0.1` cannot receive events from real shoppers. Use the deployed Render/Railway HTTPS URL in the Shopify pixel.

1. Open `shopify/customer-events-pixel.js`.
2. Replace `https://YOUR_DASHBOARD_DOMAIN/api/session-events` with the deployed dashboard URL.
3. If `SESSION_EVENT_INGEST_KEY` is set on the server, paste the same value into `SHAWQ_SESSION_KEY`.
4. Paste the file into Shopify Admin > Settings > Customer events > Custom pixel.
5. Save/connect the custom pixel.
6. Verify:

```bash
curl https://YOUR_APP/api/session-events/status
```

Local ingest smoke test:

```bash
npm run test:session-events
```

## Deployment

Render and Railway configs are included:

- `render.yaml`
- `railway.json`

Set the env vars in the deployment platform. The app refreshes on service start by default with `REFRESH_ON_START=true`.
