import fs from 'node:fs';
import path from 'node:path';

export const US_STATE_FIPS = [
  '01', '02', '04', '05', '06', '08', '09', '10', '11', '12', '13', '15', '16', '17',
  '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31',
  '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '44', '45', '46',
  '47', '48', '49', '50', '51', '53', '54', '55', '56', '72',
];

const REPORTER_CONCURRENCY = 4;
const REPORTER_BASE = 'https://api.censusreporter.org/1.0/data/show';

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeRows(rows = []) {
  const deduped = new Map();
  for (const row of rows) {
    const postalCode = String(row?.postal_code || '').match(/^(\d{5})$/)?.[1] || '';
    const income = finitePositive(row?.area_income_usd);
    const households = finitePositive(row?.households);
    if (!postalCode || income == null || households == null) continue;
    deduped.set(postalCode, {
      postal_code: postalCode,
      area_income_usd: income,
      households,
    });
  }
  return [...deduped.values()].sort((a, b) => a.postal_code.localeCompare(b.postal_code));
}

export function parseCensusAcsRows(raw = []) {
  if (!Array.isArray(raw) || raw.length < 2) return [];
  const [headers, ...rows] = raw;
  if (!Array.isArray(headers)) return [];
  const idxIncome = headers.indexOf('B19013_001E');
  const idxHouseholds = headers.indexOf('B11001_001E');
  const idxZip = headers.indexOf('zip code tabulation area');
  if (idxIncome < 0 || idxHouseholds < 0 || idxZip < 0) return [];
  return normalizeRows(rows.map((row) => ({
    postal_code: String(row?.[idxZip] || ''),
    area_income_usd: row?.[idxIncome],
    households: row?.[idxHouseholds],
  })));
}

export function parseCensusReporterRows(payload = {}) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const rows = [];
  for (const [geoid, tables] of Object.entries(data)) {
    const postalCode = String(geoid).match(/^86000US(\d{5})$/)?.[1] || '';
    if (!postalCode) continue;
    rows.push({
      postal_code: postalCode,
      area_income_usd: tables?.B19013?.estimate?.B19013001,
      households: tables?.B11001?.estimate?.B11001001,
    });
  }
  return normalizeRows(rows);
}

export function buildCensusApiUrl(vintage = '2024', apiKey = '') {
  const url = new URL(`https://api.census.gov/data/${vintage}/acs/acs5`);
  url.searchParams.set('get', 'NAME,B19013_001E,B11001_001E');
  url.searchParams.set('for', 'zip code tabulation area:*');
  if (apiKey) url.searchParams.set('key', apiKey);
  return url.toString();
}

export function buildCensusReporterUrls(vintage = '2024', stateFips = US_STATE_FIPS) {
  const release = `acs${vintage}_5yr`;
  const cleanFips = [...new Set(stateFips.map(String).filter((fips) => /^\d{2}$/.test(fips)))];
  return cleanFips.map((fips) => {
    const url = new URL(`${REPORTER_BASE}/${release}`);
    url.searchParams.set('table_ids', 'B19013,B11001');
    url.searchParams.set('geo_ids', `860|04000US${fips}`);
    return url.toString();
  });
}

async function fetchJson(url, label, fetchImpl) {
  const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${label} ${res.status}: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

function readCachedReference(cachePath, vintage) {
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const rows = normalizeRows(cached?.rows || []);
    if (cached?.vintage === vintage && rows.length) {
      return {
        rows,
        provider: cached.provider || 'U.S. Census Bureau',
        access: 'durable_cache',
        source_url: cached.source_url || `https://www.census.gov/data/developers/data-sets/acs-5year/${vintage}.html`,
      };
    }
  } catch {}
  return null;
}

function writeCachedReference(cachePath, payload) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(payload));
}

async function fetchOfficialReference({ vintage, apiKey, fetchImpl }) {
  const requestUrl = buildCensusApiUrl(vintage, apiKey);
  const raw = await fetchJson(requestUrl, 'Census ACS', fetchImpl);
  const rows = parseCensusAcsRows(raw);
  if (!rows.length) throw new Error('Census ACS returned no usable ZCTA rows.');
  return {
    rows,
    provider: 'U.S. Census Bureau',
    access: 'census_data_api',
    source_url: `https://www.census.gov/data/developers/data-sets/acs-5year/${vintage}.html`,
  };
}

async function fetchReporterReference({ vintage, fetchImpl }) {
  const byPostal = new Map();
  const urls = buildCensusReporterUrls(vintage);
  for (let i = 0; i < urls.length; i += REPORTER_CONCURRENCY) {
    const batch = urls.slice(i, i + REPORTER_CONCURRENCY);
    const payloads = await Promise.all(batch.map((url) => fetchJson(url, 'Census Reporter ACS', fetchImpl)));
    for (const payload of payloads) {
      for (const row of parseCensusReporterRows(payload)) byPostal.set(row.postal_code, row);
    }
  }
  const rows = [...byPostal.values()].sort((a, b) => a.postal_code.localeCompare(b.postal_code));
  if (!rows.length) throw new Error('Census Reporter returned no usable ZCTA rows.');
  return {
    rows,
    provider: 'U.S. Census Bureau via Census Reporter',
    access: 'census_reporter',
    source_url: 'https://censusreporter.org/',
  };
}

export async function loadUsAcsReference({
  vintage = '2024',
  cachePath,
  apiKey = '',
  fetchImpl = fetch,
} = {}) {
  if (!cachePath) throw new Error('A cachePath is required for the U.S. ACS reference.');

  const cached = readCachedReference(cachePath, vintage);
  if (cached) return cached;

  let result = null;
  let officialError = null;
  if (apiKey) {
    try {
      result = await fetchOfficialReference({ vintage, apiKey, fetchImpl });
    } catch (error) {
      officialError = error;
    }
  }

  if (!result) {
    try {
      result = await fetchReporterReference({ vintage, fetchImpl });
    } catch (reporterError) {
      if (officialError) {
        throw new Error(`${officialError.message}; Census Reporter fallback failed: ${reporterError.message}`);
      }
      throw reporterError;
    }
  }

  writeCachedReference(cachePath, {
    provider: result.provider,
    dataset: 'American Community Survey 5-year',
    vintage,
    access: result.access,
    source_url: result.source_url,
    fetched_at: new Date().toISOString(),
    rows: result.rows,
  });
  return result;
}
