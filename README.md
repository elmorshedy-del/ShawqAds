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

Meta backfill defaults to the June 3, 2026 CBO launch:

```bash
BACKFILL_START_DATE=2026-06-03
```

The **Historical insights** tab uses Shopify orders from **February 2026** onward via a separate variable (so Meta's June window does not limit Shopify history):

```bash
SHOPIFY_BACKFILL_START_DATE=2026-02-01
```

On Railway, set both variables on the service. After deploy, the server auto-refreshes Shopify data when the cache still starts after February.

You can override any fetch with:

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
GET /api/shopify/orders-map
POST /api/shopify/webhook
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

## Live Orders Map

> Full implementation + handoff guide (how to switch from demo to live Shopify
> data, env vars, webhook setup, verification): [`AI_HANDOFF_LIVE_ORDERS_MAP.md`](AI_HANDOFF_LIVE_ORDERS_MAP.md).


A live global orders map is the lead card of the Overview and now also carries
the **Live sales monitor** headline (live indicator, sale-sound toggle, last
check time, and Meta/Shopify sync health), so there is no separate monitor row.
It draws a dark SVG world map with `d3-geo` (`geoEqualEarth`) and
`world-atlas/countries-110m.json` (converted with `topojson-client`), framed by a
light platform card. Every paid order of the current reporting day is plotted as
a pink dot, and a curved route animates from ShawQ HQ in Turkey to the newest
order only. A light side list shows the last 5 orders (newest on top) with the
same order detail the monitor showed — order name, product, item count, amount,
and relative time. The map respects `prefers-reduced-motion`.

### Safe order data

Orders are sanitized server-side into a small `Purchase` shape before they reach
the browser. The customer name, email, street address, phone, and postal code are
never sent to the frontend, and Shopify credentials/secrets stay on the server.

### Location resolution

Coordinates are resolved server-side from the shipping address (falling back to
the billing address) in this priority order:

1. Exact `country|state|city` match in the built-in table
2. Optional server-side geocode of `city, region, country` (result is cached)
3. State/province centroid
4. Country centroid
5. Skip the order if no reliable location is available

US orders use Shopify's two-letter `province_code` (e.g. `NY`, `CA`, `CO`), so a
New York order lands on New York rather than the center of the USA. Full state
names and country aliases (`USA`, `United States`, …) are normalized. Resolved
cities are cached to `data/location-cache.json` so the geocoder is not called
again for the same destination. To enable geocoding for unknown cities, set a
provider key (see `.env.example`): Mapbox, OpenCage, or Google.

### Initial load and live updates

The frontend reads `purchases` from the existing `GET /api/shopify/latest-sale`
poll, and `GET /api/shopify/orders-map` returns the same sanitized list for
standalone use / initial load. Before Shopify is connected (or when today has no
orders), the map shows sample demo data.

### orders/create webhook

`POST /api/shopify/webhook` (alias `POST /webhooks/shopify/orders-create`)
listens for the Shopify `orders/create` topic:

- The `X-Shopify-Hmac-Sha256` signature is validated against the raw request body
  (using `SHOPIFY_WEBHOOK_SECRET`) **before** the body is parsed or stored.
- Invalid signatures are rejected with `401`.
- Processing is idempotent on the Shopify order ID, so retries never create
  duplicate dots.
- Stored purchases are written to `data/orders-map.json` (sanitized, no PII).

Register the webhook in Shopify Admin (or via the Admin API) pointing at the
deployed HTTPS URL, e.g. `https://YOUR_APP/api/shopify/webhook`, and set
`SHOPIFY_WEBHOOK_SECRET` to the webhook's signing secret.

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
