// ShawQ Checkout Session Replay — Shopify Theme App Embed / Custom Liquid snippet
// Paste into Online Store -> Themes -> Edit code -> theme.liquid (before </body>)
// or add as an App embed / Custom Liquid block on all pages.
//
// Records storefront DOM replay (rrweb) for cart + pre-checkout pages and posts chunks to ShawQ.
// Pair with shopify/customer-events-pixel.js so checkout step events line up with the same session_id.
//
// 1. Set ENDPOINT to your deployed dashboard URL.
// 2. If SESSION_EVENT_INGEST_KEY is set on the server, paste the same value into INGEST_KEY.
// 3. Hosted Shopify checkout (checkout.shopify.com) cannot be DOM-recorded from the theme;
//    those steps still appear in the dashboard timeline from the Customer Events pixel.

(function () {
  var ENDPOINT = 'https://shawq-ads-production.up.railway.app/api/session-replay';
  var INGEST_KEY = '';
  var STORE = 'shawq';
  var RRWEB_SRC = 'https://cdn.jsdelivr.net/npm/rrweb@2.0.1/dist/rrweb.min.js';
  var RECORD_PATH_RE = /\/(products|collections|pages|cart|checkout)(\/|$|\?)/i;
  var FLUSH_MS = 4000;
  var MAX_EVENTS_PER_CHUNK = 80;
  var chunkSeq = 0;
  var pendingEvents = [];
  var stopRecord = null;
  var flushTimer = null;

  function cookieName(base) {
    return (base + '__' + STORE).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function readCookie(name) {
    try {
      var parts = ('; ' + document.cookie).split('; ' + name + '=');
      if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift() || '');
    } catch (_error) {}
    return '';
  }

  function sessionIdentity() {
    var sessionId = readCookie(cookieName('virona_si_session_id')) || readCookie('virona_si_session1_session_id__' + STORE) || '';
    var clientId = readCookie(cookieName('virona_si_client_id')) || '';
    return { sessionId: sessionId, clientId: clientId };
  }

  function shouldRecordHere() {
    try {
      return RECORD_PATH_RE.test(String(window.location.pathname || ''));
    } catch (_error) {
      return false;
    }
  }

  function postChunk(events) {
    if (!events || !events.length) return;
    var identity = sessionIdentity();
    if (!identity.sessionId && !identity.clientId) return;
    var headers = { 'Content-Type': 'application/json' };
    if (INGEST_KEY) headers['x-session-event-key'] = INGEST_KEY;
    chunkSeq += 1;
    var payload = JSON.stringify({
      session_id: identity.sessionId,
      client_id: identity.clientId,
      chunk_seq: chunkSeq,
      timestamp: new Date().toISOString(),
      path: String(window.location.href || '').slice(0, 500),
      country_code: '',
      viewport: {
        width: window.innerWidth || 0,
        height: window.innerHeight || 0,
      },
      events: events.slice(0, MAX_EVENTS_PER_CHUNK),
    });
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(ENDPOINT + (INGEST_KEY ? '?key=' + encodeURIComponent(INGEST_KEY) : ''), blob);
        return;
      }
    } catch (_error) {}
    fetch(ENDPOINT, { method: 'POST', headers: headers, keepalive: true, body: payload }).catch(function () {});
  }

  function flushPending(force) {
    if (!pendingEvents.length) return;
    if (!force && pendingEvents.length < 12) return;
    var batch = pendingEvents.splice(0, MAX_EVENTS_PER_CHUNK);
    postChunk(batch);
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = window.setInterval(function () {
      flushPending(true);
    }, FLUSH_MS);
  }

  function onPageHide() {
    flushPending(true);
    if (typeof stopRecord === 'function') {
      try { stopRecord(); } catch (_error) {}
      stopRecord = null;
    }
  }

  function startRecording(rrweb) {
    if (!rrweb || typeof rrweb.record !== 'function') return;
    if (typeof stopRecord === 'function') return;
    stopRecord = rrweb.record({
      emit: function (event) {
        pendingEvents.push(event);
        if (pendingEvents.length >= MAX_EVENTS_PER_CHUNK) flushPending(true);
      },
      maskAllInputs: true,
      maskTextSelector: '[data-shawq-mask], input, textarea, select',
      blockClass: 'shawq-replay-block',
      ignoreClass: 'shawq-replay-ignore',
      sampling: {
        mousemove: 80,
        scroll: 120,
      },
    });
    scheduleFlush();
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') onPageHide();
    });
  }

  function loadScript(src, callback) {
    var script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = function () { callback(); };
    script.onerror = function () {};
    document.head.appendChild(script);
  }

  if (!shouldRecordHere()) return;
  loadScript(RRWEB_SRC, function () {
    startRecording(window.rrweb);
  });
})();
