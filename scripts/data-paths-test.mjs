import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  behaviorSnapshotPath,
  detectDataDir,
  seedBehaviorSnapshot,
  sessionEventsPath,
} from '../src/lib/dataPaths.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shawq-data-paths-'));
process.env.DATA_DIR = tmp;

assert(detectDataDir() === tmp, 'DATA_DIR env must win');
assert(sessionEventsPath().endsWith('session-events.ndjson'), 'session path uses data dir');
assert(behaviorSnapshotPath().endsWith('behavior-intelligence.json'), 'behavior path uses data dir');

const publicPath = path.join(tmp, 'public-behavior.json');
const volumePath = behaviorSnapshotPath();
fs.writeFileSync(publicPath, JSON.stringify({
  page_facts: [{ date: '2026-06-10', session_hash: 'a', path: '/' }],
  facts: [],
}));
const seeded = seedBehaviorSnapshot({ volumePath, publicPath });
assert(seeded, 'seedBehaviorSnapshot should copy when volume file missing');
assert(fs.existsSync(volumePath), 'seeded volume behavior file must exist');

console.log('data paths checks passed');
