import {metaRows,region,groupBy,f,GDPR,mean,median,sum,spearman,normP} from './lib.mjs';
const rows=metaRows();
const isEU=(cc)=>GDPR.has(cc)||region(cc)==='Europe';
const buck=(cc)=>isEU(cc)?'Europe':region(cc)==='Anglo'?'Anglo':region(cc)==='GCC'?'GCC':'Other';

// ---- 10. CONTROL: is the decline Europe-specific or account-wide? ----
console.log('=== 10. CONTROL — same months, Europe vs Anglo vs GCC ===');
const mo=new Map();
for(const r of rows){ const b=buck(r.country); if(b==='Other') continue; const k=r.date.slice(0,7)+'|'+b;
  const v=mo.get(k)||{m:r.date.slice(0,7),b,spend:0,pur:0,pv:0,imp:0,lc:0};
  v.spend+=r.spend; v.pur+=r.purchases; v.pv+=r.purchase_value; v.imp+=r.impressions; v.lc+=r.link_clicks; mo.set(k,v);}
const months=[...new Set([...mo.values()].map(v=>v.m))].sort();
const t=[];
for(const m of months){ const row={month:m};
  for(const b of ['Anglo','Europe','GCC']){ const v=[...mo.values()].find(x=>x.m===m&&x.b===b);
    row[b+'_roas']=v?f(v.pv/v.spend,2):null; row[b+'_cpa']=v?f(v.spend/(v.pur||1),0):null;}
  t.push(row);}
console.table(t);
console.log('--- eras: Jan-Apr (single-country ABO/ASC) vs Jun-Aug (bundled CBO/ASC) ---');
for(const b of ['Anglo','Europe','GCC']){
  const e1=[...mo.values()].filter(v=>v.b===b&&v.m<='2026-04');
  const e2=[...mo.values()].filter(v=>v.b===b&&v.m>='2026-06');
  const r1=sum(e1.map(v=>v.pv))/sum(e1.map(v=>v.spend)), r2=sum(e2.map(v=>v.pv))/sum(e2.map(v=>v.spend));
  const c1=sum(e1.map(v=>v.spend))/sum(e1.map(v=>v.pur)), c2=sum(e2.map(v=>v.spend))/sum(e2.map(v=>v.pur));
  console.log(`${b.padEnd(7)} ROAS ${f(r1,2)} -> ${f(r2,2)} (${f(100*(r2/r1-1),0)}%)   CPA ${f(c1,0)} -> ${f(c2,0)} TRY (${f(100*(c2/c1-1),0)}%)`);
}

// ---- 11. IS "RUN LONGER" CAUSAL, OR SURVIVORSHIP? ----
console.log('\n=== 11. ADSET AGE COHORTS — within long-lived adsets, does performance improve with age? ===');
const ads=new Map();
for(const r of rows){ const v=ads.get(r.adset_id)||{days:[],euSpend:0,spend:0,rows:[]};
  v.rows.push(r); v.spend+=r.spend; if(isEU(r.country)) v.euSpend+=r.spend; ads.set(r.adset_id,v);}
for(const [b,label] of [['Europe','European'],['Anglo','Anglo']]){
  const sel=[...ads.values()].filter(v=>v.spend>=5000 && (b==='Europe'? v.euSpend/v.spend>=0.6 : v.euSpend/v.spend<0.4));
  const survivors=sel.filter(v=>new Set(v.rows.map(r=>r.date)).size>=21);
  const bins={'days 1-7':{s:0,pv:0,p:0},'days 8-14':{s:0,pv:0,p:0},'days 15-21':{s:0,pv:0,p:0},'days 22+':{s:0,pv:0,p:0}};
  for(const v of survivors){ const ds=[...new Set(v.rows.map(r=>r.date))].sort();
    const idx=Object.fromEntries(ds.map((d,i)=>[d,i+1]));
    for(const r of v.rows){ const a=idx[r.date]; const k=a<=7?'days 1-7':a<=14?'days 8-14':a<=21?'days 15-21':'days 22+';
      bins[k].s+=r.spend; bins[k].pv+=r.purchase_value; bins[k].p+=r.purchases;}}
  console.log(`--- ${label} adsets surviving >=21 active days (n=${survivors.length}) ---`);
  console.table(Object.entries(bins).map(([k,v])=>({age_window:k,spend_try:f(v.s,0),purchases:v.p,roas:f(v.pv/v.s,2),cpa_try:f(v.s/(v.p||1),0)})));
}
