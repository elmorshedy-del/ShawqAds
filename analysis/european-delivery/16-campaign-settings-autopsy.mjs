import fs from 'node:fs';
const cfg=JSON.parse(fs.readFileSync('meta-config.json','utf8'));
const m=JSON.parse(fs.readFileSync('meta-country-daily.json','utf8'));
const rows=m.country_daily.filter(r=>r.spend>0);
const camps=new Map(cfg.campaigns.map(c=>[c.id,c]));
const adsetsBy=new Map(); for(const a of cfg.adsets){ (adsetsBy.get(a.campaign_id)||adsetsBy.set(a.campaign_id,[]).get(a.campaign_id)).push(a); }
const f=(n,d=2)=>Number.isFinite(n)?Number(n.toFixed(d)):0;

const UK=['Scaling_UK_ASC2','Scaling_UK_ASC','UK_ABO','Testing_UK_ABO','UK_ASC','UK1_ASC','UK1_ASC3','UK_CBO','UK_Skirts_ASC','UK Campaign','UK_SKIRTS'];
const perf=new Map();
for(const r of rows){ if(r.country!=='GB') continue;
  const v=perf.get(r.campaign_name)||{cid:r.campaign_id,spend:0,pv:0,pur:0,lc:0,imp:0,atc:0,d:new Set()};
  v.spend+=r.spend; v.pv+=r.purchase_value; v.pur+=r.purchases; v.lc+=r.link_clicks; v.imp+=r.impressions; v.atc+=r.add_to_cart; v.d.add(r.date); perf.set(r.campaign_name,v);}

console.log('=== UK CAMPAIGN AUTOPSY — every UK-only campaign with its actual settings ===');
const out=[];
for(const name of UK){ const p=perf.get(name); if(!p) continue;
  const c=camps.get(p.cid)||{}; const ads=(adsetsBy.get(p.cid)||[]);
  const a=ads[0]||{};
  const tg=a.targeting||{};
  const adv=tg.targeting_automation?.advantage_audience;
  const geo=(tg.geo_locations?.countries||[]).join('/');
  const interests=(tg.flexible_spec||tg.interests)?'interest-targeted':'broad';
  const budgets=ads.map(x=>x.daily_budget?+x.daily_budget/100:null).filter(Boolean);
  out.push({campaign:name.slice(0,20),
    roas:f(p.pv/p.spend,2), pur:p.pur, days:p.d.size, try_day:f(p.spend/p.d.size,0),
    atc_per_click:f(p.atc/(p.lc||1),3), cpm:f(1000*p.spend/p.imp,0),
    objective:(c.objective||'').replace('OUTCOME_',''), buying:c.buying_type||'',
    camp_bid:(c.bid_strategy||'—').replace('LOWEST_COST_','LC_').replace('WITHOUT_CAP','NOCAP').replace('WITH_BID_CAP','BIDCAP').replace('WITH_MIN_ROAS','MINROAS'),
    cbo: c.daily_budget?`CBO ${f(+c.daily_budget/100,0)}`:'ABO',
    adsets:ads.length, opt:(a.optimization_goal||'').replace('OFFSITE_','').replace('CONVERSIONS','CONV'),
    adset_bid:(a.bid_strategy||'—').replace('LOWEST_COST_','LC_').replace('WITHOUT_CAP','NOCAP').replace('WITH_BID_CAP','BIDCAP').replace('WITH_MIN_ROAS','MINROAS'),
    roas_floor:a.bid_amount?f(+a.bid_amount/100,2):(a.bid_strategy||'').includes('ROAS')?'set':'—',
    geo, adv_audience:adv===1?'ON':adv===0?'off':'—', targeting:interests,
    attr:(a.attribution_spec||[]).map(x=>`${x.event_type[0]}${x.window_days}`).join('/')});}
console.table(out);
