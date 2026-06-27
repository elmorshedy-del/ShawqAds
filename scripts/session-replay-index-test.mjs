import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildSessionReplayIndex,
  hashSessionKey,
  listCheckoutReplaySessions,
} from '../src/lib/sessionReplay.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shawq-replay-index-'));
const sessionEventsPath = path.join(tmpDir, 'session-events.ndjson');
const replayIndexPath = path.join(tmpDir, 'session-replay-index.json');
const replayPath = path.join(tmpDir, 'session-replay.ndjson');

const clientId = 'pixel-only-client-001';
const sessionId = 'pixel-only-session-001';
const sessionKey = hashSessionKey(clientId);

fs.writeFileSync(sessionEventsPath, `${JSON.stringify({
  event_name: 'checkout_started',
  client_id: clientId,
  session_id: sessionId,
  timestamp: '2026-06-27T10:00:00.000Z',
  path: 'https://shawq.co/checkout',
  country_code: 'NO',
})}\n`);

buildSessionReplayIndex({ sessionEventsPath, replayIndexPath, replayPath });
const sessions = listCheckoutReplaySessions(replayIndexPath, { limit: 10 });

assert(sessions.length === 1, `expected one indexed checkout session, got ${sessions.length}`);
assert(sessions[0].session_key === sessionKey, 'indexed session key must match pixel client_id hash');
assert(Number(sessions[0].checkout_steps) >= 1, 'checkout session must include checkout steps');

fs.writeFileSync(replayPath, `${JSON.stringify({
  session_id: 'storefront-only-session',
  client_id: 'storefront-only-client',
  received_at: '2026-06-27T11:00:00.000Z',
  timestamp: '2026-06-27T11:00:00.000Z',
  path: 'https://shawq.co/products/hoodie',
  events: [{ type: 4, data: { href: 'https://shawq.co/products/hoodie' }, timestamp: Date.now() }],
})}\n`);

buildSessionReplayIndex({ sessionEventsPath, replayIndexPath, replayPath });
const merged = listCheckoutReplaySessions(replayIndexPath, { limit: 10 });
assert(
  merged.some((row) => row.has_replay && row.session_key === hashSessionKey('storefront-only-client')),
  'storefront replay chunk must remain indexed even without checkout pixel events',
);

console.log('session replay index checks passed');

if (process.env.KEEP_SESSION_REPLAY_INDEX_TEST !== 'true') {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
