// The two writes an organization's own people can make from a phone.
//
// Both are refused by firestore.rules unless the caller really is the owner
// or a staff member, so what this module actually does is keep the app from
// sending a write that is going to be refused, and keep the audit trail
// honest by naming the account making the change.
//
// It sends no field that is not in EDITABLE_ORG_FIELDS. Verification status,
// ownership, the staff list and the created and verified stamps have no code
// path here at all, which is a stronger statement than a rule that would
// reject them.

import {
  doc, updateDoc, serverTimestamp,
} from '@react-native-firebase/firestore';
import * as Location from 'expo-location';

import { db, auth } from './firebase';
import { geohash } from '../shared/geo';
import { CELL_PRECISION } from '../shared/config';
import {
  addressLine, changedFields, movedAddress,
  type OrgDraft,
} from './org-role';
import type { Organization } from './notice';

const orgDoc = (orgId: string) => doc(db, 'organizations', orgId);

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in again to make this change.');
  return uid;
}

export type SaveResult = {
  /** Nothing was different, so nothing was written. */
  unchanged: boolean;
  /**
   * The address moved but the coordinates could not be worked out, so the
   * map position was left where it was. Said on screen rather than silently
   * tolerated: an address and a pin that disagree send people to the wrong
   * place, and somebody should know which one is stale.
   */
  keptOldPosition: boolean;
};

/**
 * Save a profile edit.
 *
 * Coordinates are derived, never typed. When the address changes the platform
 * geocoder is asked for a new position, and the cell geohash is recomputed
 * from it with the same precision the web app and the Cloud Functions use, so
 * Nearby keeps matching. A geocoder that returns nothing is not an error and
 * does not lose the edit: the text is saved and the old position is kept.
 */
export async function saveOrganizationProfile(
  org: Organization,
  draft: OrgDraft,
): Promise<SaveResult> {
  const uid = requireUid();
  const patch = changedFields(org, draft);
  if (Object.keys(patch).length === 0) {
    return { unchanged: true, keptOldPosition: false };
  }

  const fields: Record<string, unknown> = {
    ...patch,
    updatedAt: serverTimestamp(),
    // Pinned to the caller by the rules as well. The Firestore trigger in
    // functions/index.js reads this to attribute the org.updated entry.
    updatedBy: uid,
  };

  let keptOldPosition = false;
  if (movedAddress(patch)) {
    const point = await geocode(addressLine({ ...draft }));
    if (point) {
      fields.lat = point.lat;
      fields.lng = point.lng;
      fields.cell = geohash(point.lat, point.lng, CELL_PRECISION);
    } else {
      keptOldPosition = true;
    }
  }

  await updateDoc(orgDoc(org.id), fields);
  return { unchanged: false, keptOldPosition };
}

/**
 * Take back a registration nobody has approved.
 *
 * Not a delete. The document stays, the audit trail keeps pointing at
 * something, and an administrator can reopen it. The rules allow this
 * transition only from pending, needs_information or rejected, and only for
 * the owner, so a verified organization cannot leave this way and a staff
 * member cannot end a registration that is not theirs.
 */
export async function withdrawOrganization(orgId: string): Promise<void> {
  const uid = requireUid();
  await updateDoc(orgDoc(orgId), {
    verificationStatus: 'withdrawn',
    withdrawnAt: serverTimestamp(),
    withdrawnBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

/**
 * An address to a position, or null.
 *
 * Forward geocoding only. It does not read the device's location and needs no
 * location permission, which is why an organization can be edited by somebody
 * who has never turned Nearby on.
 */
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null;
  try {
    const [first] = await Location.geocodeAsync(address);
    if (!first || !Number.isFinite(first.latitude) || !Number.isFinite(first.longitude)) {
      return null;
    }
    return { lat: first.latitude, lng: first.longitude };
  } catch {
    // No geocoder on the device, no network, nothing found. All the same
    // answer to the caller: keep the position that is already there.
    return null;
  }
}
