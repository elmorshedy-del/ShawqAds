import {metaRows,region,groupBy,f,GDPR,mean,median,sd,sum,spearman,normP} from './lib.mjs';
const rows=metaRows();
const isEU=(cc)=>GDPR.has(cc)||region(cc)==='Europe';

// ---- 7. THE JUNE RESTRUCTURE: era comparison ----
console.log('=== 7. EUROPE BY MONTH (was there a break?) ===');
const mo=new Map();
for(const r of rows){ if(!isEU(r.country)) continue; const k=r.date.slice(0,7);
  const v=mo.get(k)||{spend:0,pur:0,pv:0,imp:0,lc:0,ic:0,atc:0,camps:new Set(),adsets:new Set(),cc:new Set()};
  v.spend+=r.spend; v.pur+=r.purchases; v.pv+=r.purchase_value; v.imp+=r.impressions; v.lc+=r.link_clicks;
  v.ic+=r.checkout_initiated; v.atc+=r.add_to_cart; v.camps.add(r.campaign_name); v.adsets.add(r.adset_id); v.cc.add(r.country); mo.set(k,v);}
console.table([...mo].sort().map(([k,v])=>({month:k,spend_try:f(v.spend,0),pur:v.pur,roas:f(v.pv/v.spend,2),
  cpa_try:f(v.spend/(v.pur||1),0),cpm_try:f(1000*v.spend/v.imp,0),ctr:f(100*v.lc/v.imp,2),
  ic_to_pur:f(v.pur/(v.ic||1),3),campaigns:v.camps.size,adsets:v.adsets.size,countries:v.cc.size})));

// ---- 8. STRUCTURE: single-country vs bundled adsets (Europe only) ----
console.log('\n=== 8. DOES BUNDLING COUNTRIES INTO ONE ADSET HURT? (European adsets) ===');
const ads=new Map();
for(const r of rows){ const v=ads.get(r.adset_id)||{name:r.adset_name,camp:r.campaign_name,days:new Set(),spend:0,pur:0,pv:0,cc:{},euSpend:0};
  v.days.add(r.date); v.spend+=r.spend; v.pur+=r.purchases; v.pv+=r.purchase_value;
  v.cc[r.country]=(v.cc[r.country]||0)+r.spend; if(isEU(r.country)) v.euSpend+=r.spend; ads.set(r.adset_id,v);}
const euAds=[...ads.values()].filter(v=>v.spend>=5000 && v.euSpend/v.spend>=0.6);
// effective number of countries (inverse Herfindahl of spend share)
const effN=(cc)=>{const t=sum(Object.values(cc)); const h=sum(Object.values(cc).map(x=>(x/t)**2)); return 1/h;};
const tag=(v)=>{const n=effN(v.cc); return n<1.5?'1 country':n<2.5?'2 countries':n<4?'3-4 countries':'5+ countries';};
const gb=groupBy(euAds,tag);
console.table([...gb].map(([k,v])=>({bundle:k,adsets:v.length,total_spend:f(sum(v.map(x=>x.spend)),0),
  pooled_roas:f(sum(v.map(x=>x.pv))/sum(v.map(x=>x.spend)),2),median_adset_roas:f(median(v.map(x=>x.pv/x.spend)),2),
  pooled_cpa:f(sum(v.map(x=>x.spend))/sum(v.map(x=>x.pur))||0,0),total_pur:sum(v.map(x=>x.pur)),
  median_run_days:f(median(v.map(x=>x.days.size)),0)})).sort((a,b)=>a.bundle.localeCompare(b.bundle)));

// ---- 9. SPEND VELOCITY vs OUTCOME (Europe) ----
console.log('\n=== 9. SPEND VELOCITY vs ROAS (European adsets, >=5000 TRY) ===');
const vel=euAds.map(v=>({rate:v.spend/v.days.size,roas:v.pv/v.spend,days:v.days.size,pur:v.pur,spend:v.spend}));
const rs=spearman(vel.map(x=>x.rate),vel.map(x=>x.roas));
const rd=spearman(vel.map(x=>x.days),vel.map(x=>x.roas));
const zs=rs*Math.sqrt(vel.length-1), zd=rd*Math.sqrt(vel.length-1);
console.log(`n=${vel.length} European adsets`);
console.log(`daily spend rate  vs ROAS : spearman ${f(rs,3)}  z=${f(zs,2)}  p=${f(normP(zs),4)}`);
console.log(`run length (days) vs ROAS : spearman ${f(rd,3)}  z=${f(zd,2)}  p=${f(normP(zd),4)}`);
const q=(arr,n)=>{const s=[...arr].sort((a,b)=>a.rate-b.rate); const out=[]; const sz=Math.ceil(s.length/n);
  for(let i=0;i<n;i++){const c=s.slice(i*sz,(i+1)*sz); if(!c.length) continue;
   out.push({quartile:`Q${i+1}`,spend_rate_try_day:f(median(c.map(x=>x.rate)),0),adsets:c.length,
     pooled_roas:f(sum(c.map(x=>x.roas*x.spend))/sum(c.map(x=>x.spend)),2),
     median_days:f(median(c.map(x=>x.days)),0),total_pur:sum(c.map(x=>x.pur))});}
  return out;};
console.table(q(vel,4));
