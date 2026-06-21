/*
  ShawQ PDP Intelligence Probe (v1.1) — full-page behaviour capture for the product page.

  WHAT IT DOES
  Captures the size-decision struggle and everything around it on a product page (the skirt and any
  PDP): size selections + oscillation, add/remove cart churn, size-chart opens, gallery views/zooms,
  accordion/detail opens, scroll depth, per-section dwell, Add-to-Cart hover + approach/retreat, idle
  stalls, and the exact exit point — PLUS a raw fallback that records every meaningful click, so the
  page is captured even where a specific control isn't recognised ("100% tracked").

  WHERE TO INSTALL  (NOT a Web Pixel — Web Pixels are sandboxed and cannot read the DOM)
  Shopify Admin → Online Store → Themes → Edit code → add this as a snippet and {% render %} it from
  the product template, OR add it as a theme app-embed. It must run on the storefront product page.

  STITCHING
  Reads Shopify's first-party _shopify_y cookie as the client id — the same value the Customer-Events
  pixel sends as clientId — so the probe's DOM events join the same shopper. Session = the probe's own
  30-min window + Shopify's _shopify_s, reconciled later by client id + time.

  PRIVACY
  Interaction SHAPE only — never input values, names, emails, addresses. Element text is labels/aria
  only, truncated. Passive listeners, throttled, sendBeacon-batched, wrapped so it can never break the
  storefront. No PII leaves the page.
*/
(function () {
  'use strict';
  try {
    var ENDPOINT = 'https://shawq-ads-production.up.railway.app/api/session-events';
    var STORE = 'shawq';
    var SOURCE = 'pdp_probe_v1';
    var ONLY_HANDLES = []; // empty = every product page; e.g. ['kuffiyah-engraved-denim-skirt'] to restrict
    var FLUSH_MS = 8000;
    var IDLE_MS = 20000;
    var MAX_BATCH = 40;
    var MAX_TEXT = 80;

    var path = location.pathname || '';
    if (path.indexOf('/products/') === -1) return; // product pages only
    var handle = (path.split('/products/')[1] || '').split('/')[0].split('?')[0].toLowerCase();
    if (ONLY_HANDLES.length && ONLY_HANDLES.indexOf(handle) === -1) return;

    function now() { return Date.now(); }
    function clamp(s, n) { s = String(s == null ? '' : s).trim(); return s.length > n ? s.slice(0, n) : s; }
    function attr(el, name) { try { return (el && el.getAttribute && el.getAttribute(name)) || ''; } catch (e) { return ''; } }
    function classOf(el) { return clamp(attr(el, 'class'), 160).toLowerCase(); }
    function cookie(name) { try { var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)'); return m ? decodeURIComponent(m.pop()) : ''; } catch (e) { return ''; } }
    function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function uuid() {
      try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
      var s = ''; for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
      return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-a' + s.slice(17, 20) + '-' + s.slice(20);
    }
    function txtOf(el) { return clamp((el && (attr(el, 'aria-label') || attr(el, 'title') || el.textContent)) || '', MAX_TEXT).toLowerCase(); }

    // identity — stitch on Shopify clientId (_shopify_y)
    var clientId = cookie('_shopify_y') || lsGet('si_pdp_cid');
    if (!clientId) { clientId = uuid(); lsSet('si_pdp_cid', clientId); }
    var shopifySession = cookie('_shopify_s');
    var sid = lsGet('si_pdp_sid'), sidTs = parseInt(lsGet('si_pdp_sid_ts') || '0', 10);
    if (!sid || !sidTs || (now() - sidTs) > 30 * 60 * 1000) sid = uuid();
    lsSet('si_pdp_sid', sid); lsSet('si_pdp_sid_ts', String(now()));
    var sessionId = clientId + ':' + sid.slice(0, 8);

    var product = { handle: handle, title: clamp(document.title, 160) };

    var startTs = now(), lastInteractTs = now(), stalled = false, buffer = [];
    var atcEl = null, atcRect = null;
    var state = {
      dwell_ms: 0, scroll_max_pct: 0, scroll_marks: {},
      size_sequence: [], size_switches: 0, size_chart_opens: 0,
      cart_adds: 0, cart_removes: 0, gallery_views: 0, gallery_zooms: 0,
      atc_hovers: 0, atc_retreats: 0, accordion_opens: [], sections: {},
      last_action: '', last_action_ts: 0
    };

    // push = enqueue only (used by passive/system events like stalls — does NOT reset idle)
    function push(name, data) {
      state.last_action = name; state.last_action_ts = now() - startTs;
      buffer.push({ t: now() - startTs, name: name, data: data || {} });
      if (buffer.length >= MAX_BATCH) flush('batch');
    }
    // record = a real user interaction — resets the idle/stall tracking
    function record(name, data) { lastInteractTs = now(); stalled = false; push(name, data); }
    function lastSize() { var s = state.size_sequence; return s.length ? s[s.length - 1].size : ''; }
    function snapshot() {
      state.dwell_ms = now() - startTs;
      return {
        dwell_ms: state.dwell_ms, scroll_max_pct: state.scroll_max_pct, scroll_marks: state.scroll_marks,
        size_sequence: state.size_sequence.slice(-40), size_switches: state.size_switches,
        size_chart_opens: state.size_chart_opens, cart_adds: state.cart_adds, cart_removes: state.cart_removes,
        gallery_views: state.gallery_views, gallery_zooms: state.gallery_zooms,
        atc_hovers: state.atc_hovers, atc_retreats: state.atc_retreats,
        accordion_opens: state.accordion_opens.slice(-20), sections: state.sections,
        last_action: state.last_action, last_action_ts: state.last_action_ts
      };
    }
    function flush(reason) {
      if (!buffer.length && reason !== 'exit') return;
      var batch = buffer.splice(0, buffer.length);
      var body = JSON.stringify({
        store: STORE, source: SOURCE,
        event_name: reason === 'exit' ? 'si_pdp_exit' : 'si_pdp',
        client_id: clientId, session_id: sessionId, shopify_session: shopifySession,
        timestamp: new Date().toISOString(),
        path: clamp(location.href, 500), referrer: clamp(document.referrer, 500), product: product,
        data: { reason: reason, events: batch, state: snapshot() }
      });
      try {
        if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
        else fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
      } catch (e) {}
    }

    function describe(el) {
      if (!el || el.nodeType !== 1) return null;
      var d = { tag: (el.tagName || '').toLowerCase(), id: clamp(el.id, 60), cls: classOf(el), role: clamp(attr(el, 'role'), 40), type: clamp(attr(el, 'type'), 40) };
      var t = clamp(attr(el, 'aria-label') || attr(el, 'title') || el.textContent, MAX_TEXT); if (t) d.text = t;
      var data = {}; try { for (var i = 0; i < el.attributes.length; i++) { var a = el.attributes[i]; if (a.name.indexOf('data-') === 0) data[a.name] = clamp(a.value, 60); } } catch (e) {}
      if (Object.keys(data).length) d.data = data;
      return d;
    }

    // Strict apparel-size token; numerics only accepted via explicit data-* option values (below).
    var SIZE_RE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl)$/;
    function isSizeControl(el) {
      if (!el) return false;
      if (/size/.test(clamp(attr(el, 'name'), 60).toLowerCase())) return true;
      var optName = clamp(attr(el, 'data-option-name') || attr(el, 'data-option'), 40).toLowerCase();
      if (/size/.test(optName)) return true;
      var dv = attr(el, 'data-option-value') || attr(el, 'data-value') || attr(el, 'data-size');
      if (dv) { var v = clamp(dv, 20).toLowerCase(); return SIZE_RE.test(v) || /^[0-9]{1,2}$/.test(v); }
      // text fallback ONLY for option-like controls, and only strict letter sizes (no bare numbers)
      var optionish = el.tagName === 'LABEL' || el.type === 'radio' || /swatch|option|variant|size/.test(classOf(el));
      return optionish && SIZE_RE.test(txtOf(el));
    }
    function sizeLabel(el) { return clamp(attr(el, 'data-option-value') || attr(el, 'data-value') || attr(el, 'data-size') || el.value || el.textContent, 40); }
    function noteSize(label, via) {
      label = clamp(label, 40); if (!label) return;
      var seq = state.size_sequence;
      if (seq.length && seq[seq.length - 1].size === label) return; // ignore repeat of same size
      if (seq.length) state.size_switches += 1;
      seq.push({ size: label, t: now() - startTs, via: via });
      record('si_size_selected', { size: label, via: via, switch_count: state.size_switches });
    }

    // ---- listeners (document/window exist now; DOM-specific lookups deferred to onReady) ----
    document.addEventListener('change', function (e) {
      var el = e.target; if (!el) return;
      if (el.tagName === 'SELECT' && /id|option|variant|size/i.test(el.name || '')) {
        var opt = el.options && el.options[el.selectedIndex];
        var lbl = opt ? clamp(opt.textContent, 40) : clamp(el.value, 40);
        if (/size/i.test(el.name || '') || isSizeControl(el)) noteSize(lbl, 'select');
        record('si_variant_changed', { value: lbl, name: clamp(el.name, 40) });
      } else if (el.type === 'radio' && isSizeControl(el)) {
        noteSize(sizeLabel(el), 'radio');
      }
    }, true);

    document.addEventListener('click', function (e) {
      var t = e.target; if (!t || t.nodeType !== 1) return;
      var node = (t.closest && t.closest('a,button,[role="button"],label,[data-option-value],.swatch,[data-size],input,summary')) || t;
      var label = txtOf(node), cls = classOf(node);
      if (isSizeControl(node) && node.tagName !== 'SELECT') noteSize(sizeLabel(node), 'swatch');
      if (/size chart|size guide|sizing|fit guide/.test(label) || /size-chart|size-guide/.test(clamp(attr(node, 'data-modal') || attr(node, 'href'), 120))) {
        state.size_chart_opens += 1; record('si_size_chart_open', { via: clamp(label, 40) });
      }
      if (node === atcEl || /add to (cart|bag)|add to basket/.test(label)) {
        state.cart_adds += 1; record('si_atc_click', { size: lastSize(), label: clamp(label, 40) });
      }
      if (/^remove$|remove item|delete/.test(label) || /remove|cart__remove|line-item-remove/.test(cls)) {
        state.cart_removes += 1; record('si_cart_remove', { label: clamp(label, 40) });
      }
      if (/zoom|gallery|product-media|thumbnail|thumb/.test(cls)) {
        if (/zoom/.test(cls)) { state.gallery_zooms += 1; record('si_gallery_zoom', {}); }
        else { state.gallery_views += 1; record('si_gallery_view', {}); }
      }
      if (node.tagName === 'SUMMARY' || /accordion|tab|collapsible/.test(cls)) {
        if (/fit|fabric|care|material|shipping|return|detail|description|review/.test(label)) {
          state.accordion_opens.push(clamp(label, 40)); record('si_accordion_open', { section: clamp(label, 40) });
        }
      }
      record('si_click', { target: describe(node) }); // raw fallback — never miss an interaction
    }, true);

    document.addEventListener('toggle', function (e) {
      var el = e.target;
      if (el && el.tagName === 'DETAILS' && el.open) {
        var l = txtOf(el.querySelector && el.querySelector('summary')) || txtOf(el);
        state.accordion_opens.push(clamp(l, 40)); record('si_accordion_open', { section: clamp(l, 40) });
      }
    }, true);

    var scrollPending = false;
    window.addEventListener('scroll', function () {
      if (scrollPending) return; scrollPending = true;
      requestAnimationFrame(function () {
        scrollPending = false;
        if (atcEl) { try { atcRect = atcEl.getBoundingClientRect(); } catch (e) {} } // refresh cached rect on scroll
        var h = document.documentElement, max = (h.scrollHeight - h.clientHeight) || 1;
        var pct = Math.min(100, Math.round(((h.scrollTop || window.pageYOffset) / max) * 100));
        if (pct > state.scroll_max_pct) {
          state.scroll_max_pct = pct;
          [25, 50, 75, 100].forEach(function (m) { if (pct >= m && !state.scroll_marks[m]) { state.scroll_marks[m] = now() - startTs; record('si_scroll', { depth: m }); } });
        }
      });
    }, { passive: true });

    // ATC approach/retreat — uses the CACHED rect (no layout read on mousemove)
    var near = false, lastDist = Infinity, mvPending = false;
    document.addEventListener('mousemove', function (e) {
      if (!atcRect || mvPending) return; mvPending = true;
      requestAnimationFrame(function () {
        mvPending = false;
        var cx = atcRect.left + atcRect.width / 2, cy = atcRect.top + atcRect.height / 2;
        var dx = e.clientX - cx, dy = e.clientY - cy, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 160) { if (!near) near = true; } else if (near && dist > lastDist + 80) { near = false; state.atc_retreats += 1; record('si_atc_retreat', {}); }
        lastDist = dist;
      });
    }, { passive: true });
    window.addEventListener('resize', function () { if (atcEl) { try { atcRect = atcEl.getBoundingClientRect(); } catch (e) {} } }, { passive: true });

    // idle / stall — fires ONCE per idle period (reset by the next real interaction); no infinite loop
    setInterval(function () {
      if (!stalled && (now() - lastInteractTs) > IDLE_MS) {
        stalled = true;
        push('si_stall', { idle_ms: now() - lastInteractTs, scroll_pct: state.scroll_max_pct, last_action: state.last_action });
      }
    }, 5000);
    setInterval(function () { flush('interval'); }, FLUSH_MS);

    function exit() {
      try { for (var k in state.sections) { var s = state.sections[k]; if (s._in) { s.visible_ms += now() - s._in; s._in = 0; } } } catch (e) {}
      push('si_exit', { dwell_ms: now() - startTs, scroll_pct: state.scroll_max_pct, last_action: state.last_action });
      flush('exit');
    }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') exit(); });
    window.addEventListener('pagehide', exit);

    // ---- DOM-dependent setup: run after the DOM is ready ----
    function onReady() {
      try {
        var meta = window.ShopifyAnalytics && ShopifyAnalytics.meta && ShopifyAnalytics.meta.product;
        if (meta) { product.id = String(meta.id || ''); product.variants = (meta.variants || []).length; }
      } catch (e) {}

      atcEl = document.querySelector('form[action*="/cart/add"] [type="submit"], button[name="add"], [data-add-to-cart], button.product-form__submit');
      if (!atcEl) {
        var b = document.querySelectorAll('button, [role="button"], input[type="submit"]');
        for (var i = 0; i < b.length; i++) { if (/add to (cart|bag)|add to basket/.test(txtOf(b[i]))) { atcEl = b[i]; break; } }
      }
      if (atcEl) {
        try { atcRect = atcEl.getBoundingClientRect(); } catch (e) {}
        atcEl.addEventListener('mouseenter', function () { state.atc_hovers += 1; record('si_atc_hover', {}); }, { passive: true });
      }

      try {
        if (window.IntersectionObserver) {
          var defs = [
            ['gallery', '[data-product-media], .product__media, .product-gallery, [class*="gallery"]'],
            ['buybox', 'form[action*="/cart/add"], .product-form, [class*="product-form"]'],
            ['description', '.product__description, [class*="description"], .rte'],
            ['reviews', '[class*="review"], #shopify-product-reviews, .spr-container']
          ];
          var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
              var key = en.target.__si_sec; if (!key) return;
              var s = state.sections[key] || (state.sections[key] = { visible_ms: 0, _in: 0, seen: false });
              if (en.isIntersecting) { s._in = now(); s.seen = true; } else if (s._in) { s.visible_ms += now() - s._in; s._in = 0; }
            });
          }, { threshold: 0.5 });
          defs.forEach(function (d) { var el = document.querySelector(d[1]); if (el) { el.__si_sec = d[0]; io.observe(el); } });
        }
      } catch (e) {}

      record('si_pdp_view', { product: product });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
    else onReady();
  } catch (e) { /* never break the storefront */ }
})();
