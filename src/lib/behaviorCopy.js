import { formatPValue } from './statsTests.js';

export const BEHAVIOR_SCOPE_NOTE = 'Since June 3 CBO launch — same window as paid campaigns.';

export const CONFIDENCE_PLAIN = {
  'High confidence': 'Strong signal',
  'Actionable': 'Worth fixing',
  'Directional': 'Early signal',
  Watch: 'Keep watching',
  'Insufficient data': 'Too few sessions',
};

export const CONFIDENCE_TIP = {
  'High confidence': 'Lots of checkout attempts and reliably worse than the comparison group.',
  Actionable: 'Clearly above normal after adjusting for popularity and multiple tests.',
  Directional: 'Looks worse than normal, but still gather more sessions before big changes.',
  Watch: 'Not clearly worse than normal yet — popularity alone can inflate raw counts.',
  'Insufficient data': 'Need more checkout or payment attempts before ranking this row.',
};

export function plainConfidence(value = '') {
  return CONFIDENCE_PLAIN[value] || value || 'Too few sessions';
}

export function plainConfidenceTip(value = '') {
  return CONFIDENCE_TIP[value] || '';
}

export function plainPValue(adjustedLabel) {
  if (!adjustedLabel || adjustedLabel === '—') return '';
  if (adjustedLabel === '< 0.001') return 'Less than 0.1% chance this is just traffic volume';
  return `${adjustedLabel} chance this pattern is random noise (after multiple-test correction)`;
}

export function plainBaseline(label = 'Site average') {
  if (String(label).toLowerCase().includes('hoodie')) return 'Compared to other hoodies';
  if (String(label).toLowerCase().includes('crewneck')) return 'Compared to other crewnecks';
  if (String(label).toLowerCase().includes('t-shirt') || String(label).includes('T-Shirt')) return 'Compared to other tees';
  if (label.includes(' average')) return `Compared to other ${label.replace(' average', '').toLowerCase()}s`;
  return 'Compared to store-wide average';
}

export function plainVsBaseline(pp) {
  const n = Number(pp || 0);
  if (!Number.isFinite(n) || Math.abs(n) < 0.5) return 'Near average';
  return n > 0 ? `${n.toFixed(1)} pts worse than comparison group` : `${Math.abs(n).toFixed(1)} pts better than comparison group`;
}

export function plainExcessAbandons(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 'No extra drop-offs vs expected';
  return `~${n.toFixed(0)} extra drop-offs vs expected at comparison rate`;
}

export function plainDwellRead(read = '') {
  const map = {
    'Friction watch': 'Browsers linger longer than buyers — possible confusion',
    'Consideration path': 'Buyers spend more time here — normal shopping',
    Neutral: 'No clear dwell gap',
    'Non-purchaser only': 'Browsers only so far — no buyer comparison yet',
    'Insufficient sample': 'Not enough sessions to compare',
    'Possible friction (underpowered)': 'Maybe slow, but sample is still small',
  };
  return map[read] || read;
}

export function formatAdjustedP(label) {
  return plainPValue(label) || (label && label !== '—' ? `Adjusted significance ${label}` : '');
}

export function launchScopeLabel(since, until) {
  if (!since || !until) return BEHAVIOR_SCOPE_NOTE;
  if (since === until) return `Launch day ${since}`;
  return `Since launch · ${since} – ${until}`;
}
