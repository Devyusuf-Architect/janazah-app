// The server side of Ta'ziyah.
//
// Everything here is here because it cannot be done from a browser, and for
// no other reason. Everything the app can do under firestore.rules still is.
//
// Four things qualify. Sending to Firebase Cloud Messaging needs a service
// account credential. The audit trail has to be written by something no
// client can skip. Granting and revoking platform administration has to
// happen somewhere /admins is writable, which is nowhere a client can reach,
// and has to be able to look a person up by email, which a client cannot do.
// And sending email needs SMTP credentials, which do not belong in a page.
//
// The notification fan-out deliberately does NOT know where any user is.
// Devices subscribe themselves to coarse area topics; this code publishes a
// notice to the topics covering the notice's own location and lets FCM do the
// matching. No user position is received, stored, or logged here. Email
// addresses are treated the same way: resolved here, used, never returned to
// a client and never written onto a document anybody else can read.

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getAuth } from 'firebase-admin/auth';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString, defineSecret } from 'firebase-functions/params';
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
import {
  AdminActionError, ADMIN_ACTIONS, assertCallerIsAdmin, checkMessage,
  grantAdmin as grantAdminAccess, revokeAdmin as revokeAdminAccess,
  archiveOrganization as archiveOrganizationAccess,
  restoreOrganization as restoreOrganizationAccess,
} from './lib/admin-management.js';
import {
  smtpSettings, verificationEmail, messageEmail, resolveRecipient,
  applicationReceivedEmail, staffGrantedEmail, staffRevokedEmail,
  NOTIFIED_STATUSES,
} from './lib/email.js';

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

// SMTP credentials, held in Secret Manager rather than in this repository or
// in functions/.env. Nothing here has a default and nothing here is ever
// logged: the whole point is that a checkout of this project cannot send mail
// as Ta'ziyah.
//
// These three are what decides whether email works at all. If any is unset,
// every send below turns into a log line and nothing else, and the write that
// prompted it still succeeds. See sendMail.
const SMTP_HOST = defineSecret('SMTP_HOST');
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');

/** Bound to every function that may send. Secrets are not ambient. */
const EMAIL_SECRETS = [SMTP_HOST, SMTP_USER, SMTP_PASSWORD];

// The port and the from address are not secrets, and both have a working
// default, so they are read straight out of the environment (functions/.env,
// the same file SITE_ORIGIN lives in) rather than declared as parameters.
//
// That is deliberate and was learned the hard way: a declared parameter makes
// the CLI stop and ask for a value, default or no default, which hangs every
// non-interactive run there is, the emulator suite and CI included.
const smtpPort = () => process.env.SMTP_PORT || '';
const smtpFrom = () => process.env.SMTP_FROM || '';

/** Public origin for links in email, with a safe fallback. */
const siteOrigin = () => {
  try {
    return SITE_ORIGIN.value() || 'https://taziyah.com';
  } catch {
    return 'https://taziyah.com';
  }
};

/**
 * Send one message, or explain in the log why it did not go.
 *
 * Never throws. Every caller is doing something else that matters more than
 * the email (approving a masjid, recording a decision), and a mail host that
 * is down, misconfigured or simply absent must not turn that into a failure.
 * The return value says what happened so the audit entry can be honest about
 * it.
 *
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function sendMail({ to, subject, text }) {
  const settings = smtpSettings({
    SMTP_HOST: SMTP_HOST.value(),
    SMTP_USER: SMTP_USER.value(),
    SMTP_PASSWORD: SMTP_PASSWORD.value(),
    SMTP_PORT: smtpPort(),
    SMTP_FROM: smtpFrom(),
  });

  if (!settings) {
    logger.warn(
      'Email is not configured, so nothing was sent. Set the SMTP credentials '
      + 'with: firebase functions:secrets:set SMTP_HOST (then SMTP_USER and '
      + 'SMTP_PASSWORD), and redeploy functions. Everything else carried on '
      + 'normally.');
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const { default: nodemailer } = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: settings.auth,
    });
    await transport.sendMail({ from: settings.from, to, subject, text });
    return { sent: true };
  } catch (err) {
    // The recipient address is deliberately absent from this log line. A
    // failure reason is operational; an address is somebody's personal data.
    logger.error('Sending email failed', {
      reason: String(err?.message || err).slice(0, 200),
    });
    return { sent: false, reason: 'send_failed' };
  }
}

/**
 * An audit entry for something a person did through a callable, rather than
 * something a document change implied. Same collection and same shape as the
 * trigger-written entries; add() rather than create() because there is no
 * CloudEvent id to key idempotency on, and a callable that ran twice really
 * did happen twice.
 */
function writeActorAudit(db, { action, actorUid, targetType, targetId, orgId, details }) {
  return db.collection('auditLog').add({
    actorUid: actorUid ?? 'unknown',
    actorEmail: '',
    action,
    targetType,
    targetId,
    orgId: orgId ?? null,
    at: FieldValue.serverTimestamp(),
    details: details ?? {},
  });
}

/** Turn a refusal from lib/admin-management.js into the callable's error. */
function asHttpsError(err) {
  if (err instanceof AdminActionError) return new HttpsError(err.code, err.message);
  logger.error('Admin action failed unexpectedly', {
    reason: String(err?.message || err).slice(0, 200),
  });
  return new HttpsError('internal', 'That did not work. Please try again.');
}

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

// ------------------------------------------------ platform administration
//
// firestore.rules keeps `allow write: if false` on /admins, unchanged. These
// two callables are how administration is granted and taken away instead:
// the Admin SDK bypasses rules because it is not a client, and the check for
// who may call them is read from Firestore server-side, from the caller's
// verified uid, on every call. Nothing in request.data is trusted.
//
// The decision logic and its refusals live in lib/admin-management.js so they
// can be tested without an emulator. These wrappers only supply the Firebase
// handles and translate a refusal into an HttpsError.

/**
 * Make an existing Ta'ziyah account a platform administrator, by email.
 *
 * @param {{email: string}} request.data
 */
export const grantAdmin = onCall(async (request) => {
  const db = getFirestore();
  try {
    return await grantAdminAccess(
      {
        db,
        auth: getAuth(),
        writeAudit: (entry) => writeActorAudit(db, entry),
        timestamp: () => FieldValue.serverTimestamp(),
      },
      request.auth?.uid || null,
      request.data || {},
    );
  } catch (err) {
    throw asHttpsError(err);
  }
});

/**
 * Take platform administration away from an account. Refuses the caller's
 * own uid, so the platform cannot be left with nobody who can administer it.
 *
 * @param {{uid: string}} request.data
 */
export const revokeAdmin = onCall(async (request) => {
  const db = getFirestore();
  try {
    return await revokeAdminAccess(
      { db, writeAudit: (entry) => writeActorAudit(db, entry) },
      request.auth?.uid || null,
      request.data || {},
    );
  } catch (err) {
    throw asHttpsError(err);
  }
});

/**
 * Archive a real organization: hide it and pull every notice it has
 * published back to draft, atomically. See lib/admin-management.js for the
 * full reasoning; this wrapper only supplies the Firebase handles.
 *
 * @param {{orgId: string, reason?: string}} request.data
 */
export const archiveOrganization = onCall(async (request) => {
  const db = getFirestore();
  try {
    return await archiveOrganizationAccess(
      {
        db,
        writeAudit: (entry) => writeActorAudit(db, entry),
        timestamp: () => FieldValue.serverTimestamp(),
        deleteField: () => FieldValue.delete(),
      },
      request.auth?.uid || null,
      request.data || {},
    );
  } catch (err) {
    throw asHttpsError(err);
  }
});

/**
 * Undo archiveOrganization: restore the organization to its prior status and
 * republish exactly the notices archiving pulled to draft.
 *
 * @param {{orgId: string}} request.data
 */
export const restoreOrganization = onCall(async (request) => {
  const db = getFirestore();
  try {
    return await restoreOrganizationAccess(
      {
        db,
        writeAudit: (entry) => writeActorAudit(db, entry),
        timestamp: () => FieldValue.serverTimestamp(),
        deleteField: () => FieldValue.delete(),
      },
      request.auth?.uid || null,
      request.data || {},
    );
  } catch (err) {
    throw asHttpsError(err);
  }
});

/**
 * Send one message from the administrators to one organization.
 *
 * Behind the same administrator check as the two above, deliberately: this
 * sends mail using the project's own SMTP credentials, so an ordinary account
 * reaching it would be a relay. The address is resolved here and never
 * returned to the caller, who sees only that it went.
 *
 * @param {{orgId: string, subject: string, body: string}} request.data
 */
export const sendOrganizationMessage = onCall({ secrets: EMAIL_SECRETS }, async (request) => {
  const db = getFirestore();
  let orgId; let subject; let body;
  try {
    await assertCallerIsAdmin(db, request.auth?.uid || null);
    ({ orgId, subject, body } = checkMessage(request.data || {}));
  } catch (err) {
    throw asHttpsError(err);
  }

  const snap = await db.collection('organizations').doc(orgId).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'That organization no longer exists.');
  }
  const org = snap.data();

  const to = await resolveRecipient({ auth: getAuth() }, org);
  if (!to) {
    throw new HttpsError('failed-precondition',
      'No address is recorded for this organization, and its owner account '
      + 'has none either, so there is nowhere to send this.');
  }

  const content = messageEmail({
    orgName: org.name, subject, body, siteUrl: siteOrigin(),
  });
  const result = await sendMail({ to, ...content });

  if (!result.sent && result.reason === 'not_configured') {
    throw new HttpsError('failed-precondition',
      'Email is not set up on this project yet, so nothing was sent. The SMTP '
      + 'credentials need to be set as Firebase secrets and the functions '
      + 'redeployed.');
  }
  if (!result.sent) {
    throw new HttpsError('unavailable',
      'The mail server would not accept the message. Nothing was sent. Please '
      + 'try again in a few minutes.');
  }

  // The subject is recorded, the body and the address are not. What was sent
  // and to which organization is the auditable fact; the wording of a private
  // note is not, and an address in the audit trail is an address on a
  // document other administrators can read.
  await writeActorAudit(db, {
    action: ADMIN_ACTIONS.MESSAGE_SENT,
    actorUid: request.auth.uid,
    targetType: 'organization',
    targetId: orgId,
    orgId,
    details: { subject },
  });

  return { sent: true };
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

export const onOrgAuditWritten = onDocumentWritten(
  { document: 'organizations/{orgId}', secrets: EMAIL_SECRETS },
  async (event) => {
    const orgId = event.params.orgId;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;

    const db = getFirestore();

    const entries = classifyOrgChange(before, after);
    await Promise.all(entries.map((entry, i) => writeAuditEntry(db, `${event.id}_${i}`, {
      action: entry.action, actorUid: entry.actorUid,
      targetType: entry.action === 'staff.removed' ? 'user' : 'organization',
      targetId: entry.action === 'staff.removed' ? entry.targetUid : orgId,
      orgId,
    })));

    // Telling the organization what was decided, or that a submission was
    // received, rides on the same trigger as the audit entry, rather than on
    // a second trigger watching the same document. One event, one place that
    // reacts to it: two triggers on organizations/{orgId} would fire and
    // retry independently, and a duplicate email is worse than a duplicate
    // log line.
    if (!before && after) {
      await notifyApplicationReceived(db, event.id, orgId, after);
    } else {
      await notifyVerificationDecision(db, event.id, orgId, before, after);
    }
    await notifyStaffRemoved(db, event.id, orgId, entries, after);
  });

/**
 * Email the organization when a reviewer approves it, declines it or asks for
 * more information.
 *
 * Everything in here is best effort by design. It runs after the audit write,
 * it swallows its own failures, and the decision it is reporting has already
 * been recorded in Firestore by the time it starts. A masjid does not stay
 * unverified because a mail server was unreachable.
 */
async function notifyVerificationDecision(db, eventId, orgId, before, after) {
  if (!after) return;
  const status = after.verificationStatus;
  if (!NOTIFIED_STATUSES.includes(status)) return;
  // Only the transition. Any other edit to a verified organization, of which
  // there are many, must not send the approval email again.
  if (before && before.verificationStatus === status) return;
  if (!before) return;
  // A restore out of 'archived' lands on whatever status preceded the
  // archive, which is very often 'verified' or 'suspended' - both of which
  // are ordinarily worth an email. Here they are not: nothing was decided,
  // the organization only returned to where it already was, and
  // archiveOrganization/restoreOrganization send no email of their own for
  // exactly that reason. Without this guard a restored masjid would get a
  // "you are verified" or "you have been suspended" email for a status it
  // already held before being archived.
  if (before.verificationStatus === 'archived') return;

  try {
    // Firestore triggers are at-least-once, so the same decision can arrive
    // more than once. This marker makes the send at-most-once, the same way
    // notificationRuns does for push. Written before the send, not after: a
    // message that may not have gone is better than one that goes twice.
    const marker = db.collection('emailSends').doc(`${eventId}_verification`);
    try {
      await marker.create({
        orgId, status, at: FieldValue.serverTimestamp(),
      });
    } catch {
      logger.info('Verification email already handled for this change', { orgId, status });
      return;
    }

    const content = verificationEmail(status, {
      orgName: after.name,
      reason: after.statusReason,
      siteUrl: siteOrigin(),
    });
    if (!content) return;

    const to = await resolveRecipient({ auth: getAuth() }, after);
    if (!to) {
      logger.warn('No address for this organization, so no email was sent', { orgId, status });
      return;
    }

    const result = await sendMail({ to, ...content });
    logger.info('Verification decision email', { orgId, status, sent: result.sent });

    await writeActorAudit(db, {
      action: 'org.email_sent',
      actorUid: 'system',
      targetType: 'organization',
      targetId: orgId,
      orgId,
      details: {
        kind: `verification.${status}`,
        sent: result.sent,
        reason: result.reason ?? null,
      },
    });
  } catch (err) {
    logger.error('Verification email step failed; the decision itself stands', {
      orgId, status, reason: String(err?.message || err).slice(0, 200),
    });
  }
}

/**
 * Tell an applicant their registration arrived, the moment it does.
 *
 * Distinct from notifyVerificationDecision below: this fires once, on
 * creation, before any reviewer has looked at anything, and says only that
 * the submission was received. It shares the same best-effort contract:
 * failures here never touch the registration itself.
 */
async function notifyApplicationReceived(db, eventId, orgId, after) {
  try {
    const marker = db.collection('emailSends').doc(`${eventId}_application`);
    try {
      await marker.create({ orgId, at: FieldValue.serverTimestamp() });
    } catch {
      logger.info('Application-received email already handled for this event', { orgId });
      return;
    }

    const content = applicationReceivedEmail({ orgName: after.name, siteUrl: siteOrigin() });
    const to = await resolveRecipient({ auth: getAuth() }, after);
    if (!to) {
      logger.warn('No address for this organization, so no email was sent', { orgId });
      return;
    }

    const result = await sendMail({ to, ...content });
    logger.info('Application-received email', { orgId, sent: result.sent });

    await writeActorAudit(db, {
      action: 'org.email_sent', actorUid: 'system', targetType: 'organization',
      targetId: orgId, orgId,
      details: { kind: 'application_received', sent: result.sent, reason: result.reason ?? null },
    });
  } catch (err) {
    logger.error('Application-received email step failed; the registration itself stands', {
      orgId, reason: String(err?.message || err).slice(0, 200),
    });
  }
}

/**
 * Tell someone their staff access to an organization was removed.
 *
 * Reads the same classifyOrgChange() result the audit trigger already
 * computed, rather than re-deriving it, so this can never disagree with the
 * audit trail about who was removed. One email per removed uid: a single
 * write can remove more than one person from staffUids at once.
 */
async function notifyStaffRemoved(db, eventId, orgId, entries, after) {
  const removals = entries.filter((entry) => entry.action === 'staff.removed');
  if (!removals.length) return;

  for (const [i, entry] of removals.entries()) {
    try {
      const marker = db.collection('emailSends').doc(`${eventId}_staffRemoved_${i}`);
      try {
        await marker.create({ orgId, targetUid: entry.targetUid, at: FieldValue.serverTimestamp() });
      } catch {
        logger.info('Staff-removed email already handled for this event', { orgId });
        continue;
      }

      let to = null;
      try {
        const user = await getAuth().getUser(entry.targetUid);
        to = user?.email || null;
      } catch {
        to = null;
      }
      if (!to) {
        logger.warn('No address for the removed staff account, so no email was sent', { orgId });
        continue;
      }

      const content = staffRevokedEmail({ orgName: after?.name, siteUrl: siteOrigin() });
      const result = await sendMail({ to, ...content });
      logger.info('Staff-removed email', { orgId, sent: result.sent });

      await writeActorAudit(db, {
        action: 'org.email_sent', actorUid: 'system', targetType: 'organization',
        targetId: orgId, orgId,
        details: { kind: 'staff_removed', sent: result.sent, reason: result.reason ?? null },
      });
    } catch (err) {
      logger.error('Staff-removed email step failed; the removal itself stands', {
        orgId, reason: String(err?.message || err).slice(0, 200),
      });
    }
  }
}

export const onStaffRequestAuditWritten = onDocumentWritten(
  { document: 'organizations/{orgId}/staffRequests/{requestUid}', secrets: EMAIL_SECRETS },
  async (event) => {
    const { orgId, requestUid } = event.params;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;

    const result = classifyStaffRequestChange(before, after);
    if (!result) return;

    const db = getFirestore();
    await writeAuditEntry(db, event.id, {
      action: result.action, actorUid: result.actorUid,
      targetType: 'staffRequest', targetId: requestUid, orgId,
    });

    if (result.action === 'staff.approved') {
      await notifyStaffGranted(db, event.id, orgId, after);
    }
  });

/** Tell someone their staff join request was approved. */
async function notifyStaffGranted(db, eventId, orgId, after) {
  try {
    const marker = db.collection('emailSends').doc(`${eventId}_staffGranted`);
    try {
      await marker.create({ orgId, at: FieldValue.serverTimestamp() });
    } catch {
      logger.info('Staff-granted email already handled for this event', { orgId });
      return;
    }

    const to = trimmedEmail(after?.email);
    if (!to) {
      logger.warn('No address on this staff request, so no email was sent', { orgId });
      return;
    }

    const org = await db.collection('organizations').doc(orgId).get();
    const content = staffGrantedEmail({ orgName: org.data()?.name, siteUrl: siteOrigin() });
    const result = await sendMail({ to, ...content });
    logger.info('Staff-granted email', { orgId, sent: result.sent });

    await writeActorAudit(db, {
      action: 'org.email_sent', actorUid: 'system', targetType: 'organization',
      targetId: orgId, orgId,
      details: { kind: 'staff_granted', sent: result.sent, reason: result.reason ?? null },
    });
  } catch (err) {
    logger.error('Staff-granted email step failed; the approval itself stands', {
      orgId, reason: String(err?.message || err).slice(0, 200),
    });
  }
}

const trimmedEmail = (value) => (String(value || '').trim() || null);

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
