import { countryDisplayName, US_STATE_CODE_TO_NAME } from './orderLocations.mjs';

const NOISE_PATTERN = /\b(apartment|apt|flat|unit|suite|ste|floor|fl|villa|tower|building|bldg|block|room|rm|door|gate|plot|phase|street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln)\b|\b#\s?\d+/i;

export function titleCaseLocality(text = '') {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isNoisyLocalitySegment(text = '') {
  const segment = String(text || '').trim();
  if (!segment) return true;
  if (NOISE_PATTERN.test(segment)) return true;
  if (/^\d+[\w-]*$/.test(segment)) return true;
  return false;
}

// Shopify's `city` field is not always a municipality. In some markets (Gulf,
// parts of Asia, freeform checkout flows) buyers enter compound locality strings
// — neighborhood, compound, building, and unit — comma-separated in one field.
// The administrative region (`province` / emirate / state) is usually the right
// public label when `city` is multi-part or contains unit/building noise.
export function isCompoundLocality(city = '') {
  const raw = String(city || '').trim();
  if (!raw) return false;
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return true;
  if (parts.length === 1 && isNoisyLocalitySegment(parts[0])) return true;
  if (raw.length > 48) return true;
  return false;
}

function isSubdivisionCode(value = '') {
  return /^[A-Z]{2,3}$/i.test(String(value || '').trim());
}

function adminRegionFromAddress(address = {}) {
  const province = String(address.province || '').trim();
  const code = String(address.province_code || '').trim();

  if (province) {
    const provinceUpper = province.toUpperCase();
    const codeUpper = code.toUpperCase();
    if (!code || provinceUpper !== codeUpper) {
      if (!isSubdivisionCode(province)) return titleCaseLocality(province);
    }
    if (province.length > 3 || /\s/.test(province)) {
      return titleCaseLocality(province);
    }
  }

  return '';
}

export function pickPublicLocality(address = {}, country = '') {
  const countryCode = String(country || address.country_code || '').trim().toUpperCase();
  const rawCity = String(address.city || '').trim();

  if (countryCode === 'US') {
    return titleCaseLocality(rawCity);
  }

  if (rawCity && !isCompoundLocality(rawCity)) {
    return titleCaseLocality(rawCity);
  }

  const adminRegion = adminRegionFromAddress(address);
  if (adminRegion) return adminRegion;

  return '';
}

export function buildPublicLocation(address = {}, country = '', regionCode = '') {
  const countryCode = String(country || address.country_code || '').trim().toUpperCase();
  const countryName = countryDisplayName(countryCode);
  const locality = pickPublicLocality(address, countryCode);

  if (countryCode === 'US') {
    const stateName = US_STATE_CODE_TO_NAME[regionCode]
      || titleCaseLocality(address.province)
      || String(regionCode || '').trim();
    const parts = [locality, stateName, 'USA'].filter(Boolean);
    return parts.join(', ');
  }

  if (locality) return `${locality}, ${countryName}`;
  return countryName;
}
