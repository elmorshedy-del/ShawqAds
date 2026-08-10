import fs from 'node:fs';
const cfg=JSON.parse(fs.readFileSync('meta-config.json','utf8'));
const m=JSON.parse(fs.readFileSync('meta-country-daily.json','utf8'));
const f=(n,d=2)=>Number.isFinite(n)?Number(n.toFixed(d)):0;
const NAME=new Map(cfg.campaigns.map(c=>[c.id,c.name]));

// --- A. Which "UK" campaigns were actually UK-only? (by delivery, not by name) ---
console.log('=== A. WAS THE UK EVER ACTUALLY ALONE? (share of campaign spend by country) ===');
const byCamp=new Map();
for(const r of m.country_daily){ if(r.spend<=0) continue;
  const v=byCamp.get(r.campaign_name)||{}; v[r.country]=(v[r.country]||0)+r.spend; byCamp.set(r.campaign_name,v);}
const UK=['Scaling_UK_ASC2','Scaling_UK_ASC','UK_ABO','Testing_UK_ABO','UK_ASC','UK1_ASC','UK1_ASC3','UK_CBO','UK_Skirts_ASC'];
const t=[];
for(const n of UK){ const v=byCamp.get(n); if(!v) continue;
  const tot=Object.values(v).reduce((a,b)=>a+b,0);
  const mix=Object.entries(v).sort((a,b)=>b[1]-a[1]).map(([c,s])=>`${c} ${f(100*s/tot,0)}%`);
  t.push({campaign:n,gb_share:f(100*(v.GB||0)/tot,0)+'%',countries:Object.keys(v).length,mix:mix.slice(0,4).join('  ')});}
console.table(t);

// --- B. Placement mix for the focus campaigns ---
const pl=cfg.breakdowns?.['publisher_platform,platform_position']||[];
const act=(a,ty)=>{const h=(a||[]).find(x=>x.action_type===ty); return h?+h.value:0;};
const agg=new Map();
for(const r of pl){ const k=r.campaign_id+'|'+r.publisher_platform+'|'+r.platform_position;
  agg.set(k,{camp:NAME.get(r.campaign_id)||r.campaign_name,plat:r.publisher_platform,pos:r.platform_position,
    spend:+r.spend,imp:+r.impressions,pur:act(r.actions,'purchase'),pv:act(r.action_values,'purchase'),
    lc:+(r.inline_link_clicks||0)});}
console.log('\n=== B. PLACEMENT MIX — where did the money actually go? (UK campaigns) ===');
const wanted=['Scaling_UK_ASC2','UK_ABO','UK_ASC','UK_CBO','UK1_ASC3','UK_Skirts_ASC'];
for(const w of wanted){
  const rs=[...agg.values()].filter(v=>v.camp===w); if(!rs.length) continue;
  const tot=rs.reduce((s,v)=>s+v.spend,0);
  const top=rs.sort((a,b)=>b.spend-a.spend).slice(0,5)
    .map(v=>`${v.plat}:${v.pos} ${f(100*v.spend/tot,0)}% (cpm ${f(1000*v.spend/(v.imp||1),0)}, roas ${f(v.pv/v.spend,2)})`);
  console.log(`${w.padEnd(18)} ${top.join(' | ')}`);
}

// --- C. Reels/story share vs outcome, across all focus campaigns ---
console.log('\n=== C. FEED vs REELS/STORY share against campaign ROAS ===');
const byC=new Map();
for(const v of agg.values()){ const o=byC.get(v.camp)||{spend:0,pv:0,reels:0,feed:0};
  o.spend+=v.spend; o.pv+=v.pv;
  if(/reels|story|stories/i.test(v.pos)) o.reels+=v.spend; if(/feed/i.test(v.pos)) o.feed+=v.spend;
  byC.set(v.camp,o);}
console.table([...byC].filter(([,o])=>o.spend>5000).map(([c,o])=>({campaign:c.slice(0,24),spend:f(o.spend,0),
  roas:f(o.pv/o.spend,2),reels_story_pct:f(100*o.reels/o.spend,0),feed_pct:f(100*o.feed/o.spend,0)}))
  .sort((a,b)=>b.roas-a.roas));
