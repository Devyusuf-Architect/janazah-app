// Deciding what to send, and what it says.
//
// Kept free of Firebase imports so it can be unit tested directly, and so the
// same logic would run unchanged on another host if the project ever moves off
// Cloud Functions.

import { cellTopicsForHash, orgTopic } from './topics.js';

/** Public fields only. Anything absent from this list never reaches a device. */
const PUBLIC_FIELDS = [
  'orgName', 'deceasedName', 'showDeceasedName', 'janazahAt', 'timeZone',
  'timeLabel', 'prayerLocation', 'burialLocation', 'status',
];

export const KIND = {
  PUBLISHED: 'published',
  UPDATED: 'updated',
  CANCELLED: 'cancelled',
};

/**
 * What, if anything, this change to a notice should tell people.
 *
 * @param {object|null} before  Document before the write, null on create.
 * @param {object|null} after   Document after the write, null on delete.
 * @returns {string|null}
 */
export function kindOfChange(before, after) {
  if (!after) return null;

  const wasPublished = before?.status === 'published';
  const wasCancelled = before?.status === 'cancelled';

  if (after.status === 'cancelled') {
    // Only tell people about a cancellation if they were told about the
    // notice in the first place. A draft deleted before publication is
    // nobody's business.
    if (wasCancelled) return null;
    return wasPublished ? KIND.CANCELLED : null;
  }

  if (after.status !== 'published') return null;
  if (!wasPublished) return KIND.PUBLISHED;

  // Already published and still published: only a real correction is worth a
  // second notification, and the version counter is what marks one.
  const bumped = Number(after.version) > Number(before?.version ?? 0);
  return bumped ? KIND.UPDATED : null;
}

/** Prayer time as a short string in the notice's own zone. */
export function formatTime(notice) {
  const raw = notice.janazahAt;
  // Guard before constructing: new Date(null) is epoch zero, not an invalid
  // date, so a missing time would otherwise render as 1969.
  if (raw === null || raw === undefined || raw === '') return '';
  const date = raw?.toDate ? raw.toDate() : (raw instanceof Date ? raw : new Date(raw));
  if (!date || Number.isNaN(date.getTime())) return '';
  let text;
  try {
    text = new Intl.DateTimeFormat('en-CA', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZone: notice.timeZone || 'America/Toronto',
    }).format(date);
  } catch {
    text = date.toISOString();
  }
  return notice.timeLabel ? `${text} (${notice.timeLabel})` : text;
}

const titleFor = (notice, kind) => {
  const who = notice.showDeceasedName && notice.deceasedName
    ? ` for ${notice.deceasedName}`
    : '';
  if (kind === KIND.CANCELLED) return `Janazah cancelled${who}`;
  if (kind === KIND.UPDATED) return `Janazah updated${who}`;
  return `Janazah${who}`;
};

const bodyFor = (notice, kind) => {
  const lines = [notice.orgName, formatTime(notice)];
  if (kind === KIND.CANCELLED) {
    lines.push(notice.cancelReason || 'This Janazah will not take place.');
  } else {
    if (notice.correctionNote && kind === KIND.UPDATED) lines.push(notice.correctionNote);
    if (notice.prayerLocation?.address) lines.push(notice.prayerLocation.address);
  }
  return lines.filter(Boolean).join('\n');
};

/**
 * The Android notification channel every Janazah message is delivered on.
 *
 * Must match the channel the app creates at launch
 * (mobile/src/lib/notifications.ts). Naming a channel that does not exist
 * means Android drops the message into the default one, where the importance
 * and the sound are whatever the system decided rather than what this needs.
 *
 * One channel, not several. Android exposes each one as a separate switch in
 * the system settings, and splitting these would let somebody turn off
 * cancellations while leaving publications on, which is the one combination
 * nobody should be able to choose by accident.
 */
export const ANDROID_CHANNEL = 'janazah';

/**
 * The message payload.
 *
 * Deliberately narrow. A notification is delivered to devices we know nothing
 * about, so it carries only what is already public on the notice, plus a link.
 *
 * Three transports, one message:
 *
 *   notification  The top-level block. What makes Android display this while
 *                 the app is killed, which is the entire reason the mobile
 *                 app exists. Without it a subscribed phone receives a
 *                 data-only message and shows nothing at all.
 *   android       Channel, tag and priority. HIGH because a Janazah is often
 *                 within hours and a message held for the next maintenance
 *                 window is a message that arrives after the burial.
 *   webpush       Unchanged from before Android existed. The web app's
 *                 delivery must not move because a phone was added.
 *
 * The tag is the notice id on both platforms, so a reader who both follows
 * the masjid and is within range sees one notification rather than two, and a
 * correction replaces the original rather than stacking on top of it.
 */
export function buildMessage(noticeId, notice, kind, { origin }) {
  const link = `${origin}/n/${noticeId}`;
  for (const key of Object.keys(notice)) {
    if (key.toLowerCase().includes('phone') || key.toLowerCase().includes('internal')) {
      throw new Error(`refusing to notify: notice ${noticeId} carries "${key}"`);
    }
  }

  const title = titleFor(notice, kind);
  const body = bodyFor(notice, kind);

  return {
    // Displayed by the system on a device that is not running the app. Every
    // field here is already public on the notice.
    notification: { title, body },
    android: {
      // A cancellation must not be held back for battery. Somebody is
      // otherwise driving to a funeral that is not happening.
      priority: 'high',
      // Replaces the previous message about this same notice rather than
      // stacking, so a correction is a correction and not a second funeral.
      collapseKey: `janazah-${noticeId}`,
      notification: {
        channelId: ANDROID_CHANNEL,
        tag: `janazah-${noticeId}`,
        // The status bar draws this as a silhouette, so it is the monochrome
        // mark rather than the full-colour icon.
        // Generated by the expo-notifications config plugin from
        // mobile/assets/notification-icon.png, under this exact name.
        icon: 'notification_icon',
        color: '#14503f',
      },
    },
    webpush: {
      notification: {
        title,
        body,
        tag: `janazah-${noticeId}`,
        renotify: kind !== KIND.PUBLISHED,
        icon: '/icon-192.png',
        badge: '/badge.png',
      },
      fcmOptions: { link },
    },
    data: {
      noticeId,
      kind,
      link,
      // Coordinates of the prayer location, which are public on the notice
      // itself. Included so a client can show a distance without a round trip.
      lat: String(notice.prayerLocation?.lat ?? ''),
      lng: String(notice.prayerLocation?.lng ?? ''),
    },
  };
}

/** Every topic this notice should reach: its area, and its masjid's followers. */
export function topicsForNotice(notice) {
  const topics = cellTopicsForHash(notice.prayerLocation?.cell);
  if (notice.orgId) topics.push(orgTopic(notice.orgId));
  return topics;
}

/** Strip a notice down to the fields that may leave the backend. */
export function publicProjection(notice) {
  const out = {};
  for (const key of PUBLIC_FIELDS) {
    if (notice[key] !== undefined) out[key] = notice[key];
  }
  if (notice.cancelReason !== undefined) out.cancelReason = notice.cancelReason;
  if (notice.correctionNote !== undefined) out.correctionNote = notice.correctionNote;
  if (notice.orgId !== undefined) out.orgId = notice.orgId;
  return out;
}
