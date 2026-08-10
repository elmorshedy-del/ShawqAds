import fs from 'node:fs';
const T=process.env.SHAWQ_META_TOKEN, A=String(process.env.SHAWQ_META_ID).replace(/^act_/,'');
const IDS=process.env.CIDS.split(',');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rows=[];
for(const cid of IDS){
  const p=new URLSearchParams({level:'ad',breakdowns:'country',time_increment:'all_days',
    fields:'campaign_name,adset_name,ad_id,ad_name,spend,impressions,inline_link_clicks,ctr,cpm,actions,action_values',
    time_range:JSON.stringify({since:'2026-01-01',until:'2026-08-10'}),limit:'400',access_token:T});
  const r=await fetch(`https://graph.facebook.com/v20.0/${cid}/insights?${p}`);
  const j=await r.json();
  if(j.error){console.error(cid,j.error.message);continue;}
  rows.push(...(j.data||[])); await sleep(400);
}
const act=(a,t)=>{const h=(a||[]).find(x=>x.action_type===t);return h?+h.value:0;};
fs.writeFileSync('meta-ads-uk2.json',JSON.stringify(rows.map(r=>({
  camp:r.campaign_name,adset:r.adset_name,ad_id:r.ad_id,ad:r.ad_name,cc:r.country,
  spend:+r.spend,imp:+r.impressions,lc:+(r.inline_link_clicks||0),cpm:+r.cpm,
  atc:act(r.actions,'add_to_cart')||act(r.actions,'omni_add_to_cart'),
  pur:act(r.actions,'purchase')||act(r.actions,'omni_purchase'),
  pv:act(r.action_values,'purchase')||act(r.action_values,'omni_purchase')}))));
console.error('ad rows',rows.length);
