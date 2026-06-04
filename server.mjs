import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.replace(/^export\s+/, '').split('=');
    if (!process.env[key]) process.env[key] = rest.join('=').replace(/^["']|["']$/g, '');
  }
}

loadEnv();

const distDir = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 3000);
const refreshKey = process.env.REFRESH_API_KEY || '';
const refreshOnStart = process.env.REFRESH_ON_START !== 'false';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function runScript(script, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', script], { cwd: __dirname, env: { ...process.env, ...extraEnv }, shell: false });
    let output = '';
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });
    child.on('close', (code) => resolve({ code, output }));
  });
}

function publicDataPath(name) {
  return path.join(__dirname, 'public', 'data', name);
}

function isAuthorized(req) {
  return Boolean(refreshKey && req.headers.authorization === `Bearer ${refreshKey}`);
}

function dateEnvFromUrl(url) {
  const since = url.searchParams.get('since') || url.searchParams.get('start') || '';
  const until = url.searchParams.get('until') || url.searchParams.get('end') || '';
  const env = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    env.SINCE = since;
    env.SHOPIFY_SINCE = since;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    env.UNTIL = until;
    env.SHOPIFY_UNTIL = until;
  }
  return env;
}

async function serveData(req, res, name, script) {
  const file = publicDataPath(name);
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const force = url.searchParams.get('refresh') === '1';
  if (force && !isAuthorized(req)) {
    send(res, 401, JSON.stringify({ ok: false, error: 'unauthorized' }));
    return;
  }

  if (force || !fs.existsSync(file)) {
    const result = await runScript(script, dateEnvFromUrl(url));
    if (result.code !== 0) {
      console.warn(result.output);
      if (!fs.existsSync(file)) {
        send(res, 500, JSON.stringify({ ok: false, error: 'refresh failed', detail: result.output.slice(0, 2000) }));
        return;
      }
    }
  }

  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

async function warmData() {
  if (!refreshOnStart) return;
  const jobs = [];
  if (process.env.SHAWQ_META_ACCESS_TOKEN && process.env.SHAWQ_META_AD_ACCOUNT_ID) jobs.push(runScript('fetch:meta'));
  if (process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN && process.env.SHAWQ_SHOPIFY_STORE) jobs.push(runScript('fetch:shopify'));
  if (!jobs.length) return;
  const results = await Promise.all(jobs);
  results.forEach((r) => { if (r.code !== 0) console.warn(r.output); });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (url.pathname === '/health') {
    send(res, 200, JSON.stringify({ ok: true, service: 'shawq-adset-radar' }));
    return;
  }

  if (url.pathname === '/api/data/adset-radar.json') {
    await serveData(req, res, 'adset-radar.json', 'fetch:meta');
    return;
  }

  if (url.pathname === '/api/data/shopify-products.json') {
    await serveData(req, res, 'shopify-products.json', 'fetch:shopify');
    return;
  }

  if (url.pathname === '/api/refresh') {
    if (!isAuthorized(req)) {
      send(res, 401, JSON.stringify({ ok: false, error: 'unauthorized' }));
      return;
    }
    const env = dateEnvFromUrl(url);
    const [meta, shopify] = await Promise.all([runScript('fetch:meta', env), runScript('fetch:shopify', env)]);
    send(res, meta.code || shopify.code ? 500 : 200, JSON.stringify({ ok: !(meta.code || shopify.code), meta, shopify }));
    return;
  }

  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = path.normalize(path.join(distDir, requested));
  if (!target.startsWith(distDir)) {
    send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    return;
  }
  const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(distDir, 'index.html');
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': mime[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`ShawQ Ad Set Radar listening on ${port}`);
  warmData().catch((error) => console.warn(error));
});
