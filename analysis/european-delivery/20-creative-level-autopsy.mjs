import fs from 'node:fs';
const ads=JSON.parse(fs.readFileSync('meta-ads-all.json','utf8'));
const f=(n,d=2)=>Number.isFinite(n)?Number(n.toFixed(d)):0;
const UK=ads.filter(a=>a.cc==='GB'&&a.spend>500);

console.log('=== UK ADS RANKED BY ATC-PER-CLICK (the link that broke) ===');
const rows=UK.map(a=>({ad:a.ad.slice(0,38),campaign:a.camp.slice(0,18),spend:f(a.spend,0),
  clicks:a.lc,atc:a.atc,atc_per_click:f(a.atc/(a.lc||1),3),pur:a.pur,roas:f(a.pv/a.spend,2),cpm:f(a.cpm,0)}))
  .sort((x,y)=>y.atc_per_click-x.atc_per_click);
console.table(rows);

console.log('\n=== DID THE WINNING CREATIVES EVER RUN AGAIN? ===');
// group ads by name across campaigns
const byAd=new Map();
for(const a of UK){ const k=a.ad; const v=byAd.get(k)||{camps:new Set(),spend:0,lc:0,atc:0,pur:0,pv:0};
  v.camps.add(a.camp); v.spend+=a.spend; v.lc+=a.lc; v.atc+=a.atc; v.pur+=a.pur; v.pv+=a.pv; byAd.set(k,v);}
const reused=[...byAd].filter(([,v])=>v.camps.size>1);
console.log(`Distinct UK ads: ${byAd.size}. Ads that ran in more than one campaign: ${reused.length}`);
if(reused.length) console.table(reused.map(([k,v])=>({ad:k.slice(0,36),campaigns:[...v.camps].join(', ').slice(0,44),
  spend:f(v.spend,0),atc_per_click:f(v.atc/(v.lc||1),3),roas:f(v.pv/v.spend,2)})));

console.log('\n=== CREATIVE CONCENTRATION per campaign (how much rode on one ad?) ===');
const byC=new Map();
for(const a of UK){ (byC.get(a.camp)||byC.set(a.camp,[]).get(a.camp)).push(a); }
console.table([...byC].map(([c,list])=>{
  const tot=list.reduce((s,x)=>s+x.spend,0);
  const top=list.sort((x,y)=>y.spend-x.spend)[0];
  const pv=list.reduce((s,x)=>s+x.pv,0);
  return {campaign:c.slice(0,20),ads:list.length,spend:f(tot,0),roas:f(pv/tot,2),
    top_ad:top.ad.slice(0,30),top_ad_share:f(100*top.spend/tot,0)+'%',
    top_ad_atc_rate:f(top.atc/(top.lc||1),3),
    campaign_atc_rate:f(list.reduce((s,x)=>s+x.atc,0)/list.reduce((s,x)=>s+x.lc,0),3)};})
  .sort((a,b)=>b.roas-a.roas));
