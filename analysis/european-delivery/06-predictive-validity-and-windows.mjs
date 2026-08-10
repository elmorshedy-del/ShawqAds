import {metaRows,region,groupBy,f,GDPR,mean,sd,cv,median,pearson,spearman} from './lib.mjs';
const rows=metaRows();
const bucketOf=(cc)=>{ if(GDPR.has(cc)) return 'EU/EEA+UK'; if(region(cc)==='Europe') return 'Eur non-EEA'; return region(cc);};
const isoWeek=(d)=>{const dt=new Date(d+'T00:00:00Z'); const t=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate()));
  const day=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-day+3); const f1=new Date(Date.UTC(t.getUTCFullYear(),0,4));
  return t.getUTCFullYear()+'-W'+String(1+Math.round(((t-f1)/86400000-3+((f1.getUTCDay()+6)%7))/7)).padStart(2,'0');};

// ---- 3. PREDICTIVE VALIDITY: does this week's ROAS predict next week's? ----
console.log('=== 3. DOES A WEEK-1 READ PREDICT WEEK-2? (lag-1 autocorrelation of weekly ROAS) ===');
console.log('r ~ 0 means the number you optimise on carries no information about what happens next.');
const cw=new Map();
for(const r of rows){const k=r.country+'|'+isoWeek(r.date); const v=cw.get(k)||{cc:r.country,w:isoWeek(r.date),spend:0,pur:0,pv:0};
  v.spend+=r.spend; v.pur+=r.purchases; v.pv+=r.purchase_value; cw.set(k,v);}
const t=[];
for(const [cc,vs] of groupBy([...cw.values()],v=>v.cc)){
  const s=vs.filter(v=>v.spend>500).sort((a,b)=>a.w.localeCompare(b.w));
  if(s.length<8) continue;
  const roas=s.map(v=>v.pv/v.spend);
  const x=roas.slice(0,-1), y=roas.slice(1);
  t.push({cc,reg:bucketOf(cc),weeks:s.length,conv_per_week:f(mean(s.map(v=>v.pur)),1),
    lag1_pearson:f(pearson(x,y),2),lag1_spearman:f(spearman(x,y),2),
    r2_pct:f(100*pearson(x,y)**2,1)});}
console.table(t.sort((a,b)=>b.conv_per_week-a.conv_per_week));
const g={};
for(const r of t){(g[r.reg]??=[]).push(r);}
console.log('--- pooled by bucket (spend-weighted mean |r| is meaningless; showing median r) ---');
console.table(Object.entries(g).map(([k,v])=>({bucket:k,countries:v.length,median_lag1_r:f(median(v.map(x=>x.lag1_pearson)),2),median_conv_wk:f(median(v.map(x=>x.conv_per_week)),1)})));

// ---- 4. HOW LONG MUST YOU WAIT? ----
console.log('\n=== 4. MINIMUM EVALUATION WINDOW: days needed for a +/-30% reliable ROAS read ===');
console.log('Need N conversions where sqrt((1+cv_aov^2)/N) <= 0.30  =>  N >= (1+cv_aov^2)/0.09');
const aovCv={US:0.479,GB:0.351,AU:0.364,CA:0.571,DE:0.353,FR:0.507,NL:0.396,ES:0.304,BE:0.406,IT:0.352,CH:0.365,AE:0.407,SA:0.521,QA:0.582,SG:0.466,DK:0.4,AT:0.4,SE:0.4,NO:0.4,KW:0.4,OM:0.4,BH:0.4,JO:0.4};
const cd=new Map();
for(const r of rows){const k=r.country; const v=cd.get(k)||{spend:0,pur:0,days:new Set()}; v.spend+=r.spend; v.pur+=r.purchases; v.days.add(r.date); cd.set(k,v);}
const w=[];
for(const [cc,v] of cd){ if(v.spend<8000||!v.days.size) continue;
  const perDay=v.pur/v.days.size; if(perDay<=0) continue;
  const g2=aovCv[cc]??0.45; const need30=(1+g2*g2)/0.09; const need50=(1+g2*g2)/0.25;
  w.push({cc,reg:bucketOf(cc),conv_per_active_day:f(perDay,2),
    conv_needed_30pct:Math.ceil(need30),days_for_30pct:Math.ceil(need30/perDay),
    conv_needed_50pct:Math.ceil(need50),days_for_50pct:Math.ceil(need50/perDay)});}
console.table(w.sort((a,b)=>a.days_for_30pct-b.days_for_30pct));
