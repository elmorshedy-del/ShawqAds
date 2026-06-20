/* Revenue-scope helper for the business cards' "Shopify" vs "Shopify + Email" toggle.
 *
 * The daily Shopify totals (revenue/orders/units) include every channel, including
 * email-campaign orders (utm_medium=email -> line.channel='email'). "Shopify + Email"
 * shows those totals as-is; "Shopify" subtracts the email-campaign contribution so the
 * cards reflect ads/direct only (and ROAS/CAC are not flattered by email revenue).
 *
 * The email contribution is taken from order_lines (the same source the Email panel uses):
 * revenue = sum of email line revenue, units = sum of email line quantity, orders = count
 * of DISTINCT email order ids. Subtraction is floored at 0 per day.
 */

const isEmailLine = (line) => String((line && line.channel) || '').toLowerCase() === 'email';
const orderKey = (line) => String((line && (line.order_id || line.order_name)) || '');

export function buildEmailDailyIndex(orderLines) {
  const byDate = new Map();
  for (const line of orderLines || []) {
    if (!line || !line.date || !isEmailLine(line)) continue;
    let e = byDate.get(line.date);
    if (!e) { e = { revenue_usd: 0, units: 0, orderSet: new Set() }; byDate.set(line.date, e); }
    e.revenue_usd += Number(line.line_revenue_usd) || 0;
    e.units += Number(line.quantity) || 0;
    const k = orderKey(line);
    if (k) e.orderSet.add(k);
  }
  const out = new Map();
  for (const [date, e] of byDate.entries()) {
    out.set(date, { revenue_usd: e.revenue_usd, units: e.units, orders: e.orderSet.size });
  }
  return out;
}

export function applyRevenueScope(dailyRows, scope, emailIndex) {
  if (scope !== 'shopify' || !emailIndex || emailIndex.size === 0) return dailyRows || [];
  return (dailyRows || []).map((row) => {
    const e = row && emailIndex.get(row.date);
    if (!e) return row;
    return {
      ...row,
      revenue_usd: Math.max(0, (Number(row.revenue_usd) || 0) - e.revenue_usd),
      orders: Math.max(0, (Number(row.orders) || 0) - e.orders),
      units: Math.max(0, (Number(row.units) || 0) - e.units),
    };
  });
}
