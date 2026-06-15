// Normalize storefront URLs for behavior analytics — strip tracking query
// strings so the same product page with different UTMs rolls up together.

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|gbraid$|wbraid$|ttclid$|mc_cid$|mc_eid$|ref$|referrer$|_kx$|shpxid$)/i;

export function normalizePagePath(href = '') {
  const raw = String(href || '').trim();
  if (!raw) return '/';
  try {
    const url = new URL(raw, 'https://shawq.co');
    const params = new URLSearchParams(url.search);
    for (const key of [...params.keys()]) {
      if (TRACKING_PARAM.test(key)) params.delete(key);
    }
    const search = params.toString();
    return `${url.pathname || '/'}${search ? `?${search}` : ''}`;
  } catch {
    const pathOnly = raw.split('?')[0].split('#')[0];
    return pathOnly.slice(0, 160) || '/';
  }
}

function titleWords(value = '') {
  return String(value || '')
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function pagePathLabel(path = '') {
  const normalized = normalizePagePath(path);
  const pathname = normalized.split('?')[0] || '/';

  if (pathname === '/' || pathname === '') return 'Homepage';
  if (pathname === '/cart') return 'Cart';
  if (pathname.startsWith('/checkout')) return 'Checkout';
  if (pathname.startsWith('/collections/')) {
    const slug = decodeURIComponent(pathname.slice('/collections/'.length));
    return `Collection · ${titleWords(slug)}`;
  }
  if (pathname.startsWith('/products/')) {
    const slug = decodeURIComponent(pathname.slice('/products/'.length));
    return titleWords(slug);
  }
  if (pathname.startsWith('/pages/')) {
    const slug = decodeURIComponent(pathname.slice('/pages/'.length));
    return titleWords(slug);
  }
  if (pathname.startsWith('/blogs/')) {
    const slug = decodeURIComponent(pathname.replace(/^\/blogs\//, ''));
    return `Blog · ${titleWords(slug)}`;
  }
  return pathname;
}

export function formatDwellSeconds(seconds = 0) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value >= 60) return `${(value / 60).toFixed(1)} min`;
  return `${value.toFixed(2)}s`;
}

export function journeyStepInsight(row = {}) {
  const label = pagePathLabel(row.path);
  const purchaserPct = Math.round(Number(row.purchaser_support || 0) * 100);
  const nonPurchaserPct = Math.round(Number(row.non_purchaser_support || 0) * 100);
  if (row.purchasers > 0 && row.non_purchasers > 0) {
    const lift = Number(row.lift || 0);
    if (lift >= 1.4) return `${purchaserPct}% of buyers hit ${label} vs ${nonPurchaserPct}% of non-buyers — stronger buyer signal.`;
    if (lift <= 0.7) return `${nonPurchaserPct}% of non-buyers reach ${label} but only ${purchaserPct}% of buyers — possible detour.`;
    return `${purchaserPct}% buyer / ${nonPurchaserPct}% non-buyer reach — similar traffic at step ${row.step}.`;
  }
  if (row.purchasers > 0) return `${purchaserPct}% of buyers pass through ${label} at step ${row.step}.`;
  return `${nonPurchaserPct}% of non-buyers pass through ${label} at step ${row.step}.`;
}
