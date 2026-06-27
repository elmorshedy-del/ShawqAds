export function buildSessionRecorderScript({
  endpoint = '/api/session-replay',
  ingestKey = '',
  store = 'shawq',
} = {}) {
  const safeEndpoint = String(endpoint || '/api/session-replay').replace(/'/g, "\\'");
  const safeKey = String(ingestKey || '').replace(/'/g, "\\'");
  const safeStore = String(store || 'shawq').replace(/'/g, "\\'");
  return `/* ShawQ hosted session recorder — auto-installed via ScriptTag or theme embed */
(function(){var ENDPOINT='${safeEndpoint}',INGEST_KEY='${safeKey}',STORE='${safeStore}',RRWEB_SRC='https://cdn.jsdelivr.net/npm/rrweb@2.0.1/dist/rrweb.min.js',RECORD_PATH_RE=/\\/(products|collections|pages|cart|checkout)(\\/|$|\\?)/i,FLUSH_MS=4000,MAX_EVENTS=80,chunkSeq=0,pending=[],stopRecord=null,flushTimer=null;
function cookieName(b){return(b+'__'+STORE).replace(/[^a-zA-Z0-9_-]/g,'_');}
function storageKey(b){return(b+'__'+STORE).replace(/[^a-zA-Z0-9_-]/g,'_');}
function readCookie(n){try{var p=('; '+document.cookie).split('; '+n+'=');if(p.length===2)return decodeURIComponent(p.pop().split(';').shift()||'');}catch(e){}return'';}
function fallbackClientId(){var key=storageKey('replay_client_id');try{var existing=localStorage.getItem(key);if(existing)return existing;var id='sr_'+Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem(key,id);return id;}catch(e){return'sr_'+Date.now();}}
function fallbackSessionId(clientId){var key=storageKey('replay_session_id');try{var existing=sessionStorage.getItem(key);if(existing)return existing;var id=clientId+':'+Math.random().toString(36).slice(2,10);sessionStorage.setItem(key,id);return id;}catch(e){return clientId+':'+Date.now();}}
function identity(){var clientId=readCookie('_shopify_y')||readCookie(cookieName('virona_si_client_id'))||fallbackClientId();var shopifySession=readCookie('_shopify_s')||'';var sessionId=readCookie(cookieName('virona_si_session_id'))||(clientId&&shopifySession?clientId+':'+shopifySession.slice(0,12):fallbackSessionId(clientId));return{sessionId:sessionId,clientId:clientId};}
function shouldRecord(){try{return RECORD_PATH_RE.test(String(location.pathname||''));}catch(e){return false;}}
function postChunk(events){if(!events||!events.length)return;var id=identity();if(!id.sessionId&&!id.clientId)return;var headers={'Content-Type':'application/json'};if(INGEST_KEY)headers['x-session-event-key']=INGEST_KEY;chunkSeq+=1;var body=JSON.stringify({session_id:id.sessionId,client_id:id.clientId,chunk_seq:chunkSeq,timestamp:new Date().toISOString(),path:String(location.href||'').slice(0,500),country_code:'',viewport:{width:innerWidth||0,height:innerHeight||0},events:events.slice(0,MAX_EVENTS)});try{if(navigator.sendBeacon){navigator.sendBeacon(ENDPOINT+(INGEST_KEY?'?key='+encodeURIComponent(INGEST_KEY):''),new Blob([body],{type:'application/json'}));return;}}catch(e){}fetch(ENDPOINT,{method:'POST',headers:headers,keepalive:true,body:body}).catch(function(){});}
function flush(force){if(!pending.length)return;if(!force&&pending.length<12)return;postChunk(pending.splice(0,MAX_EVENTS));}
function schedule(){if(flushTimer)return;flushTimer=setInterval(function(){flush(true);},FLUSH_MS);}
function onHide(){flush(true);if(typeof stopRecord==='function'){try{stopRecord();}catch(e){}stopRecord=null;}}
function waitIdentity(tries,cb){var id=identity();if(id.clientId||id.sessionId||tries<=0)return cb();setTimeout(function(){waitIdentity(tries-1,cb);},250);}
function start(rrweb){if(!rrweb||typeof rrweb.record!=='function')return;if(typeof stopRecord==='function')return;stopRecord=rrweb.record({emit:function(ev){pending.push(ev);if(pending.length>=MAX_EVENTS)flush(true);},maskAllInputs:true,maskTextSelector:'[data-shawq-mask],input,textarea,select',blockClass:'shawq-replay-block',ignoreClass:'shawq-replay-ignore',sampling:{mousemove:80,scroll:120}});schedule();addEventListener('pagehide',onHide);addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')onHide();});}
function load(src,cb){var s=document.createElement('script');s.src=src;s.async=true;s.onload=cb;s.onerror=function(){};document.head.appendChild(s);}
if(!shouldRecord())return;waitIdentity(12,function(){load(RRWEB_SRC,function(){start(window.rrweb);});});})();`;
}

export function recorderScriptTagSrc(publicBaseUrl = '') {
  const base = String(publicBaseUrl || '').replace(/\/$/, '');
  return `${base}/shopify/session-recorder.js`;
}

export async function listShopifyScriptTags({ token, store, apiVersion = '2025-10' }) {
  const url = new URL(`https://${store}/admin/api/${apiVersion}/script_tags.json`);
  url.searchParams.set('limit', '250');
  const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
  const text = await res.text();
  if (!res.ok) throw new Error(`script_tags list ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text).script_tags || [];
}

export async function ensureShopifyRecorderScriptTag({
  token,
  store,
  apiVersion = '2025-10',
  src,
}) {
  const tags = await listShopifyScriptTags({ token, store, apiVersion });
  const existing = tags.find((tag) => String(tag.src || '').includes('/shopify/session-recorder.js'));
  if (existing) return { ok: true, created: false, script_tag: existing };

  const res = await fetch(`https://${store}/admin/api/${apiVersion}/script_tags.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      script_tag: {
        event: 'onload',
        src,
        display_scope: 'online_store',
      },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`script_tags create ${res.status}: ${text.slice(0, 400)}`);
  return { ok: true, created: true, script_tag: JSON.parse(text).script_tag };
}
