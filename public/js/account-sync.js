// Keeping a signed-in reader's follows and alert preferences in one place.
//
// Ta'ziyah is now two applications on one backend, and this is the module
// that makes them behave like one product for somebody who signs in on both.
// Followed masjids and alert preferences live in /users/{uid}, which
// firestore.rules opens to that account and to nobody else, not even a
// platform administrator.
//
// The rules that make this safe to add to an application that previously
// stored nothing about anyone:
//
//   Signed out changes nothing. No document is created, nothing is read, and
//   following a masjid works exactly as it did, on the device. The anonymous
//   session the reporting flow opens cannot create one either; the rules
//   reject it by sign-in provider.
//
//   The merge unions rather than overwrites. Somebody who followed three
//   masjids on their phone and two in this browser means to follow five, and
//   whichever client happened to sign in second must not silently discard the
//   other's work.
//
//   Nothing here blocks anything. Every write is fire and forget with the
//   error logged, because a slow network must never stand between somebody
//   and following a masjid.
//
// What is deliberately NOT here: theme and text size (a phone at night and a
// desktop at work are different contexts and should be allowed to differ),
// the push token and its topic subscriptions, and the browser's notification
// and location permissions. Those are properties of one device, not of a
// person, and syncing them would mean one device silently changing what
// another one does.

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

import { auth, db } from './firebase.js';
import * as follows from './follows.js';
import * as location from './location.js';

/** Which account the mirror is currently following, or null. */
let uid = null;
let stopListening = null;

const userRef = (id) => doc(db, 'users', id);

/** Only the preference keys the rules permit, and only when they are set. */
function prefsFrom(settings) {
  return {
    radiusKm: Number(settings.radiusKm),
    alertScope: settings.alertScope === 'follows' ? 'follows' : 'nearby',
    followAlerts: settings.followAlerts !== false,
  };
}

async function push(id) {
  try {
    await setDoc(userRef(id), {
      followedOrgIds: follows.followedOrgIds().slice(0, 200),
      prefs: prefsFrom(location.settings()),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // The local list is already correct and is what every view reads. A
    // failed mirror is a sync that catches up later, not a lost follow.
    console.error('account-sync push', err);
  }
}

/**
 * Read the account's copy, union it with this device's, and store the result
 * in both places.
 *
 * Runs once per sign-in. From then on `follows.onChange` keeps the account
 * copy current, and this browser is the authority for its own session.
 */
async function merge(id) {
  let remote = null;
  try {
    const snap = await getDoc(userRef(id));
    remote = snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error('account-sync read', err);
    return;
  }

  const here = follows.followedOrgIds();
  const there = Array.isArray(remote?.followedOrgIds)
    ? remote.followedOrgIds.filter((value) => typeof value === 'string')
    : [];
  const union = [...new Set([...here, ...there])].slice(0, 200);

  // Only touch local storage when the account actually adds something. A
  // rewrite that changes nothing would still announce a change and bounce
  // straight back to the server.
  if (union.length !== here.length) follows.replaceFromAccount(union);

  // Alert preferences: the account's win when it has them, because the
  // account is where somebody last expressed the choice deliberately. Their
  // effect is still local, since each device recomputes its own topic
  // subscription from them.
  if (remote?.prefs) {
    const patch = {};
    if (Number.isFinite(remote.prefs.radiusKm)) patch.radiusKm = remote.prefs.radiusKm;
    if (remote.prefs.alertScope) patch.alertScope = remote.prefs.alertScope;
    if (typeof remote.prefs.followAlerts === 'boolean') {
      patch.followAlerts = remote.prefs.followAlerts;
    }
    if (Object.keys(patch).length) location.update(patch);
  }

  await push(id);
}

/**
 * Start mirroring. Called once at bootstrap from the public site's entry
 * point; safe to call again, and a no-op while signed out.
 */
export function startAccountSync() {
  if (stopListening) return stopListening;

  const unsubscribeFollows = follows.onChange(() => {
    if (uid) push(uid);
  });

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    // An anonymous session is not an account. The rules reject a write from
    // one, and there would be nothing durable to write to anyway.
    const next = user && !user.isAnonymous ? user.uid : null;
    if (next === uid) return;
    uid = next;
    if (uid) merge(uid);
  });

  stopListening = () => {
    unsubscribeFollows();
    unsubscribeAuth();
    stopListening = null;
    uid = null;
  };
  return stopListening;
}

/**
 * Delete the account's copy. Called before deleting the account itself, so
 * the record goes with it rather than being orphaned where nobody, including
 * an administrator, can ever reach it again.
 */
export async function deleteAccountRecord() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return;
  const { deleteDoc } = await import('firebase/firestore');
  try {
    await deleteDoc(userRef(user.uid));
  } catch (err) {
    console.error('account-sync delete', err);
  }
}

/** Test seam. Nothing in the app calls this. */
export const __state = () => ({ uid, running: !!stopListening });
