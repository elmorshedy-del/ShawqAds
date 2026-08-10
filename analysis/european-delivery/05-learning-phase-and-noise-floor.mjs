import {metaRows,shopOrders,region,aggMeta,groupBy,f,GDPR,mean,sd,cv,median} from './lib.mjs';
const rows=metaRows();
const bucketOf=(cc)=>{ if(GDPR.has(cc)) return 'EU/EEA+UK'; if(region(cc)==='Europe') return 'Eur non-EEA'; return region(cc);};

// ---- 1. LEARNING PHASE: optimisation events per adset per week ----
console.log('=== 1. LEARNING PHASE: conversions per ADSET per WEEK (Meta exits learning at ~50) ===');
const isoWeek=(d)=>{const dt=new Date(d+'T00:00:00Z'); const t=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate()));
  const day=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-day+3); const f1=new Date(Date.UTC(t.getUTCFullYear(),0,4));
  return t.getUTCFullYear()+'-W'+String(1+Math.round(((t-f1)/86400000-3+((f1.getUTCDay()+6)%7))/7)).padStart(2,'0');};
// adset x week, restricted to adsets whose delivery is majority in one bucket
const aw=new Map();
for(const r of rows){ const k=r.adset_id+'|'+isoWeek(r.date);
  const v=aw.get(k)||{adset:r.adset_id,name:r.adset_name,camp:r.campaign_name,week:isoWeek(r.date),spend:0,pur:0,pv:0,byB:{}};
  v.spend+=r.spend; v.pur+=r.purchases; v.pv+=r.purchase_value;
  const b=bucketOf(r.country); v.byB[b]=(v.byB[b]||0)+r.spend; aw.set(k,v); }
const awArr=[...aw.values()].filter(v=>v.spend>0).map(v=>{
  const top=Object.entries(v.byB).sort((a,b)=>b[1]-a[1])[0];
  return {...v,bucket:top[0],purity:top[1]/v.spend};}).filter(v=>v.purity>=0.6);
const gb=groupBy(awArr,v=>v.bucket);
const lt=[];
for(const [b,vs] of gb){ const pur=vs.map(v=>v.pur);
  lt.push({bucket:b,adset_weeks:vs.length,median_conv_per_week:f(median(pur),1),mean_conv:f(mean(pur),1),
    pct_0_conv:f(100*pur.filter(x=>x===0).length/pur.length,1),
    pct_under_10:f(100*pur.filter(x=>x<10).length/pur.length,1),
    pct_over_50:f(100*pur.filter(x=>x>=50).length/pur.length,1),
    median_spend_wk_try:f(median(vs.map(v=>v.spend)),0)});}
console.table(lt.sort((a,b)=>b.adset_weeks-a.adset_weeks));

// ---- 2. ROAS NOISE FLOOR: observed vs theoretical ----
console.log('\n=== 2. IS THE VOLATILITY REAL, OR JUST SMALL NUMBERS? ===');
console.log('theoretical_cv = sqrt((1+cv_aov^2)/E[conversions]) - the floor imposed by counting noise alone.');
const aovCv={US:0.479,GB:0.351,AU:0.364,CA:0.571,DE:0.353,FR:0.507,NL:0.396,ES:0.304,BE:0.406,IT:0.352,CH:0.365,AE:0.407,SA:0.521,QA:0.582,SG:0.466};
const byCW=new Map();
for(const r of rows){ const k=r.country+'|'+isoWeek(r.date);
  const v=byCW.get(k)||{cc:r.country,week:isoWeek(r.date),spend:0,pur:0,pv:0}; v.spend+=r.spend; v.pur+=r.purchases; v.pv+=r.purchase_value; byCW.set(k,v);}
const nt=[];
for(const [cc,vs] of groupBy([...byCW.values()],v=>v.cc)){
  const act=vs.filter(v=>v.spend>500); if(act.length<6) continue;
  const roas=act.map(v=>v.pv/v.spend); const lam=mean(act.map(v=>v.pur)); if(lam<=0) continue;
  const g=aovCv[cc]??0.45;
  const theo=Math.sqrt((1+g*g)/lam);
  const obs=cv(roas);
  nt.push({cc,reg:bucketOf(cc),weeks:act.length,mean_conv_per_week:f(lam,1),observed_roas_cv:f(obs,2),
    theoretical_floor_cv:f(theo,2),excess_ratio:f(obs/theo,2),
    roas_min:f(Math.min(...roas),2),roas_med:f(median(roas),2),roas_max:f(Math.max(...roas),2)});}
console.table(nt.sort((a,b)=>b.mean_conv_per_week-a.mean_conv_per_week));
