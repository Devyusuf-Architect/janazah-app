// The rules of following. Pure functions, no native modules, no I/O.
//
// Split out from follows.ts for the same reason lib/nearby.ts is split out
// from lib/location.ts: this is the part with the actual decisions in it, and
// it can be tested directly and read without the storage plumbing around it.
//
// The union in particular deserves to be looked at on its own. The wrong
// operation here does not throw and does not look broken. It silently
// unfollows masjids somebody deliberately chose on their other device, and
// they find out by not being told about a funeral.

import type { LocationPrefs } from './nearby';

/** The cap in firestore.rules. Kept in step by test/follows.test.ts. */
export const MAX_FOLLOWS = 200;

/** The only preference keys that travel with an account. */
export type SyncedPrefs = Pick<
  LocationPrefs, 'radiusKm' | 'alertScope' | 'followAlerts'
>;

export type AccountRecord = {
  followedOrgIds: string[];
  prefs: SyncedPrefs | null;
};

/**
 * The union of two follow lists, deduplicated and capped.
 *
 * Somebody who followed three masjids on their phone and two in a browser
 * means to follow five. Whichever client signs in second must not discard the
 * other's work, so this is a union and never a replacement.
 */
export function union(here: string[], there: string[]): string[] {
  return [...new Set([...here, ...there])].slice(0, MAX_FOLLOWS);
}

/**
 * Only the keys firestore.rules permits, in the shapes it checks for.
 *
 * Sending a key the rules do not allow fails the whole write, so anything
 * extra is dropped here rather than discovered later as a permission denial
 * that looks like following being broken.
 */
export function sanitisePrefs(
  prefs: Partial<SyncedPrefs> | null | undefined,
): SyncedPrefs | null {
  if (!prefs) return null;
  const radiusKm = Number(prefs.radiusKm);
  if (!Number.isFinite(radiusKm)) return null;
  return {
    radiusKm,
    // 'nearby' is the wider of the two, so a corrupt value means somebody
    // hears about more funerals rather than fewer. That is the right way for
    // this to fail.
    alertScope: prefs.alertScope === 'follows' ? 'follows' : 'nearby',
    followAlerts: prefs.followAlerts !== false,
  };
}

/** Strip whatever came back from Firestore down to something trustworthy. */
export function readRecord(data: Record<string, unknown> | undefined): AccountRecord {
  return {
    followedOrgIds: Array.isArray(data?.followedOrgIds)
      ? (data.followedOrgIds as unknown[]).filter(
          (id): id is string => typeof id === 'string')
      : [],
    prefs: sanitisePrefs(data?.prefs as Partial<SyncedPrefs> | undefined),
  };
}
