// Nearby matching. Pure functions, no native modules, no I/O.
//
// Split out from location.ts so it can be unit tested directly under
// `node --test`, which cannot load Expo's native modules. That is the
// mechanical reason. The better one is that this is the part with the actual
// rules in it, and it is worth being able to read it without the storage and
// permission plumbing in the way.
//
// The matching itself is the whole privacy design: notice locations are
// public and few, user positions are private and many, so the comparison
// happens here on the device against notices the feed already fetched. The
// backend never receives a position and so cannot learn where anyone is, even
// in principle.

import { distanceKm } from '../shared/geo';
import type { Notice } from './notice';

/** Where the reader is. Never leaves this device. */
export type Point = { lat: number; lng: number; at: number };

export type LocationPrefs = {
  enabled: boolean;
  radiusKm: number;
  /** 'nearby' is every Janazah in range plus followed masjids; 'follows' only
   *  the masjids you follow, wherever they are. */
  alertScope: 'nearby' | 'follows';
  followAlerts: boolean;
};

/** Same options as the web app, so a radius means the same thing on both. */
export const RADIUS_OPTIONS = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 20, label: '20 km' },
  { km: 50, label: '50 km' },
  { km: 0, label: 'Any distance' },
] as const;

export const ALERT_SCOPES = [
  { value: 'nearby', label: 'Janazahs near me, and masjids I follow' },
  { value: 'follows', label: 'Only masjids I follow' },
] as const;

export const DEFAULTS: LocationPrefs = {
  enabled: false,
  radiusKm: 10,
  alertScope: 'nearby',
  followAlerts: true,
};

/** A stored point older than this is shown as stale, not silently trusted. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export const isStale = (point: Point | null, now = Date.now()): boolean =>
  !point || now - point.at > STALE_AFTER_MS;

/**
 * Repair whatever came out of storage.
 *
 * A value not in RADIUS_OPTIONS cannot have come from this app's UI, so it is
 * corrupt storage or an older build and the default is the right answer.
 * `enabled` requires an exact true: location is opt in, and anything
 * ambiguous is off.
 */
export function normalisePrefs(parsed: unknown): LocationPrefs {
  const input = (parsed ?? {}) as Partial<LocationPrefs>;
  const radius = Number(input.radiusKm);
  return {
    enabled: input.enabled === true,
    radiusKm: RADIUS_OPTIONS.some((o) => o.km === radius) ? radius : DEFAULTS.radiusKm,
    alertScope: input.alertScope === 'follows' ? 'follows' : 'nearby',
    followAlerts: input.followAlerts !== false,
  };
}

/**
 * What the app knows about its own location permission.
 *
 * 'denied' means permanently: Android will not prompt again, and the app has
 * to say where the setting lives instead of offering a button that silently
 * does nothing. 'undetermined' means a prompt is still possible.
 */
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/** What to tell somebody who has denied it permanently. */
export const SETTINGS_HINT =
  'Location is switched off for Ta\u2019ziyah. To turn it back on, open Android '
  + 'Settings, then Apps, then Ta\u2019ziyah, then Permissions, then Location, and '
  + 'choose \u201CAllow only while using the app\u201D.';

export type Nearby = { notice: Notice; km: number };

/** Kilometres from a point to a notice's prayer location, or null. */
export function noticeDistanceKm(notice: Notice, from: Point | null): number | null {
  const place = notice?.prayerLocation;
  if (!from || !place) return null;
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return null;
  return distanceKm({ lat: from.lat, lng: from.lng }, { lat: place.lat, lng: place.lng });
}

/**
 * Notices within the radius, nearest first, each annotated with its distance.
 *
 * A radius of 0 means no limit, so everything with coordinates is included and
 * simply sorted. Matches public/js/location.js so the two clients agree about
 * what "within 10 km" means.
 */
export function nearbyNotices(
  notices: Notice[],
  from: Point | null,
  radiusKm: number,
): Nearby[] {
  if (!from) return [];
  return notices
    .map((notice) => ({ notice, km: noticeDistanceKm(notice, from) }))
    .filter((entry): entry is Nearby =>
      entry.km !== null && (radiusKm === 0 || entry.km <= radiusKm))
    .sort((a, b) => a.km - b.km);
}

/** Distances for a list, without filtering. Home shows these beside each row. */
export function annotate(notices: Notice[], from: Point | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!from) return out;
  for (const notice of notices) {
    const km = noticeDistanceKm(notice, from);
    if (km !== null) out.set(notice.id, km);
  }
  return out;
}
