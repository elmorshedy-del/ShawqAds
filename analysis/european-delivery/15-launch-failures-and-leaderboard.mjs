import {metaRows,shopOrders,region,GDPR,f,mean,median,sum,groupBy} from './lib.mjs';
const rows=metaRows(), ords=shopOrders();
const isEU=(cc)=>GDPR.has(cc)||region(cc)==='Europe';

// ---- 4. "WON'T EVEN LAUNCH": cells that took budget and died fast ----
const cells=new Map(); const campT=new Map();
for(const r of rows){const k=r.campaign_id+'|'+r.country;
  const v=cells.get(k)||{camp:r.campaign_name,cid:r.campaign_id,cc:r.country,dates:new Set(),spend:0,imp:0,pur:0,pv:0,lc:0,atc:0};
  v.dates.add(r.date); v.spend+=r.spend; v.imp+=r.impressions; v.pur+=r.purchases; v.pv+=r.purchase_value;
  v.lc+=r.link_clicks; v.atc+=r.add_to_cart; cells.set(k,v);
  campT.set(r.campaign_id,(campT.get(r.campaign_id)||0)+r.spend);}
const all=[...cells.values()].map(v=>({...v,days:v.dates.size,perDay:v.spend/v.dates.size,
  share:v.spend/campT.get(v.cid),cpm:1000*v.spend/(v.imp||1),roas:v.pv/v.spend}));
const dead=all.filter(v=>isEU(v.cc)&&v.spend>=2000&&v.days<=7&&v.pur===0)
  .sort((a,b)=>b.spend-a.spend);
console.log('=== 4. "WOULD NOT LAUNCH" — European cells that burned >=2000 TRY in <=7 days with ZERO purchases ===');
console.table(dead.map(v=>({campaign:v.camp.slice(0,26),cc:v.cc,start:[...v.dates].sort()[0],days:v.days,
  spend:f(v.spend,0),try_per_day:f(v.perDay,0),clicks:v.lc,atc:v.atc,cpm:f(v.cpm,0),
  country_share:f(100*v.share,0)+'%'})));
console.log(`Total burned: ${f(sum(dead.map(v=>v.spend)),0)} TRY across ${dead.length} cells.`);
const liveEU=all.filter(v=>isEU(v.cc)&&v.spend>=2000);
console.log(`Median TRY/day — died-in-7-days cells: ${f(median(dead.map(v=>v.perDay)),0)} | all European cells: ${f(median(liveEU.map(v=>v.perDay)),0)}`);
console.log(`Median CPM      — died cells: ${f(median(dead.map(v=>v.cpm)),0)} | all European cells: ${f(median(liveEU.map(v=>v.cpm)),0)}`);

// ---- 5. WEEK-BY-WEEK SHOPIFY LEADERBOARD ----
const isoWeek=(d)=>{const dt=new Date(d); const t=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate()));
  const day=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-day+3); const f1=new Date(Date.UTC(t.getUTCFullYear(),0,4));
  return t.getUTCFullYear()+'-W'+String(1+Math.round(((t-f1)/86400000-3+((f1.getUTCDay()+6)%7))/7)).padStart(2,'0');};
const wk=new Map();
for(const o of ords){const w=isoWeek(o.created_at); const k=w+'|'+o.country_code;
  const v=wk.get(k)||{w,cc:o.country_code,rev:0,n:0}; v.rev+=o.total_price_usd; v.n++; wk.set(k,v);}
const weeks=[...new Set([...wk.values()].map(v=>v.w))].sort();
console.log('\n=== 5. SHOPIFY WEEKLY REVENUE LEADERBOARD — where each European market ranked ===');
const track=['GB','DE','FR','NL','CH','ES','IT','BE'];
const out=[];
for(const w of weeks){
  const g=[...wk.values()].filter(v=>v.w===w).sort((a,b)=>b.rev-a.rev);
  const total=sum(g.map(v=>v.rev)); if(total<2000) continue;
  const row={week:w.slice(2),top1:g[0]?.cc||'-',top2:g[1]?.cc||'-',top3:g[2]?.cc||'-'};
  for(const cc of track){const i=g.findIndex(v=>v.cc===cc); row[cc]=i<0?'—':'#'+(i+1);}
  out.push(row);
}
console.table(out);
const ranks={};
for(const cc of track){const rs=out.map(r=>r[cc]).filter(x=>x!=='—').map(x=>+x.slice(1));
  ranks[cc]={weeks_present:rs.length,best:Math.min(...rs),median:median(rs),worst:Math.max(...rs),
    top3_weeks:rs.filter(x=>x<=3).length,absent_weeks:out.length-rs.length};}
console.log('rank stability per market:');
console.table(Object.entries(ranks).map(([cc,v])=>({cc,...v,median:f(v.median,1)})));
