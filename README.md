# ShawQ Ads

Standalone ShawQ advertising dashboard for the June 3 campaign launch window. It combines Meta delivery/attribution data with Shopify order/product data.

## What It Shows

- Meta delivery: frequency, CPM, reach, spend, and ad set change markers.
- Budget/change markers: dark red dots are reserved for budget or bid edits; red dots are other ad set edits.
- Business metrics: Shopify revenue, Meta spend converted to USD daily, CAC, and ROAS.
- Live sale monitor: polls Shopify for the latest paid order and plays a browser chime after sound is enabled.
- Product leadership: Shopify product units sold and product revenue.
- Ads leadership: one overall Meta rollup per ad across all countries with CTR (all), add to cart, initiated checkout, purchases, spend, and ROAS.
- Country coverage: Meta country performance and Shopify product mix by country.

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

## Deployment

Render and Railway configs are included:

- `render.yaml`
- `railway.json`

Set the env vars in the deployment platform. The app refreshes on service start by default with `REFRESH_ON_START=true`.
