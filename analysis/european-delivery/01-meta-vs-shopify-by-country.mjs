import {metaRows,shopOrders,region,aggMeta,groupBy,f,GDPR} from './lib.mjs';
const rows=metaRows(), ords=shopOrders();
const sByC=new Map();
for(const o of ords){const k=o.country_code; const v=sByC.get(k)||{n:0,rev:0,units:0}; v.n++; v.rev+=o.total_price_usd; v.units+=o.units; sByC.set(k,v);}
const mByC=groupBy(rows,r=>r.country);
console.log('=== META-ATTRIBUTED vs SHOPIFY-ACTUAL by country (Jan 1 - Aug 10) ===');
console.log('match_rate = Meta purchases / Shopify orders. <1 => Meta under-reports.');
const t=[];
for(const [cc,rs] of mByC){const a=aggMeta(rs); if(a.spend_usd<200) continue;
 const s=sByC.get(cc)||{n:0,rev:0};
 t.push({cc,reg:region(cc),gdpr:GDPR.has(cc)?'Y':'',spend_usd:f(a.spend_usd,0),
  meta_pur:a.purchases, shop_ord:s.n, match_rate:f(a.purchases/(s.n||1),3),
  meta_rev:f(a.purchase_value_usd,0), shop_rev:f(s.rev,0),
  meta_roas:f(a.purchase_value/a.spend,2), true_roas:f(s.rev/a.spend_usd,2)});}
console.table(t.sort((a,b)=>b.spend_usd-a.spend_usd));
const roll=(keyFn,label)=>{const g={};
 for(const r of t){const k=keyFn(r); (g[k]??={sp:0,mp:0,so:0,mr:0,sr:0}); g[k].sp+=r.spend_usd; g[k].mp+=r.meta_pur; g[k].so+=r.shop_ord; g[k].mr+=r.meta_rev; g[k].sr+=r.shop_rev;}
 console.log('=== rolled up by '+label+' ===');
 console.table(Object.entries(g).map(([k,v])=>({bucket:k,spend_usd:f(v.sp,0),meta_pur:v.mp,shop_ord:v.so,match_rate:f(v.mp/v.so,3),meta_roas:f(v.mr/v.sp,2),true_roas:f(v.sr/v.sp,2),meta_overstates_pct:f(100*((v.mr/v.sp)/(v.sr/v.sp)-1),1)})));};
roll(r=>r.reg,'region');
roll(r=>r.gdpr==='Y'?'GDPR (EU/EEA+UK)':'non-GDPR','consent regime');
