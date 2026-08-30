// Followed organizations.
//
// Signed out, this is exactly what it always was: a list on the device, in
// localStorage, needing no account. That path is untouched, and it stays the
// most important one, because reading the feed and following a masjid must
// never require signing in.
//
// Signed in, the same list is mirrored to /users/{uid} so it travels between
// this browser and the Ta'ziyah app on a phone. The mirror is one-way in each
// direction and unions on sign-in: what is here and what is there both
// survive, because somebody who followed three masjids on their phone and two
// here means to follow five.
//
// The API below is deliberately still synchronous. Nine call sites across
// seven views read it during a render, and making them async to add sync
// would have been a much larger change than the feature is worth.
// localStorage stays the thing they read; the account is a mirror kept in
// step behind them. A slow or failed network therefore cannot stop somebody
// following a masjid, which is the correct priority.

const KEY = 'janazah.followedOrgs';

/** Notified after any change, so the account mirror can be updated. */
const listeners = new Set();

/**
 * @param {(ids: string[]) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function announce(list) {
  for (const fn of listeners) {
    try {
      fn(list);
    } catch (err) {
      // A broken listener must not stop the follow itself, which has
      // already been written to localStorage by the time we get here.
      console.error('follows listener', err);
    }
  }
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
  } catch {
    // Private browsing, disabled storage, or corrupt data. Following is a
    // convenience; the feed must still work without it.
    return [];
  }
}

function write(list, { announceChange = true } = {}) {
  const unique = [...new Set(list)];
  let stored = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(unique));
  } catch {
    // Private browsing, or storage disabled. Following is a convenience; the
    // feed must still work without it.
    stored = false;
  }
  if (announceChange) announce(unique);
  return stored;
}

/**
 * Replace the whole list without announcing it.
 *
 * Used by the account mirror when it has just read the authoritative list
 * from the server. Announcing here would send it straight back again.
 */
export function replaceFromAccount(ids) {
  return write(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [],
    { announceChange: false });
}

export const followedOrgIds = () => read();
export const isFollowing = (orgId) => read().includes(orgId);

export function follow(orgId) {
  return write([...read(), orgId]);
}

export function unfollow(orgId) {
  return write(read().filter((id) => id !== orgId));
}

/** @returns {boolean} the state after toggling. */
export function toggleFollow(orgId) {
  const following = isFollowing(orgId);
  if (following) unfollow(orgId); else follow(orgId);
  return !following;
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
