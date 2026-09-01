// The settings a platform administrator controls, read by every client.
//
// One document, /platformSettings/platform, publicly readable so the values
// are in hand before anyone signs in. firestore.rules names every field,
// checks its type and bounds it. Nothing here decides who may read or write
// anything, and nothing here is a secret: a wrong value is a bad
// configuration, never a breach. That is the line these settings stay behind.
//
// Cached synchronously after one read at bootstrap, the same shape as
// sample-mode.js, because the callers are not async: a form being built, a
// radius being applied, a badge being decided while a list paints.
//
// Every value here is normalized on the way in as well as validated on the
// way to the database. The rules are the enforcement, but a client that reads
// a document written before a field existed should fall back to the default
// rather than render undefined at somebody.

export const SETTINGS_DEFAULTS = {
  // The distance a device covers by default before anyone has chosen one in
  // Settings. Not a limit on what anyone may choose.
  notificationRadiusKm: 10,
  // How close a Janazah has to be for the app to mark it as imminent.
  reminderMinutes: 180,
  organizationTypes: ['masjid', 'funeral_home', 'other'],
  supportEmail: '',
  privacyEmail: '',
  // Which optional fields the notice composer offers. Turning one off hides
  // the field; it never removes it from a notice that already carries it.
  optionalDeceasedName: true,
  optionalBurialLocation: true,
  optionalInstructions: true,
  announcementEnabled: false,
  announcementMessage: '',
};

// Mirrors the enum in validOrgShape() and validPlatformSettings().
export const SETTABLE_ORG_TYPES = ['masjid', 'funeral_home', 'other'];

export const RADIUS_BOUNDS = { min: 1, max: 200 };
export const REMINDER_BOUNDS = { min: 0, max: 2880 };
export const ANNOUNCEMENT_MAX = 280;
export const CONTACT_EMAIL_MAX = 120;

let current = { ...SETTINGS_DEFAULTS };

/** The settings in force right now. Never null, never partial. */
export const platformSettings = () => current;

const clampNumber = (value, { min, max }, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const text = (value, max, fallback) =>
  (typeof value === 'string' ? value.trim().slice(0, max) : fallback);

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

/**
 * A stored document turned into a complete, in-range settings object.
 *
 * Deliberately forgiving in the same direction the rules are strict: a field
 * that is missing, of the wrong type or out of range falls back to its
 * default instead of propagating nonsense into a form or a filter.
 */
export function normalizeSettings(raw = {}) {
  const types = Array.isArray(raw.organizationTypes)
    ? raw.organizationTypes.filter((t) => SETTABLE_ORG_TYPES.includes(t))
    : [];
  return {
    notificationRadiusKm: clampNumber(raw.notificationRadiusKm, RADIUS_BOUNDS,
      SETTINGS_DEFAULTS.notificationRadiusKm),
    reminderMinutes: Math.round(clampNumber(raw.reminderMinutes, REMINDER_BOUNDS,
      SETTINGS_DEFAULTS.reminderMinutes)),
    organizationTypes: types.length ? types : [...SETTINGS_DEFAULTS.organizationTypes],
    supportEmail: text(raw.supportEmail, CONTACT_EMAIL_MAX, SETTINGS_DEFAULTS.supportEmail),
    privacyEmail: text(raw.privacyEmail, CONTACT_EMAIL_MAX, SETTINGS_DEFAULTS.privacyEmail),
    optionalDeceasedName: bool(raw.optionalDeceasedName, SETTINGS_DEFAULTS.optionalDeceasedName),
    optionalBurialLocation: bool(raw.optionalBurialLocation,
      SETTINGS_DEFAULTS.optionalBurialLocation),
    optionalInstructions: bool(raw.optionalInstructions, SETTINGS_DEFAULTS.optionalInstructions),
    announcementEnabled: bool(raw.announcementEnabled, SETTINGS_DEFAULTS.announcementEnabled),
    announcementMessage: text(raw.announcementMessage, ANNOUNCEMENT_MAX,
      SETTINGS_DEFAULTS.announcementMessage),
  };
}

/**
 * Read the stored settings once, at bootstrap.
 *
 * @param {(settings: object) => void} [onChange] Called only when the stored
 *   document differs from what the page has already rendered with.
 */
export async function initPlatformSettings(onChange) {
  // Lazily imported: store.js imports this module, so a top-level import
  // here would be a cycle. Same reasoning as sample-mode.js.
  const { readPlatformSettings } = await import('./store.js');
  const stored = await readPlatformSettings();
  if (!stored) return;
  const next = normalizeSettings(stored);
  const changed = JSON.stringify(next) !== JSON.stringify(current);
  current = next;
  if (changed && onChange) onChange(next);
}

/** Used by the admin portal immediately after it saves, so it repaints once. */
export function setPlatformSettings(values) {
  current = normalizeSettings(values);
}

/** The announcement to show, or null when there is nothing to say. */
export function activeAnnouncement() {
  const { announcementEnabled, announcementMessage } = current;
  if (!announcementEnabled || !announcementMessage) return null;
  return announcementMessage;
}

/**
 * Whether a notice is close enough to be worth marking as imminent.
 *
 * A reminder lead time of zero switches the marker off entirely, which is
 * the honest way to express "do not flag anything" rather than a magic
 * sentinel elsewhere.
 */
export function isStartingSoon(janazahAt, now = Date.now()) {
  const minutes = current.reminderMinutes;
  if (!minutes) return false;
  const at = janazahAt?.toDate ? janazahAt.toDate() : janazahAt;
  const ms = at instanceof Date ? at.getTime() : Date.parse(at);
  if (!Number.isFinite(ms)) return false;
  return ms >= now && ms - now <= minutes * 60 * 1000;
}

/**
 * Paint the platform announcement into a banner element, if there is one.
 * Silently does nothing when the page has no such banner.
 */
export function paintAnnouncement(banner) {
  if (!banner) return;
  const message = activeAnnouncement();
  if (!message) { banner.hidden = true; return; }
  banner.textContent = message;
  banner.hidden = false;
}
