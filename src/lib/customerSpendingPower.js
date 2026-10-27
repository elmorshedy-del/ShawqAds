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
  countryReference = [],
  source = {},
  countrySource = {},
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

  // Country-level purchasing-power layer for every market with a defensible
  // World Bank reference. This intentionally stays separate from the US ZCTA
  // layer below: country PPP is useful macro context, but it must never be
  // presented as if it were an individual customer's income or local wealth.
  const countryReferenceByCode = new Map(
    (countryReference || [])
      .map((row) => [String(row?.country_code || '').trim().toUpperCase(), row])
      .filter(([code, row]) => /^[A-Z]{2}$/.test(code) && Number(row?.purchasing_power_ppp) > 0),
  );
  const countryAggregates = new Map();
  customerRows.forEach((customer) => {
    const code = String(customer.country_code || '').trim().toUpperCase();
    const ref = countryReferenceByCode.get(code);
    if (!ref) return;
    const row = countryAggregates.get(code) || {
      country_code: code,
      country: ref.country || code,
      purchasing_power_ppp: Number(ref.purchasing_power_ppp),
      purchasing_power_metric: ref.purchasing_power_metric || 'GNI per capita, PPP',
      purchasing_power_year: Number(ref.purchasing_power_year) || null,
      gni_per_capita_ppp: finiteNumber(ref.gni_per_capita_ppp),
      gni_year: Number(ref.gni_year) || null,
      gdp_per_capita_ppp: finiteNumber(ref.gdp_per_capita_ppp),
      gdp_year: Number(ref.gdp_year) || null,
      customers: 0,
      orders: 0,
      lifetime_revenue: 0,
      customer_spend: [],
    };
    row.customers += 1;
    row.orders += Number(customer.orders || 0);
    row.lifetime_revenue += Number(customer.lifetime_spend || 0);
    row.customer_spend.push(Number(customer.lifetime_spend || 0));
    countryAggregates.set(code, row);
  });

  const countryRows = [...countryAggregates.values()];
  const countryCustomerTotal = countryRows.reduce((sum, row) => sum + row.customers, 0);
  const countryRevenueTotal = countryRows.reduce((sum, row) => sum + row.lifetime_revenue, 0);
  const powerValues = countryRows
    .map((row) => Number(row.purchasing_power_ppp))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  const percentileAmongMarkets = (value) => {
    if (!powerValues.length || !Number.isFinite(Number(value))) return null;
    const v = Number(value);
    const below = powerValues.filter((candidate) => candidate < v).length;
    const equal = powerValues.filter((candidate) => candidate === v).length;
    return ((below + equal / 2) / powerValues.length) * 100;
  };

  countryRows.forEach((row) => {
    row.median_lifetime_spend = median(row.customer_spend);
    row.customer_share = safeRatio(row.customers, countryCustomerTotal);
    row.revenue_share = safeRatio(row.lifetime_revenue, countryRevenueTotal);
    row.revenue_over_index = row.customer_share
      ? row.revenue_share / row.customer_share
      : null;
    row.market_power_percentile = percentileAmongMarkets(row.purchasing_power_ppp);
    delete row.customer_spend;
  });
  countryRows.sort((a, b) =>
    Number(b.purchasing_power_ppp || 0) - Number(a.purchasing_power_ppp || 0)
      || Number(b.lifetime_revenue || 0) - Number(a.lifetime_revenue || 0));

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
      : regression.intercept + regression.slope * point.area_income_usd;
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
      note: 'Economic reference data is contextual, not personal: country PPP describes macro purchasing power and US ZCTA median income describes local-area economics. Neither estimates an individual customer’s income or wealth.',
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
    country_power: {
      status: countryRows.length ? 'ready' : 'insufficient_data',
      scope: 'lifetime-acquisition-country',
      methodology: {
        metric: 'Country purchasing-power context',
        note: 'Uses per-capita purchasing-power-parity macro data as context for ShawQ customer cohorts. It is not household wealth and should not be used alone as a market-entry score.',
        cohort: 'Customers are assigned to the country of their earliest observed paid order; later lifetime spend remains with that acquisition-country cohort.',
        percentile: 'Percentile is relative only to ShawQ countries with matched World Bank data in this analysis, not a global country percentile.',
      },
      summary: {
        matched_countries: countryRows.length,
        matched_customers: countryCustomerTotal,
        matched_customer_revenue: countryRevenueTotal,
        median_market_purchasing_power_ppp: median(countryRows.map((row) => row.purchasing_power_ppp)),
      },
      rows: countryRows,
      source: {
        provider: countrySource.provider || 'World Bank',
        dataset: countrySource.dataset || 'World Development Indicators',
        access: countrySource.access || '',
        source_url: countrySource.source_url || 'https://data.worldbank.org/',
        fetched_at: countrySource.fetched_at || '',
        primary_indicator: 'NY.GNP.PCAP.PP.CD — GNI per capita, PPP (current international $)',
        fallback_indicator: 'NY.GDP.PCAP.PP.CD — GDP per capita, PPP (current international $)',
      },
    },
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
