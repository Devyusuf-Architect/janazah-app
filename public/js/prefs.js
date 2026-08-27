// Appearance preferences: theme and text size.
//
// Device-local, in localStorage, like follows and location. There is no user
// record to write them to and deliberately so — this application stores
// nothing about a person server-side, and a colour scheme is not a good enough
// reason to start.
//
// Both are applied by setting an attribute on <html>, which the stylesheet
// reads. The alternative, toggling classes on individual elements from
// JavaScript, would mean a page that renders in the wrong colours until the
// script has run.

const KEY = 'taziyah.appearance';

export const THEMES = [
  { value: 'system', label: 'Match my system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export const TEXT_SIZES = [
  { value: 'standard', label: 'Standard' },
  { value: 'large', label: 'Larger' },
];

const DEFAULTS = { theme: 'system', textSize: 'standard' };

const valid = (list, value, fallback) =>
  (list.some((o) => o.value === value) ? value : fallback);

export function settings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      theme: valid(THEMES, parsed.theme, DEFAULTS.theme),
      textSize: valid(TEXT_SIZES, parsed.textSize, DEFAULTS.textSize),
    };
  } catch {
    // Private browsing, or storage disabled. The defaults are the design's
    // own, so the app looks correct either way.
    return { ...DEFAULTS };
  }
}

/**
 * Write the current preferences onto <html>.
 *
 * "system" removes the attribute rather than resolving it to light or dark:
 * the stylesheet's own prefers-color-scheme query is then in charge, so a
 * device switching to night mode at sunset is followed without this page
 * doing anything.
 */
export function apply(next = settings()) {
  const root = document.documentElement;
  if (next.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = next.theme;

  if (next.textSize === 'standard') delete root.dataset.text;
  else root.dataset.text = next.textSize;
  return next;
}

export function update(patch) {
  const next = { ...settings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* nothing to do; the change still applies for this session */ }
  return apply(next);
}
