import {metaRows,shopOrders,f,mean,median,sum} from './lib.mjs';
const rows=metaRows();
// EVERY campaign x country cell for the countries the user named, chronologically.
const FOCUS=['CH','GB','DE','FR','NL'];
for(const cc of FOCUS){
  const cells=new Map();
  for(const r of rows){ if(r.country!==cc) continue;
    const v=cells.get(r.campaign_id)||{camp:r.campaign_name,dates:[],spend:0,imp:0,pur:0,pv:0,lc:0,atc:0};
    v.dates.push(r.date); v.spend+=r.spend; v.imp+=r.impressions; v.pur+=r.purchases; v.pv+=r.purchase_value;
    v.lc+=r.link_clicks; v.atc+=r.add_to_cart; cells.set(r.campaign_id,v);}
  const list=[...cells.values()].map(v=>{const ds=[...new Set(v.dates)].sort();
    return {campaign:v.camp.slice(0,30),start:ds[0],end:ds[ds.length-1],days:ds.length,
      spend:f(v.spend,0),per_day:f(v.spend/ds.length,0),imp:v.imp,clicks:v.lc,atc:v.atc,
      pur:v.pur,roas:f(v.pv/v.spend,2),cpm:f(1000*v.spend/(v.imp||1),0)};})
    .sort((a,b)=>a.start.localeCompare(b.start));
  console.log(`\n════ ${cc} — every campaign it ever delivered in (${list.length} cells) ════`);
  console.table(list);
}
