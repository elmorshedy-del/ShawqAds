# ShawQ Advanced DOM pixel (Partner path)

Microsoft Clarity, Fullstory, and LogRocket get **hosted checkout DOM replay** on Shopify through the official **Advanced DOM Events API** — not through theme scripts or Custom Pixels.

## What research found (Jun 2026)

| Approach | Storefront replay | Hosted checkout replay | ShawQ status |
|----------|-------------------|------------------------|--------------|
| Theme / ScriptTag + rrweb | Yes | **No** (`checkout.shopify.com` is isolated) | **Shipped** via `/shopify/session-recorder.js` |
| Custom Customer Events pixel | Event timeline only | Step events only | **Shipped** (`shopify/customer-events-pixel.js`) |
| Checkout journey theater (pixel steps) | N/A | Visual step replay (not DOM) | **Shipped** (`CheckoutTheater.tsx`) |
| Shopify **Advanced DOM** app pixel | Yes | Yes on **Shopify Plus** | **Scaffold only** (this folder) |
| Shopify Plus legacy `checkout.liquid` | — | Deprecated Aug 2025 | Not used |

Sources:
- [Shopify Advanced DOM Events API](https://shopify.dev/docs/api/web-pixels-api/advanced-dom-events)
- [Microsoft Clarity Shopify integration](https://learn.microsoft.com/en-us/clarity/third-party-integrations/shopify)
- [Shopify community: Advanced DOM not in custom pixels](https://community.shopify.dev/t/why-the-advanced-dom-events-only-available-in-web-app-pixel-why-it-is-not-available-in-custom-pixel/4109)

## Why this folder exists

ShawQ cannot call `advanced_dom_*` from:
- `shopify/customer-events-pixel.js` (Custom Pixel — blocked)
- `shopify/theme-session-replay.js` (no checkout DOM access)

To reach **true Clarity parity on checkout**, ShawQ must become (or partner with) a **Shopify app** and request the Partner scope:

> Advanced DOM Events in web pixel app extensions

Request access: Shopify Partner Dashboard → app → API access form (session recording / heatmaps use case).

## Next implementation steps (when scope is approved)

1. Scaffold a web pixel app extension with `@shopify/web-pixels-extension`.
2. Subscribe to `advanced_dom_available`, `advanced_dom_changed`, `advanced_dom_clicked`, `advanced_dom_scrolled`, etc.
3. Reconstruct DOM fragments server-side (or stream raw events) into ShawQ's existing `/api/session-replay` ingest.
4. Reuse `SessionReplayPanel` + `rrweb-player` **or** build a fragment renderer from synthetic DOM nodes (Shopify recommends not relying on exact checkout DOM structure).
5. Deploy via Shopify CLI; merchants install the app instead of pasting Custom Pixel code.

## Current production path (no Partner scope)

```bash
# Auto-install storefront recorder (needs write_script_tags on Admin token)
npm run install:shopify-recorder

# Verify
curl https://shawq-ads-production.up.railway.app/api/shopify/recorder/status
curl https://shawq-ads-production.up.railway.app/api/session-replay/status
```

Custom pixel: still paste `shopify/customer-events-pixel.js` in **Settings → Customer events** (Shopify does not expose API to create Custom Pixels from Admin token).

## Identity stitching

Replay + pixel sessions join on **Shopify `_shopify_y` client id** (hashed). Theme recorder waits for `_shopify_y` before starting rrweb. Pixel prefers `event.clientId` from Shopify events.
