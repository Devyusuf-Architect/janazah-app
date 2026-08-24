// Followed organizations, stored on the device.
//
// Deliberately not a user account. Reading the feed and following a masjid
// need no sign-in, which removes the largest source of friction on the most
// important path and means there is no user record to protect. The cost is no
// cross-device sync, which is the right trade for a first release.

const KEY = 'janazah.followedOrgs';

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

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set(list)]));
    return true;
  } catch {
    return false;
  }
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
