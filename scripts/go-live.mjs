#!/usr/bin/env node
// Flip the Live Global Orders Map from demo data to live Shopify data on Railway.
//
// What it does (see AI_HANDOFF_LIVE_ORDERS_MAP.md §8):
//   1. Resolves the Railway project / environment / service.
//   2. Pushes the Shopify variables onto the service.
//   3. Triggers a redeploy and waits for it to go live.
//   4. Verifies GET /api/shopify/orders-map returns { configured: true }.
//   5. (optional) Registers the Shopify orders/create webhook for push updates.
//
// Requirements (env vars):
//   RAILWAY_TOKEN                 Railway account/team API token (write access).
//   SHAWQ_SHOPIFY_ACCESS_TOKEN    Shopify Admin API token (read_orders). Required.
//   SHAWQ_SHOPIFY_STORE           e.g. f3e7e9-2.myshopify.com (default kept if unset).
//   SHOPIFY_API_VERSION           e.g. 2025-10 (default kept if unset).
//
// Optional:
//   SHOPIFY_WEBHOOK_SECRET        Enables webhook registration (with REGISTER_WEBHOOK=1).
//   GEOCODER_PROVIDER / *_API_KEY / MAPBOX_GEOCODING_TOKEN / GEOCODER_TIMEOUT_MS
//   RAILWAY_PROJECT_NAME (default "faithful-compassion")
//   RAILWAY_ENVIRONMENT_NAME (default "production")
//   RAILWAY_SERVICE_NAME (default "shawq-ads")
//   RAILWAY_PROJECT_ID / RAILWAY_ENVIRONMENT_ID / RAILWAY_SERVICE_ID (skip name lookup)
//   BASE_URL (default https://shawq-ads-production.up.railway.app)
//   REGISTER_WEBHOOK=1  Also register the orders/create webhook.
//
// Flags:
//   --check   Only verify the live endpoint, change nothing.
//   --no-deploy  Push variables but do not trigger a redeploy.

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has('--check');
const NO_DEPLOY = args.has('--no-deploy');

const DEFAULTS = {
  store: 'f3e7e9-2.myshopify.com',
  apiVersion: '2025-10',
  projectName: 'faithful-compassion',
  environmentName: 'production',
  serviceName: 'shawq-ads',
  baseUrl: 'https://shawq-ads-production.up.railway.app',
};

function log(...a) { console.log(...a); }
function fail(msg) { console.error(`\n✗ ${msg}`); process.exit(1); }

async function railway(query, variables = {}) {
  const token = process.env.RAILWAY_TOKEN;
  if (!token) fail('RAILWAY_TOKEN is not set.');
  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.errors) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json.data;
}

async function resolveTargets() {
  let projectId = process.env.RAILWAY_PROJECT_ID;
  let environmentId = process.env.RAILWAY_ENVIRONMENT_ID;
  let serviceId = process.env.RAILWAY_SERVICE_ID;
  if (projectId && environmentId && serviceId) {
    return { projectId, environmentId, serviceId };
  }

  const projectName = process.env.RAILWAY_PROJECT_NAME || DEFAULTS.projectName;
  const environmentName = process.env.RAILWAY_ENVIRONMENT_NAME || DEFAULTS.environmentName;
  const serviceName = process.env.RAILWAY_SERVICE_NAME || DEFAULTS.serviceName;

  const data = await railway(`query {
    projects { edges { node { id name
      environments { edges { node { id name } } }
      services { edges { node { id name } } }
    } } }
  }`);
  const projects = data.projects.edges.map((e) => e.node);
  const project = projectId
    ? projects.find((p) => p.id === projectId)
    : projects.find((p) => p.name === projectName) || (projects.length === 1 ? projects[0] : null);
  if (!project) fail(`Could not find Railway project "${projectName}". Found: ${projects.map((p) => p.name).join(', ') || 'none'}.`);

  const envs = project.environments.edges.map((e) => e.node);
  const env = environmentId
    ? envs.find((e) => e.id === environmentId)
    : envs.find((e) => e.name === environmentName) || (envs.length === 1 ? envs[0] : null);
  if (!env) fail(`Could not find environment "${environmentName}" in project "${project.name}".`);

  const services = project.services.edges.map((e) => e.node);
  const service = serviceId
    ? services.find((s) => s.id === serviceId)
    : services.find((s) => s.name === serviceName) || (services.length === 1 ? services[0] : null);
  if (!service) fail(`Could not find service "${serviceName}" in project "${project.name}".`);

  log(`• Railway target: ${project.name} / ${env.name} / ${service.name}`);
  return { projectId: project.id, environmentId: env.id, serviceId: service.id };
}

function collectVariables() {
  const out = {};
  // Required.
  out.SHAWQ_SHOPIFY_ACCESS_TOKEN = process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN;
  // Defaults applied so the service is fully configured even on a fresh project.
  out.SHAWQ_SHOPIFY_STORE = process.env.SHAWQ_SHOPIFY_STORE || DEFAULTS.store;
  out.SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || DEFAULTS.apiVersion;
  // Optional — only pushed when present.
  for (const key of [
    'SHOPIFY_WEBHOOK_SECRET',
    'GEOCODER_PROVIDER',
    'MAPBOX_GEOCODING_TOKEN',
    'OPENCAGE_API_KEY',
    'GOOGLE_GEOCODING_API_KEY',
    'GEOCODER_TIMEOUT_MS',
    'SHAWQ_SHOPIFY_REPORTING_TIMEZONE',
  ]) {
    if (process.env[key]) out[key] = process.env[key];
  }
  return out;
}

async function upsertVariables(targets, vars) {
  for (const [name, value] of Object.entries(vars)) {
    if (value == null || value === '') continue;
    await railway(
      `mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
      { input: { ...targets, name, value: String(value) } },
    );
    log(`• Set ${name}`);
  }
}

async function latestDeployment(targets) {
  const data = await railway(
    `query($p: String!, $e: String!, $s: String!) {
      deployments(first: 1, input: { projectId: $p, environmentId: $e, serviceId: $s }) {
        edges { node { id status createdAt } }
      }
    }`,
    { p: targets.projectId, e: targets.environmentId, s: targets.serviceId },
  );
  return data.deployments.edges[0]?.node || null;
}

async function redeploy(targets) {
  await railway(
    `mutation($e: String!, $s: String!) { serviceInstanceRedeploy(environmentId: $e, serviceId: $s) }`,
    { e: targets.environmentId, s: targets.serviceId },
  );
  log('• Redeploy triggered.');
}

async function waitForDeploy(targets, { timeoutMs = 480000, intervalMs = 10000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = '';
  while (Date.now() < deadline) {
    const dep = await latestDeployment(targets);
    if (dep && dep.status !== lastStatus) {
      lastStatus = dep.status;
      log(`• Deployment ${dep.id.slice(0, 8)} — ${dep.status}`);
    }
    if (dep && dep.status === 'SUCCESS') return dep;
    if (dep && ['FAILED', 'CRASHED', 'REMOVED'].includes(dep.status)) {
      fail(`Deployment ended with status ${dep.status}.`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  fail('Timed out waiting for the deployment to become healthy.');
}

async function verifyLive(baseUrl, { attempts = 12, intervalMs = 5000 } = {}) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/shopify/orders-map`;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const json = await res.json();
      if (json.configured) {
        log(`✓ Live: ${url} → configured:true, ${Array.isArray(json.purchases) ? json.purchases.length : 0} purchase(s).`);
        return json;
      }
      log(`• Not configured yet (attempt ${i + 1}/${attempts})…`);
    } catch (err) {
      log(`• Verify attempt ${i + 1}/${attempts} failed: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

async function registerWebhook(baseUrl) {
  const token = process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN;
  const store = process.env.SHAWQ_SHOPIFY_STORE || DEFAULTS.store;
  const apiVersion = process.env.SHOPIFY_API_VERSION || DEFAULTS.apiVersion;
  const address = `${baseUrl.replace(/\/$/, '')}/api/shopify/webhook`;
  const endpoint = `https://${store}/admin/api/${apiVersion}/webhooks.json`;

  const existing = await fetch(`${endpoint}?topic=orders/create`, {
    headers: { 'X-Shopify-Access-Token': token },
  }).then((r) => r.json()).catch(() => ({}));
  const already = (existing.webhooks || []).find((w) => w.address === address);
  if (already) {
    log(`• Webhook already registered (id ${already.id}) → ${address}`);
    return;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhook: { topic: 'orders/create', address, format: 'json' } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) fail(`Webhook registration failed (${res.status}): ${JSON.stringify(json)}`);
  log(`✓ Registered orders/create webhook (id ${json.webhook?.id}) → ${address}`);
}

async function main() {
  const baseUrl = process.env.BASE_URL || DEFAULTS.baseUrl;

  if (CHECK_ONLY) {
    log('Checking live status only (no changes)…');
    const live = await verifyLive(baseUrl, { attempts: 1, intervalMs: 0 });
    if (!live) {
      log('✗ Map is still serving demo data (configured:false). Run without --check once SHAWQ_SHOPIFY_ACCESS_TOKEN is set.');
      process.exit(2);
    }
    return;
  }

  if (!process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN) {
    fail([
      'SHAWQ_SHOPIFY_ACCESS_TOKEN is not set — cannot enable live Shopify data.',
      'Add it as a Cursor Cloud Agent secret (Cloud Agents > Secrets) or export it locally, then re-run:',
      '  npm run go-live',
      'The token must come from a Shopify custom app with the read_orders scope.',
    ].join('\n  '));
  }

  const targets = await resolveTargets();
  const vars = collectVariables();
  log(`• Pushing ${Object.keys(vars).length} variable(s) to Railway…`);
  await upsertVariables(targets, vars);

  if (!NO_DEPLOY) {
    await redeploy(targets);
    await waitForDeploy(targets);
  }

  const live = await verifyLive(baseUrl);
  if (!live) {
    fail('Variables set and deploy finished, but the endpoint still reports configured:false. Check the Shopify token scope/value.');
  }

  if (args.has('--register-webhook') || process.env.REGISTER_WEBHOOK === '1') {
    if (!process.env.SHOPIFY_WEBHOOK_SECRET) {
      log('• Skipping webhook registration: SHOPIFY_WEBHOOK_SECRET is not set.');
    } else {
      await registerWebhook(baseUrl);
    }
  }

  log('\n✓ Done. The Live Global Orders Map is now serving live Shopify orders.');
}

main().catch((err) => fail(err.stack || err.message));
