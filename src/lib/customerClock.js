/* ----------------------------------------------------------------------------
 * customerClock.js — demand measured in the customer's local time.
 *
 * Every time-based view in this product buckets on Europe/Istanbul, the merchant's
 * clock. Meta and Shopify both report on it, so daily ROAS and CAC are internally
 * consistent and are NOT affected by anything here.
 *
 * What it does affect is any statement about *when* demand happens. Istanbul
 * midnight falls in the late US afternoon, so a US shopper buying on Monday
 * evening is recorded as a Tuesday order. On the launch dataset that is 44.6% of
 * US/CA orders landing on a different weekday than the buyer experienced, which
 * is enough to move a weekday effect on its own.
 *
 * This module re-buckets orders by the customer's own local hour and weekday, so
 * the dashboard can answer "when are people actually buying" rather than "when
 * did the order land in our books". That is the question ad dayparting and email
 * send-time scheduling actually need.
 *
 * Accuracy note: country -> timezone is one representative zone per country. For
 * countries spanning several zones (US, CA, AU, ES) it is the zone holding most
 * of the population, and those orders are counted as approximate. The alternative
 * would be a per-order geo lookup, which the sanitized order payload does not
 * carry — and the approximation error is at most a few hours, far smaller than
 * the merchant-clock error it replaces.
 * ------------------------------------------------------------------------- */

/** Representative IANA zone per country, plus whether the country spans several. */
export const COUNTRY_TIMEZONES = {
  US: { zone: 'America/New_York', approximate: true },
  CA: { zone: 'America/Toronto', approximate: true },
  AU: { zone: 'Australia/Sydney', approximate: true },
  GB: { zone: 'Europe/London', approximate: false },
  DE: { zone: 'Europe/Berlin', approximate: false },
  AE: { zone: 'Asia/Dubai', approximate: false },
  BE: { zone: 'Europe/Brussels', approximate: false },
  ES: { zone: 'Europe/Madrid', approximate: true },
  FR: { zone: 'Europe/Paris', approximate: false },
  SA: { zone: 'Asia/Riyadh', approximate: false },
  NL: { zone: 'Europe/Amsterdam', approximate: false },
  QA: { zone: 'Asia/Qatar', approximate: false },
  IT: { zone: 'Europe/Rome', approximate: false },
  TR: { zone: 'Europe/Istanbul', approximate: false },
  DK: { zone: 'Europe/Copenhagen', approximate: false },
  OM: { zone: 'Asia/Muscat', approximate: false },
  SG: { zone: 'Asia/Singapore', approximate: false },
  CH: { zone: 'Europe/Zurich', approximate: false },
  NO: { zone: 'Europe/Oslo', approximate: false },
  SE: { zone: 'Europe/Stockholm', approximate: false },
  IE: { zone: 'Europe/Dublin', approximate: false },
  AT: { zone: 'Europe/Vienna', approximate: false },
  PT: { zone: 'Europe/Lisbon', approximate: false },
  NZ: { zone: 'Pacific/Auckland', approximate: false },
  JP: { zone: 'Asia/Tokyo', approximate: false },
  KW: { zone: 'Asia/Kuwait', approximate: false },
  BH: { zone: 'Asia/Bahrain', approximate: false },
  JO: { zone: 'Asia/Amman', approximate: false },
  EG: { zone: 'Africa/Cairo', approximate: false },
};

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatterCache = new Map();
function partsIn(zone, date) {
  let fmt = formatterCache.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatterCache.set(zone, fmt);
  }
  const parts = Object.fromEntries(fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return {
    hour: Number(parts.hour),
    weekdayShort: parts.weekday,
    day: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function zoneForCountry(code) {
  return COUNTRY_TIMEZONES[String(code || '').toUpperCase()] || null;
}

/** Distinct orders from order lines, keyed by order id, keeping country + timestamp. */
export function distinctOrders(orderLines = []) {
  const byOrder = new Map();
  for (const line of orderLines) {
    const id = line?.order_id || line?.order_name;
    if (!id || !line.created_at) continue;
    if (byOrder.has(id)) {
      byOrder.get(id).revenue += Number(line.line_revenue_usd || 0);
      continue;
    }
    byOrder.set(id, {
      id: String(id),
      countryCode: String(line.country_code || '').toUpperCase(),
      country: line.country || line.country_code || 'Unknown',
      createdAt: line.created_at,
      revenue: Number(line.line_revenue_usd || 0),
    });
  }
  return [...byOrder.values()];
}

/**
 * Buckets orders by customer-local hour and weekday.
 *
 * `merchantZone` is only used to measure how far the merchant's books drift from
 * the customer's experience — it never changes the customer-local buckets.
 */
export function buildCustomerClock(orderLines = [], { merchantZone = 'Europe/Istanbul' } = {}) {
  const orders = distinctOrders(orderLines);
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));
  const weekdays = WEEKDAY_NAMES.map((name, index) => ({ index, name, short: WEEKDAY_SHORT[index], orders: 0, revenue: 0 }));
  const merchantWeekdays = WEEKDAY_NAMES.map((name, index) => ({ index, name, short: WEEKDAY_SHORT[index], orders: 0 }));

  let mapped = 0;
  let unmapped = 0;
  let approximate = 0;
  let weekdayDisagreements = 0;
  const unmappedCountries = new Set();

  for (const order of orders) {
    const date = new Date(order.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const mapping = zoneForCountry(order.countryCode);
    if (!mapping) {
      unmapped += 1;
      if (order.countryCode) unmappedCountries.add(order.countryCode);
      continue;
    }
    mapped += 1;
    if (mapping.approximate) approximate += 1;

    // Compare both clocks over the same mapped cohort. Counting unmapped orders
    // only on the merchant side can create a "clock disagreement" that is really a
    // population disagreement.
    const merchant = partsIn(merchantZone, date);
    const merchantIndex = WEEKDAY_SHORT.indexOf(merchant.weekdayShort);
    if (merchantIndex >= 0) merchantWeekdays[merchantIndex].orders += 1;
    const local = partsIn(mapping.zone, date);
    hours[local.hour].orders += 1;
    hours[local.hour].revenue += order.revenue;
    const localIndex = WEEKDAY_SHORT.indexOf(local.weekdayShort);
    if (localIndex >= 0) {
      weekdays[localIndex].orders += 1;
      weekdays[localIndex].revenue += order.revenue;
      if (localIndex !== merchantIndex) weekdayDisagreements += 1;
    }
  }

  return {
    totalOrders: orders.length,
    mapped,
    unmapped,
    approximate,
    unmappedCountries: [...unmappedCountries],
    weekdayDisagreements,
    disagreementRate: mapped ? weekdayDisagreements / mapped : 0,
    hours,
    weekdays,
    merchantWeekdays,
    peakWindow: peakHourWindow(hours),
    merchantZone,
  };
}

/**
 * Best contiguous block of hours by order count, wrapping past midnight.
 *
 * Contiguity matters: ad dayparting and email sends are scheduled as a window,
 * not as a set of disconnected hours, so the top-N hours would not be usable.
 */
export function peakHourWindow(hours = [], width = 4) {
  const counts = hours.map((row) => Number(row?.orders || 0));
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (!total || counts.length !== 24) return null;
  let bestStart = 0;
  let bestSum = -1;
  for (let start = 0; start < 24; start += 1) {
    let windowSum = 0;
    for (let offset = 0; offset < width; offset += 1) windowSum += counts[(start + offset) % 24];
    if (windowSum > bestSum) {
      bestSum = windowSum;
      bestStart = start;
    }
  }
  return {
    start: bestStart,
    end: (bestStart + width) % 24,
    width,
    orders: bestSum,
    share: bestSum / total,
  };
}

const pad = (hour) => `${String(hour).padStart(2, '0')}:00`;
export function formatHourWindow(window) {
  if (!window) return '';
  return `${pad(window.start)}–${pad(window.end)}`;
}

/**
 * Findings for the customer clock, in the shared finding shape.
 * Deliberately silent below a usable sample — a peak window inferred from a
 * handful of orders would send someone to reschedule their entire ad delivery.
 */
export function buildCustomerClockFindings(clock, { minOrders = 30 } = {}) {
  if (!clock || clock.mapped < minOrders) return [];
  const findings = [];
  const peak = clock.peakWindow;

  if (peak && peak.share >= 0.25) {
    findings.push({
      id: 'clock-peak',
      tone: 'positive',
      evidence: 'Observed',
      headline: `${Math.round(peak.share * 100)}% of orders land between ${formatHourWindow(peak)} customer-local time`,
      context: `${peak.orders} of ${clock.mapped} mapped order completions fall in that ${peak.width}-hour window, using a representative timezone for each destination country.`,
      driver: '',
      action: 'Use this as a scheduling test hypothesis, then compare conversion rate before changing delivery permanently.',
    });
  }

  if (clock.disagreementRate >= 0.2) {
    findings.push({
      id: 'clock-drift',
      tone: 'watch',
      evidence: 'Compared',
      headline: `${Math.round(clock.disagreementRate * 100)}% of orders fall on a different weekday for the customer than in the books`,
      context: `Reporting days close at ${clock.merchantZone} midnight, which lands mid-evening for Western buyers. Daily revenue, spend and ROAS are unaffected — Meta and Shopify both report on this clock — but weekday effects are measured on a boundary that cuts through the buying peak.`,
      driver: '',
      action: 'Read the weekday chart above as merchant-day and this one as customer-day; validate the difference with a scheduled test.',
    });
  }

  const ranked = [...(clock.weekdays || [])].sort((a, b) => b.orders - a.orders);
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];
  if (top && bottom && top.orders > 0 && top.orders >= bottom.orders * 1.5) {
    findings.push({
      id: 'clock-weekday',
      tone: 'neutral',
      evidence: 'Observed',
      headline: `${top.name} is the strongest customer-local day by volume, ${bottom.name} the weakest`,
      context: `${top.orders} total orders against ${bottom.orders}, bucketed by each buyer's own weekday. The chart above ranks by average orders per occurrence, which is a different question on a short history.`,
      driver: '',
      action: '',
    });
  }

  return findings;
}
