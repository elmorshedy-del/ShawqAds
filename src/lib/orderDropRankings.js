function orderKey(line) {
  return String(line.order_id || line.order_name || '').trim();
}

function secondsIntoReportingDay(iso, timeZone) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return (Number(parts.hour || 0) * 3600) + (Number(parts.minute || 0) * 60) + Number(parts.second || 0);
}

export function filterOrderLinesToSameElapsedWindow(lines, day, elapsedShare, timeZone) {
  if (!day) return [];
  if (elapsedShare >= 0.999) return (lines || []).filter((line) => line.date === day);
  const maxSeconds = elapsedShare * 86400;
  return (lines || []).filter((line) => {
    if (line.date !== day) return false;
    const seconds = secondsIntoReportingDay(line.created_at, timeZone);
    if (seconds == null) return true;
    return seconds <= maxSeconds + 1;
  });
}

function countOrdersByKey(lines, keyFor, labelFor) {
  const map = new Map();
  for (const line of lines || []) {
    const orderId = orderKey(line);
    const key = keyFor(line);
    if (!orderId || !key) continue;
    let row = map.get(key);
    if (!row) {
      row = { key, label: labelFor(line), orderIds: new Set() };
      map.set(key, row);
    }
    row.orderIds.add(orderId);
  }
  return map;
}

function rankNegativeDeltas(currentMap, previousMap, limit = 3) {
  const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);
  const rows = [];
  for (const key of keys) {
    const current = currentMap.get(key)?.orderIds.size || 0;
    const previous = previousMap.get(key)?.orderIds.size || 0;
    const delta = current - previous;
    if (delta >= 0) continue;
    rows.push({
      key,
      label: currentMap.get(key)?.label || previousMap.get(key)?.label || key,
      current,
      previous,
      delta,
    });
  }
  return rows.sort((a, b) => a.delta - b.delta || b.previous - a.previous || a.label.localeCompare(b.label)).slice(0, limit);
}

function rankPositiveDeltas(currentMap, previousMap, limit = 3) {
  const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);
  const rows = [];
  for (const key of keys) {
    const current = currentMap.get(key)?.orderIds.size || 0;
    const previous = previousMap.get(key)?.orderIds.size || 0;
    const delta = current - previous;
    if (delta <= 0) continue;
    rows.push({
      key,
      label: currentMap.get(key)?.label || previousMap.get(key)?.label || key,
      current,
      previous,
      delta,
    });
  }
  return rows.sort((a, b) => b.delta - a.delta || b.current - a.current || a.label.localeCompare(b.label)).slice(0, limit);
}

function countryLabel(line, countryFlag) {
  const code = line.country_code || '';
  const flag = countryFlag?.(code) || '';
  const name = line.country || code || 'Unknown';
  return `${flag} ${name}`.trim();
}

function buildMoverMaps(currentLines, previousLines, { limit, countryFlag, cleanAdLabel }) {
  const countryKeyFor = (line) => line.country_code || line.country || '';
  const adKeyFor = (line) => cleanAdLabel?.(line) || '';

  return {
    countriesDown: rankNegativeDeltas(
      countOrdersByKey(currentLines, countryKeyFor, (line) => countryLabel(line, countryFlag)),
      countOrdersByKey(previousLines, countryKeyFor, (line) => countryLabel(line, countryFlag)),
      limit,
    ),
    countriesUp: rankPositiveDeltas(
      countOrdersByKey(currentLines, countryKeyFor, (line) => countryLabel(line, countryFlag)),
      countOrdersByKey(previousLines, countryKeyFor, (line) => countryLabel(line, countryFlag)),
      limit,
    ),
    adsDown: rankNegativeDeltas(
      countOrdersByKey(currentLines, adKeyFor, (line) => cleanAdLabel?.(line) || ''),
      countOrdersByKey(previousLines, adKeyFor, (line) => cleanAdLabel?.(line) || ''),
      limit,
    ),
    adsUp: rankPositiveDeltas(
      countOrdersByKey(currentLines, adKeyFor, (line) => cleanAdLabel?.(line) || ''),
      countOrdersByKey(previousLines, adKeyFor, (line) => cleanAdLabel?.(line) || ''),
      limit,
    ),
  };
}

export function buildOrderMoverRankings(
  orderLines,
  day,
  prevDay,
  {
    direction = 'down',
    limit = 3,
    minMovePct = 40,
    elapsedShare = 1,
    timeZone = 'Europe/Istanbul',
    countryFlag,
    cleanAdLabel,
    isTipLine,
  } = {},
) {
  if (!day || !prevDay) return null;

  const currentLines = (orderLines || []).filter((line) => line.date === day && !isTipLine?.(line));
  const previousAll = (orderLines || []).filter((line) => line.date === prevDay && !isTipLine?.(line));
  const previousLines = elapsedShare < 1
    ? filterOrderLinesToSameElapsedWindow(previousAll, prevDay, elapsedShare, timeZone)
    : previousAll;
  if (!previousLines.length) return null;

  const currentOrders = new Set(currentLines.map(orderKey).filter(Boolean)).size;
  const previousOrders = new Set(previousLines.map(orderKey).filter(Boolean)).size;
  const orderDelta = currentOrders - previousOrders;
  const orderDeltaPct = previousOrders ? (orderDelta / previousOrders) * 100 : (currentOrders ? 100 : 0);

  const movers = buildMoverMaps(currentLines, previousLines, { limit, countryFlag, cleanAdLabel });
  const countries = direction === 'up' ? movers.countriesUp : movers.countriesDown;
  const ads = direction === 'up' ? movers.adsUp : movers.adsDown;

  if (direction === 'up') {
    if (orderDelta <= 0 || orderDeltaPct < minMovePct) return null;
  } else if (orderDelta >= 0 || orderDeltaPct > -minMovePct) {
    return null;
  }

  if (!countries.length && !ads.length) return null;

  return {
    day,
    prevDay,
    direction,
    currentOrders,
    previousOrders,
    orderDelta,
    orderDeltaPct,
    countries,
    ads,
    sameTimePreviousDay: elapsedShare < 1,
  };
}

/** @deprecated Use buildOrderMoverRankings */
export function buildOrderDropRankings(orderLines, day, prevDay, options = {}) {
  return buildOrderMoverRankings(orderLines, day, prevDay, { ...options, direction: 'down', minMovePct: options.minDropPct ?? 40 });
}
