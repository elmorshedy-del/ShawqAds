// Pull Meta country x day insights from 2026-01-01 -> today.
// Writes raw rows to ./data (gitignored). Does NOT touch public/data/*.json.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOKEN = process.env.SHAWQ_META_TOKEN || process.env.SHAWQ_META_ACCESS_TOKEN;
const ACCT = String(process.env.SHAWQ_META_ID || process.env.SHAWQ_META_AD_ACCOUNT_ID || '').replace(/^act_/, '');
const V = process.env.META_GRAPH_VERSION || 'v20.0';
const OUT = process.argv[2]
  || process.env.ANALYSIS_DATA_DIR && `${process.env.ANALYSIS_DATA_DIR}/meta-country-daily.json`
  || fileURLToPath(new URL('./data/meta-country-daily.json', import.meta.url));
const SINCE = process.env.PULL_SINCE || '2026-01-01';
const UNTIL = process.env.PULL_UNTIL || new Date().toISOString().slice(0, 10);
const LEVEL = process.env.PULL_LEVEL || 'adset';

const FIELDS = [
  'date_start', 'date_stop', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name',
  'spend', 'impressions', 'reach', 'frequency', 'clicks', 'inline_link_clicks',
  'cpm', 'ctr', 'cpc', 'actions', 'action_values', 'objective', 'optimization_goal',
].join(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, attempt = 0) {
  const res = await fetch(url);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: { message: text.slice(0, 400) } }; }
  if (!res.ok || json.error) {
    const code = json?.error?.code;
    const transient = res.status >= 500 || code === 1 || code === 2 || code === 4 || code === 17 || code === 32 || code === 613;
    if (transient && attempt < 6) {
      const wait = Math.min(60000, 3000 * 2 ** attempt);
      console.error(`  retry ${attempt + 1} in ${wait}ms (code ${code}): ${json?.error?.message?.slice(0, 120)}`);
      await sleep(wait);
      return getJson(url, attempt + 1);
    }
    throw new Error(`Meta API ${res.status} code=${code}: ${json?.error?.message || text.slice(0, 300)}`);
  }
  return json;
}

// Month chunks keep each insights request small enough to stay synchronous.
function monthChunks(since, until) {
  const out = [];
  let cur = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  while (cur <= end) {
    const s = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), 1));
    const e = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    out.push({
      since: (s < new Date(`${since}T00:00:00Z`) ? since : s.toISOString().slice(0, 10)),
      until: (e > end ? until : e.toISOString().slice(0, 10)),
    });
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return out;
}

function pickAction(actions, type) {
  if (!Array.isArray(actions)) return 0;
  const hit = actions.find((a) => a.action_type === type);
  return hit ? Number(hit.value) || 0 : 0;
}

async function pullWindow({ since, until }, breakdown) {
  const params = new URLSearchParams({
    level: LEVEL,
    fields: FIELDS,
    time_increment: '1',
    time_range: JSON.stringify({ since, until }),
    limit: '500',
    access_token: TOKEN,
  });
  if (breakdown) params.set('breakdowns', breakdown);
  let url = `https://graph.facebook.com/${V}/act_${ACCT}/insights?${params}`;
  const rows = [];
  let page = 0;
  while (url) {
    const json = await getJson(url);
    for (const r of json.data || []) {
      rows.push({
        date: r.date_start,
        country: r.country || null,
        campaign_id: r.campaign_id, campaign_name: r.campaign_name,
        adset_id: r.adset_id, adset_name: r.adset_name,
        objective: r.objective || null, optimization_goal: r.optimization_goal || null,
        spend: Number(r.spend) || 0,
        impressions: Number(r.impressions) || 0,
        reach: Number(r.reach) || 0,
        frequency: Number(r.frequency) || 0,
        clicks: Number(r.clicks) || 0,
        link_clicks: Number(r.inline_link_clicks) || 0,
        cpm: Number(r.cpm) || 0,
        ctr: Number(r.ctr) || 0,
        cpc: Number(r.cpc) || 0,
        purchases: pickAction(r.actions, 'purchase') || pickAction(r.actions, 'omni_purchase'),
        purchase_value: pickAction(r.action_values, 'purchase') || pickAction(r.action_values, 'omni_purchase'),
        add_to_cart: pickAction(r.actions, 'add_to_cart') || pickAction(r.actions, 'omni_add_to_cart'),
        checkout_initiated: pickAction(r.actions, 'initiate_checkout') || pickAction(r.actions, 'omni_initiated_checkout'),
        landing_page_views: pickAction(r.actions, 'landing_page_view'),
        page_engagement: pickAction(r.actions, 'page_engagement'),
      });
    }
    url = json.paging?.next || null;
    page += 1;
    if (page > 200) break;
    if (url) await sleep(400);
  }
  return rows;
}

const chunks = monthChunks(SINCE, UNTIL);
console.error(`Meta pull: act_${ACCT} ${SINCE}..${UNTIL} level=${LEVEL} — ${chunks.length} month chunks`);

const byCountry = [];
for (const c of chunks) {
  const rows = await pullWindow(c, 'country');
  console.error(`  country ${c.since}..${c.until}: ${rows.length} rows`);
  byCountry.push(...rows);
  await sleep(700);
}

const noBreakdown = [];
for (const c of chunks) {
  const rows = await pullWindow(c, null);
  console.error(`  plain   ${c.since}..${c.until}: ${rows.length} rows`);
  noBreakdown.push(...rows);
  await sleep(700);
}

fs.writeFileSync(OUT, JSON.stringify({
  pulled_at: new Date().toISOString(),
  account_id: `act_${ACCT}`,
  level: LEVEL,
  since: SINCE, until: UNTIL,
  country_daily: byCountry,
  adset_daily: noBreakdown,
}, null, 0));
console.error(`\nWrote ${OUT}: ${byCountry.length} country rows, ${noBreakdown.length} adset rows`);
