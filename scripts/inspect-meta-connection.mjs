// Meta connectivity inspector — same credential resolution as server.mjs / fetch-meta-insights.mjs.
//
//   node scripts/inspect-meta-connection.mjs
//
// On Railway: open a shell on the ShawQ service and run the same command (vars are already injected).

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_META_AD_ACCOUNT_ID = '1026963365133388';

for (const envPath of [process.env.ENV_FILE, path.resolve('.env')].filter(Boolean)) {
  if (!fs.existsSync(envPath)) continue;
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}

const token = process.env.SHAWQ_META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '';
const account = (process.env.SHAWQ_META_AD_ACCOUNT_ID || process.env.META_AD_ACCOUNT_ID || DEFAULT_META_AD_ACCOUNT_ID).replace(/^act_/, '');
const graphVersion = process.env.META_GRAPH_VERSION || 'v20.0';
const timezone = process.env.SHAWQ_META_REPORTING_TIMEZONE || process.env.META_REPORTING_TIMEZONE || 'Europe/Istanbul';

function dateInTimezone(date, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function credentialSource() {
  const tokenVar = process.env.SHAWQ_META_ACCESS_TOKEN ? 'SHAWQ_META_ACCESS_TOKEN' : (process.env.META_ACCESS_TOKEN ? 'META_ACCESS_TOKEN' : 'missing');
  const accountVar = process.env.SHAWQ_META_AD_ACCOUNT_ID ? 'SHAWQ_META_AD_ACCOUNT_ID' : (process.env.META_AD_ACCOUNT_ID ? 'META_AD_ACCOUNT_ID' : 'default');
  return { tokenVar, accountVar };
}

async function graphGet(url) {
  const response = await fetch(url);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    const msg = body?.error?.message || text.slice(0, 300);
    throw new Error(`HTTP ${response.status}: ${msg}`);
  }
  return body;
}

async function main() {
  const { tokenVar, accountVar } = credentialSource();
  console.log('Meta credential check');
  console.log(`  token: ${token ? `set (${tokenVar}, ${token.length} chars)` : 'MISSING'}`);
  console.log(`  account: act_${account} (${accountVar})`);
  console.log(`  graph: ${graphVersion}, reporting tz: ${timezone}`);

  if (!token) {
    console.error('\nFAIL: No access token. Set SHAWQ_META_ACCESS_TOKEN or META_ACCESS_TOKEN on Railway.');
    process.exit(2);
  }

  const accountUrl = new URL(`https://graph.facebook.com/${graphVersion}/act_${account}`);
  accountUrl.searchParams.set('access_token', token);
  accountUrl.searchParams.set('fields', 'name,currency,account_status,timezone_name');

  try {
    const meta = await graphGet(accountUrl.toString());
    console.log('\nAccount metadata: OK');
    console.log(`  name: ${meta.name || 'n/a'}`);
    console.log(`  currency: ${meta.currency || 'n/a'}`);
    console.log(`  account_status: ${meta.account_status ?? 'n/a'}`);
    console.log(`  timezone: ${meta.timezone_name || 'n/a'}`);
  } catch (error) {
    console.error('\nFAIL: Account metadata request failed');
    console.error(`  ${error.message}`);
    process.exit(1);
  }

  const today = dateInTimezone(new Date(), timezone);
  const insightsUrl = new URL(`https://graph.facebook.com/${graphVersion}/act_${account}/insights`);
  insightsUrl.searchParams.set('access_token', token);
  insightsUrl.searchParams.set('level', 'account');
  insightsUrl.searchParams.set('time_increment', '1');
  insightsUrl.searchParams.set('fields', 'spend,impressions,reach');
  insightsUrl.searchParams.set('time_range', JSON.stringify({ since: today, until: today }));

  try {
    const insights = await graphGet(insightsUrl.toString());
    const row = insights.data?.[0];
    console.log(`\nToday insights (${today}): OK`);
    if (row) {
      console.log(`  spend: ${row.spend ?? 0}`);
      console.log(`  impressions: ${row.impressions ?? 0}`);
      console.log(`  reach: ${row.reach ?? 0}`);
    } else {
      console.log('  (no rows yet for today — account reachable but day may be empty)');
    }
    console.log('\nPASS: Meta Graph API is connected.');
  } catch (error) {
    console.error(`\nFAIL: Today insights request failed (${today})`);
    console.error(`  ${error.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
