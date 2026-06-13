import { emailCampaignName, emailSourceLabel } from './orderChannel.mjs';

function isEmailLine(line) {
  return String(line?.channel || '').toLowerCase() === 'email';
}

function campaignFromSource(source = '') {
  const text = String(source || '').trim();
  const prefix = 'Email campaign · ';
  return text.startsWith(prefix) ? text.slice(prefix.length).trim() : text.replace(/^Email campaign\s*/i, '').trim();
}

function formatOrderTime(createdAt, timeZone) {
  if (!createdAt) return '';
  return new Date(createdAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timeZone || 'UTC',
  });
}

export function buildEmailCampaignSummary(orderLines = [], { countryFlag, timeZone } = {}) {
  const emailLines = (orderLines || []).filter(isEmailLine);
  const orderIds = new Set();
  const products = new Map();
  const campaigns = new Map();
  const ordersById = new Map();
  let units = 0;
  let revenue = 0;

  for (const line of emailLines) {
    const orderId = String(line.order_id || line.order_name || '').trim() || `${line.date}:${line.product}`;
    const orderRevenue = Number(line.order_revenue_usd || 0);
    const quantity = Number(line.quantity || 0);
    const attribution = line.attribution || {};
    const campaignKey = emailCampaignName(attribution) || 'Email';

    if (!ordersById.has(orderId)) {
      ordersById.set(orderId, {
        id: line.order_name || orderId,
        flag: countryFlag?.(line.country_code) || '',
        location: line.country || line.country_code || '',
        city: '',
        product: line.product || '',
        amount: orderRevenue,
        currency: 'USD',
        items: 0,
        time: line.created_at ? formatOrderTime(line.created_at, timeZone) : line.date || '',
        source: emailSourceLabel(attribution),
        created_at: line.created_at || '',
        date: line.date || '',
      });
      orderIds.add(orderId);
      revenue += orderRevenue;
      const campaignRow = campaigns.get(campaignKey) || { name: campaignKey, orders: 0, revenue_usd: 0 };
      campaignRow.orders += 1;
      campaignRow.revenue_usd += orderRevenue;
      campaigns.set(campaignKey, campaignRow);
    }

    const orderRow = ordersById.get(orderId);
    orderRow.items += quantity;
    if (!orderRow.product && line.product) orderRow.product = line.product;
    units += quantity;

    const productKey = line.product || 'Unknown product';
    const productRow = products.get(productKey) || { product: productKey, units: 0, revenue_usd: 0 };
    productRow.units += quantity;
    productRow.revenue_usd += Number(line.line_revenue_usd || 0);
    products.set(productKey, productRow);
  }

  const orders = [...ordersById.values()]
    .sort((a, b) => `${b.created_at || b.date}`.localeCompare(`${a.created_at || a.date}`))
    .slice(0, 6);

  return {
    summary: {
      orders: orderIds.size,
      units,
      revenue_usd: revenue,
      products: [...products.values()]
        .sort((a, b) => b.units - a.units || b.revenue_usd - a.revenue_usd)
        .slice(0, 6),
      campaigns: [...campaigns.values()]
        .sort((a, b) => b.revenue_usd - a.revenue_usd || b.orders - a.orders)
        .slice(0, 6),
    },
    orders,
  };
}

export function buildEmailCampaignFromPurchases(purchases = [], { countryFlag } = {}) {
  const emailPurchases = (purchases || []).filter((purchase) => String(purchase?.channel || '').toLowerCase() === 'email');
  const products = new Map();
  const campaigns = new Map();
  let units = 0;
  let revenue = 0;

  const orders = emailPurchases.map((purchase) => {
    const amount = Number(purchase.amount || 0);
    const items = Number(purchase.items || 0);
    const campaignKey = campaignFromSource(purchase.source) || 'Email';
    revenue += amount;
    units += items;

    const productKey = purchase.product || 'Unknown product';
    const productRow = products.get(productKey) || { product: productKey, units: 0, revenue_usd: 0 };
    productRow.units += items;
    productRow.revenue_usd += amount;
    products.set(productKey, productRow);

    const campaignRow = campaigns.get(campaignKey) || { name: campaignKey, orders: 0, revenue_usd: 0 };
    campaignRow.orders += 1;
    campaignRow.revenue_usd += amount;
    campaigns.set(campaignKey, campaignRow);

    return {
      id: purchase.id || purchase.name || '',
      flag: purchase.flag || countryFlag?.(purchase.countryCode) || '',
      location: purchase.location || purchase.country || '',
      city: purchase.city || '',
      product: purchase.product || '',
      amount,
      currency: purchase.currency || 'USD',
      items,
      time: purchase.time || '',
      source: purchase.source || 'Email campaign',
    };
  });

  return {
    summary: {
      orders: emailPurchases.length,
      units,
      revenue_usd: revenue,
      products: [...products.values()]
        .sort((a, b) => b.units - a.units || b.revenue_usd - a.revenue_usd)
        .slice(0, 6),
      campaigns: [...campaigns.values()]
        .sort((a, b) => b.revenue_usd - a.revenue_usd || b.orders - a.orders)
        .slice(0, 6),
    },
    orders,
  };
}
