import {metaRows,shopOrders,region,aggMeta,groupBy,f,GDPR} from './lib.mjs';
const rows=metaRows(), ords=shopOrders();

// Classify a Shopify order as Meta-paid-driven.
function isPaidMeta(o){
  const m=(o.utm_medium||'').toLowerCase(), s=(o.utm_source||'').toLowerCase();
  const land=(o.landing_site||'');
  if(/fbclid/i.test(land)) return true;
  if(m==='paid_social'||m==='paid') return true;
  if(['meta','fb','facebook'].includes(s)) return true;
  return false;
}
function isOrganicSocial(o){
  if(isPaidMeta(o)) return false;
  const s=(o.utm_source||'').toLowerCase(); const m=(o.utm_medium||'').toLowerCase();
  const ref=(o.referring_site||'');
  return s==='ig'||s==='igshopping'||m==='social'||/instagram|facebook/i.test(ref);
}
const paid=ords.filter(isPaidMeta), org=ords.filter(isOrganicSocial), rest=ords.filter(o=>!isPaidMeta(o)&&!isOrganicSocial(o));
console.log(`Shopify orders ${ords.length}: paid-Meta ${paid.length} | organic-social ${org.length} | other/direct ${rest.length}`);

const bucket=(arr)=>{const m=new Map(); for(const o of arr){const v=m.get(o.country_code)||{n:0,rev:0}; v.n++; v.rev+=o.total_price_usd; m.set(o.country_code,v);} return m;};
const P=bucket(paid), O=bucket(org), R=bucket(rest), ALL=bucket(ords);
const mByC=groupBy(rows,r=>r.country);

console.log('\n=== ATTRIBUTION QUALITY: Meta purchases vs Shopify PAID-attributed orders ===');
console.log('capture = Meta purchases / Shopify paid-Meta orders. ~1.0 = clean. <1 = Meta blind. >1 = Meta over-claims (view-thru/organic stolen).');
const t=[];
for(const [cc,rs] of mByC){const a=aggMeta(rs); if(a.spend_usd<400) continue;
 const p=P.get(cc)||{n:0,rev:0}, o=O.get(cc)||{n:0,rev:0}, r2=R.get(cc)||{n:0,rev:0}, al=ALL.get(cc)||{n:0,rev:0};
 t.push({cc,reg:region(cc),gdpr:GDPR.has(cc)?'Y':'',spend:f(a.spend_usd,0),
  meta_pur:a.purchases, paid_ord:p.n, capture:f(a.purchases/(p.n||1),2),
  organic_ord:o.n, other_ord:r2.n, paid_share:f(100*p.n/al.n,0),
  meta_roas:f(a.purchase_value/a.spend,2), paid_roas:f(p.rev/a.spend_usd,2), blended_roas:f(al.rev/a.spend_usd,2)});}
console.table(t.sort((a,b)=>b.spend-a.spend));

const roll=(keyFn,label)=>{const g={};
 for(const r of t){const k=keyFn(r); (g[k]??={sp:0,mp:0,po:0,oo:0,ro:0}); const x=g[k]; x.sp+=r.spend; x.mp+=r.meta_pur; x.po+=r.paid_ord; x.oo+=r.organic_ord; x.ro+=r.other_ord;}
 console.log('\n=== by '+label+' ===');
 console.table(Object.entries(g).map(([k,v])=>({bucket:k,spend:f(v.sp,0),meta_pur:v.mp,paid_ord:v.po,capture:f(v.mp/v.po,2),organic_ord:v.oo,other_ord:v.ro,paid_share_of_orders:f(100*v.po/(v.po+v.oo+v.ro),0)})));};
roll(r=>r.reg,'region'); roll(r=>r.gdpr==='Y'?'GDPR':'non-GDPR','consent regime');
