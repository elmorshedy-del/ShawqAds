# Checkout session replay research (ShawQ)

**Last Updated:** 2026-06-26

## User ask

“Something like Playwright to see customers in checkout like Microsoft Clarity.”

Interpretation: **watch real shopper sessions through checkout**, not automated Playwright tests.

## How Clarity actually does it on Shopify

1. **Official Shopify App** in the App Store — not a theme paste.
2. Uses **Shopify Web Pixels** with privileged **Advanced DOM Events** scope (Partner-approved apps only).
3. **Shopify Plus** required for full checkout-step DOM on hosted checkout.
4. Standard plans: storefront + thank-you / order status; checkout steps often appear as funnel events rather than full DOM on every step.

Clarity does **not** rely on merchants pasting rrweb into `theme.liquid` for checkout.

## What ShawQ shipped (PR #73+)

| Layer | Mechanism |
|-------|-----------|
| Storefront DOM | Hosted `/shopify/session-recorder.js` (rrweb) + optional ScriptTag auto-install |
| Hosted checkout steps | Customer Events pixel → checkout journey theater + timeline |
| Dashboard | Behavior tab → Session replay panel + rrweb player |
| Storage | `session-replay.ndjson`, `session-events.ndjson`, index on Railway volume |

## Hard platform limits (cannot code around without Partner app)

- Custom Pixels: **sandboxed**, no DOM scrape on checkout.
- Theme scripts: **do not run** on `checkout.shopify.com`.
- Checkout Extensibility UI extensions: structured data only, not full page recording.
- Advanced DOM API: **app extension only**, requires Partner approval + Plus for checkout.

## Recommended roadmap

1. **Now:** ScriptTag install + pixel + journey theater (done).
2. **Next:** Partner app + Advanced DOM scope request (scaffold in `extensions/shawq-advanced-dom-pixel/`).
3. **Optional:** Link friction matrix rows → replay sessions by `client_id` hash.

## Operator commands

```bash
npm run install:shopify-recorder   # needs SHAWQ_SHOPIFY_ACCESS_TOKEN + write_script_tags
npm run test:session-replay
npm run test:checkout-theater
```
