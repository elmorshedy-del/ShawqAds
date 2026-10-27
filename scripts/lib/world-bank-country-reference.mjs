import fs from 'node:fs';
import path from 'node:path';

const WORLD_BANK_BASE = 'https://api.worldbank.org/v2';
const GNI_PPP = 'NY.GNP.PCAP.PP.CD';
const GDP_PPP = 'NY.GDP.PCAP.PP.CD';
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PROJECT_USER_AGENT = 'ShawqAds/1.0 (+https://github.com/elmorshedy-del/ShawqAds; country-spending-power)';

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanCountryCodes(countryCodes = []) {
  return [...new Set(
    countryCodes
      .map((code) => String(code || '').trim().toUpperCase())
      .filter((code) => /^[A-Z]{2}$/.test(code)),
  )].sort();
}

export function buildWorldBankIndicatorUrl(indicator, countryCodes = [], {
  startYear = new Date().getUTCFullYear() - 4,
  endYear = new Date().getUTCFullYear(),
} = {}) {
  const codes = cleanCountryCodes(countryCodes);
  if (!codes.length) throw new Error('At least one ISO-2 country code is required.');
  const url = new URL(`${WORLD_BANK_BASE}/country/${codes.join(';')}/indicator/${indicator}`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('per_page', '1000');
  url.searchParams.set('date', `${startYear}:${endYear}`);
  return url.toString();
}

export function parseWorldBankIndicator(payload, expectedIndicator = '') {
  const rows = Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1] : [];
  const latest = new Map();
  for (const row of rows) {
    const indicator = String(row?.indicator?.id || '');
    if (expectedIndicator && indicator && indicator !== expectedIndicator) continue;
    const countryCode = String(row?.country?.id || '').trim().toUpperCase();
    const value = finitePositive(row?.value);
    const year = Number(row?.date);
    if (!/^[A-Z]{2}$/.test(countryCode) || value == null || !Number.isInteger(year)) continue;
    const current = latest.get(countryCode);
    if (!current || year > current.year) {
      latest.set(countryCode, {
        country_code: countryCode,
        country: String(row?.country?.value || countryCode),
        value,
        year,
      });
    }
  }
  return latest;
}

async function fetchJson(url, label, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: {
      accept: 'application/json',
      'user-agent': PROJECT_USER_AGENT,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${label} ${res.status}: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

function readCache(cachePath, countryCodes) {
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const fetchedAt = Date.parse(cached?.fetched_at || '');
    if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > CACHE_MAX_AGE_MS) return null;
    const byCode = new Map((cached?.rows || []).map((row) => [String(row?.country_code || '').toUpperCase(), row]));
    const requested = cleanCountryCodes(countryCodes);
    const checkedCodes = new Set(
      Array.isArray(cached?.requested_codes)
        ? cached.requested_codes.map((code) => String(code || '').toUpperCase())
        : [...byCode.keys()],
    );
    if (!requested.every((code) => checkedCodes.has(code))) return null;
    return {
      rows: requested.map((code) => byCode.get(code)).filter(Boolean),
      provider: cached.provider || 'World Bank',
      dataset: cached.dataset || 'World Development Indicators',
      access: 'durable_cache',
      source_url: cached.source_url || 'https://data.worldbank.org/',
      fetched_at: cached.fetched_at,
    };
  } catch {
    return null;
  }
}

function writeCache(cachePath, payload) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(payload));
}

export async function loadWorldBankCountryReference({
  countryCodes = [],
  cachePath,
  fetchImpl = fetch,
  startYear = new Date().getUTCFullYear() - 4,
  endYear = new Date().getUTCFullYear(),
} = {}) {
  if (!cachePath) throw new Error('A cachePath is required for the World Bank country reference.');
  const requested = cleanCountryCodes(countryCodes);
  if (!requested.length) {
    return {
      rows: [],
      provider: 'World Bank',
      dataset: 'World Development Indicators',
      access: 'not_needed',
      source_url: 'https://data.worldbank.org/',
      fetched_at: new Date().toISOString(),
    };
  }

  const cached = readCache(cachePath, requested);
  if (cached) return cached;

  const [gniPayload, gdpPayload] = await Promise.all([
    fetchJson(buildWorldBankIndicatorUrl(GNI_PPP, requested, { startYear, endYear }), 'World Bank GNI PPP', fetchImpl),
    fetchJson(buildWorldBankIndicatorUrl(GDP_PPP, requested, { startYear, endYear }), 'World Bank GDP PPP', fetchImpl),
  ]);

  const gni = parseWorldBankIndicator(gniPayload, GNI_PPP);
  const gdp = parseWorldBankIndicator(gdpPayload, GDP_PPP);
  const rows = requested.map((code) => {
    const gniRow = gni.get(code);
    const gdpRow = gdp.get(code);
    if (!gniRow && !gdpRow) return null;
    const preferred = gniRow || gdpRow;
    return {
      country_code: code,
      country: gniRow?.country || gdpRow?.country || code,
      purchasing_power_ppp: gniRow?.value ?? gdpRow?.value ?? null,
      purchasing_power_metric: gniRow ? 'GNI per capita, PPP' : 'GDP per capita, PPP',
      purchasing_power_year: gniRow?.year ?? gdpRow?.year ?? null,
      gni_per_capita_ppp: gniRow?.value ?? null,
      gni_year: gniRow?.year ?? null,
      gdp_per_capita_ppp: gdpRow?.value ?? null,
      gdp_year: gdpRow?.year ?? null,
    };
  }).filter(Boolean);

  const payload = {
    provider: 'World Bank',
    dataset: 'World Development Indicators',
    access: 'world_bank_api',
    source_url: 'https://data.worldbank.org/',
    fetched_at: new Date().toISOString(),
    requested_codes: requested,
    rows,
  };
  writeCache(cachePath, payload);
  return payload;
}
