function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function median(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function safeRatio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

export function linearRegression(points = [], xKey = 'x', yKey = 'y') {
  const rows = points
    .map((point) => ({ x: finiteNumber(point?.[xKey]), y: finiteNumber(point?.[yKey]) }))
    .filter((point) => point.x != null && point.y != null);
  const n = rows.length;
  if (n < 2) return { n, slope: null, intercept: null, r: null, r2: null };

  const meanX = rows.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = rows.reduce((sum, point) => sum + point.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  rows.forEach((point) => {
    const dx = point.x - meanX;
    const dy = point.y - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  });
  if (!(sxx > 0)) return { n, slope: null, intercept: meanY, r: null, r2: null };

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r = syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  return {
    n,
    slope,
    intercept,
    r,
    r2: r == null ? null : r * r,
  };
}

export function weightedIncomePercentiles(rows = []) {
  const clean = rows
    .map((row) => ({
      postal_code: String(row?.postal_code || ''),
      area_income_usd: finiteNumber(row?.area_income_usd),
      households: finiteNumber(row?.households),
    }))
    .filter((row) => row.postal_code && row.area_income_usd > 0 && row.households > 0)
    .sort((a, b) => a.area_income_usd - b.area_income_usd || a.postal_code.localeCompare(b.postal_code));

  const totalHouseholds = clean.reduce((sum, row) => sum + row.households, 0);
  let cumulative = 0;
  return clean.map((row) => {
    const midpoint = cumulative + row.households / 2;
    cumulative += row.households;
    return {
      ...row,
      spending_power_percentile: totalHouseholds ? (midpoint / totalHouseholds) * 100 : null,
    };
  });
}

function quintileFor(percentile) {
  const p = Math.max(0, Math.min(100, Number(percentile || 0)));
  if (p >= 80) return 5;
  if (p >= 60) return 4;
  if (p >= 40) return 3;
  if (p >= 20) return 2;
  return 1;
}

function bandLabel(quintile) {
  return ({
    1: 'Bottom 20%',
    2: '20–40%',
    3: '40–60%',
    4: '60–80%',
    5: 'Top 20%',
  })[quintile] || 'Unknown';
}

function isEarlierOrder(orderDate, currentFirstDate) {
  if (!currentFirstDate) return true;
  if (!orderDate) return false;
  return String(orderDate) < String(currentFirstDate);
}

export function buildCustomerSpendingPowerAnalysis({
  orders = [],
  usReference = [],
  source = {},
  shopCurrency = 'USD',
  lifetimeSince = '',
  lifetimeUntil = '',
} = {}) {
  const reference = new Map(
    weightedIncomePercentiles(usReference).map((row) => [row.postal_code, row]),
  );

  const customers = new Map();
  const supportedOrderIds = new Set();
  const matchedOrderIds = new Set();
  const supportedCountries = new Set();
  const keyBasisCounts = new Map();
  let includedRevenue = 0;
  let identifiedRevenue = 0;
  let matchedRevenue = 0;
  let supportedOrders = 0;
  let identifiedOrders = 0;

  orders.forEach((order) => {
    const revenue = Math.max(0, Number(order?.revenue || 0));
    includedRevenue += revenue;
    const customerKey = String(order?.customer_id || '').trim();
    if (!customerKey) return;
    identifiedOrders += 1;
    identifiedRevenue += revenue;
    const keyBasis = String(order?.customer_key_basis || 'shopify_customer');
    keyBasisCounts.set(keyBasis, (keyBasisCounts.get(keyBasis) || 0) + 1);

    const countryCode = String(order?.country_code || '').trim().toUpperCase();
    const postalCode = String(order?.postal_code || '').trim();
    const orderDate = String(order?.created_at || '');
    const current = customers.get(customerKey) || {
      lifetime_spend: 0,
      orders: 0,
      first_order_at: '',
      country_code: '',
      postal_code: '',
      customer_key_basis: keyBasis,
    };
    current.lifetime_spend += revenue;
    current.orders += 1;

    // Economic-area exposure is fixed to the earliest paid order, including when
    // that first area is unsupported. A later move must not silently turn a customer
    // into a US acquisition just because the later ZIP is easier to enrich.
    if (isEarlierOrder(orderDate, current.first_order_at)) {
      current.first_order_at = orderDate;
      current.country_code = countryCode;
      current.postal_code = postalCode;
      current.customer_key_basis = keyBasis;
    }
    customers.set(customerKey, current);

    if (countryCode === 'US' && postalCode) {
      supportedOrders += 1;
      supportedCountries.add(countryCode);
      const orderKey = String(order?.order_id || `${customerKey}:${orderDate}`);
      supportedOrderIds.add(orderKey);
      if (reference.has(postalCode)) {
        matchedOrderIds.add(orderKey);
        matchedRevenue += revenue;
      }
    }
  });

  const customerRows = [...customers.values()];
  const supportedFirstOrderCustomers = customerRows.filter(
    (customer) => customer.country_code === 'US' && customer.postal_code,
  );
  const points = [];
  supportedFirstOrderCustomers.forEach((customer) => {
    const ref = reference.get(customer.postal_code);
    if (!ref) return;
    points.push({
      area_income_usd: ref.area_income_usd,
      spending_power_percentile: ref.spending_power_percentile,
      lifetime_spend: customer.lifetime_spend,
      orders: customer.orders,
      fitted_spend: null,
    });
  });

  const regression = linearRegression(points, 'area_income_usd', 'lifetime_spend');
  points.forEach((point) => {
    point.fitted_spend = regression.slope == null || regression.intercept == null
      ? null
      : Math.max(0, regression.intercept + regression.slope * point.area_income_usd);
  });
  points.sort((a, b) => a.area_income_usd - b.area_income_usd || a.lifetime_spend - b.lifetime_spend);

  const totalMatchedRevenue = points.reduce((sum, point) => sum + point.lifetime_spend, 0);
  const distribution = [1, 2, 3, 4, 5].map((quintile) => {
    const bucket = points.filter((point) => quintileFor(point.spending_power_percentile) === quintile);
    const revenue = bucket.reduce((sum, point) => sum + point.lifetime_spend, 0);
    return {
      quintile,
      label: bandLabel(quintile),
      customers: bucket.length,
      customer_share: safeRatio(bucket.length, points.length),
      lifetime_revenue: revenue,
      revenue_share: safeRatio(revenue, totalMatchedRevenue),
      median_lifetime_spend: median(bucket.map((point) => point.lifetime_spend)),
    };
  });

  const top = distribution.find((row) => row.quintile === 5) || {};
  const slopePer10k = regression.slope == null ? null : regression.slope * 10000;

  return {
    status: points.length >= 2 ? 'ready' : 'insufficient_data',
    scope: 'lifetime',
    period: { since: lifetimeSince || '', until: lifetimeUntil || '' },
    methodology: {
      name: 'Customer Spending Power',
      metric: 'Area-level household economic capacity',
      note: 'Area-derived estimates describe the typical economics of a customer delivery area; they are not estimates of an individual customer’s income or wealth.',
      customer_unit: 'Unique Shopify customer ID where available; privacy-safe address HMAC fallback may be used for guest orders. Economic area is fixed at the earliest observed paid order.',
      privacy: 'No customer identifiers, address hashes, addresses, or postal codes are emitted to the dashboard payload.',
    },
    coverage: {
      included_orders: orders.length,
      identified_orders: identifiedOrders,
      identified_customers: customers.size,
      supported_orders: supportedOrders,
      matched_orders: matchedOrderIds.size,
      supported_first_order_customers: supportedFirstOrderCustomers.length,
      matched_customers: points.length,
      included_revenue: includedRevenue,
      identified_revenue: identifiedRevenue,
      matched_customer_revenue: totalMatchedRevenue,
      matched_order_revenue: matchedRevenue,
      overall_customer_coverage: safeRatio(points.length, customers.size),
      supported_customer_match_rate: safeRatio(points.length, supportedFirstOrderCustomers.length),
      supported_order_match_rate: safeRatio(matchedOrderIds.size, supportedOrderIds.size),
      supported_countries: [...supportedCountries].sort(),
      customer_key_basis_orders: Object.fromEntries([...keyBasisCounts.entries()].sort()),
    },
    summary: {
      median_area_income_usd: median(points.map((point) => point.area_income_usd)),
      median_spending_power_percentile: median(points.map((point) => point.spending_power_percentile)),
      top_20_customer_share: top.customer_share ?? null,
      top_20_revenue_share: top.revenue_share ?? null,
      top_20_over_index: top.customer_share == null ? null : top.customer_share / 0.2,
      median_lifetime_spend: median(points.map((point) => point.lifetime_spend)),
      regression: {
        n: regression.n,
        slope_per_income_dollar: regression.slope,
        slope_per_10000_income: slopePer10k,
        intercept: regression.intercept,
        pearson_r: regression.r,
        r2: regression.r2,
      },
    },
    distribution,
    points,
    source: {
      country_code: 'US',
      provider: source.provider || 'U.S. Census Bureau',
      dataset: source.dataset || 'American Community Survey 5-year',
      vintage: source.vintage || '',
      geography: source.geography || 'ZIP Code Tabulation Area (ZCTA)',
      income_variable: source.income_variable || 'B19013_001E — Median household income',
      household_variable: source.household_variable || 'B11001_001E — Total households',
      shop_currency: shopCurrency,
      url: source.url || '',
    },
  };
}
