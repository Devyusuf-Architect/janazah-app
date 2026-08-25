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
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';

import { isValidTopic } from './lib/topics.js';
import { kindOfChange, buildMessage, topicsForNotice } from './lib/notify.js';
import { RETENTION, daysAgo, redactionPatch, needsRedaction } from './lib/retention.js';
import { LIMITS, checkAndCount } from './lib/limits.js';
import { eachIndependently } from './lib/resilient-batch.js';
import {
  classifyNoticeChange, classifyOrgChange, classifyStaffRequestChange,
  classifyReportChange,
} from './lib/audit-log.js';

initializeApp();

// Same region as Firestore, so a notification is not routed through another
// country on its way out.
setGlobalOptions({ region: 'northamerica-northeast1', maxInstances: 10 });

// Deliberately has no default. Every notification links back to this origin,
// so a placeholder that deployed silently would send the whole community to
// the wrong address. With no default the CLI asks on first deploy and stores
// the answer in functions/.env.
const SITE_ORIGIN = defineString('SITE_ORIGIN', {
  description: 'Public origin of the feed, e.g. https://janazah-app.web.app',
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
    // A published notice that cannot be routed to a single topic means
    // nobody following this masjid and nobody nearby will be alerted: the
    // core feature failed for this notice, not merely a delivery hiccup.
    logger.error('Notice has no routable topics: nobody will be notified', { noticeId, kind });
    return;
  }

  // A burst of notifications from one organization is the signature of a
  // compromised coordinator account. The notice itself is never blocked, only
  // the notification, and an administrator is told either way.
  if (after.orgId && !(await allowNotification(db, after.orgId, noticeId, kind))) return;

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
  const reason = failed.length
    ? String(failed[0].reason?.message || failed[0].reason).slice(0, 200)
    : null;

  if (failed.length === topics.length) {
    // Every send failed: this notice reached nobody. Distinct from a partial
    // failure, and the one outcome here that genuinely needs attention rather
    // than routine monitoring.
    logger.error('Notice notification totally failed: nobody was notified', {
      noticeId, kind, topics: topics.length, reason,
    });
  } else if (failed.length) {
    logger.warn('Notice notification partially failed', {
      noticeId, kind, topics: topics.length, failed: failed.length, reason,
    });
  } else {
    logger.info('Notice notification sent', { noticeId, kind, topics: topics.length });
  }

  // The audit trail is client-written elsewhere; this entry is server-written
  // and therefore cannot be skipped by whoever triggered it.
  await writeSystemAudit(db, `notification.${kind}`, noticeId, after.orgId ?? null, {
    topics: topics.length, failed: failed.length,
  });
});

/** Server-written audit entry. Never carries notice content, only counts. */
function writeSystemAudit(db, action, targetId, orgId, details = {}) {
  return db.collection('auditLog').add({
    actorUid: 'system',
    actorEmail: '',
    action,
    targetType: 'notice',
    targetId,
    orgId,
    at: FieldValue.serverTimestamp(),
    details,
  });
}

/**
 * Every create, edit and cancellation of a notice, and every verification and
 * staff decision, used to be written from the browser by whichever client
 * action triggered it. That meant the write could be skipped: nothing forced
 * a compromised or merely buggy client to call it. These four triggers close
 * that gap structurally. They fire on the document write itself, from the
 * Admin SDK, so there is no code path that changes a notice, an organization,
 * a staff request or a report without an entry being written about it.
 *
 * classification lives in lib/audit-log.js and is pure; these triggers only
 * do the Firestore reads and writes the pure functions cannot do themselves.
 *
 * Idempotency: Firestore triggers are at-least-once. Each entry's document ID
 * is derived from the CloudEvent's own id, which is stable across retries of
 * the same underlying change, and written with create() rather than add(), so
 * a retry collides with the entry already written instead of duplicating it.
 */

/** Shared by all four triggers below. */
async function writeAuditEntry(db, docId, { action, actorUid, targetType, targetId, orgId, details }) {
  try {
    await db.collection('auditLog').doc(docId).create({
      actorUid: actorUid ?? 'unknown',
      actorEmail: '',
      action,
      targetType,
      targetId,
      orgId: orgId ?? null,
      at: FieldValue.serverTimestamp(),
      details: details ?? {},
    });
  } catch {
    logger.info('Audit entry already recorded for this event', { docId, action });
  }
}

export const onNoticeAuditWritten = onDocumentWritten('notices/{noticeId}', async (event) => {
  const noticeId = event.params.noticeId;
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;

  // The admin lookup is only meaningful, and only needed, for the one case
  // that genuinely cannot be told apart from the document alone: whether a
  // cancellation was the org's own staff or a platform administrator.
  const cancelling = before && after
    && before.status !== 'cancelled' && after.status === 'cancelled';
  const db = getFirestore();
  let isActorAdmin = false;
  if (cancelling) {
    const actorUid = after.lastEditedBy ?? after.createdBy ?? null;
    if (actorUid) {
      const adminSnap = await db.collection('admins').doc(actorUid).get();
      isActorAdmin = adminSnap.exists;
    }
  }

  const result = classifyNoticeChange(before, after, isActorAdmin);
  if (!result) return;

  const orgId = (after ?? before)?.orgId ?? null;
  await writeAuditEntry(db, event.id, {
    action: result.action, actorUid: result.actorUid,
    targetType: 'notice', targetId: noticeId, orgId,
  });
});

export const onOrgAuditWritten = onDocumentWritten('organizations/{orgId}', async (event) => {
  const orgId = event.params.orgId;
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;

  const entries = classifyOrgChange(before, after);
  if (!entries.length) return;

  const db = getFirestore();
  await Promise.all(entries.map((entry, i) => writeAuditEntry(db, `${event.id}_${i}`, {
    action: entry.action, actorUid: entry.actorUid,
    targetType: entry.action === 'staff.removed' ? 'user' : 'organization',
    targetId: entry.action === 'staff.removed' ? entry.targetUid : orgId,
    orgId,
  })));
});

export const onStaffRequestAuditWritten = onDocumentWritten(
  'organizations/{orgId}/staffRequests/{requestUid}', async (event) => {
    const { orgId, requestUid } = event.params;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;

    const result = classifyStaffRequestChange(before, after);
    if (!result) return;

    await writeAuditEntry(getFirestore(), event.id, {
      action: result.action, actorUid: result.actorUid,
      targetType: 'staffRequest', targetId: requestUid, orgId,
    });
  });

export const onReportAuditWritten = onDocumentWritten('reports/{reportId}', async (event) => {
  const reportId = event.params.reportId;
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;

  const result = classifyReportChange(before, after);
  if (!result) return;

  await writeAuditEntry(getFirestore(), event.id, {
    action: result.action, actorUid: result.actorUid,
    targetType: 'report', targetId: reportId, orgId: null,
  });
});

/**
 * Rolling per-organization notification budget.
 *
 * Returns false when the budget is spent. The first message over the line
 * raises a report for an administrator; later ones in the same burst are
 * simply dropped so the queue is not flooded too.
 */
async function allowNotification(db, orgId, noticeId, kind) {
  const ref = db.collection('orgNotificationRates').doc(orgId);
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const result = checkAndCount(snap.exists ? snap.data() : null, Date.now());
    tx.set(ref, result.next, { merge: true });
    return result;
  });

  if (outcome.allowed) return true;

  logger.warn('Notification suppressed by rate limit', {
    orgId, noticeId, kind, count: outcome.next.count,
  });

  if (outcome.tripped) {
    await db.collection('reports').add({
      noticeId,
      reportedBy: 'system',
      reason: 'rate_limit',
      detail:
        `${orgId} triggered more than ${LIMITS.notificationsPerWindow} notifications `
        + `in ${LIMITS.windowMinutes} minutes. Notifications are suppressed for this `
        + 'organization until the window clears. Notices are still being published.',
      status: 'open',
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await writeSystemAudit(db, 'notification.suppressed', noticeId, orgId, {
    reason: 'rate_limit', count: outcome.next.count,
  });
  return false;
}

/**
 * Retention. Runs daily and enforces the policy in lib/retention.js.
 *
 * Deliberately batched and bounded: a purge that half-finishes is fine,
 * because tomorrow's run picks up whatever is left.
 */
export const enforceRetention = onSchedule(
  { schedule: '17 4 * * *', timeZone: 'America/Toronto' },
  async () => {
    const db = getFirestore();
    const counts = { privateDeleted: 0, redacted: 0, runsDeleted: 0, reportsDeleted: 0 };
    // One malformed document used to be able to abort the entire daily run:
    // an uncaught throw partway through a loop meant nothing after it ran,
    // and nothing before it was reported either, just a generic crash log
    // with no indication of how much of the batch actually completed.
    // eachIndependently (lib/resilient-batch.js) is what fixes that: every
    // item in every stage below is attempted regardless of earlier failures,
    // and every failure is tagged with which stage and which document.
    const errors = [];
    const tag = (stage, list) => list.map((e) => ({ stage, ...e }));

    // 1. Family contacts and internal notes, once the prayer is well past.
    const oldNotices = await db.collection('notices')
      .where('janazahAt', '<', daysAgo(RETENTION.privateDetailsDays))
      .limit(400)
      .get();

    errors.push(...tag('privateDetails', await eachIndependently(oldNotices.docs, async (noticeDoc) => {
      const privateDocs = await noticeDoc.ref.collection('private').get();
      for (const priv of privateDocs.docs) {
        await priv.ref.delete();
        counts.privateDeleted += 1;
      }
    })));

    // 2. The deceased's name, once the notice is old enough that keeping it
    //    serves nobody.
    const toRedact = await db.collection('notices')
      .where('janazahAt', '<', daysAgo(RETENTION.publicNameDays))
      .limit(400)
      .get();

    errors.push(...tag('redaction', await eachIndependently(toRedact.docs, async (noticeDoc) => {
      if (!needsRedaction(noticeDoc.data())) return;
      await noticeDoc.ref.update(redactionPatch(FieldValue.serverTimestamp()));
      counts.redacted += 1;
      await writeSystemAudit(db, 'notice.redacted', noticeDoc.id,
        noticeDoc.data().orgId ?? null, { policyDays: RETENTION.publicNameDays });
    })));

    // 3. Delivery bookkeeping.
    const staleRuns = await db.collection('notificationRuns')
      .where('at', '<', daysAgo(RETENTION.notificationRunsDays))
      .limit(400)
      .get();
    errors.push(...tag('notificationRuns', await eachIndependently(staleRuns.docs, async (run) => {
      await run.ref.delete();
      counts.runsDeleted += 1;
    })));

    // 4. Reports that were dealt with long ago.
    const staleReports = await db.collection('reports')
      .where('status', '==', 'resolved')
      .where('resolvedAt', '<', daysAgo(RETENTION.resolvedReportsDays))
      .limit(400)
      .get();
    errors.push(...tag('resolvedReports', await eachIndependently(staleReports.docs, async (report) => {
      await report.ref.delete();
      counts.reportsDeleted += 1;
    })));

    if (errors.length) {
      // Loud on purpose: this is exactly the kind of failure that used to be
      // invisible, so a summary that undercounted or omitted it entirely
      // would recreate the same gap in a quieter form.
      logger.error('Retention pass completed with errors', {
        ...counts, errorCount: errors.length, errors: errors.slice(0, 10),
      });
    } else {
      logger.info('Retention pass complete', counts);
    }
  });
