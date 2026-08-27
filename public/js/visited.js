// Whether this device has used Ta'ziyah before.
//
// The only thing it decides is whether somebody arriving at the site root is
// shown the welcome or the index. Deliberately not a cookie and not a
// server-side record: this application keeps nothing about anyone, and "has
// this person been here" is no exception to that.
//
// Shared between the two entry points so there is one key and one answer. A
// coordinator who has been working in the console has plainly used Ta'ziyah,
// and clicking through to the public site should show them their notices, not
// an introduction to the service they publish on.

const KEY = 'taziyah.visited';

/**
 * When storage is unavailable the answer is "yes, they have". Showing the
 * welcome to somebody in a private window on every single visit would put an
 * introduction between them and a funeral notice, repeatedly.
 */
export function isFirstVisit() {
  try {
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return false;
  }
}

export function markVisited() {
  try {
    localStorage.setItem(KEY, '1');
  } catch { /* private browsing; isFirstVisit already accounts for it */ }
}
