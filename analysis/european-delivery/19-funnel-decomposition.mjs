import fs from 'node:fs';
const m=JSON.parse(fs.readFileSync('meta-country-daily.json','utf8'));
const cfg=JSON.parse(fs.readFileSync('meta-config.json','utf8'));
const fx=JSON.parse(fs.readFileSync('fx-try-usd.json','utf8'));
const fxd=Object.keys(fx.rates).sort();
const usd=(d)=>{let lo=0,hi=fxd.length-1,b=fxd[0]; while(lo<=hi){const mid=(lo+hi)>>1; if(fxd[mid]<=d){b=fxd[mid];lo=mid+1}else hi=mid-1;} return fx.rates[b].USD;};
const f=(n,d=2)=>Number.isFinite(n)?Number(n.toFixed(d)):0;

// ROAS = (1000/CPM_usd) x CTR x ATC/click x purchase/ATC x AOV_usd
function decompose(rows){
  const sp=rows.reduce((s,r)=>s+r.spend*usd(r.date),0);
  const imp=rows.reduce((s,r)=>s+r.impressions,0);
  const lc=rows.reduce((s,r)=>s+r.link_clicks,0);
  const atc=rows.reduce((s,r)=>s+r.add_to_cart,0);
  const pur=rows.reduce((s,r)=>s+r.purchases,0);
  const pv=rows.reduce((s,r)=>s+r.purchase_value*usd(r.date),0);
  return {spend:sp,cpm:1000*sp/imp,ctr:lc/imp,atcRate:atc/(lc||1),purPerAtc:pur/(atc||1),
    aov:pur?pv/pur:0,roas:pv/sp,imp,lc,atc,pur};
}
const show=(title,groups)=>{
  console.log(`\n=== ${title} ===`);
  console.log('ROAS = (1000/CPM) x CTR x ATC-per-click x purchases-per-ATC x AOV   [all USD]');
  const base=groups[0][1];
  console.table(groups.map(([name,d])=>({
    campaign:name.slice(0,22), roas:f(d.roas,2),
    cpm_usd:f(d.cpm,2), ctr_pct:f(100*d.ctr,2), atc_per_click:f(d.atcRate,3),
    pur_per_atc:f(d.purPerAtc,3), aov_usd:f(d.aov,0),
    'vs_best_CPM':f(base.cpm/d.cpm,2)+'x', 'vs_best_CTR':f(d.ctr/base.ctr,2)+'x',
    'vs_best_ATC':f(d.atcRate/base.atcRate,2)+'x', 'vs_best_PUR/ATC':f(d.purPerAtc/base.purPerAtc,2)+'x',
    'vs_best_AOV':f(d.aov/base.aov,2)+'x'})));
};

const gb=(name)=>m.country_daily.filter(r=>r.campaign_name===name&&r.country==='GB'&&r.spend>0);
show('UK AUTOPSY — which link in the chain broke? (ordered best to worst)',
  [['Scaling_UK_ASC2',decompose(gb('Scaling_UK_ASC2'))],
   ['UK_ABO',decompose(gb('UK_ABO'))],
   ['UK1_ASC',decompose(gb('UK1_ASC'))],
   ['UK_ASC (Jul-Aug)',decompose(gb('UK_ASC').filter(r=>r.date>='2026-07-01'))],
   ['UK_CBO',decompose(gb('UK_CBO'))],
   ['UK1_ASC3',decompose(gb('UK1_ASC3'))],
   ['UK_Skirts_ASC',decompose(gb('UK_Skirts_ASC'))]]);

// CH_AT_NOR as a whole campaign, vs the campaigns CH earned in
const all=(name)=>m.country_daily.filter(r=>r.campaign_name===name&&r.spend>0);
show('CH_AT_NOR_ASC vs the campaigns Switzerland earned in (whole campaign, all countries)',
  [['Scaling_Euro_Campaign',decompose(all('Scaling_Euro_Campaign'))],
   ['Euro-Shop1',decompose(all('Euro-Shop1'))],
   ['DACH_ASC',decompose(all('DACH_ASC'))],
   ['DACH_CBO',decompose(all('DACH_CBO'))],
   ['CH_AT_NOR_ASC',decompose(all('CH_AT_NOR_ASC'))],
   ['CH_ASC',decompose(all('CH_ASC'))]]);

// what did CH_AT_NOR actually contain?
console.log('\n=== CH_AT_NOR_ASC — full breakdown by country ===');
const t=[];
for(const r of all('CH_AT_NOR_ASC')){ const k=r.country;
  const v=t.find(x=>x.cc===k)||{cc:k,spend:0,imp:0,lc:0,atc:0,pur:0,pv:0,days:new Set()};
  if(!t.includes(v)) t.push(v);
  v.spend+=r.spend; v.imp+=r.impressions; v.lc+=r.link_clicks; v.atc+=r.add_to_cart; v.pur+=r.purchases; v.pv+=r.purchase_value; v.days.add(r.date);}
console.table(t.map(v=>({cc:v.cc,days:v.days.size,spend_try:f(v.spend,0),impressions:v.imp,link_clicks:v.lc,
  atc:v.atc,purchases:v.pur,roas:f(v.pv/v.spend,2),cpm_try:f(1000*v.spend/v.imp,0)})).sort((a,b)=>b.spend_try-a.spend_try));
