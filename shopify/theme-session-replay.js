// Prefer the hosted recorder (auto-updated, auto-installable via ScriptTag):
//   https://shawq-ads-production.up.railway.app/shopify/session-recorder.js
// This file is a static fallback if you cannot use ScriptTag.

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
    var clientId = readCookie('_shopify_y') || readCookie(cookieName('virona_si_client_id')) || fallbackClientId();
    var shopifySession = readCookie('_shopify_s') || '';
    var sessionId = readCookie(cookieName('virona_si_session_id')) || (clientId && shopifySession ? clientId + ':' + shopifySession.slice(0, 12) : fallbackSessionId(clientId));
    return { sessionId: sessionId, clientId: clientId };
  }

  function storageKey(base) {
    return (base + '__' + STORE).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function fallbackClientId() {
    var key = storageKey('replay_client_id');
    try {
      var existing = localStorage.getItem(key);
      if (existing) return existing;
      var id = 'sr_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(key, id);
      return id;
    } catch (_error) {
      return 'sr_' + Date.now();
    }
  }

  function fallbackSessionId(clientId) {
    var key = storageKey('replay_session_id');
    try {
      var existing = sessionStorage.getItem(key);
      if (existing) return existing;
      var id = clientId + ':' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(key, id);
      return id;
    } catch (_error) {
      return clientId + ':' + Date.now();
    }
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
  function waitIdentity(tries, cb) {
    var id = sessionIdentity();
    if (id.clientId || id.sessionId || tries <= 0) return cb();
    setTimeout(function () { waitIdentity(tries - 1, cb); }, 250);
  }
  waitIdentity(12, function () {
    loadScript(RRWEB_SRC, function () {
      startRecording(window.rrweb);
    });
  });
})();
