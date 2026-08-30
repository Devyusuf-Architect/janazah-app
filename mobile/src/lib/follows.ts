// Followed masjids.
//
// The mobile half of what public/js/account-sync.js does on the web, and it
// has to behave identically, because the whole point is that following a
// masjid on a phone shows up in a browser and the other way round.
//
// Signed out, this is a list on the device and nothing more. Reading the feed
// and following a masjid need no account, exactly as on the web, and the
// anonymous session opened at launch cannot create a /users document: the
// rules reject it by sign-in provider, so there is no way for one to appear
// per install.
//
// Signed in, the list is mirrored to /users/{uid}, which firestore.rules
// opens to that account and to nobody else, not even a platform
// administrator.
//
// Two behaviours are load-bearing and are pinned by test/follows.test.ts:
//
//   The merge unions. Somebody who followed three masjids here and two in a
//   browser means to follow five, and whichever client signs in second must
//   not silently discard the other's work.
//
//   Following never waits on the network. The local list is written first and
//   is what every screen reads; the mirror catches up behind it. A slow
//   connection outside a masjid must not stand between somebody and a follow.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDoc, setDoc, deleteDoc, serverTimestamp,
} from '@react-native-firebase/firestore';

import { userRef } from './collections';
import { auth } from './firebase';
import {
  MAX_FOLLOWS, readRecord,
  type AccountRecord, type SyncedPrefs,
} from './follow-merge';

const KEY = 'taziyah.followedOrgs';

// ---------------------------------------------------------------- on device

export async function readLocal(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
  } catch {
    // Storage unavailable. Following is a convenience; the feed must still
    // work without it.
    return [];
  }
}

export async function writeLocal(ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)].slice(0, MAX_FOLLOWS);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(unique));
  } catch {
    // The change still applies for this session.
  }
  return unique;
}

// ---------------------------------------------------------------- the mirror

/** Whether there is a real account to mirror to. Anonymous does not count. */
export function accountUid(): string | null {
  const user = auth.currentUser;
  return user && !user.isAnonymous ? user.uid : null;
}

export async function readAccount(uid: string): Promise<AccountRecord | null> {
  try {
    const snapshot = await getDoc(userRef(uid));
    if (!snapshot.exists()) return null;
    return readRecord(snapshot.data());
  } catch {
    // A denial or a network failure. The local list is still correct and is
    // what every screen reads.
    return null;
  }
}

export async function writeAccount(
  uid: string,
  followedOrgIds: string[],
  prefs: SyncedPrefs | null,
): Promise<void> {
  try {
    await setDoc(userRef(uid), {
      followedOrgIds: followedOrgIds.slice(0, MAX_FOLLOWS),
      ...(prefs ? { prefs } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Fire and forget by design. A failed mirror is a sync that catches up
    // later, not a lost follow.
  }
}

/**
 * Delete the account's record.
 *
 * Called before deleting the account itself, while there is still a session
 * allowed to do it. Afterwards nobody can: the rules open this document to
 * its own account and to nobody else, so one left behind is unreachable
 * forever.
 */
export async function deleteAccountRecord(uid: string): Promise<void> {
  try {
    await deleteDoc(userRef(uid));
  } catch {
    // Reported by the caller through the account deletion flow.
  }
}

export * from './follow-merge';
