import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { BellRing, CalendarDays, RefreshCw, Search, Volume2, VolumeX } from 'lucide-react';
import { compact, money, pct, slug } from './lib/format.js';
import { statusLabels, statusOrder } from './features/adset-radar/constants.js';
import { familyStyle } from './features/product-demand/constants.js';

const SALE_POLL_MS = 30000;

function fallbackData() {
  const dates = Array.from({ length: 32 }, (_, i) => {
    const d = new Date('2026-05-01T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const names = ['US | Broad | 25-44 | Auto', 'US | Advantage+ Shopping', 'US | Retarget | 7d | All', 'US | LAL 1% Purchasers', 'US | Video Viewers | 30d', 'US | Interests | Cultural', 'US | Broad | 18-24'];
  const adsets = names.map((name, idx) => {
    const rows = dates.map((date, i) => {
      const wave = Math.sin(i / 4 + idx) * 0.13;
      const fatigue = idx > 3 ? i * 0.018 : i * 0.004;
      const frequency = 1.05 + idx * 0.17 + wave + fatigue;
      const cpm = 13.5 + idx * 1.8 + i * (idx > 3 ? 0.22 : 0.04) + Math.cos(i / 3) * 0.8;
      const reach = 520000 - idx * 42000 + Math.sin(i / 5) * 35000 - (idx > 4 ? i * 5200 : i * 1200);
      const impressions = reach * frequency;
      const spend = impressions * cpm / 1000;
      return { date, frequency, cpm, reach, impressions, spend };
    });
    return { adset_id: `sample_${idx}`, adset_name: name, campaign_name: idx < 2 ? 'Testing_USA_ABO' : 'Scaling_US_ASC', rows };
  });
  return {
    generated_at: new Date().toISOString(),
    source: 'sample-data',
    account_id: 'sample',
    analysis_window: { since: '2026-05-01', until: '2026-06-01' },
    delivery_scope: 'usa_adsets_only',
    data_coverage: { all_adsets: 7, usa_adsets: 7, ads: 14, countries: 6, ad_country_daily_rows: 84 },
    march_baseline: { frequency: 1.38, cpm: 16.8, reach: 490000, impressions: 676200 },
    adset_changes: [
      { date: '2026-05-09', adset_id: 'sample_0', label: 'Budget edited' },
      { date: '2026-05-17', adset_id: 'sample_4', label: 'Creative added' },
      { date: '2026-05-25', adset_id: 'sample_6', label: 'Bid/audience edit' },
    ],
    ads: [
      { ad_id: 'sample_ad_1', ad_name: 'Vescarts Skirt 2', product_family: 'Skirts', ctr: 3.4, add_to_cart: 18, checkout_initiated: 8, purchases: 6, roas: 3.2, spend_usd: 188, purchase_value_usd: 602 },
      { ad_id: 'sample_ad_2', ad_name: 'Vescarts Crewneck 98', product_family: 'Crewnecks', ctr: 2.8, add_to_cart: 14, checkout_initiated: 7, purchases: 4, roas: 2.5, spend_usd: 160, purchase_value_usd: 400 },
      { ad_id: 'sample_ad_3', ad_name: 'Vescarts Denim Pants', product_family: 'Denim pants', ctr: 2.1, add_to_cart: 11, checkout_initiated: 4, purchases: 3, roas: 1.8, spend_usd: 140, purchase_value_usd: 252 },
    ],
    countries: [
      { country_code: 'US', country: 'United States', spend_usd: 980, purchases: 21, roas: 2.8 },
      { country_code: 'AU', country: 'Australia', spend_usd: 260, purchases: 6, roas: 2.1 },
      { country_code: 'CH', country: 'Switzerland', spend_usd: 130, purchases: 3, roas: 1.9 },
    ],
    adsets,
  };
}

function fallbackShopify() {
  const families = ['Skirts', 'Crewnecks', 'Hoodies', 'Denim pants', 'Tops', 'Kuffiyah accessory', 'Art-frame'];
  const totals = { Skirts: 59, Crewnecks: 42, Hoodies: 35, 'Denim pants': 33, Tops: 16, 'Kuffiyah accessory': 14, 'Art-frame': 2 };
  const dates = Array.from({ length: 31 }, (_, i) => {
    const d = new Date('2026-05-01T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const daily = dates.map((date, i) => {
    const phase = (i + 1) / dates.length;
    const orders = Math.round(2 + Math.sin(i / 3) * 1.2 + phase * 7);
    return { date, revenue_usd: Math.max(0, orders * 82 + Math.cos(i / 4) * 90), orders, units: Math.max(0, Math.round(orders * 1.25)) };
  });
  const cumulative = dates.map((date, i) => {
    const day = { date };
    families.forEach((f, idx) => { day[f] = Math.round(totals[f] * Math.pow((i + 1) / dates.length, 0.85 + idx * 0.03)); });
    return day;
  });
  return {
    source: 'sample-shopify',
    generated_at: new Date().toISOString(),
    period: { since: '2026-05-01', until: '2026-06-01', currency: 'USD' },
    daily,
    families: Object.entries(totals).map(([family, units]) => ({ family, units, revenue_usd: units * 82 })),
    products: Object.entries(totals).map(([family, units]) => ({ product: `Sample ${family}`, family, units, revenue_usd: units * 82 })),
    countries: [
      { country_code: 'US', country: 'USA', units: 69, unique_products: 8, mix: { Skirts: 23, Crewnecks: 18, Hoodies: 10, 'Denim pants': 9, 'Kuffiyah accessory': 5, Tops: 4 } },
      { country_code: 'AU', country: 'Australia', units: 23, unique_products: 7, mix: { Hoodies: 7, Crewnecks: 7, Skirts: 6, 'Denim pants': 1, 'Kuffiyah accessory': 1, 'Art-frame': 1 } },
      { country_code: 'CH', country: 'Switzerland', units: 9, unique_products: 5, mix: { Skirts: 3, Hoodies: 2, 'Denim pants': 2, Crewnecks: 1, 'Kuffiyah accessory': 1 } },
      { country_code: 'ES', country: 'Spain', units: 12, unique_products: 5, mix: { Hoodies: 4, 'Denim pants': 3, Tops: 2, Skirts: 2, 'Kuffiyah accessory': 1 } },
      { country_code: 'DK', country: 'Denmark', units: 5, unique_products: 3, mix: { Crewnecks: 2, Skirts: 2, Hoodies: 1 } },
      { country_code: 'AT', country: 'Austria', units: 2, unique_products: 2, mix: { Crewnecks: 1, Hoodies: 1 } },
      { country_code: 'IT', country: 'Italy', units: 1, unique_products: 1, mix: { Hoodies: 1 } },
    ],
    cumulative,
  };
}

async function fetchJsonWithFallback(apiPath, staticPath, fallbackFactory) {
  for (const target of [apiPath, staticPath]) {
    try {
      const res = await fetch(target, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch {}
  }
  return fallbackFactory();
}

async function fetchLatestSale() {
  const res = await fetch('/api/shopify/latest-sale', { cache: 'no-store' });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(payload.error || `Shopify sale monitor ${res.status}`);
  return payload;
}

function aggregateRows(adsets) {
  const byDate = new Map();
  adsets.forEach((adset) => {
    adset.rows?.forEach((r) => {
      const cur = byDate.get(r.date) || { date: r.date, spend: 0, spend_usd: 0, impressions: 0, reach: 0 };
      cur.spend += Number(r.spend || 0);
      cur.spend_usd += Number(r.spend_usd ?? r.spend ?? 0);
      cur.impressions += Number(r.impressions || 0);
      cur.reach += Number(r.reach || 0);
      byDate.set(r.date, cur);
    });
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({
    ...r,
    frequency: r.reach ? r.impressions / r.reach : 0,
    cpm: r.impressions ? (r.spend_usd / r.impressions) * 1000 : 0,
  }));
}

function avg(rows, key) {
  const vals = rows.map((r) => Number(r[key] || 0)).filter((v) => Number.isFinite(v) && v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
function sum(rows, key) { return rows.reduce((a, r) => a + Number(r[key] || 0), 0); }
function delta(cur, base) { return base ? ((cur - base) / base) * 100 : 0; }
function shortLabel(value, max = 28) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
function countryFlag(code) {
  const cc = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '•';
  return [...cc].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join('');
}
function saleMoney(sale) {
  const currency = sale?.currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(sale?.total_price || 0));
  } catch {
    return money.format(Number(sale?.total_price || 0));
  }
}
function saleTime(value) {
  if (!value) return 'No timestamp';
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function businessMetricConfig(active) {
  return {
    revenue: { key: 'revenue_usd', label: 'Shopify revenue', formatter: (v) => money.format(v), color: '#e02e92' },
    spend: { key: 'spend_usd', label: 'Meta spend', formatter: (v) => money.format(v), color: '#bf6b1f' },
    cac: { key: 'cac', label: 'CAC', formatter: (v) => (v ? money.format(v) : 'n/a'), color: '#9f1d63' },
    roas: { key: 'roas', label: 'ROAS', formatter: (v) => (v ? `${Number(v).toFixed(2)}x` : 'n/a'), color: '#0b766c' },
  }[active] || { key: 'revenue_usd', label: 'Shopify revenue', formatter: (v) => money.format(v), color: '#e02e92' };
}

function windowedRows(rows, windowKey) {
  if (windowKey === 'all') return rows;
  const count = Number(windowKey || 0);
  return count > 0 ? rows.slice(-count) : rows;
}

function fxAuditText(data) {
  const rates = data.fx_rates?.rates || [];
  if (!rates.length) return 'FX audit: no rate metadata in this dataset yet.';
  const usdRates = rates.filter((r) => r.fx_to_usd);
  const exact = usdRates.filter((r) => r.fx_to_usd_requested_date === r.fx_to_usd_rate_date).length;
  const fallback = Math.max(0, usdRates.length - exact);
  const latest = usdRates[usdRates.length - 1];
  return `FX audit: TRY→USD via ${data.fx_rates?.provider || 'Frankfurter'}; ${exact}/${usdRates.length} exact daily rates${fallback ? `, ${fallback} fallback` : ''}. Latest ${latest?.date || ''}: ${Number(latest?.fx_to_usd || 0).toFixed(5)} (${latest?.fx_to_usd_source || 'source unknown'}).`;
}

function enrichAdset(adset, march) {
  const rows = adset.rows || [];
  const last = rows[rows.length - 1] || {};
  const prev = rows.slice(0, Math.max(0, rows.length - 1));
  const histFrequency = avg(prev, 'frequency') || avg(rows, 'frequency');
  const histCpm = avg(prev, 'cpm_usd') || avg(rows, 'cpm_usd') || avg(prev, 'cpm') || avg(rows, 'cpm');
  const histReach = avg(prev, 'reach') || avg(rows, 'reach');
  const current = {
    frequency: Number(last.frequency || avg(rows.slice(-3), 'frequency') || 0),
    cpm: Number(last.cpm_usd || last.cpm || avg(rows.slice(-3), 'cpm_usd') || avg(rows.slice(-3), 'cpm') || 0),
    reach: Number(last.reach || avg(rows.slice(-3), 'reach') || 0),
    impressions: Number(last.impressions || avg(rows.slice(-3), 'impressions') || 0),
    spend: Number(last.spend_usd || last.spend || avg(rows.slice(-3), 'spend_usd') || avg(rows.slice(-3), 'spend') || 0),
  };
  const histDelta = { frequency: delta(current.frequency, histFrequency), cpm: delta(current.cpm, histCpm), reach: delta(current.reach, histReach) };
  const marchDelta = { frequency: delta(current.frequency, march.frequency), cpm: delta(current.cpm, march.cpm), reach: delta(current.reach, march.reach) };
  let status = 'healthy';
  if (rows.length < 4 || sum(rows, 'spend') < 100) status = 'insufficient';
  else if (histDelta.frequency > 35 && histDelta.cpm > 25 && histDelta.reach < -8) status = 'expensive reach';
  else if (histDelta.frequency > 22 || histDelta.cpm > 25) status = 'fatigue risk';
  else if (histDelta.frequency > 10 || histDelta.cpm > 12 || histDelta.reach < -10) status = 'warming';
  const recommendation = status === 'healthy' ? 'Eligible to scale' : status === 'warming' ? 'Hold and watch 48h' : status === 'fatigue risk' ? 'Refresh creative or cap expansion' : status === 'expensive reach' ? 'Do not scale before reset' : 'Wait for more delivery';
  return { ...adset, current, histDelta, marchDelta, activeDays: rows.filter((r) => Number(r.spend || 0) > 0).length, status, recommendation };
}

function groupedChangePointsForRows(rows, changes) {
  if (!changes?.length) return [];
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const grouped = new Map();
  changes.forEach((change) => {
    if (!byDate.has(change.date)) return;
    const list = grouped.get(change.date) || [];
    list.push(change);
    grouped.set(change.date, list);
  });
  return [...grouped.entries()].map(([date, list]) => {
    const r = byDate.get(date);
    const budgetCount = list.filter((c) => c.is_budget_change).length;
    const ordered = [...list].sort((a, b) => Number(Boolean(b.is_budget_change)) - Number(Boolean(a.is_budget_change)));
    const examples = ordered.slice(0, 4).map((c) => `${c.is_budget_change ? 'BUDGET: ' : ''}${c.object_name || 'Ad set'}: ${c.label || c.event_type || 'changed'}`);
    return {
      coord: [date, r.frequency],
      value: budgetCount ? `${budgetCount} budget change${budgetCount === 1 ? '' : 's'} · ${list.length} total edit${list.length === 1 ? '' : 's'}` : `${list.length} ad set change${list.length === 1 ? '' : 's'}`,
      changes: list,
      examples,
      budgetCount,
      itemStyle: { color: budgetCount ? '#a40013' : '#c81e2c', borderColor: '#fff', borderWidth: 2 },
      symbolSize: budgetCount ? Math.min(24, 14 + Math.sqrt(budgetCount) * 4) : Math.min(16, 9 + Math.sqrt(list.length) * 2),
    };
  });
}

function sparkOption(rows, metric, color) {
  return { animation: false, grid: { left: 0, right: 0, top: 4, bottom: 0 }, xAxis: { type: 'category', show: false, data: rows.map((r) => r.date) }, yAxis: { type: 'value', show: false, scale: true }, series: [{ type: 'line', data: rows.map((r) => Number(r[metric] || 0)), smooth: true, symbol: 'none', lineStyle: { color, width: 2 }, areaStyle: { color: `${color}22` } }] };
}

function trendOption(rows, march, changes) {
  const dates = rows.map((r) => r.date);
  const reach = rows.map((r) => Number(r.reach || 0));
  const maxReach = Math.max(...reach, march.reach || 0, 1);
  const showUsaBaseline = Boolean(march?.applies);
  return {
    color: ['#067c73', '#e09113', '#1d64d8', '#c81e2c'],
    tooltip: { trigger: 'axis', backgroundColor: '#111827', borderColor: '#111827', textStyle: { color: '#fff' }, formatter: (params) => {
      const i = params[0].dataIndex;
      const r = rows[i];
      const editsForDay = (changes || []).filter((c) => c.date === r.date);
      const orderedEdits = [...editsForDay].sort((a, b) => Number(Boolean(b.is_budget_change)) - Number(Boolean(a.is_budget_change)));
      const budgetCount = orderedEdits.filter((c) => c.is_budget_change).length;
      const edits = orderedEdits.length ? `${budgetCount ? `${budgetCount} BUDGET change${budgetCount === 1 ? '' : 's'} · ` : ''}${orderedEdits.length} total edit${orderedEdits.length === 1 ? '' : 's'}<br/>${orderedEdits.slice(0, 4).map((c) => `${c.is_budget_change ? 'BUDGET: ' : ''}${c.object_name || 'Ad set'}: ${c.label || c.event_type || 'changed'}`).join('<br/>')}` : '';
      return `<b>${r.date}</b><br/>Frequency: ${r.frequency.toFixed(2)}<br/>CPM: ${money.format(r.cpm)}<br/>Unique impressions / reach: ${compact(r.reach)}<br/>Spend: ${money.format(r.spend_usd ?? r.spend ?? 0)}${edits ? `<br/><span style="color:#ffb4b4">● ${edits}</span>` : ''}`;
    } },
    legend: { top: 0, right: 18, itemGap: 22, textStyle: { color: '#394150', fontWeight: 600 } },
    grid: { left: 48, right: 68, top: 48, bottom: 58 },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 18, borderColor: '#d8d4ca', fillerColor: '#0a766630' }],
    xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: '#d8d4ca' } }, axisLabel: { color: '#697386' } },
    yAxis: [{ type: 'value', name: 'Frequency / reach index', min: 0, axisLabel: { color: '#067c73' }, splitLine: { lineStyle: { color: '#ece7db', type: 'dashed' } } }, { type: 'value', name: 'CPM', axisLabel: { color: '#e09113', formatter: '${value}' }, splitLine: { show: false } }],
    series: [
      { name: 'Frequency', type: 'line', smooth: true, symbolSize: 6, data: rows.map((r) => Number(r.frequency || 0)), markLine: showUsaBaseline ? { silent: true, symbol: 'none', data: [{ yAxis: march.frequency, name: 'March freq' }], lineStyle: { color: '#067c73', type: 'dashed', opacity: 0.55 } } : undefined, markPoint: { data: groupedChangePointsForRows(rows, changes), label: { show: false }, tooltip: { formatter: (p) => `<b>${p.data.value}</b><br/>${(p.data.examples || []).join('<br/>')}` } } },
      { name: 'CPM', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 6, data: rows.map((r) => Number(r.cpm || 0)), markLine: showUsaBaseline ? { silent: true, symbol: 'none', data: [{ yAxis: march.cpm, name: 'March CPM' }], lineStyle: { color: '#e09113', type: 'dashed', opacity: 0.55 } } : undefined },
      { name: 'Unique impressions / reach index', type: 'line', smooth: true, symbolSize: 5, data: reach.map((v) => (v / maxReach) * 3), lineStyle: { width: 2 }, areaStyle: { opacity: 0.08 } },
    ],
  };
}

function productGrowthOption(shopify) {
  const rows = shopify.cumulative || [];
  const families = (shopify.families || []).map((f) => f.family).filter((f) => rows.some((r) => Number(r[f] || 0) > 0));
  return {
    color: families.map((f) => familyStyle[f]?.color || familyStyle.Other.color),
    tooltip: { trigger: 'axis', backgroundColor: '#111827', borderColor: '#111827', textStyle: { color: '#fff' } },
    legend: { top: 0, type: 'scroll', textStyle: { color: '#394150', fontWeight: 700 } },
    grid: { left: 42, right: 24, top: 54, bottom: 36 },
    xAxis: { type: 'category', data: rows.map((r) => r.date), axisLabel: { color: '#697386' }, axisLine: { lineStyle: { color: '#d8d4ca' } } },
    yAxis: { type: 'value', name: 'Cumulative units', axisLabel: { color: '#697386' }, splitLine: { lineStyle: { color: '#ece7db', type: 'dashed' } } },
    series: families.map((family) => {
      const style = familyStyle[family] || familyStyle.Other;
      return { name: family, type: 'line', smooth: true, data: rows.map((r) => Number(r[family] || 0)), symbol: style.symbol, symbolSize: 7, lineStyle: { width: family === 'Skirts' ? 4 : 3, type: style.dash, color: style.color }, itemStyle: { color: style.color }, emphasis: { focus: 'series' } };
    }),
  };
}

function countrySalesRoasOption(shopifyCountries = [], metaCountries = []) {
  const metaByCode = new Map((metaCountries || []).map((country) => [country.country_code, country]));
  const rows = (shopifyCountries || []).slice(0, 14).map((country) => ({
    ...country,
    meta: metaByCode.get(country.country_code) || {},
  }));
  return {
    color: ['#e02e92', '#0b766c'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#22121a',
      borderColor: '#22121a',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        const row = rows[params[0].dataIndex];
        return `<b>${countryFlag(row.country_code)} ${row.country}</b><br/>Shopify units: ${row.units || 0}<br/>Meta purchases: ${row.meta.purchases || 0}<br/>Meta ROAS: ${Number(row.meta.roas || 0).toFixed(2)}x<br/>Meta spend: ${money.format(row.meta.spend_usd || 0)}`;
      },
    },
    grid: { left: 42, right: 52, top: 26, bottom: 42 },
    xAxis: { type: 'category', data: rows.map((row) => `${countryFlag(row.country_code)} ${row.country_code}`), axisLabel: { color: '#6d5a66', fontWeight: 800 }, axisLine: { lineStyle: { color: '#f0dce8' } } },
    yAxis: [
      { type: 'value', name: 'Units', axisLabel: { color: '#6d5a66' }, splitLine: { lineStyle: { color: '#f5e4ee', type: 'dashed' } } },
      { type: 'value', name: 'ROAS', axisLabel: { color: '#0b766c', formatter: '{value}x' }, splitLine: { show: false } },
    ],
    series: [
      { name: 'Shopify units', type: 'bar', data: rows.map((row) => Number(row.units || 0)), barMaxWidth: 20, itemStyle: { borderRadius: [8, 8, 0, 0] } },
      { name: 'Meta country ROAS', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 7, data: rows.map((row) => Number(row.meta.roas || 0)), lineStyle: { width: 3 } },
    ],
  };
}

function mergeBusinessRows(metaDaily, shopifyDaily) {
  const metaByDate = new Map((metaDaily || []).map((r) => [r.date, r]));
  return (shopifyDaily || []).map((shop) => {
    const meta = metaByDate.get(shop.date) || {};
    const spendUsd = Number(meta.spend_usd ?? meta.spend ?? 0);
    const revenueUsd = Number(shop.revenue_usd || 0);
    const orders = Number(shop.orders || 0);
    return {
      date: shop.date,
      revenue_usd: revenueUsd,
      spend_usd: spendUsd,
      orders,
      units: Number(shop.units || 0),
      cac: orders ? spendUsd / orders : 0,
      roas: spendUsd ? revenueUsd / spendUsd : 0,
    };
  });
}

function accountDailyFromAdRows(rows) {
  const byDate = new Map();
  (rows || []).forEach((row) => {
    const cur = byDate.get(row.date) || { date: row.date, spend_usd: 0, spend_try: 0, impressions: 0, reach: 0, purchases: 0, purchase_value_usd: 0 };
    cur.spend_usd += Number(row.spend_usd || 0);
    cur.spend_try += Number(row.spend_try || 0);
    cur.impressions += Number(row.impressions || 0);
    cur.reach += Number(row.reach || 0);
    cur.purchases += Number(row.purchases || 0);
    cur.purchase_value_usd += Number(row.purchase_value_usd || 0);
    byDate.set(row.date, cur);
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function businessTrendOption(rows, active) {
  const metric = businessMetricConfig(active);
  return {
    color: [metric.color],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#22121a',
      borderColor: '#22121a',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        const r = rows[params[0].dataIndex];
        return `<b>${r.date}</b><br/>${metric.label}: ${metric.formatter(Number(r[metric.key] || 0))}<br/>Revenue: ${money.format(r.revenue_usd)}<br/>Spend: ${money.format(r.spend_usd)}<br/>Orders: ${r.orders || 0}<br/>CAC: ${r.orders ? money.format(r.cac) : 'n/a'}<br/>ROAS: ${r.roas ? r.roas.toFixed(2) : 'n/a'}x`;
      },
    },
    grid: { left: 54, right: 28, top: 20, bottom: 38 },
    xAxis: { type: 'category', data: rows.map((r) => r.date), axisLabel: { color: '#697386' }, axisLine: { lineStyle: { color: '#d8d4ca' } } },
    yAxis: { type: 'value', scale: true, axisLabel: { color: '#697386', formatter: (v) => active === 'roas' ? `${v}x` : active === 'cac' || active === 'spend' || active === 'revenue' ? `$${v}` : v }, splitLine: { lineStyle: { color: '#f0dce8', type: 'dashed' } } },
    series: [
      { name: metric.label, type: 'line', smooth: true, symbolSize: 7, data: rows.map((r) => Number(r[metric.key] || 0)), lineStyle: { width: 4 }, areaStyle: { opacity: 0.12 } },
    ],
  };
}

function BusinessMetricPanel({ rows, active, windowKey, setWindowKey, fxText }) {
  const metric = businessMetricConfig(active);
  const shown = windowedRows(rows, windowKey);
  const windows = [['3', '3D'], ['7', 'Week'], ['14', '2W'], ['30', 'Month'], ['all', 'All']];
  return <section className="metric-detail unfold-panel">
    <div className="metric-detail-copy">
      <b>{metric.label} trend</b>
      <span>Click a business card to unfold one clean smoothed line. Business cards use Shopify revenue/orders and full-account Meta spend.</span>
      <small>{fxText}</small>
      <div className="window-tabs">{windows.map(([key, label]) => <button type="button" key={key} className={windowKey === key ? 'active' : ''} onClick={() => setWindowKey(key)}>{label}</button>)}</div>
    </div>
    <div className="metric-detail-chart"><ReactECharts option={businessTrendOption(shown, active)} style={{ height: 260 }} /></div>
    <div className="table-wrap compact-table metric-detail-table"><table><thead><tr><th>Date</th><th>Revenue</th><th>Meta spend</th><th>Orders</th><th>CAC</th><th>ROAS</th></tr></thead><tbody>{shown.map((r) => <tr key={r.date} className={`focus-${active}`}><td><b>{r.date}</b></td><td>{money.format(r.revenue_usd || 0)}</td><td>{money.format(r.spend_usd || 0)}</td><td>{r.orders || 0}</td><td>{r.orders ? money.format(r.cac) : 'n/a'}</td><td>{r.roas ? `${r.roas.toFixed(2)}x` : 'n/a'}</td></tr>)}</tbody></table></div>
  </section>;
}

function productLeadershipOption(products) {
  const rows = [...(products || []).slice(0, 14)].reverse();
  return {
    color: ['#d63f8c'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#111827',
      borderColor: '#111827',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        const r = rows[params[0].dataIndex];
        return `<b>${r.product}</b><br/>Family: ${r.family || 'Unknown'}<br/>Units sold: ${r.units || 0}<br/>Revenue: ${money.format(r.revenue_usd || 0)}`;
      },
    },
    grid: { left: 168, right: 32, top: 20, bottom: 24 },
    xAxis: { type: 'value', name: 'Units sold', axisLabel: { color: '#697386' }, splitLine: { lineStyle: { color: '#ece7db', type: 'dashed' } } },
    yAxis: { type: 'category', data: rows.map((r) => shortLabel(r.product, 30)), axisLabel: { color: '#344054', fontWeight: 700, fontSize: 10, width: 150, overflow: 'truncate' } },
    series: [{ name: 'Sales units', type: 'bar', data: rows.map((r) => Number(r.units || 0)), barMaxWidth: 16, itemStyle: { borderRadius: [0, 8, 8, 0] }, label: { show: true, position: 'right', formatter: '{c}' } }],
  };
}

function adLeadershipOption(ads) {
  const rows = (ads || []).slice(0, 12);
  return {
    color: ['#0b766c', '#d63f8c', '#5146d9', '#1d64d8', '#c68a00'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#111827',
      borderColor: '#111827',
      textStyle: { color: '#fff' },
      formatter: (params) => {
        const r = rows[params[0].dataIndex];
        return `<b>${r.ad_name}</b><br/>Product: ${r.product_family || 'unknown_product'}<br/>CTR (all): ${Number(r.ctr || 0).toFixed(2)}%<br/>Add to cart: ${r.add_to_cart || 0}<br/>Initiated checkout: ${r.checkout_initiated || 0}<br/>Sales / purchases: ${r.purchases || 0}<br/>ROAS: ${Number(r.roas || 0).toFixed(2)}x<br/>Spend: ${money.format(r.spend_usd || 0)}<br/>Purchase value: ${money.format(r.purchase_value_usd || 0)}`;
      },
    },
    legend: { top: 0, type: 'scroll', textStyle: { color: '#394150', fontWeight: 800 } },
    grid: { left: 44, right: 56, top: 58, bottom: 92 },
    xAxis: { type: 'category', data: rows.map((r) => shortLabel(r.ad_name, 18)), axisLabel: { color: '#697386', rotate: 42, interval: 0 }, axisLine: { lineStyle: { color: '#d8d4ca' } } },
    yAxis: [
      { type: 'value', name: 'Funnel counts', axisLabel: { color: '#697386' }, splitLine: { lineStyle: { color: '#ece7db', type: 'dashed' } } },
      { type: 'value', name: 'CTR / ROAS', axisLabel: { color: '#1d64d8' }, splitLine: { show: false } },
    ],
    series: [
      { name: 'Sales', type: 'bar', data: rows.map((r) => Number(r.purchases || 0)), barMaxWidth: 14, itemStyle: { borderRadius: [5, 5, 0, 0] } },
      { name: 'Add to cart', type: 'bar', data: rows.map((r) => Number(r.add_to_cart || 0)), barMaxWidth: 14, itemStyle: { borderRadius: [5, 5, 0, 0] } },
      { name: 'IC', type: 'bar', data: rows.map((r) => Number(r.checkout_initiated || 0)), barMaxWidth: 14, itemStyle: { borderRadius: [5, 5, 0, 0] } },
      { name: 'CTR (all)', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 6, data: rows.map((r) => Number(r.ctr || 0)) },
      { name: 'ROAS', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 6, data: rows.map((r) => Number(r.roas || 0)) },
    ],
  };
}

function Card({ title, value, sub, deltaValue, tone, rows, metric, color }) {
  return <section className="metric-card"><div className="metric-copy"><span>{title}</span><strong>{value}</strong><small>{sub}</small><em className={tone}>{deltaValue}</em></div><div className="spark"><ReactECharts option={sparkOption(rows, metric, color)} style={{ height: 72 }} /></div></section>;
}

function FinanceCard({ title, value, sub, tone = 'neutral', active, onClick }) {
  return <button type="button" className={`finance-card ${tone} ${active ? 'active' : ''}`} onClick={onClick}><span>{title}</span><strong>{value}</strong><small>{sub}</small></button>;
}

function SaleMonitor({ monitor, soundEnabled, onEnableSound }) {
  const sale = monitor.sale;
  const statusText = monitor.status === 'live' ? 'Live Shopify sales monitor' : monitor.status === 'checking' ? 'Checking Shopify sales' : 'Sale monitor paused';
  const items = sale?.line_items || [];
  const detail = sale ? `${sale.name} · ${saleMoney(sale)} · ${sale.item_count || 0} item${Number(sale.item_count || 0) === 1 ? '' : 's'}` : 'Waiting for the next paid order';
  const country = sale?.country?.code ? `${countryFlag(sale.country.code)} ${sale.country.name || sale.country.code}` : 'Country pending';
  const attribution = sale?.matched_ad?.ad_name || sale?.attribution_label || 'Unattributed in Shopify';
  return <section className={`sale-monitor ${monitor.fresh ? 'fresh' : ''}`}>
    <div className="sale-main">
      <span className={`sale-dot ${monitor.status === 'live' ? 'on' : ''}`} />
      <div>
        <b><BellRing size={15} />{monitor.fresh ? 'New Shopify sale' : statusText}</b>
        <small>{detail} · {country}</small>
        {items.length ? <div className="sale-items">{items.map((item) => <em key={`${item.title}-${item.quantity}`}>{item.quantity}x {item.title}</em>)}</div> : sale?.product_title ? <em>{sale.product_title}</em> : null}
        {sale ? <strong className="sale-source">Ad/source: {attribution}</strong> : null}
      </div>
    </div>
    <div className="sale-actions">
      <small>{monitor.checkedAt ? `Checked ${saleTime(monitor.checkedAt)}` : monitor.error || 'Starting monitor'}</small>
      <button type="button" className={soundEnabled ? 'sound-on' : ''} onClick={onEnableSound}>{soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}{soundEnabled ? 'Sound on' : 'Enable sound'}</button>
    </div>
  </section>;
}

function CoverageStrip({ coverage }) {
  const items = [
    ['All ad sets', coverage?.all_adsets || 0],
    ['USA ad sets', coverage?.usa_adsets || 0],
    ['Ads', coverage?.ads || 0],
    ['Countries', coverage?.countries || 0],
    ['Adset-country rows', coverage?.adset_country_daily_rows || 0],
    ['Ad-country rows', coverage?.ad_country_daily_rows || 0],
  ];
  return <section className="coverage-strip">{items.map(([label, value]) => <div key={label}><span>{label}</span><b>{compact(value)}</b></div>)}</section>;
}

function mixTooltip(family, units, total, subtypes = {}) {
  const familyShare = total ? Math.round((units / total) * 100) : 0;
  const subtypeEntries = Object.entries(subtypes[family] || {}).sort((a, b) => b[1] - a[1]);
  const subtypeText = subtypeEntries.length
    ? subtypeEntries.map(([subtype, count]) => `${subtype}: ${count} (${Math.round((count / units) * 100)}% of ${family}, ${Math.round((count / total) * 100)}% of country)`).join('\n')
    : 'No subtype split available';
  return `${family}: ${units} units (${familyShare}% of country)\n${subtypeText}`;
}

function MixBars({ mix, total, subtypes }) {
  const entries = Object.entries(mix || {}).sort((a, b) => b[1] - a[1]);
  return <div className="mix-bars">{entries.map(([family, units]) => <span key={family} style={{ width: `${Math.max(4, total ? (units / total) * 100 : 0)}%`, background: familyStyle[family]?.color || familyStyle.Other.color }} title={mixTooltip(family, units, total, subtypes)} />)}</div>;
}

function ProductTotals({ families }) {
  return <div className="product-totals">{families.map((f) => <div key={f.family} className="product-chip"><i style={{ background: familyStyle[f.family]?.color || familyStyle.Other.color }} /><span>{f.family}</span><b>{f.units}</b></div>)}</div>;
}

function OverallProducts({ products }) {
  return <div className="overall-products"><div><b>Total products sold overall</b><span>Actual Shopify product names, not families</span></div><div className="overall-product-list">{(products || []).slice(0, 9).map((p) => <small key={p.product}><span>{p.product}</span><b>{p.units}</b></small>)}</div></div>;
}

function LeadershipTables({ products, ads }) {
  return <section className="leadership-tables">
    <div className="mini-table">
      <h3>Product sales table</h3>
      <div className="table-wrap compact-table"><table><thead><tr><th>Product</th><th>Family</th><th>Subtype</th><th>Units</th><th>Revenue</th></tr></thead><tbody>{(products || []).slice(0, 12).map((p) => <tr key={p.product}><td className="name-cell"><b>{p.product}</b></td><td>{p.family || 'Unknown'}</td><td>{p.subtype || 'Unknown'}</td><td>{p.units || 0}</td><td>{money.format(p.revenue_usd || 0)}</td></tr>)}</tbody></table></div>
    </div>
    <div className="mini-table">
      <h3>Ads leadership table</h3>
      <div className="table-wrap compact-table"><table><thead><tr><th>Ad</th><th>Product</th><th>Subtype</th><th>CTR</th><th>ATC</th><th>IC</th><th>Sales</th><th>ROAS</th><th>Spend</th></tr></thead><tbody>{(ads || []).slice(0, 12).map((a) => <tr key={a.ad_id}><td className="name-cell"><b>{a.ad_name}</b></td><td>{a.product_family || 'unknown_product'}</td><td>{a.product_subtype || 'Unknown'}</td><td>{Number(a.ctr || 0).toFixed(2)}%</td><td>{a.add_to_cart || 0}</td><td>{a.checkout_initiated || 0}</td><td>{a.purchases || 0}</td><td>{Number(a.roas || 0).toFixed(2)}x</td><td>{money.format(a.spend_usd || 0)}</td></tr>)}</tbody></table></div>
    </div>
  </section>;
}


function App() {
  const [raw, setRaw] = useState(null);
  const [shopify, setShopify] = useState(null);
  const [selected, setSelected] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [activeBusiness, setActiveBusiness] = useState('revenue');
  const [businessWindow, setBusinessWindow] = useState('all');
  const [saleSoundEnabled, setSaleSoundEnabled] = useState(false);
  const [saleMonitor, setSaleMonitor] = useState({ status: 'checking', sale: null, checkedAt: null, fresh: false, error: '' });
  const saleAudioRef = useRef(null);
  const saleSoundEnabledRef = useRef(false);
  const lastSaleIdRef = useRef('');
  const saleInitializedRef = useRef(false);
  const saleFlashTimerRef = useRef(null);

  useEffect(() => {
    fetchJsonWithFallback('/api/data/adset-radar.json', '/data/adset-radar.json', fallbackData).then(setRaw);
  }, []);
  useEffect(() => {
    fetchJsonWithFallback('/api/data/shopify-products.json', '/data/shopify-products.json', fallbackShopify).then(setShopify);
  }, []);
  useEffect(() => {
    saleSoundEnabledRef.current = saleSoundEnabled;
  }, [saleSoundEnabled]);

  async function playSaleChime() {
    if (!saleAudioRef.current) {
      const audio = new Audio('/assets/shopify_sale_sound.mp3');
      audio.preload = 'auto';
      audio.volume = 0.88;
      saleAudioRef.current = audio;
    }
    const audio = saleAudioRef.current;
    try {
      audio.currentTime = 0;
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  async function enableSaleSound() {
    const played = await playSaleChime();
    setSaleSoundEnabled(Boolean(played));
  }

  useEffect(() => {
    let cancelled = false;
    async function pollLatestSale() {
      try {
        const payload = await fetchLatestSale();
        if (cancelled) return;
        const sale = payload.sale || null;
        const previousId = lastSaleIdRef.current;
        const isNewSale = Boolean(sale?.id && saleInitializedRef.current && sale.id !== previousId);
        if (sale?.id) lastSaleIdRef.current = sale.id;
        saleInitializedRef.current = true;
        setSaleMonitor({ status: payload.configured === false ? 'not_configured' : 'live', sale, checkedAt: payload.checked_at || new Date().toISOString(), fresh: isNewSale, error: '' });
        if (isNewSale) {
          if (saleSoundEnabledRef.current) playSaleChime();
          window.clearTimeout(saleFlashTimerRef.current);
          saleFlashTimerRef.current = window.setTimeout(() => setSaleMonitor((current) => ({ ...current, fresh: false })), 15000);
        }
      } catch (error) {
        if (!cancelled) setSaleMonitor((current) => ({ ...current, status: 'offline', checkedAt: new Date().toISOString(), fresh: false, error: error.message }));
      }
    }
    pollLatestSale();
    const timer = window.setInterval(pollLatestSale, SALE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(saleFlashTimerRef.current);
    };
  }, []);

  const data = raw || fallbackData();
  const productData = shopify || fallbackShopify();
  const isUsaFrequencyView = data.delivery_scope === 'usa_adsets_only' && (selected === 'all' || (data.adsets || []).some((a) => a.adset_id === selected));
  const march = { ...(data.march_baseline || {}), applies: isUsaFrequencyView };
  const enriched = useMemo(() => (data.adsets || []).map((a) => enrichAdset(a, march)).sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.current.spend - a.current.spend), [data, march]);
  const filtered = enriched.filter((a) => (statusFilter === 'all' || a.status === statusFilter) && `${a.adset_name} ${a.campaign_name}`.toLowerCase().includes(query.toLowerCase()));
  const chosen = selected === 'all' ? filtered : filtered.filter((a) => a.adset_id === selected);
  const trendRows = aggregateRows(chosen.length ? chosen : filtered);
  const selectedIds = new Set((chosen.length ? chosen : filtered).map((a) => a.adset_id));
  const selectedChanges = (data.adset_changes || []).filter((c) => selected === 'all' || selectedIds.has(c.adset_id));
  const budgetChangeCount = selectedChanges.filter((c) => c.is_budget_change).length;
  const otherChangeCount = selectedChanges.length - budgetChangeCount;
  const overall = trendRows[trendRows.length - 1] || {};
  const histRows = trendRows.slice(0, -1);
  const hist = { frequency: avg(histRows, 'frequency'), cpm: avg(histRows, 'cpm'), reach: avg(histRows, 'reach') };
  const overallDelta = { frequency: delta(overall.frequency, hist.frequency), cpm: delta(overall.cpm, hist.cpm), reach: delta(overall.reach, hist.reach) };
  const marchDelta = { frequency: delta(overall.frequency, march.frequency), cpm: delta(overall.cpm, march.cpm), reach: delta(overall.reach, march.reach) };
  const sourceLabel = data.source === 'sample-data' ? 'Sample fallback' : 'Meta API';
  const productSourceLabel = productData.source?.includes('sample') ? 'Sample Shopify' : 'Shopify';
  const accountDaily = useMemo(() => {
    const accountRows = data.account_daily_metrics?.length ? data.account_daily_metrics : accountDailyFromAdRows(data.ad_country_daily || []);
    return accountRows.length ? accountRows : (data.daily_metrics || aggregateRows(data.adsets || []));
  }, [data]);
  const businessRows = useMemo(() => mergeBusinessRows(accountDaily, productData.daily || []), [accountDaily, productData]);
  const business = {
    revenue_usd: sum(businessRows, 'revenue_usd'),
    spend_usd: sum(businessRows, 'spend_usd'),
    orders: sum(businessRows, 'orders'),
    units: sum(businessRows, 'units'),
  };
  business.cac = business.orders ? business.spend_usd / business.orders : 0;
  business.roas = business.spend_usd ? business.revenue_usd / business.spend_usd : 0;
  const productRows = productData.products || [];
  const adRows = data.ads || [];
  const baselineCopy = march.applies ? 'March USA baseline shown because this frequency view is USA ad sets only.' : 'No March baseline on this view because it is not USA-only.';
  const fxText = fxAuditText(data);
  const adsetPerfById = useMemo(() => new Map((data.all_adsets || []).map((row) => [row.adset_id, row])), [data]);

  return <main className="shell">
    <aside className="rail">
      <div className="brand"><img src="/assets/shawq-logo.png" alt="ShawQ" /><div><b>ShawQ</b><span>Business Monitoring</span></div></div>
      <div className="filter-block"><label>Date window</label><button><CalendarDays size={16} /> {data.analysis_window?.since || 'May 1'} - {data.analysis_window?.until || 'today'}</button></div>
      <div className="filter-block"><label>Campaign/ad set</label><select value={selected} onChange={(e) => setSelected(e.target.value)}><option value="all">All ad sets</option>{enriched.map((a) => <option key={a.adset_id} value={a.adset_id}>{a.adset_name}</option>)}</select></div>
      <div className="filter-block"><label>Status</label><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option>{Object.keys(statusLabels).map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></div>
      <div className="filter-block"><label>Search</label><div className="search"><Search size={15}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="ad set or campaign" /></div></div>
      <div className="method"><b>Baseline logic</b><p>Red dots mark ad set edits. Delivery compares against each ad set history. {baselineCopy} Product growth uses Shopify sold units by country and family.</p></div>
    </aside>

    <section className="content">
      <header className="topbar"><div className="headline-lockup"><img className="hero-logo" src="/assets/shawq-logo.png" alt="ShawQ" /><div><h1>ShawQ Business Monitoring</h1><p>Revenue, spend, CAC, ROAS, product demand, and delivery drift from the June 3 launch window.</p></div></div><div className="top-actions"><SaleMonitor monitor={saleMonitor} soundEnabled={saleSoundEnabled} onEnableSound={enableSaleSound} /><div className="refresh"><span>{sourceLabel}</span><small>Refreshed {data.generated_at ? new Date(data.generated_at).toLocaleString() : 'now'}</small><RefreshCw size={18}/></div></div></header>

      <section className="finance-cards top-finance">
        <FinanceCard title="Shopify revenue" value={money.format(business.revenue_usd)} sub={`${business.orders} orders · ${business.units} units`} tone={business.revenue_usd ? 'good' : 'neutral'} active={activeBusiness === 'revenue'} onClick={() => setActiveBusiness('revenue')} />
        <FinanceCard title="Meta spend" value={money.format(business.spend_usd)} sub="Full-account spend, converted daily" tone="warn" active={activeBusiness === 'spend'} onClick={() => setActiveBusiness('spend')} />
        <FinanceCard title="CAC" value={business.orders ? money.format(business.cac) : 'n/a'} sub="Full Meta spend / Shopify orders" tone={business.cac && business.cac < 45 ? 'good' : 'warn'} active={activeBusiness === 'cac'} onClick={() => setActiveBusiness('cac')} />
        <FinanceCard title="ROAS" value={business.roas ? `${business.roas.toFixed(2)}x` : 'n/a'} sub="Shopify revenue / full Meta spend" tone={business.roas >= 2 ? 'good' : business.roas >= 1 ? 'warn' : 'bad'} active={activeBusiness === 'roas'} onClick={() => setActiveBusiness('roas')} />
      </section>
      <BusinessMetricPanel rows={businessRows} active={activeBusiness} windowKey={businessWindow} setWindowKey={setBusinessWindow} fxText={fxText} />

      <section className="cards secondary-cards">
        <Card title="Frequency" value={(overall.frequency || 0).toFixed(2)} sub={march.applies ? `March ${Number(march.frequency || 0).toFixed(2)}` : 'No March baseline'} deltaValue={`${pct(overallDelta.frequency)} vs own history`} tone={overallDelta.frequency > 20 ? 'bad' : overallDelta.frequency > 8 ? 'warn' : 'good'} rows={trendRows} metric="frequency" color="#9a1b22" />
        <Card title="CPM" value={money.format(overall.cpm || 0)} sub={march.applies ? `March ${money.format(march.cpm || 0)}` : 'No March baseline'} deltaValue={`${pct(overallDelta.cpm)} vs own history`} tone={overallDelta.cpm > 25 ? 'bad' : overallDelta.cpm > 12 ? 'warn' : 'good'} rows={trendRows} metric="cpm" color="#c98834" />
        <Card title="Unique impressions / reach" value={compact(overall.reach || 0)} sub={march.applies ? `March ${compact(march.reach || 0)}` : 'No March baseline'} deltaValue={`${pct(overallDelta.reach)} vs own history`} tone={overallDelta.reach < -10 ? 'bad' : overallDelta.reach < -4 ? 'warn' : 'good'} rows={trendRows} metric="reach" color="#6f2a30" />
        {march.applies ? <section className="benchmark-card"><span>Vs March USA benchmark</span><div><b className={marchDelta.frequency > 20 ? 'bad' : 'warn'}>{pct(marchDelta.frequency)}</b><small>Frequency</small></div><div><b className={marchDelta.cpm > 20 ? 'bad' : 'warn'}>{pct(marchDelta.cpm)}</b><small>CPM</small></div><div><b className={marchDelta.reach < -8 ? 'bad' : 'good'}>{pct(marchDelta.reach)}</b><small>Reach</small></div></section> : <section className="benchmark-card muted-benchmark"><span>March baseline disabled</span><p>This chart is not a USA-only frequency view, so the USA March benchmark is intentionally hidden.</p></section>}
      </section>

      <section className="leadership-zone">
        <div className="panel-title product-title"><div><h2>Leadership tables</h2><p>Product sales come from Shopify. Ads leadership is one overall Meta rollup per ad across all countries.</p></div><span>{adRows.length} ads</span></div>
        <LeadershipTables products={productRows} ads={adRows} />
      </section>

      <section className="change-strip">
        <div><b>Budget changes are the priority marker</b><span>Dark red dots = budget or bid edits. Red dots = other ad set edits.</span></div>
        <strong><i className="dot budget" /> {budgetChangeCount} budget / bid edits</strong>
        <strong><i className="dot normal" /> {otherChangeCount} other edits</strong>
      </section>

      <section className="workbench"><div className="chart-panel"><div className="panel-title"><h2>Daily delivery shape</h2><p>Dark red dots mark budget/bid changes. Dashed lines are March USA baselines.</p></div><ReactECharts option={trendOption(trendRows, march, selectedChanges)} style={{ height: 438 }} /></div><aside className="rank-panel"><div className="panel-title"><h2>Ad sets ranked</h2><p>Risk comes from rising frequency/CPM plus falling unique reach.</p></div>{filtered.slice(0, 9).map((a, i) => <div className={`rank-row ${slug(a.status)}`} key={a.adset_id}><strong>{i+1}</strong><div><b>{a.adset_name}</b><small>{a.campaign_name}</small></div><span>{statusLabels[a.status]}</span></div>)}</aside></section>

      <section className="table-panel"><div className="panel-title"><h2>Ad set decision table</h2><p>Use this before scaling: healthy delivery is rising unique reach, not just higher spend. ROAS is calculated from each ad set's own spend and purchase value.</p></div><div className="table-wrap"><table><thead><tr><th>Ad set</th><th>Campaign</th><th>Status</th><th>Sales</th><th>ROAS</th><th>Meta spend</th><th>Active days</th><th>Freq</th><th>CPM</th><th>Unique imp. / reach</th><th>Freq vs hist</th><th>CPM vs hist</th><th>Reach vs hist</th><th>Freq vs Mar</th><th>CPM vs Mar</th><th>Reach vs Mar</th><th>Action</th></tr></thead><tbody>{filtered.map((a) => { const perf = adsetPerfById.get(a.adset_id) || {}; return <tr key={a.adset_id}><td className="name-cell"><b>{a.adset_name}</b></td><td className="name-cell">{a.campaign_name}</td><td><span className={`pill ${slug(a.status)}`}>{statusLabels[a.status]}</span></td><td>{perf.purchases || 0}</td><td>{Number(perf.roas || 0).toFixed(2)}x</td><td>{money.format(perf.spend_usd || a.current.spend || 0)}</td><td>{a.activeDays}</td><td>{a.current.frequency.toFixed(2)}</td><td>{money.format(a.current.cpm)}</td><td>{compact(a.current.reach)}</td><td className={a.histDelta.frequency > 18 ? 'bad' : a.histDelta.frequency > 8 ? 'warn' : 'good'}>{pct(a.histDelta.frequency)}</td><td className={a.histDelta.cpm > 20 ? 'bad' : a.histDelta.cpm > 10 ? 'warn' : 'good'}>{pct(a.histDelta.cpm)}</td><td className={a.histDelta.reach < -10 ? 'bad' : 'good'}>{pct(a.histDelta.reach)}</td><td>{pct(a.marchDelta.frequency)}</td><td>{pct(a.marchDelta.cpm)}</td><td>{pct(a.marchDelta.reach)}</td><td className="name-cell"><b>{a.recommendation}</b></td></tr>; })}</tbody></table></div></section>

      <section className="product-zone">
        <div className="panel-title product-title"><div><h2>Product demand after launch</h2><p>{productSourceLabel} sold-unit view for {productData.period?.since} - {productData.period?.until}. Lines are cumulative monthly sold units by product family.</p></div><span>{(productData.families || []).reduce((a, f) => a + Number(f.units || 0), 0)} merch units</span></div>
        <ProductTotals families={productData.families || []} />
        <OverallProducts products={productData.products || []} />
        <section className="product-grid"><div className="growth-card"><div className="panel-title"><h2>Developing growth chart</h2><p>Each line is one product family. Similar apparel categories use different color + stroke + marker shapes to stay readable.</p></div><ReactECharts option={productGrowthOption(productData)} style={{ height: 390 }} /></div><div className="country-card"><div className="panel-title"><h2>Country sales + ROAS</h2><p>Bars are Shopify units sold. The line is Meta ROAS by country using that country spend.</p></div><ReactECharts option={countrySalesRoasOption(productData.countries || [], data.countries || [])} style={{ height: 240 }} /><div className="country-list">{(productData.countries || []).map((c) => { const entries = Object.entries(c.mix || {}).sort((a,b)=>b[1]-a[1]); return <div className="country-row" key={c.country_code}><div className="country-head"><b><span className="flag">{countryFlag(c.country_code)}</span>{c.country}</b><span>{c.units} units · {c.unique_products} products</span></div><MixBars mix={c.mix} total={c.units} subtypes={c.subtypes || {}} /><div className="mix-labels">{entries.slice(0, 6).map(([f,u]) => <small key={f} title={mixTooltip(f, u, c.units, c.subtypes || {})}><i style={{ background: familyStyle[f]?.color || familyStyle.Other.color }} />{f} {c.units ? Math.round((u / c.units) * 100) : 0}%</small>)}</div></div>; })}</div></div></section>
      </section>
    </section>
  </main>;
}

export default App;
