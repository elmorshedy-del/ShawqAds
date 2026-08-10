import {metaRows,region,groupBy,f,GDPR,mean,median,sum} from './lib.mjs';
const rows=metaRows();
const bucketOf=(cc)=>{ if(GDPR.has(cc)) return 'EU/EEA+UK'; if(region(cc)==='Europe') return 'Eur non-EEA'; return region(cc);};
// days needed for +/-30% read, from analysis 4
const NEED={US:6,AU:10,GB:15,CA:15,DE:23,SG:29,AE:30,FR:35,NL:39,ES:40,BE:42,SA:63,CH:73,DK:83,NO:86,IT:94,QA:106,KW:116,OM:135,SE:168,AT:183,JO:202,BH:289};

// ---- 5. CAMPAIGN LIFESPAN vs REQUIRED READ WINDOW ----
console.log('=== 5. WERE CAMPAIGNS GIVEN LONG ENOUGH TO BE READ? ===');
const camps=new Map();
for(const r of rows){ const v=camps.get(r.campaign_id)||{name:r.campaign_name,days:new Set(),spend:0,pur:0,pv:0,cc:{}};
  v.days.add(r.date); v.spend+=r.spend; v.pur+=r.purchases; v.pv+=r.purchase_value;
  v.cc[r.country]=(v.cc[r.country]||0)+r.spend; camps.set(r.campaign_id,v);}
const list=[];
for(const [id,v] of camps){ if(v.spend<5000) continue;
  const ds=[...v.days].sort(); const span=Math.round((new Date(ds[ds.length-1])-new Date(ds[0]))/86400000)+1;
  const top=Object.entries(v.cc).sort((a,b)=>b[1]-a[1]);
  const primary=top[0][0]; const b=bucketOf(primary);
  const need=NEED[primary]??60;
  list.push({campaign:v.name.slice(0,30),bucket:b,primary,span_days:span,need_days:need,
    adequacy:f(span/need,2),spend_try:f(v.spend,0),pur:v.pur,roas:f(v.pv/v.spend,2),n_countries:top.length});}
const byB=groupBy(list,x=>x.bucket);
console.log('--- rollup: campaigns with >=5000 TRY spend ---');
console.table([...byB].map(([b,v])=>({bucket:b,campaigns:v.length,median_span_days:f(median(v.map(x=>x.span_days)),0),
  median_need_days:f(median(v.map(x=>x.need_days)),0),median_adequacy:f(median(v.map(x=>x.adequacy)),2),
  pct_killed_before_readable:f(100*v.filter(x=>x.adequacy<1).length/v.length,0),
  pct_killed_before_half_readable:f(100*v.filter(x=>x.adequacy<0.5).length/v.length,0)})).sort((a,b)=>b.campaigns-a.campaigns));
console.log('--- every European campaign, ranked by how far short of a readable window it was killed ---');
console.table(list.filter(x=>x.bucket.startsWith('EU')||x.bucket==='Eur non-EEA').sort((a,b)=>a.adequacy-b.adequacy).slice(0,26));

// ---- 6. WHAT ACTUALLY WORKED IN EUROPE ----
console.log('\n=== 6. EUROPEAN RUNS THAT CLEARED A REAL BAR (>=13 conversions, the minimum readable N) ===');
const cc2=new Map();
for(const r of rows){ if(bucketOf(r.country)!=='EU/EEA+UK'&&bucketOf(r.country)!=='Eur non-EEA') continue;
  const k=r.campaign_id+'|'+r.country; const v=cc2.get(k)||{camp:r.campaign_name,cc:r.country,days:new Set(),spend:0,pur:0,pv:0,imp:0,lc:0,ic:0};
  v.days.add(r.date); v.spend+=r.spend; v.pur+=r.purchases; v.pv+=r.purchase_value; v.imp+=r.impressions; v.lc+=r.link_clicks; v.ic+=r.checkout_initiated; cc2.set(k,v);}
const winners=[...cc2.values()].filter(v=>v.pur>=13);
console.table(winners.map(v=>({campaign:v.camp.slice(0,28),cc:v.cc,days:v.days.size,spend_try:f(v.spend,0),pur:v.pur,
  roas:f(v.pv/v.spend,2),cpa_try:f(v.spend/v.pur,0),ctr:f(100*v.lc/v.imp,2),ic_to_pur:f(v.pur/(v.ic||1),3)})).sort((a,b)=>b.roas-a.roas));
console.log(`\nEuropean campaign x country cells total: ${cc2.size}. Cells reaching a readable 13+ conversions: ${winners.length} (${f(100*winners.length/cc2.size,1)}%).`);
const anglo=new Map();
for(const r of rows){ if(bucketOf(r.country)!=='Anglo') continue; const k=r.campaign_id+'|'+r.country;
  const v=anglo.get(k)||{pur:0}; v.pur+=r.purchases; anglo.set(k,v);}
const aw=[...anglo.values()].filter(v=>v.pur>=13);
console.log(`Anglo campaign x country cells: ${anglo.size}. Reaching 13+: ${aw.length} (${f(100*aw.length/anglo.size,1)}%).`);
