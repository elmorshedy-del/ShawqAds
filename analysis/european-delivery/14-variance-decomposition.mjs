import {metaRows,region,GDPR,f,mean,median,sum,sd,normP,groupBy} from './lib.mjs';
const rows=metaRows();
const isEU=(cc)=>GDPR.has(cc)||region(cc)==='Europe';
const cells=new Map(); const campTotals=new Map();
for(const r of rows){
  const k=r.campaign_id+'|'+r.country;
  const v=cells.get(k)||{camp:r.campaign_name,cid:r.campaign_id,cc:r.country,dates:new Set(),spend:0,imp:0,pur:0,pv:0,lc:0,atc:0};
  v.dates.add(r.date); v.spend+=r.spend; v.imp+=r.impressions; v.pur+=r.purchases; v.pv+=r.purchase_value;
  v.lc+=r.link_clicks; v.atc+=r.add_to_cart; cells.set(k,v);
  campTotals.set(r.campaign_id,(campTotals.get(r.campaign_id)||0)+r.spend);
}
const all=[...cells.values()].map(v=>({...v,days:v.dates.size,share:v.spend/campTotals.get(v.cid),
  roas:v.pv/v.spend, atcRate:v.lc?v.atc/v.lc:0, cvr:v.lc?v.pur/v.lc:0}));

// ---- 1. VARIANCE DECOMPOSITION: is it the country, or the campaign? ----
// Cells with enough clicks that the cell's own conversion rate is at least crudely estimable.
const eu=all.filter(v=>isEU(v.cc)&&v.lc>=100&&v.spend>=3000);
console.log(`=== 1. VARIANCE DECOMPOSITION — European cells (n=${eu.length}) ===`);
console.log('Question: does knowing the COUNTRY or the CAMPAIGN tell you more about the outcome?');
const grand=mean(eu.map(v=>v.roas));
const tss=sum(eu.map(v=>(v.roas-grand)**2));
const between=(keyFn)=>{let b=0; for(const [,g] of groupBy(eu,keyFn)){ b+=g.length*(mean(g.map(v=>v.roas))-grand)**2;} return b;};
const bC=between(v=>v.cc), bK=between(v=>v.cid);
const nC=new Set(eu.map(v=>v.cc)).size, nK=new Set(eu.map(v=>v.cid)).size;
// adjust for the fact that more groups mechanically explain more variance
const adj=(b,k)=>{const within=(tss-b)/(eu.length-k); const betw=b/(k-1); return {r2:b/tss, F:betw/within};};
const aC=adj(bC,nC), aK=adj(bK,nK);
console.log(`  country  (${nC} groups): R2 = ${f(100*aC.r2,1)}%   F = ${f(aC.F,2)}`);
console.log(`  campaign (${nK} groups): R2 = ${f(100*aK.r2,1)}%   F = ${f(aK.F,2)}`);
console.log(`  -> ${aK.F>aC.F?'CAMPAIGN':'COUNTRY'} carries more signal per degree of freedom.`);

// ---- 2. SAME COUNTRY, DIFFERENT CAMPAIGNS: how wide is the spread? ----
console.log('\n=== 2. WITHIN one country, spread of ROAS across its campaigns ===');
const t=[];
for(const [cc,g] of groupBy(eu,v=>v.cc)){ if(g.length<4) continue;
  const rs=g.map(v=>v.roas).sort((a,b)=>a-b);
  t.push({cc,cells:g.length,worst:f(rs[0],2),median:f(median(rs),2),best:f(rs[rs.length-1],2),
    spread_x:f(rs[rs.length-1]/(rs[0]||0.01),1),
    best_campaign:g.reduce((a,b)=>a.roas>b.roas?a:b).camp.slice(0,24),
    worst_campaign:g.reduce((a,b)=>a.roas<b.roas?a:b).camp.slice(0,24)});}
console.table(t.sort((a,b)=>b.cells-a.cells));

// ---- 3. SAME CAMPAIGN, DIFFERENT COUNTRIES: do countries move together inside one campaign? ----
console.log('\n=== 3. WITHIN one campaign, do its countries agree? (multi-country EU campaigns) ===');
const byCamp=groupBy(all.filter(v=>v.lc>=100&&v.spend>=3000),v=>v.cid);
const t3=[];
for(const [cid,g] of byCamp){ if(g.length<3) continue;
  const rs=g.map(v=>v.roas);
  t3.push({campaign:g[0].camp.slice(0,26),countries:g.length,
    spend:f(sum(g.map(v=>v.spend)),0),
    roas_min:f(Math.min(...rs),2),roas_med:f(median(rs),2),roas_max:f(Math.max(...rs),2),
    cv_across_countries:f(sd(rs)/(mean(rs)||1),2),
    all_same_direction:(rs.every(r=>r>=2)||rs.every(r=>r<2))?'yes':'no'});}
console.table(t3.sort((a,b)=>b.spend-a.spend));
