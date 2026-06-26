#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  ensureShopifyRecorderScriptTag,
  listShopifyScriptTags,
  recorderScriptTagSrc,
} from '../src/lib/sessionRecorderInstall.js';

const envPaths = [process.env.ENV_FILE, path.resolve('.env')].filter(Boolean);
for (const envPath of envPaths) {
  if (!fs.existsSync(envPath)) continue;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [k, ...rest] = line.replace(/^export\s+/, '').split('=');
    if (!process.env[k]) process.env[k] = rest.join('=').replace(/^["']|["']$/g, '');
  }
}

const token = process.env.SHAWQ_SHOPIFY_ACCESS_TOKEN;
const store = process.env.SHAWQ_SHOPIFY_STORE || process.env.SHOPIFY_STORE || 'f3e7e9-2.myshopify.com';
const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';
const publicBase = process.env.SHAWQ_PUBLIC_APP_URL || 'https://shawq-ads-production.up.railway.app';
const src = recorderScriptTagSrc(publicBase);

if (!token) {
  console.error('Missing SHAWQ_SHOPIFY_ACCESS_TOKEN. Set it in Railway or .env and retry.');
  process.exit(1);
}

try {
  const tags = await listShopifyScriptTags({ token, store, apiVersion });
  const existing = tags.filter((tag) => String(tag.src || '').includes('/shopify/session-recorder.js'));
  console.log(JSON.stringify({ ok: true, store, existing_count: existing.length, hosted_src: src }, null, 2));

  const result = await ensureShopifyRecorderScriptTag({ token, store, apiVersion, src });
  console.log(JSON.stringify({ ok: true, action: result.created ? 'created' : 'already_installed', script_tag: result.script_tag }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    hint: 'Token may need write_script_tags scope. Custom pixel still installs manually under Settings → Customer events.',
    hosted_src: src,
  }, null, 2));
  process.exit(1);
}
