import {metaRows,region,GDPR,f,mean,median,sum,spearman,normP,groupBy} from './lib.mjs';
const rows=metaRows();
const isEU=(cc)=>GDPR.has(cc)||region(cc)==='Europe';
// Build campaign x country cells, and mark how "dedicated" the campaign was to that country.
const cells=new Map();
const campTotals=new Map();
for(const r of rows){
  const k=r.campaign_id+'|'+r.country;
  const v=cells.get(k)||{camp:r.campaign_name,cid:r.campaign_id,cc:r.country,dates:new Set(),spend:0,imp:0,pur:0,pv:0,lc:0,atc:0,ic:0};
  v.dates.add(r.date); v.spend+=r.spend; v.imp+=r.impressions; v.pur+=r.purchases; v.pv+=r.purchase_value;
  v.lc+=r.link_clicks; v.atc+=r.add_to_cart; v.ic+=r.checkout_initiated; cells.set(k,v);
  campTotals.set(r.campaign_id,(campTotals.get(r.campaign_id)||0)+r.spend);
}
const euCells=[...cells.values()].filter(v=>isEU(v.cc)&&v.spend>=3000&&v.lc>=40).map(v=>({
  ...v, days:v.dates.size, perDay:v.spend/v.dates.size,
  share:v.spend/campTotals.get(v.cid),           // how much of the campaign was this country
  atcRate:v.atc/v.lc, roas:v.pv/v.spend, cpm:1000*v.spend/v.imp,
  role: (v.spend/campTotals.get(v.cid))>=0.55 ? 'dedicated (>=55% of campaign)' : 'passenger (<55%)',
}));
console.log(`European campaign x country cells with >=3000 TRY and >=40 clicks: ${euCells.length}\n`);

console.log('=== A. PASSENGER vs DEDICATED ===');
for(const [role,v] of groupBy(euCells,x=>x.role)){
  console.log(`${role.padEnd(30)} n=${String(v.length).padStart(3)}  pooled ROAS ${f(sum(v.map(x=>x.pv))/sum(v.map(x=>x.spend)),2)}  median ROAS ${f(median(v.map(x=>x.roas)),2)}  zero-purchase cells ${f(100*v.filter(x=>x.pur===0).length/v.length,0)}%  median TRY/day ${f(median(v.map(x=>x.perDay)),0)}  median ATC/click ${f(median(v.map(x=>x.atcRate)),3)}`);
}

console.log('\n=== B. WHAT PREDICTS A CAMPAIGNxCOUNTRY CELL WORKING? (Spearman vs ROAS) ===');
const y=euCells.map(x=>x.roas);
const feats={'daily spend rate (TRY/day)':x=>x.perDay,'ATC per link click':x=>x.atcRate,'CPM':x=>x.cpm,
  'country share of campaign':x=>x.share,'days run':x=>x.days,'total spend':x=>x.spend,'clicks':x=>x.lc};
for(const [n,fn] of Object.entries(feats)){
  const r=spearman(euCells.map(fn),y); const z=r*Math.sqrt(euCells.length-1);
  console.log(`  ${n.padEnd(28)} r=${String(f(r,3)).padStart(7)}  p=${f(normP(z),4)}${normP(z)<0.05/7?'  **survives Bonferroni**':''}`);
}

console.log('\n=== C. DAILY SPEND RATE QUARTILES (European campaign x country cells) ===');
const s=[...euCells].sort((a,b)=>a.perDay-b.perDay); const q=Math.ceil(s.length/4);
const rowsQ=[];
for(let i=0;i<4;i++){const c=s.slice(i*q,(i+1)*q); if(!c.length) continue;
  rowsQ.push({quartile:`Q${i+1}`,median_try_per_day:f(median(c.map(x=>x.perDay)),0),cells:c.length,
    pooled_roas:f(sum(c.map(x=>x.pv))/sum(c.map(x=>x.spend)),2),
    median_atc_per_click:f(median(c.map(x=>x.atcRate)),3),
    median_cpm:f(median(c.map(x=>x.cpm)),0),
    zero_purchase_pct:f(100*c.filter(x=>x.pur===0).length/c.length,0),
    total_spend:f(sum(c.map(x=>x.spend)),0)});}
console.table(rowsQ);
