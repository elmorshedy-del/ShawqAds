import fs from 'node:fs';
const m=JSON.parse(fs.readFileSync('meta-country-daily.json','utf8'));
const fx=JSON.parse(fs.readFileSync('fx-try-usd.json','utf8'));
const fxd=Object.keys(fx.rates).sort();
const usd=(d)=>{let lo=0,hi=fxd.length-1,b=fxd[0]; while(lo<=hi){const mid=(lo+hi)>>1; if(fxd[mid]<=d){b=fxd[mid];lo=mid+1}else hi=mid-1;} return fx.rates[b].USD;};
const f=(n,d=2)=>Number.isFinite(n)?Number(n.toFixed(d)):0;
const rows=m.country_daily.filter(r=>r.spend>0);

console.log('=== CPM IN USD BY MONTH (strips out TRY depreciation) ===');
const cc=['GB','DE','FR','NL','CH','IT','ES','US','CA','AU','AE'];
const g=new Map();
for(const r of rows){ if(!cc.includes(r.country)) continue;
  const k=r.country+'|'+r.date.slice(0,7);
  const v=g.get(k)||{sp:0,imp:0,reach:0}; v.sp+=r.spend*usd(r.date); v.imp+=r.impressions; v.reach+=r.reach; g.set(k,v);}
const months=[...new Set(rows.map(r=>r.date.slice(0,7)))].sort();
const tbl=[];
for(const c of cc){ const row={cc:c};
  for(const mo of months){ const v=g.get(c+'|'+mo); row[mo.slice(5)]=v&&v.imp>3000?f(1000*v.sp/v.imp,2):null;}
  const first=row['01']??row['02']??row['03'], last=row['08']??row['07']??row['06'];
  row['change']=first&&last?f(100*(last/first-1),0)+'%':'—';
  tbl.push(row);}
console.table(tbl);

console.log('=== FREQUENCY BY MONTH (audience exhaustion: impressions / reach) ===');
const tf=[];
for(const c of cc){ const row={cc:c};
  for(const mo of months){ const v=g.get(c+'|'+mo); row[mo.slice(5)]=v&&v.imp>3000?f(v.imp/v.reach,2):null;}
  tf.push(row);}
console.table(tf);
