/* ----------------------------------------------------------------------------
 * metricDefinitions.js — plain-language definitions for the business KPI cards.
 *
 * These describe how ShawQ actually computes each number, including the parts
 * that are easy to misread. CAC and ROAS in particular are *blended*: the
 * numerator is all Shopify revenue in the window (whatever brought it in) while
 * the denominator is Meta spend only. That flatters Meta whenever organic,
 * direct or email traffic contributes, so the caveat travels with the metric.
 * ------------------------------------------------------------------------- */

export const METRIC_DEFINITIONS = {
  revenue_usd: {
    definition: 'Paid Shopify order revenue in the selected window, converted to USD.',
    whyItMatters: 'The top line every other metric is measured against. Tips are tracked separately and excluded.',
  },
  orders: {
    definition: 'Count of paid Shopify orders placed in the selected window.',
    whyItMatters: 'Order count moves before revenue does, so it is the earliest signal that demand is turning.',
  },
  aov: {
    definition: 'Average order value — Shopify revenue divided by paid orders.',
    whyItMatters: 'Separates "more buyers" from "bigger baskets". Revenue can rise on AOV alone while demand is flat.',
  },
  spend_usd: {
    definition: 'Meta ad spend for the window, converted from the account currency at that day\'s FX rate.',
    whyItMatters: 'The only cost in CAC and ROAS. Spend changes usually explain sudden swings in both.',
  },
  cac: {
    definition: 'Blended customer acquisition cost — Meta spend divided by all Shopify orders.',
    whyItMatters: 'Blended, not Meta-attributed: organic and email orders are in the denominator, so true Meta CAC is higher.',
  },
  roas: {
    definition: 'Blended return on ad spend — all Shopify revenue divided by Meta spend.',
    whyItMatters: 'Blended, not Meta-attributed. Use the campaign ROAS tree for the Meta-only view before making budget calls.',
  },
};

export function metricDefinition(key) {
  return METRIC_DEFINITIONS[key] || null;
}
