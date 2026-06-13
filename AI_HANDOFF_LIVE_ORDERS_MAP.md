# Live Global Orders Map — Implementation & Handoff

This document describes the **Live Global Shopify Orders Map** feature that was
added to the ShawQ dashboard, and the exact remaining steps required to switch it
from sample/demo data to **live Shopify orders**. It is written so another agent
(or engineer) can finish the integration without reverse-engineering the code.

---

## 1. Status

| Item | State |
| --- | --- |
| Feature code (frontend + server) | ✅ Done, merged to `main` (PR #4) |
| Production deploy (Railway) | ✅ Deployed and serving the new build |
| Map renders with **demo** data | ✅ Working in prod right now |
| Map renders with **live Shopify** data | ⛔ Pending — needs Shopify env vars on Railway (see §8) |
| `orders/create` webhook (live push updates) | ⛔ Pending — needs `SHOPIFY_WEBHOOK_SECRET` + webhook registration (see §8) |

- Production URL: `https://shawq-ads-production.up.railway.app`
- Shopify store (default): `f3e7e9-2.myshopify.com`
- The map is the **top card of the Overview** and also serves as the
  **"Live sales monitor"** headline (the old standalone monitor row was removed).

**Why it currently shows demo data:** `GET /api/shopify/orders-map` returns
`{"ok":false,"configured":false,"purchases":[]}` because the Shopify Admin token
is not set in the Railway environment. When `purchases` is empty, the frontend
falls back to `DEMO_PURCHASES`. Setting the token (see §8) flips it to live data.

---

## 2. What it does

- Renders an **SVG world map** (Equal-Earth projection) — not Google Maps.
- Plots **every paid order of the current reporting day** as a pink dot.
- The **newest order only** gets: an animated curved route from ShawQ HQ in
  Turkey, an expanding pulse, and a stronger glow + a "New order in {city}" card.
- Older orders are static pink dots.
- A side list shows the **last 5 orders**, newest on top.
- Dark map framed by a light platform card; respects `prefers-reduced-motion`;
  responsive (desktop + mobile).

---

## 3. Tech stack

- `react` + the existing Vite/Tailwind v4 setup.
- `d3-geo` — `geoEqualEarth().fitExtent([[18,18],[W-18,H-18]], { type: "Sphere" })`
  and `geoPath`.
- `topojson-client` — converts `world-atlas/countries-110m.json` to GeoJSON.
- Points are projected with `projection(order.coordinates)` where coordinates are
  geographic **`[longitude, latitude]`** (never `[lat, lon]`, never manual x/y).
- Server is plain Node `http` (`server.mjs`), no framework.

---

## 4. Files

| File | Purpose |
| --- | --- |
| `src/components/dashboard/OrdersMap.tsx` | The map component (SVG map, route/pulse/glow, newest-order card, last-5 list, sales-monitor headline). |
| `src/lib/orderLocations.mjs` | Static coordinate tables: city coords, region/state centroids, country centroids, country names, aliases, NYC boroughs, normalizers. |
| `src/lib/orderResolver.mjs` | Server-only: `createLocationStore` (resolve + cache), `createGeocoder` (optional HTTP geocoders), `buildPurchase` (sanitize Shopify order → safe `Purchase`), `relativeTime`. |
| `server.mjs` | Endpoints, webhook handler (HMAC + idempotency), location store wiring, purchases included in latest-sale payload. |
| `src/App.jsx` | Renders `<OrdersMap>`, reads `purchases` from the latest-sale poll, holds `DEMO_PURCHASES` fallback. |
| `src/styles.css` | Map theme tokens (`.orders-map-canvas`) + route/pulse keyframes + reduced-motion. |

---

## 5. Data model — the safe `Purchase` shape

Sent to the browser. **No customer PII** (no name, email, street address, phone,
or postal code) is ever included.

```ts
type Purchase = {
  id: string;
  name?: string;        // Shopify order name, e.g. "#3940"
  country: string;      // display country, e.g. "USA", "France"
  location?: string;    // full label, see §7
  city: string;         // locality (borough for NYC, else city)
  region?: string;      // province/state code, e.g. "NY"
  countryCode: string;  // ISO-3166 alpha-2, e.g. "US"
  flag: string;         // emoji flag
  amount: number;
  currency: string;
  items: number;
  product?: string;     // first merchandise product title
  source?: string;      // ad/attribution label (e.g. "Meta · Retargeting")
  coordinates: [number, number]; // [longitude, latitude]
  time: string;         // relative, e.g. "Just now", "2m ago"
  createdAt?: string;   // ISO timestamp (for client re-formatting/sorting)
};
```

---

## 6. Server endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/shopify/orders-map` | Recent sanitized purchases for the day (initial load). Returns `{ ok, configured, checked_at, reporting_day, purchases }`. |
| GET | `/api/shopify/latest-sale` | Existing poll the frontend uses; now also includes a `purchases` array (same shape). |
| POST | `/api/shopify/webhook` (alias `/webhooks/shopify/orders-create`) | Shopify `orders/create` webhook. Validates HMAC against the raw body, rejects bad signatures (401), idempotent on order id, stores sanitized purchase. |
| GET | `/health` | Health check (used by Railway/Render). |

The frontend polls `latest-sale` and reads `purchases` from it (no extra request).
Both endpoints share one builder so live + webhook-stored orders are merged and
deduped by id, sorted newest first.

---

## 7. Location resolution (server-side, from Shopify `shipping_address`)

Source fields (falls back to `billing_address` when shipping is missing):
`shipping_address.country_code`, `shipping_address.province_code`,
`shipping_address.city`.

**Coordinate priority** (`resolveOrderCoordinates`):
1. Exact `COUNTRY|REGION|CITY` match in the built-in city table.
2. Optional server-side geocode of `"city, region, country"` (cached on disk).
3. State/province centroid.
4. Country centroid.
5. `null` → the order is skipped (no reliable location).

Normalization rules:
- Country aliases → ISO2 (`USA`/`United States` → `US`, `UK` → `GB`, …).
  Unknown full names resolve via a name→ISO map; otherwise **empty** (never
  guessed by slicing letters). Shopify always sends `country_code`, so this is
  mostly a safety net.
- US `province_code` is used as-is (two-letter USPS). Full US state names are
  converted to their abbreviations.

**Display label (`location`)** built from the resolved address:
- Non-US → `"City, Country"` → e.g. `Paris, France`
- US → `"City, State, USA"` → e.g. `Los Angeles, California, USA`
- New York City → `"Borough, New York, New York, USA"` →
  e.g. `Brooklyn, New York, New York, USA` (Bronx / Staten Island / Queens /
  Manhattan supported, each with its own coordinates so boroughs separate).

To add more cities/boroughs, extend the tables in
`src/lib/orderLocations.mjs` (`cityCoordinates`, `regionCentroids`,
`countryCentroids`). Keys are uppercase and use the form `COUNTRY|REGION|CITY`
(region empty for non-US, e.g. `FR||PARIS`). Coordinates are `[lon, lat]`.

---

## 8. ✅ Remaining steps to go LIVE (do this next)

All of this is configuration on **Railway** for the `shawq-ads` service. No code
changes are required.

### 8.1 Required — show real orders

Add these Railway **Variables** (Railway → `shawq-ads` → Variables), then redeploy:

| Variable | Value |
| --- | --- |
| `SHAWQ_SHOPIFY_ACCESS_TOKEN` | Shopify Admin API access token (read_orders scope). **Secret.** |
| `SHAWQ_SHOPIFY_STORE` | `f3e7e9-2.myshopify.com` |
| `SHOPIFY_API_VERSION` | `2025-10` |

The token must belong to a Shopify custom/private app with at least
`read_orders` (and `read_customers` is **not** needed — we never read PII).

After redeploy, verify:
```bash
curl -s https://shawq-ads-production.up.railway.app/api/shopify/orders-map | head -c 300
# expect: {"ok":true,"configured":true, ... ,"purchases":[ ... ]}
```
`configured:true` + a non-empty `purchases` array (when there are paid orders
today) ⇒ the map now shows live orders.

### 8.2 Optional — live push updates via webhook

For instant updates (instead of the ~30s poll), register the Shopify
`orders/create` webhook and set the signing secret.

1. Add Railway variable `SHOPIFY_WEBHOOK_SECRET` = the webhook signing secret.
2. Register the webhook (Shopify Admin → Settings → Notifications → Webhooks,
   or via Admin API) with:
   - Topic: `orders/create`
   - URL: `https://shawq-ads-production.up.railway.app/api/shopify/webhook`
   - Format: JSON
   - The signing secret must match `SHOPIFY_WEBHOOK_SECRET`.
3. Verify a delivery: a valid webhook returns `200 {"ok":true,"stored":true}`;
   an invalid signature returns `401`. Retries are idempotent (no duplicate dots).

> Note: the webhook secret for a webhook created in the Shopify **Admin UI** is
> the store's API secret / the value shown when creating it; for app-created
> webhooks it's the app's client secret. Whatever you register with, put the same
> value in `SHOPIFY_WEBHOOK_SECRET`.

### 8.3 Optional — geocode unknown cities

If orders arrive from cities not in the built-in table, enable a geocoder so they
resolve precisely (results are cached on disk):

| Variable | Value |
| --- | --- |
| `GEOCODER_PROVIDER` | `mapbox` \| `opencage` \| `google` (auto-detected if omitted) |
| `MAPBOX_GEOCODING_TOKEN` / `OPENCAGE_API_KEY` / `GOOGLE_GEOCODING_API_KEY` | provider key |
| `GEOCODER_TIMEOUT_MS` | optional, default `4000` |

Without a geocoder, unknown cities fall back to state → country centroid (still
plotted, just less precise).

---

## 9. Environment variables (full reference)

| Variable | Required | Purpose |
| --- | --- | --- |
| `SHAWQ_SHOPIFY_ACCESS_TOKEN` | for live data | Shopify Admin API token (secret) |
| `SHAWQ_SHOPIFY_STORE` | for live data | e.g. `f3e7e9-2.myshopify.com` |
| `SHOPIFY_API_VERSION` | for live data | e.g. `2025-10` |
| `SHOPIFY_WEBHOOK_SECRET` | for webhook | HMAC signing secret for `orders/create` |
| `GEOCODER_PROVIDER` + key | optional | precise geocoding of unknown cities |
| `GEOCODER_TIMEOUT_MS` | optional | geocoder fetch timeout (default 4000) |
| `LOCATION_CACHE_PATH` | optional | override geocode cache path (default `data/location-cache.json`) |
| `ORDERS_MAP_STORE_PATH` | optional | override webhook store path (default `data/orders-map.json`) |
| `SHAWQ_SHOPIFY_REPORTING_TIMEZONE` | optional | reporting day timezone (default `Europe/Istanbul`) |

Secrets must stay server-side. They are never bundled into the frontend.

---

## 10. Verify (copy/paste)

```bash
BASE=https://shawq-ads-production.up.railway.app

# health
curl -s $BASE/health

# is Shopify configured? (false until §8.1 is done)
curl -s $BASE/api/shopify/orders-map | head -c 300

# webhook signature enforcement (should print 401 without a valid HMAC)
curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/api/shopify/webhook \
  -H 'X-Shopify-Hmac-Sha256: invalid' -H 'content-type: application/json' -d '{"id":1}'
```

Local end-to-end webhook test (replace `SECRET`):
```bash
BODY='{"id":777,"name":"#777","created_at":"2026-01-01T00:00:00Z","current_total_price":"142.00","currency":"USD","line_items":[{"quantity":2,"title":"Tee"}],"shipping_address":{"country_code":"US","province_code":"NY","city":"Brooklyn"}}'
HMAC=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "SECRET" -binary | base64)
curl -s -X POST localhost:3000/api/shopify/webhook \
  -H "X-Shopify-Hmac-Sha256: $HMAC" -H 'content-type: application/json' -d "$BODY"
# expect {"ok":true,"stored":true}; resends return {"ok":true,"duplicate":true}
```

---

## 11. Local development

```bash
npm install
npm run dev        # Vite dev server (frontend only; APIs need the node server)
# or full server (serves built app + APIs):
npm run build && npm start   # http://127.0.0.1:3000
```

Without a Shopify token locally, the map shows `DEMO_PURCHASES` (defined in
`src/App.jsx`) — the same set used in production until §8.1 is completed.

---

## 12. Security & data guarantees

- HMAC is validated against the **raw request body** before any parsing/storage;
  invalid signatures are rejected with `401`.
- Webhook processing is **idempotent** on the Shopify order id (retries never
  create duplicate dots).
- Only the `Purchase` fields above reach the browser — **no PII**.
- Shopify/geocoder secrets stay on the server; runtime caches live under `data/`
  (gitignored).
- File writes on the request path are async; hot reads (attribution/FX) are
  cached by file mtime to avoid blocking the event loop.

---

## 13. Quick checklist for the next agent

- [ ] Set `SHAWQ_SHOPIFY_ACCESS_TOKEN`, `SHAWQ_SHOPIFY_STORE`,
      `SHOPIFY_API_VERSION` on Railway → redeploy.
- [ ] Confirm `GET /api/shopify/orders-map` returns `configured:true`.
- [ ] (Optional) Set `SHOPIFY_WEBHOOK_SECRET` and register the `orders/create`
      webhook → confirm `200`/`401` behavior.
- [ ] (Optional) Configure a geocoder for unknown cities.
- [ ] Hard-refresh the site and confirm real orders plot in the correct cities
      (US orders land on their city/state, not the center of the USA).
