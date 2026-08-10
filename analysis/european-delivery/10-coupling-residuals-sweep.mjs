import {metaRows,region,groupBy,f,GDPR,mean,median,sd,sum,pearson,spearman,normP} from './lib.mjs';
const rows=metaRows();
const isEU=(cc)=>GDPR.has(cc)||region(cc)==='Europe';
const buck=(cc)=>isEU(cc)?'Europe':region(cc)==='Anglo'?'Anglo':region(cc)==='GCC'?'GCC':'Other';
const isoWeek=(d)=>{const dt=new Date(d+'T00:00:00Z'); const t=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate()));
  const day=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-day+3); const f1=new Date(Date.UTC(t.getUTCFullYear(),0,4));
  return t.getUTCFullYear()+'-W'+String(1+Math.round(((t-f1)/86400000-3+((f1.getUTCDay()+6)%7))/7)).padStart(2,'0');};

// ---- 12. How tightly does Europe track the rest of the account? ----
const wk=new Map();
for(const r of rows){const b=buck(r.country); if(b==='Other') continue; const k=isoWeek(r.date)+'|'+b;
  const v=wk.get(k)||{w:isoWeek(r.date),b,spend:0,pv:0,pur:0}; v.spend+=r.spend; v.pv+=r.purchase_value; v.pur+=r.purchases; wk.set(k,v);}
const weeks=[...new Set([...wk.values()].map(v=>v.w))].sort();
const pair=[];
for(const w of weeks){const e=[...wk.values()].find(v=>v.w===w&&v.b==='Europe'), a=[...wk.values()].find(v=>v.w===w&&v.b==='Anglo');
  if(e&&a&&e.spend>3000&&a.spend>3000) pair.push({w,eu:e.pv/e.spend,an:a.pv/a.spend,euP:e.pur,anP:a.pur});}
const rW=pearson(pair.map(x=>x.eu),pair.map(x=>x.an));
console.log('=== 12. DOES EUROPE MOVE WITH THE ACCOUNT, OR ON ITS OWN? ===');
console.log(`Weekly ROAS, Europe vs Anglo: pearson r=${f(rW,3)}  R2=${f(100*rW**2,1)}%  (n=${pair.length} weeks)`);
// monthly, less noisy
const mo=new Map();
for(const r of rows){const b=buck(r.country); if(b==='Other') continue; const k=r.date.slice(0,7)+'|'+b;
  const v=mo.get(k)||{m:r.date.slice(0,7),b,spend:0,pv:0}; v.spend+=r.spend; v.pv+=r.purchase_value; mo.set(k,v);}
const mp=[...new Set([...mo.values()].map(v=>v.m))].sort().map(m=>{
  const e=[...mo.values()].find(v=>v.m===m&&v.b==='Europe'), a=[...mo.values()].find(v=>v.m===m&&v.b==='Anglo');
  return e&&a?{m,eu:e.pv/e.spend,an:a.pv/a.spend}:null;}).filter(Boolean);
const rM=pearson(mp.map(x=>x.eu),mp.map(x=>x.an));
console.log(`Monthly ROAS, Europe vs Anglo: pearson r=${f(rM,3)}  R2=${f(100*rM**2,1)}%  (n=${mp.length} months)`);
console.log(`Europe/Anglo ROAS ratio by month: ${mp.map(x=>x.m.slice(5)+':'+f(x.eu/x.an,2)).join('  ')}`);
const ratios=mp.map(x=>x.eu/x.an);
console.log(`ratio mean ${f(mean(ratios),3)} sd ${f(sd(ratios),3)} -> Europe runs a stable ${f(100*(1-mean(ratios)),0)}% discount to Anglo, not an erratic one.`);

// ---- 13. RESIDUAL SCAN: which European country deviates from the shared account trend? ----
console.log('\n=== 13. RESIDUAL SCAN — country effect after removing the account-wide monthly trend ===');
const acct=new Map();
for(const r of rows){const k=r.date.slice(0,7); const v=acct.get(k)||{spend:0,pv:0}; v.spend+=r.spend; v.pv+=r.purchase_value; acct.set(k,v);}
const cm=new Map();
for(const r of rows){const k=r.country+'|'+r.date.slice(0,7); const v=cm.get(k)||{cc:r.country,m:r.date.slice(0,7),spend:0,pv:0,pur:0};
  v.spend+=r.spend; v.pv+=r.purchase_value; v.pur+=r.purchases; cm.set(k,v);}
const res=new Map();
for(const v of cm.values()){ if(v.spend<8000) continue; const a=acct.get(v.m); const base=a.pv/a.spend;
  const lift=Math.log((v.pv/v.spend+0.01)/base); const arr=res.get(v.cc)||[]; arr.push({m:v.m,lift,spend:v.spend,pur:v.pur}); res.set(v.cc,arr);}
const rt=[];
for(const [cc,arr] of res){ if(arr.length<4) continue;
  const l=arr.map(x=>x.lift); const m=mean(l), s=sd(l); const se=s/Math.sqrt(l.length); const z=m/se;
  rt.push({cc,reg:buck(cc),months:l.length,mean_log_lift:f(m,3),ratio_vs_account:f(Math.exp(m),2),
    sd_of_lift:f(s,2),z:f(z,2),p:f(normP(z),3),total_pur:sum(arr.map(x=>x.pur))});}
console.table(rt.sort((a,b)=>b.mean_log_lift-a.mean_log_lift));
console.log('Bonferroni threshold for '+rt.length+' tests: p < '+f(0.05/rt.length,4));

// ---- 14. BROAD COVARIATE SWEEP on European adset-weeks ----
console.log('\n=== 14. AUTOMATED SWEEP — what correlates with European adset-week ROAS? ===');
const aw=new Map();
for(const r of rows){ const k=r.adset_id+'|'+isoWeek(r.date);
  const v=aw.get(k)||{name:r.adset_name,camp:r.campaign_name,w:isoWeek(r.date),spend:0,pv:0,pur:0,imp:0,reach:0,lc:0,clicks:0,atc:0,ic:0,lpv:0,euS:0,cc:new Set(),dates:new Set(),obj:r.optimization_goal};
  v.spend+=r.spend; v.pv+=r.purchase_value; v.pur+=r.purchases; v.imp+=r.impressions; v.reach+=r.reach;
  v.lc+=r.link_clicks; v.clicks+=r.clicks; v.atc+=r.add_to_cart; v.ic+=r.checkout_initiated; v.lpv+=r.landing_page_views;
  if(isEU(r.country)) v.euS+=r.spend; v.cc.add(r.country); v.dates.add(r.date); aw.set(k,v);}
const eu=[...aw.values()].filter(v=>v.spend>=3000 && v.euS/v.spend>=0.6 && v.imp>0);
console.log(`n = ${eu.length} European adset-weeks (>=3000 TRY)`);
const feats={
  'spend (TRY)':v=>v.spend, 'daily spend rate':v=>v.spend/v.dates.size, 'active days':v=>v.dates.size,
  'CPM':v=>1000*v.spend/v.imp, 'CTR (link)':v=>v.lc/v.imp, 'CPC (link)':v=>v.spend/(v.lc||1),
  'frequency':v=>v.imp/(v.reach||1), 'reach':v=>v.reach, 'n countries in adset':v=>v.cc.size,
  'LPV/link click':v=>v.lpv/(v.lc||1), 'ATC/link click':v=>v.atc/(v.lc||1), 'IC/ATC':v=>v.ic/(v.atc||1),
  'week index (time)':v=>weeks.indexOf(v.w),
};
const y=eu.map(v=>v.pv/v.spend);
const sw=[];
for(const [name,fn] of Object.entries(feats)){ const x=eu.map(fn);
  const r=spearman(x,y); const z=r*Math.sqrt(eu.length-1); const p=normP(z);
  sw.push({feature:name,spearman_r:f(r,3),z:f(z,2),p_raw:f(p,4),survives_bonferroni:p<0.05/Object.keys(feats).length?'YES':''});}
console.table(sw.sort((a,b)=>Math.abs(b.spearman_r)-Math.abs(a.spearman_r)));
console.log(`Bonferroni threshold for ${Object.keys(feats).length} tests: p < ${f(0.05/Object.keys(feats).length,4)}`);
