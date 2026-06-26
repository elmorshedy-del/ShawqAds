import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port = Number(process.env.SESSION_REPLAY_TEST_PORT || 5192);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shawq-session-replay-'));
const replayPath = path.join(tmpDir, 'session-replay.ndjson');
const replayIndexPath = path.join(tmpDir, 'session-replay-index.json');
const sessionPath = path.join(tmpDir, 'session-events.ndjson');
const baseUrl = `http://127.0.0.1:${port}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {}
    await wait(250);
  }
  throw new Error('server did not become healthy');
}

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: tmpDir,
    REFRESH_ON_START: 'false',
    SESSION_EVENTS_PATH: sessionPath,
    SESSION_REPLAY_PATH: replayPath,
    SESSION_REPLAY_INDEX_PATH: replayIndexPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await waitForHealth();

  const sessionId = 'replay-test-session-001';
  const clientId = 'replay-test-client-001';

  const checkoutRes = await fetch(`${baseUrl}/api/session-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_name: 'checkout_started',
      session_id: sessionId,
      client_id: clientId,
      timestamp: new Date().toISOString(),
      path: 'https://shawq.com/checkout',
      country_code: 'AE',
    }),
  });
  assert(checkoutRes.ok, 'session-events ingest must accept checkout_started');

  const replayRes = await fetch(`${baseUrl}/api/session-replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      client_id: clientId,
      chunk_seq: 1,
      timestamp: new Date().toISOString(),
      path: 'https://shawq.com/cart',
      events: [{ type: 4, data: { href: 'https://shawq.com/cart', width: 1280, height: 720 }, timestamp: Date.now() }],
    }),
  });
  const replayJson = await replayRes.json();
  assert(replayRes.ok, `session-replay ingest failed: ${replayJson.error || replayRes.status}`);
  assert(replayJson.session_key, 'session-replay ingest must return session_key');

  const indexRes = await fetch(`${baseUrl}/api/session-replay/index?limit=5`);
  const indexJson = await indexRes.json();
  assert(indexRes.ok, 'session-replay index must respond');
  assert(Array.isArray(indexJson.sessions), 'session-replay index must return sessions array');
  assert(indexJson.sessions.some((row) => row.session_key === replayJson.session_key), 'indexed session must include ingested replay');

  const detailRes = await fetch(`${baseUrl}/api/session-replay/${replayJson.session_key}?session_id=${encodeURIComponent(sessionId)}`);
  const detailJson = await detailRes.json();
  assert(detailRes.ok, 'session-replay detail must respond');
  assert(detailJson.has_replay, 'session detail must report replay availability');
  assert(Array.isArray(detailJson.events) && detailJson.events.length > 0, 'session detail must return replay events');
  assert(Array.isArray(detailJson.checkout_timeline) && detailJson.checkout_timeline.length > 0, 'session detail must include checkout timeline');
assert(detailJson.checkout_theater?.frames?.length > 0, 'session detail must include checkout theater frames');

  const statusRes = await fetch(`${baseUrl}/api/session-replay/status`);
  const statusJson = await statusRes.json();
  assert(statusRes.ok, 'session-replay status must respond');
  assert(Number(statusJson.chunks) >= 1, 'session-replay status must count ingested chunks');

  console.log('session replay smoke checks passed');
} finally {
  server.kill('SIGTERM');
  setTimeout(() => server.kill('SIGKILL'), 1000).unref();
  if (process.env.KEEP_SESSION_REPLAY_TEST_FILE !== 'true') fs.rmSync(tmpDir, { recursive: true, force: true });
}
