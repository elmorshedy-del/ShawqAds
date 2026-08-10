import {metaRows,region,groupBy,f,GDPR,mean,median,sd,sum,pearson,spearman,normP} from './lib.mjs';
const rows=metaRows();
const isEU=(cc)=>GDPR.has(cc)||region(cc)==='Europe';
const isoWeek=(d)=>{const dt=new Date(d+'T00:00:00Z'); const t=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate()));
  const day=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-day+3); const f1=new Date(Date.UTC(t.getUTCFullYear(),0,4));
  return t.getUTCFullYear()+'-W'+String(1+Math.round(((t-f1)/86400000-3+((f1.getUTCDay()+6)%7))/7)).padStart(2,'0');};

// ---- 15. EVENT VOLUME: why an upper-funnel signal converges faster ----
console.log('=== 15. EVENTS AVAILABLE PER COUNTRY-WEEK (more events = faster readable signal) ===');
const cw=new Map();
for(const r of rows){ if(!isEU(r.country)) continue; const k=r.country+'|'+isoWeek(r.date);
  const v=cw.get(k)||{cc:r.country,spend:0,pur:0,atc:0,ic:0,lc:0}; v.spend+=r.spend; v.pur+=r.purchases;
  v.atc+=r.add_to_cart; v.ic+=r.checkout_initiated; v.lc+=r.link_clicks; cw.set(k,v);}
const t=[];
for(const [cc,vs] of groupBy([...cw.values()],v=>v.cc)){
  const act=vs.filter(v=>v.spend>500); if(act.length<6) continue;
  const P=mean(act.map(v=>v.pur)), A=mean(act.map(v=>v.atc)), I=mean(act.map(v=>v.ic)), L=mean(act.map(v=>v.lc));
  // relative standard error of a rate estimated from N events ~ 1/sqrt(N)
  t.push({cc,weeks:act.length,purch_wk:f(P,1),atc_wk:f(A,1),ic_wk:f(I,1),clicks_wk:f(L,0),
    rse_purch_pct:f(100/Math.sqrt(P||1),0),rse_atc_pct:f(100/Math.sqrt(A||1),0),rse_ic_pct:f(100/Math.sqrt(I||1),0),
    atc_multiple:f(A/(P||1),1)});}
console.table(t.sort((a,b)=>b.purch_wk-a.purch_wk));

// ---- 16. FORWARD TEST: does week-N ATC-rate predict week-N+1 ROAS better than week-N ROAS does? ----
console.log('\n=== 16. FORWARD PREDICTION on European adset-weeks (out-of-period) ===');
const aw=new Map();
for(const r of rows){ const k=r.adset_id+'|'+isoWeek(r.date);
  const v=aw.get(k)||{ad:r.adset_id,w:isoWeek(r.date),spend:0,pv:0,pur:0,atc:0,ic:0,lc:0,imp:0,euS:0};
  v.spend+=r.spend; v.pv+=r.purchase_value; v.pur+=r.purchases; v.atc+=r.add_to_cart; v.ic+=r.checkout_initiated;
  v.lc+=r.link_clicks; v.imp+=r.impressions; if(isEU(r.country)) v.euS+=r.spend; aw.set(k,v);}
const eu=[...aw.values()].filter(v=>v.spend>=3000&&v.euS/v.spend>=0.6&&v.lc>0);
const byAd=groupBy(eu,v=>v.ad);
const pairs=[];
for(const [ad,vs] of byAd){ const s=vs.sort((a,b)=>a.w.localeCompare(b.w));
  for(let i=0;i<s.length-1;i++){ const a=s[i],b=s[i+1];
    // consecutive weeks only
    pairs.push({roas_t:a.pv/a.spend, atc_t:a.atc/a.lc, ic_t:a.ic/a.lc, ctr_t:a.lc/a.imp, cpc_t:a.spend/a.lc, roas_next:b.pv/b.spend});}}
console.log(`n = ${pairs.length} consecutive European adset-week pairs`);
const test=(name,key)=>{const x=pairs.map(p=>p[key]), y=pairs.map(p=>p.roas_next);
  const r=spearman(x,y); const z=r*Math.sqrt(pairs.length-1);
  console.log(`  ${name.padEnd(28)} spearman ${String(f(r,3)).padStart(6)}  z=${String(f(z,2)).padStart(6)}  p=${f(normP(z),4)}`);};
console.log('predicting NEXT week ROAS from THIS week:');
test('this week ROAS','roas_t'); test('this week ATC / link click','atc_t'); test('this week IC / link click','ic_t');
test('this week CTR','ctr_t'); test('this week CPC','cpc_t');

// tercile lift: act on ATC rate
const s=[...pairs].sort((a,b)=>a.atc_t-b.atc_t); const n=Math.floor(s.length/3);
const terc=[s.slice(0,n),s.slice(n,2*n),s.slice(2*n)];
console.log('\nIf you had ranked European adsets on ATC-per-click and looked at what they did NEXT week:');
console.table(terc.map((c,i)=>({tercile:['bottom third','middle third','top third'][i],adset_weeks:c.length,
  median_atc_per_click:f(median(c.map(x=>x.atc_t)),3),next_week_median_roas:f(median(c.map(x=>x.roas_next)),2),
  next_week_mean_roas:f(mean(c.map(x=>x.roas_next)),2)})));
const s2=[...pairs].sort((a,b)=>a.roas_t-b.roas_t);
const terc2=[s2.slice(0,n),s2.slice(n,2*n),s2.slice(2*n)];
console.log('Same exercise ranking on ROAS instead (what is being done today):');
console.table(terc2.map((c,i)=>({tercile:['bottom third','middle third','top third'][i],adset_weeks:c.length,
  median_this_week_roas:f(median(c.map(x=>x.roas_t)),2),next_week_median_roas:f(median(c.map(x=>x.roas_next)),2),
  next_week_mean_roas:f(mean(c.map(x=>x.roas_next)),2)})));
