import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port = Number(process.env.SESSION_EVENT_TEST_PORT || 5191);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shawq-session-events-'));
const sessionPath = path.join(tmpDir, 'session-events.ndjson');
const baseUrl = `http://127.0.0.1:${port}`;

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

async function postEvent(event) {
  const res = await fetch(`${baseUrl}/api/session-events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`event post failed ${res.status}: ${text}`);
}

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    REFRESH_ON_START: 'false',
    SESSION_EVENTS_PATH: sessionPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
server.stdout.on('data', (chunk) => { output += chunk.toString(); });
server.stderr.on('data', (chunk) => { output += chunk.toString(); });

try {
  await waitForHealth();
  const timestamp = new Date().toISOString();
  const common = {
    client_id: 'smoke-client',
    session_id: 'smoke-session',
    country_code: 'US',
    line_items: [{ title: 'Quote crewneck (Unisex)', product_id: '111', variant_id: '222', quantity: 1, price: 88 }],
  };
  await postEvent({ ...common, event_name: 'page_viewed', timestamp, path: 'https://shawq.co/products/quote-crewneck' });
  await postEvent({ ...common, event_name: 'session_heartbeat', timestamp: new Date(Date.parse(timestamp) + 15000).toISOString(), path: 'https://shawq.co/products/quote-crewneck', line_items: [] });
  await postEvent({ ...common, event_name: 'payment_info_submitted', timestamp: new Date(Date.parse(timestamp) + 20000).toISOString(), path: 'https://shawq.co/checkouts/cn/test' });

  const statusRes = await fetch(`${baseUrl}/api/session-events/status`);
  const status = await statusRes.json();
  if (!status.ok || status.count !== 3 || status.sessions !== 1) {
    throw new Error(`unexpected status: ${JSON.stringify(status)}`);
  }
  const lines = fs.readFileSync(sessionPath, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length !== 3) throw new Error(`expected 3 persisted events, got ${lines.length}`);
  console.log(JSON.stringify({ ok: true, status, sessionPath }, null, 2));
} finally {
  server.kill('SIGTERM');
  setTimeout(() => server.kill('SIGKILL'), 1000).unref();
  if (process.env.KEEP_SESSION_EVENT_TEST_FILE !== 'true') fs.rmSync(tmpDir, { recursive: true, force: true });
}
