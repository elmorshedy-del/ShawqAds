import {metaRows,shopOrders,region,aggMeta,groupBy,f,GDPR,mean,sd,cv,median,normP} from './lib.mjs';
const ords=shopOrders();
// EEA/UK consent regime vs the rest of Europe (CH is geographically European, outside EU/EEA).
const EEA_UK=GDPR;
const bucketOf=(cc)=>{ if(EEA_UK.has(cc)) return 'EU/EEA+UK'; if(region(cc)==='Europe') return 'Europe non-EEA (CH)'; return region(cc);};
const g={};
for(const o of ords){ const k=bucketOf(o.country_code); const land=o.landing_site||''; const ref=o.referring_site||'';
  const fb=/fbclid/i.test(land); const dark=!fb&&!(o.utm_source||o.utm_medium||/utm_/i.test(land))&&!ref;
  (g[k]??={n:0,fb:0,dark:0}); g[k].n++; if(fb)g[k].fb++; if(dark)g[k].dark++; }
console.log('=== fbclid survival: the natural experiment (Switzerland is in Europe but outside EU/EEA) ===');
console.table(Object.entries(g).map(([k,v])=>({bucket:k,orders:v.n,fbclid_pct:f(100*v.fb/v.n,1),dark_pct:f(100*v.dark/v.n,1)})).sort((a,b)=>b.orders-a.orders));
// two-proportion z-test EU/EEA+UK vs Anglo
const A=g['Anglo'], E=g['EU/EEA+UK'];
const p1=A.fb/A.n, p2=E.fb/E.n, pp=(A.fb+E.fb)/(A.n+E.n);
const z=(p1-p2)/Math.sqrt(pp*(1-pp)*(1/A.n+1/E.n));
console.log(`fbclid survival Anglo ${f(100*p1,1)}% vs EU/EEA+UK ${f(100*p2,1)}%  z=${f(z,2)}  p=${normP(z).toExponential(2)}`);
const C=g['Europe non-EEA (CH)'];
const z2=(C.fb/C.n-p2)/Math.sqrt(pp*(1-pp)*(1/C.n+1/E.n));
console.log(`fbclid survival CH ${f(100*C.fb/C.n,1)}% vs EU/EEA+UK ${f(100*p2,1)}%  z=${f(z2,2)}  p=${normP(z2).toExponential(2)}  (n_CH=${C.n})`);

// AOV dispersion per country -> the gamma term in the noise floor
console.log('\n=== ORDER VALUE DISPERSION (drives ROAS noise beyond counting) ===');
const byC=new Map();
for(const o of ords){ const v=byC.get(o.country_code)||[]; v.push(o.total_price_usd); byC.set(o.country_code,v); }
const t=[];
for(const [cc,v] of byC){ if(v.length<20) continue;
  t.push({cc,reg:region(cc),orders:v.length,aov:f(mean(v),0),median:f(median(v),0),sd:f(sd(v),0),cv_aov:f(cv(v),3),
    max:f(Math.max(...v),0),top1_share_pct:f(100*Math.max(...v)/v.reduce((a,b)=>a+b,0),1)});}
console.table(t.sort((a,b)=>b.orders-a.orders));
const gg={};
for(const [cc,v] of byC){ const k=bucketOf(cc); (gg[k]??=[]).push(...v); }
console.table(Object.entries(gg).map(([k,v])=>({bucket:k,orders:v.length,aov:f(mean(v),0),cv_aov:f(cv(v),3)})));
