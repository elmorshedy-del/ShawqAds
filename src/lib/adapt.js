/* ----------------------------------------------------------------------------
 * adapt.js — pure mappers from live computed values (App.jsx) to the Lovable
 * component prop shapes (dashboard-data.ts).
 *
 * This module recomputes NO business logic. Every number it emits is read
 * straight off values already computed in App.jsx. The three tiny helpers
 * below (reachPerDollar / countryFlag / shopifyCountryRoas) are ported
 * verbatim from App.jsx only so this file stays import-free of the app shell.
 * ------------------------------------------------------------------------- */

import { familyColors } from "./dashboard-data";

const num = (v) => Number(v || 0);
const round2 = (v) => Math.round(num(v) * 100) / 100;
const round1 = (v) => Math.round(num(v) * 10) / 10;

function reachPerDollar(row = {}) {
  const spendUsd = Number(row.spend_usd ?? row.spend ?? 0);
  return spendUsd > 0 ? Number(row.reach || 0) / spendUsd : 0;
}

function countryFlag(code) {
  const cc = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "•";
  return [...cc].map((ch) => String.fromCodePoint(127397 + ch.charCodeAt(0))).join("");
}

function shopifyCountryRoas(country, metaCountry) {
  const spend = Number(metaCountry?.spend_usd || 0);
  return spend ? Number(country?.revenue_usd || 0) / spend : 0;
}

/* ---- KPI sparkline series (KpiCard.series) ----
 * Real daily values for the metric across the SELECTED period, so each card's
 * curve actually corresponds to its headline figure + delta and responds to the
 * date filter — instead of an always-on full-history shape that reads as decoration.
 * Falls back to the most recent real days only when the chosen window is too short
 * (1–2 days) to draw a meaningful line. No values are synthesized. */
export function sparkSeries(rows, key, fallbackRows) {
  const series = (rows || []).map((r) => num(r[key]));
  if (series.length >= 3) return series;
  const recent = (fallbackRows || []).map((r) => num(r[key]));
  return recent.length > series.length ? recent.slice(-14) : series;
}

/* ---- Daily breakdown (DataTable) + performance trend (RevenueChart) ---- */
export function toDayRows(businessRows) {
  return (businessRows || []).map((r) => ({
    date: r.date,
    revenue: num(r.revenue_usd),
    spend: num(r.spend_usd),
    items: num(r.units),
    orders: num(r.orders),
    aov: num(r.aov),
    cac: num(r.cac),
    roas: num(r.roas),
  }));
}

/* ---- Campaign Shopify ROAS tree ---- */
function treeFlag(node) {
  if (node.has_sales_gap) return "warning";
  if (node.has_inferred_sales || node.has_best_fit_inference) return "inferred";
  return "clean";
}
function flagNote(node, flag) {
  if (flag === "warning") {
    return `Meta ${Math.round(num(node.meta_sales))} vs mapped ${Math.round(num(node.inferred_shopify_sales))}`;
  }
  if (flag === "inferred") {
    const note = (node.inference_notes || [])[0];
    if (note) return note;
    const inf = Math.round(num(node.inferred_shopify_sales) - num(node.true_shopify_sales));
    return `${inf} inferred sale${inf === 1 ? "" : "s"}`;
  }
  return num(node.true_shopify_sales) ? "Direct match" : "";
}
function toTreeMetrics(node) {
  const flag = treeFlag(node);
  return {
    flag,
    flagNote: flagNote(node, flag),
    category: node.product_family || node.product_subtype || "",
    spend: num(node.spend_usd),
    ctr: num(node.ctr),
    atc: num(node.add_to_cart),
    ic: num(node.checkout_initiated),
    metaSales: num(node.meta_sales),
    shopify: num(node.true_shopify_sales),
    mapped: num(node.inferred_shopify_sales),
    metaRoas: num(node.meta_roas),
    shopifyRoas: num(node.true_roas),
    mappedRoas: num(node.inferred_roas),
  };
}
export function toCampaignTree(attribution) {
  return (attribution?.campaigns || []).map((c) => ({
    name: c.campaign_name || c.campaign_id || "Unknown campaign",
    region: "",
    ...toTreeMetrics(c),
    children: (c.adsets || []).map((a) => ({
      name: a.adset_name || a.adset_id || "Unknown ad set",
      parent: c.campaign_name || "",
      ...toTreeMetrics(a),
      children: (a.ads || []).map((ad) => ({
        name: ad.ad_name || ad.ad_id || "Unknown ad",
        parent: a.adset_name || a.adset_id || "",
        ...toTreeMetrics(ad),
      })),
    })),
  }));
}

/* ---- Leadership tables ---- */
export function toProductLeaders(productRows, cap = 8) {
  return [...(productRows || [])]
    .sort((a, b) => num(b.units) - num(a.units))
    .slice(0, cap)
    .map((p) => {
      const name = p.product || p.family || "Product";
      return {
        initial: (String(name).trim()[0] || "S").toUpperCase(),
        name,
        category: p.family || p.subtype || "Other",
        units: num(p.units),
        revenue: num(p.revenue_usd),
      };
    });
}
export function toAdLeaders(adRows, cap = 8) {
  const rows = adRows || [];
  const campaignsByAd = new Map();
  for (const a of rows) {
    const set = campaignsByAd.get(a.ad_name) || new Set();
    if (a.campaign_id) set.add(a.campaign_id);
    campaignsByAd.set(a.ad_name, set);
  }
  return [...rows]
    .sort((a, b) => num(b.shopify_sales) - num(a.shopify_sales) || num(b.spend_usd) - num(a.spend_usd))
    .slice(0, cap)
    .map((a) => ({
      name: a.ad_name || "Ad",
      category: a.product_family || a.product_subtype || "Uncategorized",
      campaigns: Math.max(1, (campaignsByAd.get(a.ad_name) || new Set()).size),
      sales: num(a.shopify_sales),
      roas: num(a.shopify_roas),
      ctr: num(a.ctr),
      atc: num(a.add_to_cart),
      ic: num(a.checkout_initiated),
      spend: num(a.spend_usd),
    }));
}

/* ---- Ad set decision table ---- */
export function toAdSetDecisions(filtered, adsetPerfById, statusLabels) {
  return (filtered || []).map((a) => {
    const perf = (adsetPerfById && adsetPerfById.get(a.adset_id)) || {};
    return {
      adSet: a.adset_name || "Ad set",
      campaign: a.campaign_name || "",
      status: (statusLabels && statusLabels[a.status]) || a.status || "",
      sales: num(perf.purchases),
      roas: num(perf.roas),
      spend: num(perf.spend_usd ?? a.current?.spend),
      activeDays: num(a.activeDays),
      freq: num(a.current?.frequency),
      cpm: num(a.current?.cpm),
      reachPerDollar: num(a.current?.reach_per_dollar),
      freqVsMar: num(a.marchDelta?.frequency),
      cpmVsMar: num(a.marchDelta?.cpm),
      reachVsMar: num(a.marchDelta?.reach_per_dollar),
      action: a.recommendation || "Hold",
    };
  });
}

/* ---- Country sales + ROAS ---- */
export function toCountrySales(countries, metaByCode) {
  return [...(countries || [])]
    .map((c) => {
      const meta = metaByCode && metaByCode.get(c.country_code);
      const total = num(c.units);
      const splits = Object.entries(c.mix || {})
        .sort((a, b) => b[1] - a[1])
        .map(([label, u]) => ({ label, pct: total ? Math.round((num(u) / total) * 100) : 0 }))
        .filter((s) => s.pct > 0);
      return {
        flag: countryFlag(c.country_code),
        country: c.country || c.country_code || "—",
        roas: shopifyCountryRoas(c, meta),
        units: total,
        revenue: num(c.revenue_usd),
        spend: num(meta?.spend_usd),
        products: num(c.unique_products),
        splits,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

/* ---- Daily delivery shape (DeliveryPoint[]) ---- */
export function toDeliveryShape(trendRows) {
  return (trendRows || []).map((r) => ({
    date: String(r.date || "").slice(5),
    reach: num(r.reach),
    frequency: num(r.frequency),
    cpm: num(r.cpm),
    spend: num(r.spend_usd ?? r.spend),
  }));
}

/* ---- Product demand after launch ---- */
export function toProductDemand(launchProductData, since, famCap = 8, prodCap = 8) {
  const fams = launchProductData?.families || [];
  const families = fams
    .map((f) => ({ label: f.family, units: num(f.units) }))
    .sort((a, b) => b.units - a.units)
    .slice(0, famCap);
  const topProducts = [...(launchProductData?.products || [])]
    .sort((a, b) => num(b.units) - num(a.units))
    .slice(0, prodCap)
    .map((p) => ({ name: p.product, units: num(p.units) }));
  return {
    tipsPeople: num(launchProductData?.tips?.people),
    tipsTotal: num(launchProductData?.tips?.total_usd),
    totalUnits: fams.reduce((s, f) => s + num(f.units), 0),
    since: since || "",
    families,
    topProducts,
  };
}

/* ---- Product development (cumulative units per family) ---- */
export function toProductDevelopment(launchProductData, cap = 8) {
  const rows = launchProductData?.cumulative || [];
  const familyNames = (launchProductData?.families || [])
    .map((f) => f.family)
    .filter((f) => rows.some((r) => num(r[f]) > 0));
  const last = rows[rows.length - 1] || {};
  const lines = familyNames
    .map((f) => ({ key: f, label: f, color: familyColors[f] || familyColors.Other, total: num(last[f]) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, cap);
  const keys = lines.map((l) => l.key);
  const data = rows.map((r) => {
    const o = { date: String(r.date || "").slice(5) };
    for (const k of keys) o[k] = num(r[k]);
    return o;
  });
  return { lines, data };
}

/* ---- USA_ABO history vs June launch (phase cards + per-active-day curve) ----
 * Pass the output of App.jsx's module-level comparisonStats / comparisonRows —
 * this adapter only reshapes, it does not re-derive the comparison. */
export function toUsaPhase(stats, name, variant) {
  const s = stats || {};
  return {
    name: name || (variant === "launch" ? "USA launch" : "USA history"),
    period: s.since && s.until ? `${s.since} → ${s.until}` : "—",
    days: num(s.days),
    sales: num(s.sales),
    spend: num(s.spend),
    freq: num(s.avgFrequency),
    cpm: num(s.avgCpm),
    reachPerDollar: num(s.avgReachPerDollar),
    variant,
  };
}
const curveCpm = (row) => row.cpm_usd ?? row.cpm;
const curveReach = (row) => row.reach_per_dollar ?? reachPerDollar(row);
export function toUsaCurve(historyRows, launchRows) {
  const h = historyRows || [];
  const l = launchRows || [];
  const len = Math.max(h.length, l.length);
  const out = [];
  for (let i = 0; i < len; i++) {
    const hr = h[i];
    const lr = l[i];
    out.push({
      day: i + 1,
      historyReach: hr ? num(curveReach(hr)) : null,
      historyCpm: hr ? num(curveCpm(hr)) : null,
      historyFreq: hr ? num(hr.frequency) : null,
      launchReach: lr ? num(curveReach(lr)) : null,
      launchCpm: lr ? num(curveCpm(lr)) : null,
      launchFreq: lr ? num(lr.frequency) : null,
    });
  }
  return out;
}

/* ---- Daily sales leaders (latest day with a winner) ---- */
export function toSalesLeader(highlightRows) {
  const rows = highlightRows || [];
  let pick = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if ((r.products && r.products.length) || (r.ads && r.ads.length)) {
      pick = r;
      break;
    }
  }
  if (!pick) pick = rows[rows.length - 1] || { date: "", products: [], ads: [] };
  const p = (pick.products || [])[0];
  const a = (pick.ads || [])[0];
  return {
    date: pick.date || "",
    topProduct: { name: p?.product || "No Shopify sale", units: num(p?.units), revenue: num(p?.revenue_usd) },
    topAd: { name: a?.ad || "No ad captured", sales: num(a?.order_count), revenue: num(a?.revenue_usd) },
  };
}

/* ---- Delivery vs benchmark (March USA, or own trailing history) ---- */
function prevFromDelta(cur, deltaPct) {
  const c = num(cur);
  const d = num(deltaPct);
  const denom = 1 + d / 100;
  return denom ? c / denom : 0;
}
export function toBenchmarks(overall, march, marchDelta, overallDelta) {
  const reachOverall = reachPerDollar(overall || {});
  if (march?.applies) {
    return {
      region: "USA",
      month: "March",
      items: [
        { label: "Frequency", value: round2(overall?.frequency), prev: round2(march?.frequency), delta: num(marchDelta?.frequency), lowerIsBetter: true },
        { label: "CPM", value: round2(overall?.cpm), prev: round2(march?.cpm), delta: num(marchDelta?.cpm), prefix: "$", lowerIsBetter: true },
        { label: "Reach / $", value: round1(reachOverall), prev: round1(reachPerDollar(march || {})), delta: num(marchDelta?.reach_per_dollar), lowerIsBetter: false },
      ],
    };
  }
  return {
    region: "own",
    month: "trailing",
    items: [
      { label: "Frequency", value: round2(overall?.frequency), prev: round2(prevFromDelta(overall?.frequency, overallDelta?.frequency)), delta: num(overallDelta?.frequency), lowerIsBetter: true },
      { label: "CPM", value: round2(overall?.cpm), prev: round2(prevFromDelta(overall?.cpm, overallDelta?.cpm)), delta: num(overallDelta?.cpm), prefix: "$", lowerIsBetter: true },
      { label: "Reach / $", value: round1(reachOverall), prev: round1(prevFromDelta(reachOverall, overallDelta?.reach_per_dollar)), delta: num(overallDelta?.reach_per_dollar), lowerIsBetter: false },
    ],
  };
}
