import { buildCampaignAttribution } from '../src/lib/campaignAttribution.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const meta = {
  ad_daily: [
    {
      date: '2026-06-22',
      campaign_id: 'camp_1',
      campaign_name: 'USA_CBO',
      adset_id: 'adset_1',
      adset_name: 'Prospecting',
      ad_id: 'ad_1',
      ad_name: 'Skirt creative',
      product_family: 'Skirts',
      product_subtype: 'Skirt',
      spend_usd: 100,
      impressions: 1000,
      link_clicks: 40,
      add_to_cart: 8,
      checkout_initiated: 4,
      purchases: 2,
      purchase_value_usd: 180,
    },
    {
      date: '2026-06-22',
      campaign_id: 'camp_1',
      campaign_name: 'USA_CBO',
      adset_id: 'adset_2',
      adset_name: 'Retargeting',
      ad_id: 'ad_2',
      ad_name: 'Hoodie creative',
      product_family: 'Hoodies',
      product_subtype: 'Hoodie',
      spend_usd: 75,
      impressions: 500,
      link_clicks: 25,
      add_to_cart: 6,
      checkout_initiated: 3,
      purchases: 1,
      purchase_value_usd: 90,
    },
  ],
  // Simulates a sparse country breakdown: only one ad appears here even though
  // Ad Manager's normal ad-level report has both ads above.
  ad_country_daily: [
    {
      date: '2026-06-22',
      country_code: 'US',
      country: 'United States',
      campaign_id: 'camp_1',
      campaign_name: 'USA_CBO',
      adset_id: 'adset_1',
      adset_name: 'Prospecting',
      ad_id: 'ad_1',
      ad_name: 'Skirt creative',
      product_family: 'Skirts',
      product_subtype: 'Skirt',
      spend_usd: 100,
      impressions: 1000,
      link_clicks: 40,
      add_to_cart: 8,
      checkout_initiated: 4,
      purchases: 2,
      purchase_value_usd: 180,
    },
  ],
};

const shopify = {
  order_lines: [
    {
      date: '2026-06-22',
      country_code: 'US',
      product: 'Hoodie',
      family: 'Hoodies',
      subtype: 'Hoodie',
      quantity: 1,
      line_revenue_usd: 90,
      attribution: {
        match_hints: {
          campaign_id: 'camp_1',
          ad_id: 'ad_2',
        },
      },
    },
  ],
};

const attribution = buildCampaignAttribution(meta, shopify);
const campaign = attribution.campaigns.find((row) => row.campaign_id === 'camp_1');
const adsetIds = new Set((campaign?.adsets || []).map((row) => row.adset_id));
const retargeting = (campaign?.adsets || []).find((row) => row.adset_id === 'adset_2');
const hoodieAd = retargeting?.ads?.find((row) => row.ad_id === 'ad_2');

assert(campaign, 'Expected campaign from ad_daily rows.');
assert(adsetIds.has('adset_1'), 'Expected country-breakdown ad set to remain in the tree.');
assert(adsetIds.has('adset_2'), 'Expected ad_daily-only ad set to appear in the campaign tree.');
assert(hoodieAd?.true_shopify_sales === 1, 'Expected direct Shopify ad hint to attach to the ad_daily-only ad.');
assert(campaign.spend_usd === 175, 'Expected campaign spend to come from no-breakdown ad_daily rows, not sparse country rows.');

console.log('campaign attribution checks passed');
