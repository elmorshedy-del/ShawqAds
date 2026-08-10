import {shopOrders,region,f,GDPR} from './lib.mjs';
const ords=shopOrders();
// Is the "over-claim" an artifact of European browsers stripping fbclid/UTM?
// If so, European orders should show MORE total attribution darkness (no utm AND no referrer AND no fbclid).
const rowsByC=new Map();
for(const o of ords){
  const land=o.landing_site||''; const ref=o.referring_site||'';
  const hasFbclid=/fbclid/i.test(land);
  const hasAnyUtm=!!(o.utm_source||o.utm_medium||o.utm_campaign||o.utm_content)||/utm_/i.test(land);
  const hasRef=!!ref;
  const metaRef=/facebook|instagram/i.test(ref);
  const dark=!hasFbclid&&!hasAnyUtm&&!hasRef;
  const k=o.country_code; const v=rowsByC.get(k)||{n:0,fbclid:0,utm:0,ref:0,metaRef:0,dark:0,landEmpty:0};
  v.n++; if(hasFbclid)v.fbclid++; if(hasAnyUtm)v.utm++; if(hasRef)v.ref++; if(metaRef)v.metaRef++; if(dark)v.dark++;
  if(!land)v.landEmpty++;
  rowsByC.set(k,v);
}
console.log('=== ATTRIBUTION DARKNESS by country (orders >= 25) ===');
console.log('dark = no fbclid, no utm, no referrer. If Europe >> Anglo, the over-claim finding is confounded.');
const t=[];
for(const [cc,v] of rowsByC){ if(v.n<25) continue;
  t.push({cc,reg:region(cc),gdpr:GDPR.has(cc)?'Y':'',orders:v.n,fbclid_pct:f(100*v.fbclid/v.n,1),utm_pct:f(100*v.utm/v.n,1),
    referrer_pct:f(100*v.ref/v.n,1),meta_referrer_pct:f(100*v.metaRef/v.n,1),dark_pct:f(100*v.dark/v.n,1)});}
console.table(t.sort((a,b)=>b.orders-a.orders));
const g={};
for(const [cc,v] of rowsByC){const k=region(cc); (g[k]??={n:0,fbclid:0,utm:0,ref:0,dark:0}); const x=g[k]; x.n+=v.n; x.fbclid+=v.fbclid; x.utm+=v.utm; x.ref+=v.ref; x.dark+=v.dark;}
console.log('=== by region ===');
console.table(Object.entries(g).map(([k,v])=>({region:k,orders:v.n,fbclid_pct:f(100*v.fbclid/v.n,1),utm_pct:f(100*v.utm/v.n,1),referrer_pct:f(100*v.ref/v.n,1),dark_pct:f(100*v.dark/v.n,1)})));
