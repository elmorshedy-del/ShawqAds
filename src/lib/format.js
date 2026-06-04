export const fmt = new Intl.NumberFormat('en-US');
export const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export function pct(value) {
  const n = Number(value || 0);
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

export function slug(value) {
  return String(value || '').replace(/\s+/g, '-');
}

export function compact(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return fmt.format(Math.round(n));
}
