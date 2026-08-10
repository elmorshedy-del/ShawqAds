// Diagnostic layer: campaign/adset/ad configuration + placement & demographic breakdowns.
import fs from 'node:fs';
const T = process.env.SHAWQ_META_TOKEN;
const A = String(process.env.SHAWQ_META_ID).replace(/^act_/, '');
const V = 'v20.0';
const OUT = '/tmp/claude-0/-home-user-ShawqAds/0847f968-9cb1-5c8b-b322-aaaadfdd54ed/scratchpad/meta-config.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getAll(path, fields, extra = {}) {
  const out = [];
  let url = `https://graph.facebook.com/${V}/${path}?fields=${fields}&limit=${extra.__limit || 200}&access_token=${T}`
    + Object.entries(extra).filter(([k]) => k !== '__limit').map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  let guard = 0;
  while (url && guard++ < 60) {
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) {
      if (guard < 5) { await sleep(3000 * guard); continue; }
      throw new Error(`${path}: ${j.error.message}`);
    }
    out.push(...(j.data || []));
    url = j.paging?.next || null;
    if (url) await sleep(350);
  }
  return out;
}

console.error('campaigns…');
const campaigns = await getAll(`act_${A}/campaigns`,
  'name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,budget_remaining,created_time,start_time,stop_time,special_ad_categories,buying_type');

console.error('adsets…');
const adsets = await getAll(`act_${A}/adsets`,
  'name,campaign_id,optimization_goal,billing_event,bid_strategy,bid_amount,daily_budget,lifetime_budget,'
  + 'targeting,promoted_object,attribution_spec,destination_type,status,effective_status,created_time,start_time,end_time,learning_stage_info');

console.error('ads…');
const ads = await getAll(`act_${A}/ads`,
  'name,adset_id,campaign_id,status,effective_status,created_time,creative{id,name,video_id,image_hash,effective_object_story_id}', { __limit: 40 });

fs.writeFileSync(OUT, JSON.stringify({ pulled_at: new Date().toISOString(), campaigns, adsets, ads }, null, 0));
console.error(`campaigns ${campaigns.length} | adsets ${adsets.length} | ads ${ads.length}`);

// Placement + demographic breakdowns for the campaigns under autopsy.
const FOCUS = process.env.FOCUS_CAMPAIGN_IDS ? process.env.FOCUS_CAMPAIGN_IDS.split(',') : [];
if (FOCUS.length) {
  const brk = {};
  for (const b of ['publisher_platform,platform_position', 'age,gender']) {
    const rows = [];
    for (const cid of FOCUS) {
      const p = new URLSearchParams({
        level: 'campaign', breakdowns: b, time_increment: 'all_days',
        fields: 'campaign_id,campaign_name,spend,impressions,reach,clicks,inline_link_clicks,cpm,ctr,actions,action_values',
        time_range: JSON.stringify({ since: '2026-01-01', until: '2026-08-10' }),
        limit: '500', access_token: T,
      });
      const r = await fetch(`https://graph.facebook.com/${V}/${cid}/insights?${p}`);
      const j = await r.json();
      if (j.error) { console.error(`  ${cid} ${b}: ${j.error.message}`); continue; }
      rows.push(...(j.data || []));
      await sleep(400);
    }
    brk[b] = rows;
    console.error(`breakdown ${b}: ${rows.length} rows`);
  }
  const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  prev.breakdowns = brk;
  fs.writeFileSync(OUT, JSON.stringify(prev, null, 0));
}
console.error('done');
