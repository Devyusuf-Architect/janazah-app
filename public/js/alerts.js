// In-page alerts for newly published nearby notices.
//
// Scope, stated plainly because it is easy to overstate: this raises a browser
// notification only while this page is open. It is not a push notification and
// it will not reach a locked phone. That needs a server credential to send to
// FCM, which is Phase 4. Everything here is a local decision made in the
// browser from notices it already has.

import { noticeDistanceKm } from './location.js';
import { formatDistance } from './geo.js';
import { formatJanazahTime } from './model.js';

const SEEN_KEY = 'janazah.alertedNoticeIds';
const SEEN_LIMIT = 200;

function seenIds() {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function rememberSeen(ids) {
  try {
    // Bounded, and holds notice IDs only. Not a record of anywhere the user has
    // been; a notice ID says nothing about where its reader was.
    const next = [...new Set([...seenIds(), ...ids])].slice(-SEEN_LIMIT);
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    // Nothing to do; the worst case is a repeated alert.
  }
}

export const notificationsSupported = () => 'Notification' in window;

export const notificationPermission = () =>
  (notificationsSupported() ? Notification.permission : 'unsupported');

/** Called only from an explicit user action, as browsers require. */
export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

/**
 * Mark everything currently on the feed as already seen, so enabling alerts
 * does not immediately fire one per existing notice.
 */
export function primeSeen(notices) {
  rememberSeen(notices.map((n) => n.id));
}

/**
 * Raise a notification for each published notice within range that has not
 * been alerted on before.
 *
 * @returns {object[]} the notices actually alerted on.
 */
export function alertOnNew(notices, from, radiusKm) {
  if (!from || notificationPermission() !== 'granted') return [];

  const already = new Set(seenIds());
  const fresh = [];

  for (const notice of notices) {
    if (already.has(notice.id) || notice.status !== 'published') continue;
    const km = noticeDistanceKm(notice, from);
    if (km === null || (radiusKm !== 0 && km > radiusKm)) continue;
    fresh.push({ notice, km });
  }

  // Mark every notice on the feed as seen, not only the ones alerted on, so a
  // notice that was out of range does not fire later just because the reader
  // moved closer while the tab sat open.
  rememberSeen(notices.map((n) => n.id));

  for (const { notice, km } of fresh) {
    const title = notice.showDeceasedName && notice.deceasedName
      ? `Janazah nearby for ${notice.deceasedName}`
      : 'Janazah nearby';
    try {
      const alert = new Notification(title, {
        body: [
          notice.orgName,
          formatJanazahTime(notice),
          `about ${formatDistance(km)} away`,
        ].filter(Boolean).join('\n'),
        tag: `janazah-${notice.id}`,
        requireInteraction: false,
      });
      alert.addEventListener('click', () => {
        window.focus();
        location.assign(`/n/${notice.id}`);
      });
    } catch (err) {
      console.error('Could not raise a notification', err);
    }
  }

  return fresh.map(({ notice }) => notice);
}

export function clearSeen() {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    // Nothing to do.
  }
}
