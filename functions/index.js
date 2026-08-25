// Notification fan-out.
//
// This is the only server-side code in the project, and it exists for one
// reason: sending to Firebase Cloud Messaging needs a service account
// credential, which cannot live in a browser. Everything else the app does is
// still decided by firestore.rules.
//
// It deliberately does NOT know where any user is. Devices subscribe
// themselves to coarse area topics; this code publishes a notice to the topics
// covering the notice's own location and lets FCM do the matching. No user
// position is received, stored, or logged here.

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';

import { isValidTopic } from './lib/topics.js';
import { kindOfChange, buildMessage, topicsForNotice } from './lib/notify.js';

initializeApp();

// Same region as Firestore, so a notification is not routed through another
// country on its way out.
setGlobalOptions({ region: 'northamerica-northeast1', maxInstances: 10 });

const SITE_ORIGIN = defineString('SITE_ORIGIN', {
  description: 'Public origin of the feed, e.g. https://janazah-app.web.app',
  default: 'https://example.web.app',
});

/** Topic subscription changes a single device may request in one call. */
const MAX_TOPICS_PER_CALL = 60;

/**
 * Subscribe or unsubscribe one device token to area and masjid topics.
 *
 * The FCM web SDK has no client-side topic subscription, so this has to be a
 * server call. The cell list arrives, is acted on, and is discarded. It is
 * never written to Firestore and never logged: the counts below are logged,
 * the topics themselves are not, because a cell name is a coarse location.
 */
export const subscribeDevice = onCall(async (request) => {
  // An anonymous session is enough. It is not identity, it is a handle to rate
  // limit against so the endpoint cannot be driven by anyone at all.
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign-in is required to manage alerts.');
  }

  const { token, subscribe = [], unsubscribe = [] } = request.data || {};

  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    throw new HttpsError('invalid-argument', 'A valid messaging token is required.');
  }
  if (!Array.isArray(subscribe) || !Array.isArray(unsubscribe)) {
    throw new HttpsError('invalid-argument', 'subscribe and unsubscribe must be arrays.');
  }
  if (subscribe.length + unsubscribe.length > MAX_TOPICS_PER_CALL) {
    throw new HttpsError('invalid-argument',
      `At most ${MAX_TOPICS_PER_CALL} topic changes per call.`);
  }
  for (const topic of [...subscribe, ...unsubscribe]) {
    if (!isValidTopic(topic)) {
      throw new HttpsError('invalid-argument', 'Unrecognised topic.');
    }
  }

  const messaging = getMessaging();
  const results = await Promise.allSettled([
    ...subscribe.map((t) => messaging.subscribeToTopic(token, t)),
    ...unsubscribe.map((t) => messaging.unsubscribeFromTopic(token, t)),
  ]);

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    // Log the count and the reason, never which topics were involved.
    logger.warn('Some topic changes failed', {
      failed: failed.length,
      total: results.length,
      reason: String(failed[0].reason?.message || failed[0].reason).slice(0, 200),
    });
  }

  return { subscribed: subscribe.length, unsubscribed: unsubscribe.length, failed: failed.length };
});

/**
 * Fan a published, corrected or cancelled notice out to its topics.
 *
 * Cancellations reach exactly the people the original reached, because both go
 * to the same topics. That is why no list of who was notified is kept: such a
 * list would be a record of who was near a particular funeral.
 */
export const onNoticeWritten = onDocumentWritten('notices/{noticeId}', async (event) => {
  const noticeId = event.params.noticeId;
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;

  const kind = kindOfChange(before, after);
  if (!kind) return;

  // Firestore triggers are at-least-once. This marker makes the send
  // at-most-once per notice version, and lives in its own collection so it
  // cannot disturb the field allowlist that guards the public notice.
  const db = getFirestore();
  const runId = `${noticeId}_${kind}_v${after.version ?? 0}`;
  const runRef = db.collection('notificationRuns').doc(runId);
  try {
    await runRef.create({
      noticeId, kind, version: after.version ?? 0, at: FieldValue.serverTimestamp(),
    });
  } catch {
    logger.info('Notification already sent for this version', { noticeId, kind });
    return;
  }

  const topics = topicsForNotice(after);
  if (!topics.length) {
    logger.warn('Notice has no routable topics', { noticeId });
    return;
  }

  let message;
  try {
    message = buildMessage(noticeId, after, kind, { origin: SITE_ORIGIN.value() });
  } catch (err) {
    // buildMessage refuses to send anything carrying a private-looking field.
    logger.error('Refusing to notify', { noticeId, reason: err.message });
    return;
  }

  const messaging = getMessaging();
  const sent = await Promise.allSettled(
    topics.map((topic) => messaging.send({ ...message, topic })),
  );

  const failed = sent.filter((r) => r.status === 'rejected');
  logger.info('Notice notification sent', {
    noticeId, kind, topics: topics.length, failed: failed.length,
  });
  if (failed.length) {
    logger.warn('Some sends failed', {
      reason: String(failed[0].reason?.message || failed[0].reason).slice(0, 200),
    });
  }

  // The audit trail is client-written elsewhere; this entry is server-written
  // and therefore cannot be skipped by whoever triggered it.
  await db.collection('auditLog').add({
    actorUid: 'system',
    actorEmail: '',
    action: `notification.${kind}`,
    targetType: 'notice',
    targetId: noticeId,
    orgId: after.orgId ?? null,
    at: FieldValue.serverTimestamp(),
    details: { topics: topics.length, failed: failed.length },
  });
});
