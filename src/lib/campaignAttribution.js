const DOMINANT_COUNTRY_CAMPAIGN_SHARE = 0.7;
const DOMINANT_PRODUCT_AD_SHARE = 0.8;

function n(value) { return Number(value || 0); }
function keyFor(parts) { return parts.filter(Boolean).join('::'); }
function norm(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

function emptyNode(type, ids = {}) {
  return {
    type,
    ...ids,
    spend_usd: 0,
    impressions: 0,
    clicks_all: 0,
    link_clicks: 0,
    add_to_cart: 0,
    checkout_initiated: 0,
    meta_sales: 0,
    meta_revenue_usd: 0,
    shopify_direct_sales: 0,
    shopify_direct_revenue_usd: 0,
    shopify_country_sales: 0,
    shopify_country_revenue_usd: 0,
    shopify_product_inferred_sales: 0,
    shopify_product_inferred_revenue_usd: 0,
    unresolved_sales: 0,
    unresolved_revenue_usd: 0,
    inference_notes: new Set(),
    adsets: new Map(),
    ads: new Map(),
  };
}

function addMetaMetrics(node, row) {
  node.spend_usd += n(row.spend_usd);
  node.impressions += n(row.impressions);
  node.clicks_all += n(row.clicks_all);
  node.link_clicks += n(row.link_clicks);
  node.add_to_cart += n(row.add_to_cart);
  node.checkout_initiated += n(row.checkout_initiated);
  node.meta_sales += n(row.purchases);
  node.meta_revenue_usd += n(row.purchase_value_usd);
}

function addShopify(node, bucket, line) {
  node[`${bucket}_sales`] += n(line.quantity) || 1;
  node[`${bucket}_revenue_usd`] += n(line.line_revenue_usd);
}

function finalizeNode(node) {
  const trueRevenue = node.shopify_direct_revenue_usd + node.shopify_country_revenue_usd;
  const inferredRevenue = trueRevenue + node.shopify_product_inferred_revenue_usd;
  const trueSales = node.shopify_direct_sales + node.shopify_country_sales;
  const inferredSales = trueSales + node.shopify_product_inferred_sales;
  const out = {
    ...node,
    ctr: node.impressions ? node.link_clicks / node.impressions * 100 : 0,
    meta_roas: node.spend_usd ? node.meta_revenue_usd / node.spend_usd : 0,
    true_shopify_sales: trueSales,
    true_shopify_revenue_usd: trueRevenue,
    inferred_shopify_sales: inferredSales,
    inferred_shopify_revenue_usd: inferredRevenue,
    true_roas: node.spend_usd ? trueRevenue / node.spend_usd : 0,
    inferred_roas: node.spend_usd ? inferredRevenue / node.spend_usd : 0,
    inference_notes: [...node.inference_notes],
  };
  out.adsets = [...node.adsets.values()].map(finalizeNode).sort((a, b) => b.spend_usd - a.spend_usd);
  out.ads = [...node.ads.values()].map(finalizeNode).sort((a, b) => b.spend_usd - a.spend_usd);
  return out;
}

function findByHint(hint, rows, idKey, nameKey) {
  const h = norm(hint);
  if (!h) return null;
  return rows.find((row) => String(row[idKey] || '') === String(hint))
    || rows.find((row) => norm(row[nameKey]) === h)
    || rows.find((row) => norm(row[nameKey]).includes(h) || h.includes(norm(row[nameKey])));
}

function dominantCampaignByCountry(metaRows) {
  const byCountry = new Map();
  for (const row of metaRows || []) {
    if (!row.country_code || !row.campaign_id) continue;
    const country = byCountry.get(row.country_code) || new Map();
    const key = row.campaign_id;
    const current = country.get(key) || { campaign_id: row.campaign_id, campaign_name: row.campaign_name, spend_usd: 0 };
    current.spend_usd += n(row.spend_usd);
    country.set(key, current);
    byCountry.set(row.country_code, country);
  }
  const out = new Map();
  for (const [country, campaigns] of byCountry.entries()) {
    const list = [...campaigns.values()].sort((a, b) => b.spend_usd - a.spend_usd);
    const total = list.reduce((sum, row) => sum + row.spend_usd, 0);
    const top = list[0];
    const share = total ? top.spend_usd / total : 0;
    out.set(country, { ...top, share, total_spend_usd: total, ambiguous: share < DOMINANT_COUNTRY_CAMPAIGN_SHARE, candidates: list });
  }
  return out;
}

function productCandidates(metaRows, campaignId, countryCode, family, subtype) {
  const grouped = new Map();
  for (const row of metaRows || []) {
    if (campaignId && row.campaign_id !== campaignId) continue;
    if (countryCode && row.country_code !== countryCode) continue;
    if (row.product_family !== family || row.product_subtype !== subtype) continue;
    if (!row.ad_id) continue;
    const key = row.ad_id;
    const cur = grouped.get(key) || {
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      adset_id: row.adset_id,
      adset_name: row.adset_name,
      ad_id: row.ad_id,
      ad_name: row.ad_name,
      spend_usd: 0,
    };
    cur.spend_usd += n(row.spend_usd);
    grouped.set(key, cur);
  }
  const list = [...grouped.values()].sort((a, b) => b.spend_usd - a.spend_usd);
  const total = list.reduce((sum, row) => sum + row.spend_usd, 0);
  const top = list[0];
  const share = total && top ? top.spend_usd / total : 0;
  return { top, list, total, share, unique: Boolean(top && (list.length === 1 || share >= DOMINANT_PRODUCT_AD_SHARE)) };
}

export function buildCampaignAttribution(meta, shopify) {
  const metaRows = meta?.ad_country_daily || [];
  const campaigns = new Map();
  const campaignRows = [];
  const adsetRows = [];
  const adRows = [];

  function getCampaign(row) {
    const key = row.campaign_id || row.campaign_name;
    if (!campaigns.has(key)) campaigns.set(key, emptyNode('campaign', { campaign_id: row.campaign_id, campaign_name: row.campaign_name }));
    return campaigns.get(key);
  }
  function getAdset(campaign, row) {
    const key = row.adset_id || keyFor([row.campaign_id, row.adset_name]);
    if (!campaign.adsets.has(key)) campaign.adsets.set(key, emptyNode('adset', { campaign_id: row.campaign_id, campaign_name: row.campaign_name, adset_id: row.adset_id, adset_name: row.adset_name }));
    return campaign.adsets.get(key);
  }
  function getAd(adset, row) {
    const key = row.ad_id || keyFor([row.adset_id, row.ad_name]);
    if (!adset.ads.has(key)) adset.ads.set(key, emptyNode('ad', { campaign_id: row.campaign_id, campaign_name: row.campaign_name, adset_id: row.adset_id, adset_name: row.adset_name, ad_id: row.ad_id, ad_name: row.ad_name, product_family: row.product_family, product_subtype: row.product_subtype }));
    return adset.ads.get(key);
  }

  for (const row of metaRows) {
    const campaign = getCampaign(row);
    const adset = getAdset(campaign, row);
    const ad = getAd(adset, row);
    addMetaMetrics(campaign, row);
    addMetaMetrics(adset, row);
    addMetaMetrics(ad, row);
    campaignRows.push(row);
    adsetRows.push(row);
    adRows.push(row);
  }

  const countryCampaigns = dominantCampaignByCountry(metaRows);
  const unresolved = [];

  for (const line of shopify?.order_lines || []) {
    const attribution = line.attribution || {};
    const directCampaign = findByHint(attribution.campaign_hint, campaignRows, 'campaign_id', 'campaign_name');
    const countryCampaign = countryCampaigns.get(line.country_code);
    const campaignRow = directCampaign || (!countryCampaign?.ambiguous ? countryCampaign : null);

    if (!campaignRow) {
      unresolved.push({ line, reason: countryCampaign?.ambiguous ? 'country_has_multiple_campaigns' : 'no_country_campaign' });
      continue;
    }

    const campaign = campaigns.get(campaignRow.campaign_id || campaignRow.campaign_name);
    if (!campaign) continue;
    const campaignBucket = directCampaign ? 'shopify_direct' : 'shopify_country';
    addShopify(campaign, campaignBucket, line);
    if (!directCampaign && countryCampaign?.share) campaign.inference_notes.add(`${line.country_code}: country assigned to ${campaign.campaign_name} (${Math.round(countryCampaign.share * 100)}% Meta spend share)`);

    const directAd = findByHint(attribution.ad_hint, adRows, 'ad_id', 'ad_name');
    const directAdset = findByHint(attribution.adset_hint, adsetRows, 'adset_id', 'adset_name') || (directAd ? directAd : null);
    if (directAd && directAd.campaign_id === campaign.campaign_id) {
      const adset = getAdset(campaign, directAd);
      const ad = getAd(adset, directAd);
      addShopify(adset, 'shopify_direct', line);
      addShopify(ad, 'shopify_direct', line);
      continue;
    }
    if (directAdset && directAdset.campaign_id === campaign.campaign_id) {
      const adset = getAdset(campaign, directAdset);
      addShopify(adset, 'shopify_direct', line);
      continue;
    }

    const candidates = productCandidates(metaRows, campaign.campaign_id, line.country_code, line.family, line.subtype);
    if (candidates.unique && candidates.top) {
      const adset = getAdset(campaign, candidates.top);
      const ad = getAd(adset, candidates.top);
      addShopify(adset, 'shopify_product_inferred', line);
      addShopify(ad, 'shopify_product_inferred', line);
      adset.inference_notes.add(`${line.product}: product-only inferred to ${candidates.top.ad_name} (${Math.round(candidates.share * 100)}% matching spend)`);
      ad.inference_notes.add(`${line.product}: product-only inferred (${Math.round(candidates.share * 100)}% matching spend)`);
    } else {
      addShopify(campaign, 'unresolved', line);
      campaign.inference_notes.add(`${line.product}: unresolved ad mapping (${candidates.list.length || 0} matching ads)`);
      unresolved.push({ line, reason: 'ambiguous_product_to_ad', candidates: candidates.list.slice(0, 6) });
    }
  }

  return {
    campaigns: [...campaigns.values()].map(finalizeNode).sort((a, b) => b.spend_usd - a.spend_usd),
    unresolved,
    country_campaign_map: [...countryCampaigns.entries()].map(([country_code, row]) => ({ country_code, ...row })),
  };
}
