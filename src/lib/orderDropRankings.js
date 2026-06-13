function orderKey(line) {
  return String(line.order_id || line.order_name || '').trim();
}

function countOrdersByKey(lines, keyFor, labelFor) {
  const map = new Map();
  for (const line of lines || []) {
    const orderId = orderKey(line);
    const key = keyFor(line);
    if (!orderId || !key) continue;
    const row = map.get(key) || { key, label: labelFor(line), orderIds: new Set() };
    row.orderIds.add(orderId);
    map.set(key, row);
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
  return rows.sort((a, b) => a.delta - b.delta).slice(0, limit);
}

export function buildOrderDropRankings(orderLines, day, prevDay, { limit = 3, countryFlag, cleanAdLabel, isTipLine } = {}) {
  if (!day || !prevDay) return null;

  const currentLines = (orderLines || []).filter((line) => line.date === day && !isTipLine?.(line));
  const previousLines = (orderLines || []).filter((line) => line.date === prevDay && !isTipLine?.(line));
  if (!previousLines.length) return null;

  const currentOrders = new Set(currentLines.map(orderKey).filter(Boolean)).size;
  const previousOrders = new Set(previousLines.map(orderKey).filter(Boolean)).size;
  const orderDelta = currentOrders - previousOrders;
  if (orderDelta >= 0) return null;

  const countries = rankNegativeDeltas(
    countOrdersByKey(currentLines, (line) => line.country_code || line.country || '', (line) => {
      const code = line.country_code || '';
      const flag = countryFlag?.(code) || '';
      const name = line.country || code || 'Unknown';
      return `${flag} ${name}`.trim();
    }),
    countOrdersByKey(previousLines, (line) => line.country_code || line.country || '', (line) => {
      const code = line.country_code || '';
      const flag = countryFlag?.(code) || '';
      const name = line.country || code || 'Unknown';
      return `${flag} ${name}`.trim();
    }),
    limit,
  );

  const ads = rankNegativeDeltas(
    countOrdersByKey(currentLines, (line) => cleanAdLabel?.(line) || '', (line) => cleanAdLabel?.(line) || ''),
    countOrdersByKey(previousLines, (line) => cleanAdLabel?.(line) || '', (line) => cleanAdLabel?.(line) || ''),
    limit,
  );

  if (!countries.length && !ads.length) return null;

  return {
    day,
    prevDay,
    currentOrders,
    previousOrders,
    orderDelta,
    orderDeltaPct: previousOrders ? (orderDelta / previousOrders) * 100 : 0,
    countries,
    ads,
  };
}
