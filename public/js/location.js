// Nearby matching, entirely on the device.
//
// The single most important property of this module: a user's position is
// never written to Firestore, never sent to a masjid, and never leaves the
// browser. The published notice list is public and small, so the match is done
// here, against notices already downloaded to render the feed. The backend
// therefore cannot learn where anyone is, even in principle.
//
// Only the most recent point is kept, in localStorage on the user's own
// device, overwritten in place. Nothing is appended, so no travel history can
// accumulate, and opting out erases it.

import { distanceKm } from './geo.js';

const KEY = 'janazah.location';

export const RADIUS_OPTIONS = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 20, label: '20 km' },
  { km: 50, label: '50 km' },
  { km: 0, label: 'Any distance' },
];

const DEFAULTS = {
  enabled: false,
  radiusKm: 10,
  alertsEnabled: false,
  // 'nearby'  every Janazah in range, plus masjids you follow
  // 'follows'  only masjids you follow, wherever they are
  //
  // In a dense city "every Janazah in range" can be several alerts a day,
  // which is the fastest way to have notifications switched off altogether.
  // This is the volume control, and it works by narrowing what the device
  // subscribes to rather than by discarding messages on arrival.
  alertScope: 'nearby',
  // Whether a masjid this device follows may notify it. Separate from
  // alertScope, which is about area coverage: somebody can want their own
  // masjids and nothing else, or the area and not the masjids.
  followAlerts: true,
  last: null, // { lat, lng, at }
};

export const ALERT_SCOPES = [
  { value: 'nearby', label: 'Janazahs near me, and masjids I follow' },
  { value: 'follows', label: 'Only masjids I follow' },
];

/** A stored position older than this is shown as stale, not silently trusted. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export function settings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      radiusKm: Number.isFinite(parsed.radiusKm) ? parsed.radiusKm : DEFAULTS.radiusKm,
      alertScope: parsed.alertScope === 'follows' ? 'follows' : DEFAULTS.alertScope,
      followAlerts: parsed.followAlerts !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function update(patch) {
  const next = { ...settings(), ...patch };
  save(next);
  return next;
}

/**
 * Turn the feature off and erase the stored point in the same step. Opting out
 * has to actually delete, not merely stop reading.
 */
export function disable() {
  const next = { ...settings(), enabled: false, alertsEnabled: false, last: null };
  save(next);
  return next;
}

export function isStale(last) {
  return !last?.at || Date.now() - last.at > STALE_AFTER_MS;
}

export class LocationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

/** Permission state without triggering a prompt, where the browser supports it. */
export async function permissionState() {
  if (!('geolocation' in navigator)) return 'unsupported';
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unknown';
  }
}

/**
 * Ask the browser for the current position. This is the only place that does,
 * and it is called only from an explicit user action.
 */
export function requestPosition({ timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new LocationError(
        'This browser does not support location.', 'unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          at: Date.now(),
        };
        // Overwrite in place. Never append.
        update({ last: point });
        resolve(point);
      },
      (err) => {
        const map = {
          1: ['Location permission was declined. On a computer, look for the ' +
              'location icon in the address bar and allow it for this site. ' +
              'On a phone, check Settings for your browser (Location) or tap ' +
              'the site-info icon next to the address bar.', 'denied'],
          2: ['Your location could not be determined right now. Try again, ' +
              'or check that location services are on for this device.', 'unavailable'],
          3: ['Finding your location took too long. Try again.', 'timeout'],
        };
        const [message, code] = map[err.code]
          || ['Your location could not be read.', 'unknown'];
        reject(new LocationError(message, code));
      },
      { enableHighAccuracy: false, timeout, maximumAge: 5 * 60 * 1000 },
    );
  });
}

/**
 * Distance in kilometres from the stored point to a notice's prayer location,
 * or null when either side is missing.
 */
export function noticeDistanceKm(notice, from) {
  const loc = notice?.prayerLocation;
  if (!from || !Number.isFinite(loc?.lat) || !Number.isFinite(loc?.lng)) return null;
  return distanceKm({ lat: from.lat, lng: from.lng }, { lat: loc.lat, lng: loc.lng });
}

/**
 * Notices within the chosen radius, nearest first, each annotated with its
 * distance. A radius of 0 means no limit, so everything with coordinates is
 * included and simply sorted.
 */
export function nearbyNotices(notices, from, radiusKm) {
  if (!from) return [];
  return notices
    .map((notice) => ({ notice, km: noticeDistanceKm(notice, from) }))
    .filter(({ km }) => km !== null && (radiusKm === 0 || km <= radiusKm))
    .sort((a, b) => a.km - b.km);
}

export const storageAvailable = () => {
  try {
    localStorage.setItem(`${KEY}.probe`, '1');
    localStorage.removeItem(`${KEY}.probe`);
    return true;
  } catch {
    return false;
  }
};

/** Secure context or localhost. Geolocation is blocked over plain HTTP. */
export const canUseLocation = () =>
  'geolocation' in navigator && (window.isSecureContext
    || ['localhost', '127.0.0.1'].includes(location.hostname));
