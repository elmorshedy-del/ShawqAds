// Server-side location resolver for Shopify orders.
//
// Converts a Shopify shipping/billing address into geographic
// [longitude, latitude] coordinates without ever exposing the raw
// customer address to the browser. Resolution priority:
//   1. Exact country + state/province + city match (cityCoordinates)
//   2. Geocode city + region + country (optional, server-side only)
//   3. State/province centroid (regionCentroids)
//   4. Country centroid (countryCentroids)
//   5. null (skip the point)

export function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[._]/g, ' ')
    .replace(/[^A-Z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Country name / alias -> ISO-3166 alpha-2.
const COUNTRY_ALIASES = {
  USA: 'US',
  US: 'US',
  'UNITED STATES': 'US',
  'UNITED STATES OF AMERICA': 'US',
  AMERICA: 'US',
  UK: 'GB',
  GB: 'GB',
  'UNITED KINGDOM': 'GB',
  'GREAT BRITAIN': 'GB',
  ENGLAND: 'GB',
  SCOTLAND: 'GB',
  WALES: 'GB',
  CANADA: 'CA',
  CA: 'CA',
  AUSTRALIA: 'AU',
  AU: 'AU',
  GERMANY: 'DE',
  DEUTSCHLAND: 'DE',
  DE: 'DE',
  FRANCE: 'FR',
  FR: 'FR',
  SPAIN: 'ES',
  ESPANA: 'ES',
  ES: 'ES',
  ITALY: 'IT',
  ITALIA: 'IT',
  IT: 'IT',
  NETHERLANDS: 'NL',
  NL: 'NL',
  IRELAND: 'IE',
  IE: 'IE',
  'NEW ZEALAND': 'NZ',
  NZ: 'NZ',
  'UNITED ARAB EMIRATES': 'AE',
  UAE: 'AE',
  AE: 'AE',
  'SAUDI ARABIA': 'SA',
  SA: 'SA',
  TURKEY: 'TR',
  TURKIYE: 'TR',
  TR: 'TR',
};

export function normalizeCountry(value) {
  const raw = normalize(value);
  if (!raw) return '';
  if (COUNTRY_ALIASES[raw]) return COUNTRY_ALIASES[raw];
  // Already a 2-letter ISO code.
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  return raw.slice(0, 2);
}

// Full US state name -> USPS abbreviation.
const US_STATE_NAME_TO_CODE = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
  COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', 'DISTRICT OF COLUMBIA': 'DC',
  FLORIDA: 'FL', GEORGIA: 'GA', HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL',
  INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA',
  MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN',
  MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK',
  OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT',
  VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI',
  WYOMING: 'WY',
};

export const US_STATE_CODE_TO_NAME = Object.fromEntries(
  Object.entries(US_STATE_NAME_TO_CODE).map(([name, code]) => [code, toTitle(name)]),
);

function toTitle(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// Region/province normalization. For US, always resolve to the 2-letter
// USPS abbreviation (Shopify province_code), converting full names if needed.
export function normalizeRegion(country, value) {
  const raw = normalize(value);
  if (!raw) return '';
  if (country === 'US') {
    if (US_STATE_NAME_TO_CODE[raw]) return US_STATE_NAME_TO_CODE[raw];
    if (/^[A-Z]{2}$/.test(raw)) return raw;
    return raw.slice(0, 2);
  }
  if (/^[A-Z]{2,3}$/.test(raw)) return raw;
  return raw;
}

// [longitude, latitude] for major destination cities, keyed
// `${country}|${region}|${city}`. Coordinates always [lon, lat].
export const cityCoordinates = {
  // United States
  'US|NY|NEW YORK': [-74.006, 40.7128],
  // New York City boroughs (so they separate on the map)
  'US|NY|MANHATTAN': [-73.9712, 40.7831],
  'US|NY|BROOKLYN': [-73.9442, 40.6782],
  'US|NY|BRONX': [-73.8648, 40.8448],
  'US|NY|THE BRONX': [-73.8648, 40.8448],
  'US|NY|QUEENS': [-73.7949, 40.7282],
  'US|NY|STATEN ISLAND': [-74.1502, 40.5795],
  'US|CA|LOS ANGELES': [-118.2437, 34.0522],
  'US|CA|SAN FRANCISCO': [-122.4194, 37.7749],
  'US|CA|SAN DIEGO': [-117.1611, 32.7157],
  'US|CA|SAN JOSE': [-121.8863, 37.3382],
  'US|CA|SACRAMENTO': [-121.4944, 38.5816],
  'US|CO|DENVER': [-104.9903, 39.7392],
  'US|CO|COLORADO SPRINGS': [-104.8214, 38.8339],
  'US|FL|MIAMI': [-80.1918, 25.7617],
  'US|FL|ORLANDO': [-81.3792, 28.5383],
  'US|FL|TAMPA': [-82.4572, 27.9506],
  'US|FL|JACKSONVILLE': [-81.6557, 30.3322],
  'US|TX|DALLAS': [-96.797, 32.7767],
  'US|TX|HOUSTON': [-95.3698, 29.7604],
  'US|TX|AUSTIN': [-97.7431, 30.2672],
  'US|TX|SAN ANTONIO': [-98.4936, 29.4241],
  'US|IL|CHICAGO': [-87.6298, 41.8781],
  'US|WA|SEATTLE': [-122.3321, 47.6062],
  'US|MA|BOSTON': [-71.0589, 42.3601],
  'US|GA|ATLANTA': [-84.388, 33.749],
  'US|AZ|PHOENIX': [-112.074, 33.4484],
  'US|PA|PHILADELPHIA': [-75.1652, 39.9526],
  'US|PA|PITTSBURGH': [-79.9959, 40.4406],
  'US|NV|LAS VEGAS': [-115.1398, 36.1699],
  'US|OR|PORTLAND': [-122.6765, 45.5152],
  'US|MI|DETROIT': [-83.0458, 42.3314],
  'US|MN|MINNEAPOLIS': [-93.265, 44.9778],
  'US|NC|CHARLOTTE': [-80.8431, 35.2271],
  'US|TN|NASHVILLE': [-86.7816, 36.1627],
  'US|MO|ST LOUIS': [-90.1994, 38.627],
  'US|OH|COLUMBUS': [-82.9988, 39.9612],
  'US|DC|WASHINGTON': [-77.0369, 38.9072],
  // Canada
  'CA|ON|TORONTO': [-79.3832, 43.6532],
  'CA|ON|OTTAWA': [-75.6972, 45.4215],
  'CA|QC|MONTREAL': [-73.5673, 45.5017],
  'CA|BC|VANCOUVER': [-123.1207, 49.2827],
  'CA|AB|CALGARY': [-114.0719, 51.0447],
  'CA|AB|EDMONTON': [-113.4938, 53.5461],
  // United Kingdom
  'GB||LONDON': [-0.1276, 51.5072],
  'GB||MANCHESTER': [-2.2426, 53.4808],
  'GB||BIRMINGHAM': [-1.8904, 52.4862],
  'GB||GLASGOW': [-4.2518, 55.8642],
  'GB||EDINBURGH': [-3.1883, 55.9533],
  // Europe
  'FR||PARIS': [2.3522, 48.8566],
  'FR||LYON': [4.8357, 45.764],
  'FR||MARSEILLE': [5.3698, 43.2965],
  'DE||BERLIN': [13.405, 52.52],
  'DE||MUNICH': [11.582, 48.1351],
  'DE||HAMBURG': [9.9937, 53.5511],
  'DE||FRANKFURT': [8.6821, 50.1109],
  'ES||MADRID': [-3.7038, 40.4168],
  'ES||BARCELONA': [2.1734, 41.3851],
  'IT||ROME': [12.4964, 41.9028],
  'IT||MILAN': [9.19, 45.4642],
  'NL||AMSTERDAM': [4.9041, 52.3676],
  'IE||DUBLIN': [-6.2603, 53.3498],
  // Middle East
  'AE||DUBAI': [55.2708, 25.2048],
  'AE||ABU DHABI': [54.3773, 24.4539],
  'SA||RIYADH': [46.6753, 24.7136],
  'TR||ISTANBUL': [28.9784, 41.0082],
  'TR||ANKARA': [32.8597, 39.9334],
  // Oceania
  'AU||SYDNEY': [151.2093, -33.8688],
  'AU||MELBOURNE': [144.9631, -37.8136],
  'AU||BRISBANE': [153.0251, -27.4698],
  'AU||PERTH': [115.8605, -31.9505],
  'NZ||AUCKLAND': [174.7633, -36.8485],
};

// State/province centroids keyed `${country}|${region}` -> [lon, lat].
export const regionCentroids = {
  'US|AL': [-86.79, 32.81], 'US|AK': [-152.4, 64.2], 'US|AZ': [-111.66, 34.17],
  'US|AR': [-92.44, 34.97], 'US|CA': [-119.68, 36.12], 'US|CO': [-105.31, 39.06],
  'US|CT': [-72.76, 41.6], 'US|DE': [-75.51, 39.32], 'US|DC': [-77.03, 38.9],
  'US|FL': [-81.69, 27.77], 'US|GA': [-83.64, 33.04], 'US|HI': [-157.5, 21.09],
  'US|ID': [-114.48, 44.24], 'US|IL': [-88.99, 40.35], 'US|IN': [-86.26, 39.85],
  'US|IA': [-93.21, 42.01], 'US|KS': [-96.73, 38.53], 'US|KY': [-84.67, 37.67],
  'US|LA': [-91.87, 31.17], 'US|ME': [-69.38, 44.69], 'US|MD': [-76.8, 39.06],
  'US|MA': [-71.53, 42.23], 'US|MI': [-84.54, 43.33], 'US|MN': [-93.9, 45.69],
  'US|MS': [-89.68, 32.74], 'US|MO': [-92.29, 38.46], 'US|MT': [-110.45, 46.92],
  'US|NE': [-98.27, 41.13], 'US|NV': [-117.06, 38.31], 'US|NH': [-71.56, 43.45],
  'US|NJ': [-74.52, 40.3], 'US|NM': [-106.25, 34.84], 'US|NY': [-74.95, 42.17],
  'US|NC': [-79.81, 35.63], 'US|ND': [-99.78, 47.53], 'US|OH': [-82.76, 40.39],
  'US|OK': [-96.93, 35.57], 'US|OR': [-122.07, 44.57], 'US|PA': [-77.21, 40.59],
  'US|RI': [-71.51, 41.68], 'US|SC': [-80.95, 33.86], 'US|SD': [-99.44, 44.3],
  'US|TN': [-86.69, 35.75], 'US|TX': [-97.56, 31.05], 'US|UT': [-111.86, 40.15],
  'US|VT': [-72.71, 44.05], 'US|VA': [-78.17, 37.77], 'US|WA': [-121.49, 47.4],
  'US|WV': [-80.95, 38.49], 'US|WI': [-89.62, 44.27], 'US|WY': [-107.3, 42.76],
  'CA|ON': [-85.0, 50.0], 'CA|QC': [-71.5, 52.0], 'CA|BC': [-124.0, 54.0],
  'CA|AB': [-114.0, 54.0], 'CA|MB': [-98.0, 54.0], 'CA|SK': [-106.0, 54.0],
  'CA|NS': [-63.0, 45.0], 'CA|NB': [-66.0, 46.5],
};

// Country centroids keyed by ISO-3166 alpha-2 -> [lon, lat].
export const countryCentroids = {
  US: [-98.5795, 39.8283], CA: [-106.3468, 56.1304], GB: [-1.5, 52.3],
  FR: [2.2137, 46.2276], DE: [10.4515, 51.1657], ES: [-3.7492, 40.4637],
  IT: [12.5674, 41.8719], NL: [5.2913, 52.1326], IE: [-8.2439, 53.4129],
  AU: [133.7751, -25.2744], NZ: [174.886, -40.9006], AE: [53.8478, 23.4241],
  SA: [45.0792, 23.8859], TR: [35.2433, 38.9637], BE: [4.4699, 50.5039],
  CH: [8.2275, 46.8182], SE: [18.6435, 60.1282], NO: [8.4689, 60.472],
  DK: [9.5018, 56.2639], FI: [25.7482, 61.9241], AT: [14.5501, 47.5162],
  PT: [-8.2245, 39.3999], PL: [19.1451, 51.9194], MX: [-102.5528, 23.6345],
  BR: [-51.9253, -14.235], JP: [138.2529, 36.2048], IN: [78.9629, 20.5937],
  CN: [104.1954, 35.8617], SG: [103.8198, 1.3521], ZA: [22.9375, -30.5595],
  KR: [127.7669, 35.9078], IL: [34.8516, 31.0461], GR: [21.8243, 39.0742],
};

// ISO-3166 alpha-2 -> display name (common storefront markets).
export const countryNames = {
  US: 'USA', CA: 'Canada', GB: 'United Kingdom', FR: 'France', DE: 'Germany',
  ES: 'Spain', IT: 'Italy', NL: 'Netherlands', IE: 'Ireland', AU: 'Australia',
  NZ: 'New Zealand', AE: 'United Arab Emirates', SA: 'Saudi Arabia', TR: 'Turkey',
  BE: 'Belgium', CH: 'Switzerland', SE: 'Sweden', NO: 'Norway', DK: 'Denmark',
  FI: 'Finland', AT: 'Austria', PT: 'Portugal', PL: 'Poland', MX: 'Mexico',
  BR: 'Brazil', JP: 'Japan', IN: 'India', CN: 'China', SG: 'Singapore',
  ZA: 'South Africa', KR: 'South Korea', IL: 'Israel', GR: 'Greece',
};

// New York City boroughs, used to render "<Borough>, New York, New York, USA".
export const NYC_BOROUGHS = new Set(['MANHATTAN', 'BROOKLYN', 'BRONX', 'THE BRONX', 'QUEENS', 'STATEN ISLAND']);

export function countryFlag(code) {
  const cc = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '\u{1F3F3}';
  return [...cc].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join('');
}

export function countryDisplayName(code) {
  const cc = normalizeCountry(code);
  return countryNames[cc] || cc || 'Unknown';
}

// Builds a normalized destination object from a Shopify address.
export function normalizeAddress(address = {}) {
  const country = normalizeCountry(address.country_code || address.country);
  const region = normalizeRegion(country, address.province_code || address.province);
  const city = normalize(address.city);
  return { country, region, city };
}

export function lookupKey({ country, region, city }) {
  return `${country}|${region}|${city}`;
}

// Resolves coordinates synchronously from the static tables only
// (no geocoding). Returns [lon, lat] or null.
export function resolveStaticCoordinates({ country, region, city }) {
  if (!country) return null;
  const exact = cityCoordinates[`${country}|${region}|${city}`];
  if (exact) return exact;
  const regionFallback = regionCentroids[`${country}|${region}`];
  if (regionFallback) return regionFallback;
  return countryCentroids[country] || null;
}
