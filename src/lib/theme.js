/* ----------------------------------------------------------------------------
 * theme.js — light/dark selection.
 *
 * Resolution order: an explicit choice the operator saved, then the OS setting,
 * then light. The class is applied to <html> by an inline script in index.html
 * before React mounts, so the page never paints light and then flips.
 * ------------------------------------------------------------------------- */

export const THEME_STORAGE_KEY = 'shawq-theme';

export function systemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function storedTheme() {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    // Private mode / blocked storage — fall through to the system preference.
    return null;
  }
}

export function resolveTheme() {
  return storedTheme() || systemTheme();
}

export function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', next === 'dark');
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Persisting is best-effort; the in-session choice still applies.
  }
  return next;
}
