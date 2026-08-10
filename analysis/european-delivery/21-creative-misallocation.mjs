import fs from 'node:fs';
const ads=JSON.parse(fs.readFileSync('meta-ads-all.json','utf8'));
const f=(n,d=2)=>Number.isFinite(n)?Number(n.toFixed(d)):0;
const UK=ads.filter(a=>a.cc==='GB'&&a.spend>300);
const pear=(x,y)=>{const n=x.length,mx=x.reduce((a,b)=>a+b)/n,my=y.reduce((a,b)=>a+b)/n;
  let s=0,dx=0,dy=0; for(let i=0;i<n;i++){const a=x[i]-mx,b=y[i]-my; s+=a*b;dx+=a*a;dy+=b*b;} return s/Math.sqrt(dx*dy);};

// campaign-level ATC rate vs ROAS across UK campaigns
const byC=new Map();
for(const a of UK){ const v=byC.get(a.camp)||{spend:0,lc:0,atc:0,pv:0,ads:[]};
  v.spend+=a.spend; v.lc+=a.lc; v.atc+=a.atc; v.pv+=a.pv; v.ads.push(a); byC.set(a.camp,v);}
const list=[...byC].map(([c,v])=>({c,atc:v.atc/v.lc,roas:v.pv/v.spend,spend:v.spend,v}));
console.log('=== UK: campaign ATC-per-click vs campaign ROAS ===');
console.log(`pearson r = ${f(pear(list.map(x=>x.atc),list.map(x=>x.roas)),3)}  (n=${list.length} UK campaigns)`);

console.log('\n=== THE MISALLOCATION: UK spend vs creative quality ===');
const all=UK.map(a=>({ad:a.ad,camp:a.camp,spend:a.spend,rate:a.atc/(a.lc||1),lc:a.lc}));
const med=[...all].sort((a,b)=>a.rate-b.rate)[Math.floor(all.length/2)].rate;
const good=all.filter(a=>a.rate>=0.15), bad=all.filter(a=>a.rate<0.08);
const sum=a=>a.reduce((s,x)=>s+x.spend,0);
console.log(`median UK ad ATC-per-click: ${f(med,3)}`);
console.log(`ads at >=0.15 ATC/click : ${good.length} ads, ${f(sum(good),0)} TRY (${f(100*sum(good)/sum(all),0)}% of UK spend)`);
console.log(`ads at < 0.08 ATC/click : ${bad.length} ads, ${f(sum(bad),0)} TRY (${f(100*sum(bad)/sum(all),0)}% of UK spend)`);
console.log('\nTop 5 UK ads by spend:');
console.table([...all].sort((a,b)=>b.spend-a.spend).slice(0,5).map(a=>({ad:a.ad.slice(0,40),campaign:a.camp,
  spend_try:f(a.spend,0),clicks:a.lc,atc_per_click:f(a.rate,3),vs_median:f(a.rate/med,2)+'x'})));
console.log('\nTop 5 UK ads by ATC-per-click (min 100 clicks):');
console.table([...all].filter(a=>a.lc>=100).sort((a,b)=>b.rate-a.rate).slice(0,5).map(a=>({ad:a.ad.slice(0,40),campaign:a.camp,
  spend_try:f(a.spend,0),clicks:a.lc,atc_per_click:f(a.rate,3),vs_median:f(a.rate/med,2)+'x'})));
