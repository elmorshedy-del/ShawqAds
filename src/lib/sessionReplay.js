import crypto from 'node:crypto';
import fs from 'node:fs';
import { normalizePagePath } from './pagePath.js';

export const CHECKOUT_PIXEL_EVENTS = new Set([
  'cart_viewed',
  'checkout_started',
  'checkout_contact_info_submitted',
  'checkout_address_info_submitted',
  'checkout_shipping_info_submitted',
  'payment_info_submitted',
  'checkout_completed',
]);

const CHECKOUT_PATH_RE = /\/(cart|checkout)(\/|$|\?)/i;

export function hashSessionKey(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function parseNdjsonLines(text = '') {
  return String(text || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

export function rawEventName(raw = {}) {
  return String(
    raw.event_name
    || raw.eventType
    || raw.event_type
    || raw.name
    || raw.payload?.event_name
    || raw.payload?.name
    || '',
  ).trim();
}

export function eventTimestamp(raw = {}) {
  return raw.event_ts
    || raw.timestamp
    || raw.created_at
    || raw.payload?.timestamp
    || raw.payload?.context?.timestamp
    || raw.received_at
    || new Date().toISOString();
}

export function eventPath(raw = {}) {
  const href = raw.path
    || raw.url
    || raw.page_url
    || raw.context?.document?.location?.href
    || raw.payload?.context?.document?.location?.href
    || raw.payload?.url
    || '';
  return normalizePagePath(href);
}

export function eventSessionId(raw = {}) {
  return String(
    raw.session_id
    || raw.sessionId
    || raw.payload?.session_id
    || raw.payload?.sessionId
    || '',
  ).trim();
}

export function eventClientId(raw = {}) {
  return String(
    raw.client_id
    || raw.clientId
    || raw.payload?.client_id
    || raw.payload?.clientId
    || '',
  ).trim();
}

export function eventSessionKey(raw = {}) {
  const sessionId = eventSessionId(raw);
  const clientId = eventClientId(raw);
  return hashSessionKey(clientId || sessionId || raw.id || raw.payload?.id || '');
}

export function isCheckoutRelatedPath(path = '') {
  return CHECKOUT_PATH_RE.test(String(path || ''));
}

export function isCheckoutPixelEvent(name = '') {
  return CHECKOUT_PIXEL_EVENTS.has(String(name || '').trim());
}

export function checkoutOutcomeFromEvents(events = []) {
  const names = events.map((event) => String(event.event_name || event.name || ''));
  if (names.some((name) => /checkout_completed|purchase/i.test(name))) return 'completed';
  if (names.some((name) => /payment_info_submitted/i.test(name))) return 'payment_abandoned';
  if (names.some((name) => /checkout_started/i.test(name))) return 'checkout_abandoned';
  if (names.some((name) => /cart_viewed/i.test(name))) return 'cart_only';
  return 'browsing';
}

export function formatCheckoutOutcome(outcome = '') {
  switch (outcome) {
    case 'completed':
      return 'Completed purchase';
    case 'payment_abandoned':
      return 'Abandoned at payment';
    case 'checkout_abandoned':
      return 'Abandoned in checkout';
    case 'cart_only':
      return 'Cart only';
    default:
      return 'Storefront browsing';
  }
}

export function summarizePixelTimeline(events = []) {
  return [...events]
    .sort((a, b) => new Date(a.timestamp || a.ts) - new Date(b.timestamp || b.ts))
    .map((event) => ({
      event_name: event.event_name || event.name || '',
      timestamp: event.timestamp || event.ts || '',
      path: event.path || '',
      country_code: event.country_code || '',
      line_items: Array.isArray(event.line_items) ? event.line_items.slice(0, 6) : [],
    }));
}

function countryFromEvent(raw = {}) {
  const code = raw.country_code
    || raw.countryCode
    || raw.payload?.country_code
    || raw.payload?.countryCode
    || '';
  return String(code || '').trim().toUpperCase();
}

export function readSessionEventsByKey(sessionEventsPath) {
  if (!sessionEventsPath || !fs.existsSync(sessionEventsPath)) return new Map();
  const text = fs.readFileSync(sessionEventsPath, 'utf8');
  const byKey = new Map();
  for (const raw of parseNdjsonLines(text)) {
    const key = eventSessionKey(raw);
    if (!key) continue;
    const list = byKey.get(key) || [];
    list.push({
      event_name: rawEventName(raw),
      timestamp: eventTimestamp(raw),
      path: eventPath(raw),
      country_code: countryFromEvent(raw),
      session_id: eventSessionId(raw),
      client_id: eventClientId(raw),
      line_items: Array.isArray(raw.line_items) ? raw.line_items : Array.isArray(raw.payload?.line_items) ? raw.payload.line_items : [],
    });
    byKey.set(key, list);
  }
  return byKey;
}

export function readReplayIndex(replayIndexPath) {
  if (!replayIndexPath || !fs.existsSync(replayIndexPath)) return { sessions: [], updated_at: '' };
  try {
    const parsed = JSON.parse(fs.readFileSync(replayIndexPath, 'utf8'));
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      updated_at: parsed.updated_at || '',
    };
  } catch {
    return { sessions: [], updated_at: '' };
  }
}

export function writeReplayIndex(replayIndexPath, sessions = []) {
  const payload = {
    updated_at: new Date().toISOString(),
    sessions: [...sessions]
      .sort((a, b) => String(b.last_seen_at || '').localeCompare(String(a.last_seen_at || '')))
      .slice(0, 500),
  };
  fs.mkdirSync(pathDir(replayIndexPath), { recursive: true });
  const tmp = `${replayIndexPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, replayIndexPath);
  return payload;
}

function pathDir(filePath) {
  return filePath.slice(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')));
}

export function upsertReplayIndexEntry(indexSessions = [], entry = {}) {
  const sessionKey = entry.session_key || hashSessionKey(entry.client_id || entry.session_id);
  if (!sessionKey) return indexSessions;
  const next = [...indexSessions];
  const existingIndex = next.findIndex((row) => row.session_key === sessionKey);
  const existing = existingIndex >= 0 ? next[existingIndex] : {};
  const merged = {
    session_key: sessionKey,
    session_id: entry.session_id || existing.session_id || '',
    client_id: entry.client_id || existing.client_id || '',
    country_code: entry.country_code || existing.country_code || '',
    first_seen_at: existing.first_seen_at || entry.received_at || entry.timestamp || new Date().toISOString(),
    last_seen_at: entry.received_at || entry.timestamp || existing.last_seen_at || new Date().toISOString(),
    replay_chunks: Number(existing.replay_chunks || 0) + Number(entry.replay_chunks || 0),
    replay_events: Number(existing.replay_events || 0) + Number(entry.replay_events || 0),
    has_replay: Boolean(existing.has_replay || entry.has_replay || Number(entry.replay_events || 0) > 0),
    last_path: entry.path || existing.last_path || '',
    checkout_outcome: existing.checkout_outcome || entry.checkout_outcome || 'browsing',
    checkout_steps: existing.checkout_steps || entry.checkout_steps || 0,
  };
  if (existingIndex >= 0) next[existingIndex] = merged;
  else next.push(merged);
  return next;
}

export function buildSessionReplayIndex({
  sessionEventsPath,
  replayIndexPath,
  replayPath,
}) {
  const pixelByKey = readSessionEventsByKey(sessionEventsPath);
  let sessions = readReplayIndex(replayIndexPath).sessions;

  if (replayPath && fs.existsSync(replayPath)) {
    const replayRows = parseNdjsonLines(fs.readFileSync(replayPath, 'utf8'));
    for (const row of replayRows) {
      sessions = upsertReplayIndexEntry(sessions, {
        session_id: row.session_id,
        client_id: row.client_id,
        country_code: row.country_code,
        received_at: row.received_at,
        timestamp: row.timestamp,
        path: row.path,
        replay_chunks: 1,
        replay_events: Array.isArray(row.events) ? row.events.length : 0,
        has_replay: Array.isArray(row.events) && row.events.length > 0,
      });
    }
  }

  sessions = sessions.map((row) => {
    const pixelEvents = pixelByKey.get(row.session_key) || [];
    const checkoutEvents = pixelEvents.filter((event) => isCheckoutPixelEvent(event.event_name));
    const checkoutRelated = checkoutEvents.length > 0
      || pixelEvents.some((event) => isCheckoutRelatedPath(event.path));
    if (!checkoutRelated) return null;
    return {
      ...row,
      checkout_steps: checkoutEvents.length,
      checkout_outcome: checkoutOutcomeFromEvents(pixelEvents),
      country_code: row.country_code || checkoutEvents.find((event) => event.country_code)?.country_code || pixelEvents.find((event) => event.country_code)?.country_code || '',
      pixel_events: checkoutEvents.length,
    };
  }).filter(Boolean);

  return writeReplayIndex(replayIndexPath, sessions);
}

export function listCheckoutReplaySessions(replayIndexPath, { limit = 25 } = {}) {
  const index = readReplayIndex(replayIndexPath);
  return index.sessions
    .filter((row) => Number(row.checkout_steps || 0) > 0 || row.has_replay || isCheckoutRelatedPath(row.last_path))
    .slice(0, Math.max(1, Math.min(Number(limit) || 25, 100)))
    .map((row) => ({
      session_key: row.session_key,
      session_id: row.session_id,
      country_code: row.country_code || '',
      first_seen_at: row.first_seen_at || '',
      last_seen_at: row.last_seen_at || '',
      has_replay: Boolean(row.has_replay),
      replay_events: Number(row.replay_events || 0),
      checkout_outcome: row.checkout_outcome || 'browsing',
      checkout_steps: Number(row.checkout_steps || 0),
      last_path: row.last_path || '',
    }));
}

export function loadSessionReplayChunks(replayPath, sessionKey, sessionId = '', clientId = '') {
  if (!replayPath || !fs.existsSync(replayPath)) {
    return { events: [], chunks: 0 };
  }
  const altSessionKey = hashSessionKey(sessionId);
  const altClientKey = hashSessionKey(clientId);
  const rows = parseNdjsonLines(fs.readFileSync(replayPath, 'utf8'))
    .filter((row) => {
      const key = hashSessionKey(row.client_id || row.session_id);
      return key === sessionKey || (altSessionKey && key === altSessionKey) || (altClientKey && key === altClientKey);
    })
    .sort((a, b) => Number(a.chunk_seq || 0) - Number(b.chunk_seq || 0));
  const events = [];
  for (const row of rows) {
    if (Array.isArray(row.events)) events.push(...row.events);
  }
  return { events, chunks: rows.length };
}

export function loadSessionPixelEvents(sessionEventsPath, sessionKey, sessionId = '', clientId = '') {
  const byKey = readSessionEventsByKey(sessionEventsPath);
  const altSessionKey = hashSessionKey(sessionId);
  const altClientKey = hashSessionKey(clientId);
  return byKey.get(sessionKey) || byKey.get(altSessionKey) || byKey.get(altClientKey) || [];
}

export function sessionReplayStatus(replayPath, replayIndexPath) {
  const index = readReplayIndex(replayIndexPath);
  let chunks = 0;
  let lastReceived = '';
  if (replayPath && fs.existsSync(replayPath)) {
    const rows = parseNdjsonLines(fs.readFileSync(replayPath, 'utf8'));
    chunks = rows.length;
    for (const row of rows) {
      if (row.received_at) lastReceived = row.received_at;
    }
  }
  return {
    configured: Boolean(replayPath),
    chunks,
    sessions: index.sessions.length,
    checkout_sessions: index.sessions.filter((row) => Number(row.checkout_steps || 0) > 0).length,
    last_received_at: lastReceived || index.updated_at || '',
    path: replayPath || '',
  };
}
