import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicMetaPath = path.join(rootDir, 'public', 'data', 'adset-radar.json');
const durableDataDir = process.env.DATA_DIR
  || (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'shawq-data')
    : '');
const durableMetaPath = durableDataDir ? path.join(durableDataDir, 'adset-radar.json') : '';

function snapshotMeta(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const until = String(data?.analysis_window?.until || '');
    const generatedAt = String(data?.generated_at || '');
    if (!until && !generatedAt) return null;
    return { until, generatedAt };
  } catch {
    return null;
  }
}

function isNewerSnapshot(candidate, current) {
  if (!candidate) return false;
  if (!current) return true;
  if (candidate.until !== current.until) return candidate.until > current.until;
  const candidateGenerated = Date.parse(candidate.generatedAt || '');
  const currentGenerated = Date.parse(current.generatedAt || '');
  if (Number.isFinite(candidateGenerated) && Number.isFinite(currentGenerated)) {
    return candidateGenerated > currentGenerated;
  }
  return Boolean(candidate.generatedAt && !current.generatedAt);
}

function restoreDurableSnapshot() {
  if (!durableMetaPath) return;
  const durable = snapshotMeta(durableMetaPath);
  const current = snapshotMeta(publicMetaPath);
  if (!isNewerSnapshot(durable, current)) return;
  fs.mkdirSync(path.dirname(publicMetaPath), { recursive: true });
  fs.copyFileSync(durableMetaPath, publicMetaPath);
  console.log(`Restored durable Meta snapshot through ${durable.until || 'unknown'} from ${durableMetaPath}`);
}

function persistDurableSnapshot() {
  if (!durableMetaPath) return;
  const current = snapshotMeta(publicMetaPath);
  if (!current) throw new Error('Meta fetch completed without a readable adset-radar.json');
  fs.mkdirSync(durableDataDir, { recursive: true });
  const tempPath = `${durableMetaPath}.tmp-${process.pid}-${Date.now()}`;
  fs.copyFileSync(publicMetaPath, tempPath);
  fs.renameSync(tempPath, durableMetaPath);
  console.log(`Persisted Meta snapshot through ${current.until || 'unknown'} to ${durableMetaPath}`);
}

try {
  restoreDurableSnapshot();
} catch (error) {
  console.warn(`Could not restore durable Meta snapshot: ${error.message}`);
}

const child = spawn(
  process.execPath,
  [path.join(__dirname, 'fetch-meta-insights.mjs')],
  { cwd: rootDir, env: process.env, stdio: 'inherit' },
);

child.on('error', (error) => {
  console.error(`Could not start Meta fetch: ${error.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  if (code === 0) {
    try {
      persistDurableSnapshot();
    } catch (error) {
      // The freshly generated public snapshot is still usable for this process.
      // Log persistence failure without converting a successful Meta fetch into a
      // failed refresh; the next run can try the durable copy again.
      console.warn(`Could not persist Meta snapshot: ${error.message}`);
    }
  }
  process.exit(code ?? 1);
});
