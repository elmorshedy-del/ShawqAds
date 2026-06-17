import fs from 'node:fs';
import path from 'node:path';

const VOLUME_CANDIDATES = ['/app/data', '/data'];

export function detectDataDir(projectRoot = process.cwd()) {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  for (const dir of VOLUME_CANDIDATES) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
    } catch {
      // Ignore unreadable mount paths.
    }
  }
  return path.join(projectRoot, 'data');
}

export function resolveDataFile(envKey, fileName, projectRoot = process.cwd()) {
  if (process.env[envKey]) return process.env[envKey];
  return path.join(detectDataDir(projectRoot), fileName);
}

export function behaviorSnapshotPath(projectRoot = process.cwd()) {
  return resolveDataFile('BEHAVIOR_SNAPSHOT_PATH', 'behavior-intelligence.json', projectRoot);
}

export function sessionEventsPath(projectRoot = process.cwd()) {
  return resolveDataFile('SESSION_EVENTS_PATH', 'session-events.ndjson', projectRoot);
}

export function locationCachePath(projectRoot = process.cwd()) {
  return resolveDataFile('LOCATION_CACHE_PATH', 'location-cache.json', projectRoot);
}

export function ordersMapStorePath(projectRoot = process.cwd()) {
  return resolveDataFile('ORDERS_MAP_STORE_PATH', 'orders-map.json', projectRoot);
}

export function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function seedBehaviorSnapshot({ volumePath, publicPath }) {
  if (!volumePath || !publicPath || volumePath === publicPath) return false;
  if (!fs.existsSync(publicPath)) return false;
  if (!fs.existsSync(volumePath)) {
    ensureDirForFile(volumePath);
    fs.copyFileSync(publicPath, volumePath);
    return true;
  }
  try {
    const volumeStat = fs.statSync(volumePath);
    const publicStat = fs.statSync(publicPath);
    if (volumeStat.size === 0 || publicStat.mtimeMs > volumeStat.mtimeMs + 60_000) {
      const volume = JSON.parse(fs.readFileSync(volumePath, 'utf8'));
      const fallback = JSON.parse(fs.readFileSync(publicPath, 'utf8'));
      const volumeDays = new Set((volume.page_facts || []).map((row) => row.date).filter(Boolean));
      const fallbackDays = new Set((fallback.page_facts || []).map((row) => row.date).filter(Boolean));
      if (fallbackDays.size > volumeDays.size) {
        fs.copyFileSync(publicPath, volumePath);
        return true;
      }
    }
  } catch {
    ensureDirForFile(volumePath);
    fs.copyFileSync(publicPath, volumePath);
    return true;
  }
  return false;
}
