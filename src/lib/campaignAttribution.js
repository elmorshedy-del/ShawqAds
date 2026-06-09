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
    inferred_warning_sales: 0,
    inferred_warning_revenue_usd: 0,
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

function addInferredWarning(node, line) {
  node.inferred_warning_sales += n(line.quantity) || 1;
  node.inferred_warning_revenue_usd += n(line.line_revenue_usd);
}

function finalizeNode(node) {
  const trueRevenue = node.shopify_direct_revenue_usd + node.shopify_country_revenue_usd;
  const inferredRevenue = trueRevenue + node.shopify_product_inferred_revenue_usd;
  const trueSales = node.shopify_direct_sales + node.shopify_country_sales;
  const inferredSales = trueSales + node.shopify_product_inferred_sales;
  const salesGap = Math.max(0, node.meta_sales - inferredSales);
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
    has_inferred_sales: node.shopify_product_inferred_sales > 0,
    has_best_fit_inference: node.inferred_warning_sales > 0,
    meta_sales_over_shopify_sales: salesGap,
    has_sales_gap: salesGap > 0,
    inference_notes: [...node.inference_notes],
  };
  out.adsets = [...node.adsets.values()].map(finalizeNode).sort((a, b) => b.spend_usd - a.spend_usd);
  out.ads = [...node.ads.values()].map(finalizeNode).sort((a, b) => b.spend_usd - a.spend_usd);
  return out;
}

function uniqueRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const key = keyFor([row.campaign_id, row.adset_id, row.ad_id, row.campaign_name, row.adset_name, row.ad_name, row.country_code]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function exactHintCandidates(hint, rows, idKey, nameKey) {
  const raw = String(hint || '').trim();
  const h = norm(raw);
  if (!h) return [];
  return uniqueRows((rows || []).filter((row) => {
    const rowId = String(row[idKey] || '').trim();
    const rowName = norm(row[nameKey]);
    return (rowId && rowId === raw) || (rowName && rowName === h);
  }));
}

function bestBySpend(rows) {
  return [...(rows || [])].sort((a, b) => n(b.spend_usd) - n(a.spend_usd))[0] || null;
}

function scopedRows(rows, campaign, line, extra = {}) {
  return (rows || []).filter((row) => {
    if (campaign?.campaign_id && row.campaign_id !== campaign.campaign_id) return false;
    if (campaign?.campaign_name && !campaign.campaign_id && row.campaign_name !== campaign.campaign_name) return false;
    if (line?.country_code && row.country_code && row.country_code !== line.country_code) return false;
    if (extra.adset_id && row.adset_id !== extra.adset_id) return false;
    return true;
  });
}

function matchFromHints(hints, rows, idKey, nameKey) {
  const candidates = hints.flatMap((hint) => exactHintCandidates(hint, rows, idKey, nameKey));
  return bestBySpend(candidates);
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

function productCandidates(metaRows, campaignId, countryCode, family, subtype, options = {}) {
  const familyOnly = Boolean(options.familyOnly || !subtype);
  const grouped = new Map();
  for (const row of metaRows || []) {
    if (campaignId && row.campaign_id !== campaignId) continue;
    if (countryCode && row.country_code !== countryCode) continue;
    if (row.product_family !== family) continue;
    if (!familyOnly && row.product_subtype !== subtype) continue;
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

function bestInferredCandidate(metaRows, campaignId, countryCode, family, subtype) {
  const exact = productCandidates(metaRows, campaignId, countryCode, family, subtype);
  if (exact.top) return { ...exact, mode: exact.unique ? 'product-only' : 'best-fit product' };
  if (family && family !== 'Other') {
    const familyCandidates = productCandidates(metaRows, campaignId, countryCode, family, null, { familyOnly: true });
    if (familyCandidates.top) return { ...familyCandidates, mode: familyCandidates.unique ? 'family-only' : 'best-fit family' };
  }
  return { top: null, list: [], total: 0, share: 0, unique: false, mode: 'unmapped' };
}

function collectSalesGaps(nodes, out = [], path = []) {
  for (const node of nodes || []) {
    const label = node.type === 'ad'
      ? (node.ad_name || 'Unknown ad')
      : node.type === 'adset'
        ? (node.adset_name || 'Unknown ad set')
        : (node.campaign_name || node.type || 'Unknown');
    const nextPath = [...path, label];
    if (node.has_sales_gap) {
      out.push({
        type: node.type,
        name: label,
        path: nextPath.join(' / '),
        campaign_name: node.campaign_name || '',
        adset_name: node.adset_name || '',
        ad_name: node.ad_name || '',
        meta_sales: node.meta_sales,
        inferred_shopify_sales: node.inferred_shopify_sales,
        true_shopify_sales: node.true_shopify_sales,
        meta_sales_over_shopify_sales: node.meta_sales_over_shopify_sales,
      });
    }
    collectSalesGaps(node.adsets || [], out, nextPath);
    collectSalesGaps(node.ads || [], out, nextPath);
  }
  return out;
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
    const directCampaign = matchFromHints([
      attribution.match_hints?.campaign_id,
      attribution.campaign_hint,
      attribution.match_hints?.campaign_name,
    ], campaignRows, 'campaign_id', 'campaign_name');
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

    const scopedAdsets = scopedRows(adsetRows, campaign, line);
    const directAdset = matchFromHints([
      attribution.match_hints?.adset_id,
      attribution.adset_hint,
      attribution.match_hints?.adset_name,
    ], scopedAdsets, 'adset_id', 'adset_name');
    const scopedAds = scopedRows(adRows, campaign, line, directAdset?.adset_id ? { adset_id: directAdset.adset_id } : {});
    const directAd = matchFromHints([
      attribution.match_hints?.ad_id,
      attribution.ad_hint,
      attribution.match_hints?.ad_name,
    ], scopedAds, 'ad_id', 'ad_name');

    if (directAd) {
      const adset = getAdset(campaign, directAd);
      const ad = getAd(adset, directAd);
      addShopify(adset, 'shopify_direct', line);
      addShopify(ad, 'shopify_direct', line);
      continue;
    }
    if (directAdset) {
      const adset = getAdset(campaign, directAdset);
      addShopify(adset, 'shopify_direct', line);
      continue;
    }

    const candidates = bestInferredCandidate(metaRows, campaign.campaign_id, line.country_code, line.family, line.subtype);
    if (candidates.top) {
      const adset = getAdset(campaign, candidates.top);
      const ad = getAd(adset, candidates.top);
      addShopify(adset, 'shopify_product_inferred', line);
      addShopify(ad, 'shopify_product_inferred', line);
      if (!candidates.unique) {
        addInferredWarning(adset, line);
        addInferredWarning(ad, line);
      }
      const candidateText = candidates.list.length > 1 ? `; ${candidates.list.length} candidates` : '';
      adset.inference_notes.add(`${line.product}: ${candidates.mode} inferred to ${candidates.top.ad_name} (${Math.round(candidates.share * 100)}% matching spend${candidateText})`);
      ad.inference_notes.add(`${line.product}: ${candidates.mode} inferred (${Math.round(candidates.share * 100)}% matching spend${candidateText})`);
    } else {
      addShopify(campaign, 'unresolved', line);
      campaign.inference_notes.add(`${line.product}: unresolved ad mapping (${candidates.list.length || 0} matching ads)`);
      unresolved.push({ line, reason: 'no_product_ad_candidate', candidates: candidates.list.slice(0, 6) });
    }
  }

  const finalizedCampaigns = [...campaigns.values()].map(finalizeNode).sort((a, b) => b.spend_usd - a.spend_usd);
  return {
    campaigns: finalizedCampaigns,
    unresolved,
    sales_gaps: collectSalesGaps(finalizedCampaigns),
    country_campaign_map: [...countryCampaigns.entries()].map(([country_code, row]) => ({ country_code, ...row })),
  };
}
