// Shared marketing-channel helpers.
//
// Centralizes how a Shopify order's UTM attribution is read so the live server,
// the offline product fetcher, and verification scripts all classify the
// "email" channel (utm_medium=email) identically.

// Matches the same attribution-bearing query keys the rest of the pipeline keeps.
const UTM_KEY_RE = /^(utm_|campaign_|campaign$|ad_|ad$|adset_|adset$|placement|creative|attributes\[(ad|ad-id|campaign|campaign-id|adset|adset-id)\])/i;

export function queryParamsFromMaybeUrl(value = '') {
  const text = String(value || '');
  const query = text.includes('?') ? text.slice(text.indexOf('?') + 1) : text;
  const params = new URLSearchParams(query);
  return Object.fromEntries([...params.entries()].filter(([key]) => UTM_KEY_RE.test(key)));
}

export function lowerKeyLookup(obj = {}, ...keys) {
  const lower = {};
  for (const [key, value] of Object.entries(obj || {})) lower[key.toLowerCase()] = value;
  for (const key of keys) {
    const value = lower[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
  }
  return '';
}

// The marketing medium Shopify recorded for the order (utm_medium), normalized
// to lowercase. Email-marketing tools (Klaviyo, Shopify Email, …) set
// utm_medium=email, which we use to split this traffic out of the paid-ads view.
export function attributionUtmMedium(attribution = {}) {
  return String(
    lowerKeyLookup(attribution?.utm || {}, 'utm_medium', 'utm_medium_last', 'utm_medium_first', 'medium')
      || lowerKeyLookup(attribution?.note_attributes || {}, 'utm_medium', 'utm_medium_last', 'utm_medium_first', 'medium'),
  ).trim().toLowerCase();
}

export function isEmailAttribution(attribution = {}) {
  return attributionUtmMedium(attribution) === 'email';
}

export function emailCampaignName(attribution = {}) {
  return String(attribution?.campaign_hint || attribution?.utm?.utm_campaign || '').trim();
}

export function attributionUtmSource(attribution = {}) {
  return String(
    lowerKeyLookup(attribution?.utm || {}, 'utm_source', 'utm_source_last', 'utm_source_first', 'source')
      || lowerKeyLookup(attribution?.note_attributes || {}, 'utm_source', 'utm_source_last', 'utm_source_first', 'source'),
  ).trim().toLowerCase();
}

// Klaviyo vs Shopify Email (and other ESPs) for the email campaign order list.
export function emailFlowLabel(attribution = {}) {
  const source = attributionUtmSource(attribution);
  const sourceName = String(attribution?.source_name || '').trim().toLowerCase();
  const referrer = String(attribution?.referrer_host || '').trim().toLowerCase();
  const haystack = [source, sourceName, referrer].filter(Boolean).join(' ');

  if (haystack.includes('klaviyo')) return 'Klaviyo';
  if (haystack.includes('shopify_email') || haystack.includes('shopify email')) return 'Shopify Email';
  if (source === 'email' || sourceName === 'email') return 'Email';
  if (source) {
    return source
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return 'Email';
}

// Human label shown in the live monitor / map for an email-driven order.
export function emailSourceLabel(attribution = {}) {
  const campaign = emailCampaignName(attribution);
  return campaign ? `Email campaign · ${campaign}` : 'Email campaign';
}

// Minimal attribution shape (utm + note attributes + campaign hint) sufficient
// for channel detection, built straight from a raw Shopify order. Used by
// verification scripts that don't need the server's full ad-matching logic.
export function buildAttributionLite(order = {}) {
  const safeOrder = order || {};
  const noteAttributes = {};
  for (const attr of safeOrder.note_attributes || []) {
    if (attr?.name) noteAttributes[attr.name] = attr.value;
  }
  const lowerNote = Object.fromEntries(
    Object.entries(noteAttributes).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const landingParams = queryParamsFromMaybeUrl(safeOrder.landing_site || safeOrder.landing_site_ref || '');
  const referrerParams = queryParamsFromMaybeUrl(safeOrder.referring_site || '');
  const noteLandingLast = queryParamsFromMaybeUrl(lowerNote.landing_page_last || lowerNote.landing_page || '');
  const noteLandingFirst = queryParamsFromMaybeUrl(lowerNote.landing_page_first || '');
  const utm = { ...noteLandingFirst, ...landingParams, ...referrerParams, ...noteLandingLast };
  const campaign_hint = String(
    lowerNote.utm_campaign_last || utm.utm_campaign || lowerNote.utm_campaign || lowerNote.campaign_name || lowerNote.campaign || '',
  ).trim();
  return { utm, note_attributes: noteAttributes, campaign_hint };
}
