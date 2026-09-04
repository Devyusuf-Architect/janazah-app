// Granting and revoking platform administration, and the one authorization
// check both of them rest on.
//
// Why this is server-side at all: firestore.rules has `allow write: if false`
// on /admins for every caller without exception, and that stays exactly as it
// is. Opening a client write path to that collection would mean a compromised
// administrator session could mint a second administrator, or remove the real
// ones. So the writing happens here instead, through the Admin SDK, which
// bypasses rules because it is not a client at all. The check that decides
// who may do it lives in code, not in a collection anybody can reach.
//
// Same discipline as audit-log.js, notify.js and limits.js: no Firebase
// imports. Everything this needs (a Firestore handle, an Auth handle, a way
// to write an audit entry, a server timestamp) arrives as `deps`, so the
// whole decision path is unit-testable with plain fakes and the emulator is
// not required to prove that a non-administrator is refused.

/**
 * A refusal with an error code the callable wrapper can hand to HttpsError.
 * The message is written for the administrator who will read it on screen,
 * because every one of these is either actionable or worth knowing exactly.
 */
export class AdminActionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AdminActionError';
    this.code = code;
  }
}

export const ADMIN_ACTIONS = {
  GRANTED: 'admin.granted',
  REVOKED: 'admin.revoked',
  MESSAGE_SENT: 'org.message_sent',
  ORG_ARCHIVED: 'org.archived',
  ORG_RESTORED: 'org.restored',
};

/** Bounds on the one-off message an administrator can send to an organization. */
export const MESSAGE_LIMITS = { subject: 150, body: 4000, reason: 500 };

/**
 * Firestore batched writes are capped at 500 operations. archiveOrganization
 * spends one of those on the organization document itself, and
 * restoreOrganization could in principle spend one on stamping something
 * alongside the notices, so every chunk here stays comfortably under the cap
 * rather than running right up to it.
 *
 * Nothing about Ta'ziyah's scale today makes a single organization with more
 * than a few hundred published notices plausible; this exists so that the
 * rare organization that does outgrow one batch is handled by looping, not by
 * failing partway through with no explanation.
 */
const BATCH_CHUNK_SIZE = 450;

/** Ordinary statuses an organization can be archived from, and restored to. */
const RESTORABLE_STATUSES = ['pending', 'needs_information', 'verified', 'rejected', 'suspended'];

const SAMPLE_ID = /^sample-/;

/**
 * Commit a list of Firestore writes in chunks of at most BATCH_CHUNK_SIZE,
 * each chunk its own atomic batch.
 *
 * A single chunk is exactly as atomic as any other Firestore batch: it
 * commits whole or not at all. Across chunks it is not, the same as any
 * multi-batch operation against Firestore has to be: there is no primitive
 * that makes an arbitrarily large set of writes atomic together. That only
 * matters once an organization's published notices exceed BATCH_CHUNK_SIZE,
 * which is not a realistic scale for this app today; the chunking exists so
 * that day is handled by looping rather than by a write silently failing past
 * the 500-operation cap.
 *
 * @param {object} db  Firestore handle (an Admin SDK Firestore, or a fake
 *   exposing the same `batch()` shape in tests).
 * @param {{ref: object, data: object}[]} writes
 */
async function commitInChunks(db, writes) {
  for (let i = 0; i < writes.length; i += BATCH_CHUNK_SIZE) {
    const chunk = writes.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = db.batch();
    for (const { ref, data } of chunk) batch.update(ref, data);
    await batch.commit();
  }
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw) {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

/**
 * The whole authorization story for every callable in this file.
 *
 * Nothing the client sends is consulted. The caller's uid comes from the
 * verified auth context, and whether that uid is an administrator is read
 * from Firestore here, on the server, at the moment of the call.
 *
 * @param {object} db  Firestore handle.
 * @param {string|null} callerUid  From request.auth, never from request.data.
 */
export async function assertCallerIsAdmin(db, callerUid) {
  if (!callerUid) {
    throw new AdminActionError('unauthenticated',
      'Sign in as a platform administrator to do this.');
  }
  const snap = await db.collection('admins').doc(callerUid).get();
  if (!snap.exists) {
    throw new AdminActionError('permission-denied',
      'Only a platform administrator can do this.');
  }
  return snap.data() || {};
}

/**
 * Make an existing account a platform administrator.
 *
 * The target is looked up by email through the Admin SDK, which a browser
 * cannot do: a client can only ever address a user by uid, which is why this
 * screen used to send administrators to the Firebase console to copy one out
 * by hand.
 *
 * There is deliberately no invitation path. An account has to exist before it
 * can be given anything, and accounts on Ta'ziyah are created by signing up.
 * Writing an /admins document against an address nobody has claimed would
 * hand administration to whoever registers it first.
 */
export async function grantAdmin(deps, callerUid, data) {
  const { db, auth, writeAudit, timestamp } = deps;
  await assertCallerIsAdmin(db, callerUid);

  const email = normalizeEmail(data?.email);
  if (!email || !EMAIL_SHAPE.test(email)) {
    throw new AdminActionError('invalid-argument',
      'Enter the email address of the person to make an administrator.');
  }

  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    throw new AdminActionError('not-found',
      `No Ta'ziyah account exists for ${email}. Ask them to create an account `
      + 'and sign in once, then grant it here. Administration can only be '
      + 'given to an account that already exists.');
  }

  const ref = db.collection('admins').doc(user.uid);
  if ((await ref.get()).exists) {
    throw new AdminActionError('already-exists',
      `${email} is already a platform administrator.`);
  }

  await ref.set({
    email: user.email || email,
    grantedAt: timestamp(),
    grantedBy: callerUid,
  });

  await writeAudit({
    action: ADMIN_ACTIONS.GRANTED,
    actorUid: callerUid,
    targetType: 'user',
    targetId: user.uid,
    orgId: null,
    details: {},
  });

  return { uid: user.uid, email: user.email || email };
}

/**
 * Take platform administration away from an account.
 *
 * Refuses to act on the caller's own account. A platform with zero
 * administrators cannot verify a masjid, moderate a notice or grant
 * administration back, and the only way out of that is the Firebase console,
 * which is exactly the manual step this pair of functions exists to remove.
 * One misclick should not be able to put the platform there.
 */
export async function revokeAdmin(deps, callerUid, data) {
  const { db, writeAudit } = deps;
  await assertCallerIsAdmin(db, callerUid);

  const uid = typeof data?.uid === 'string' ? data.uid.trim() : '';
  if (!uid) {
    throw new AdminActionError('invalid-argument',
      'Which administrator to remove was not given.');
  }
  if (uid === callerUid) {
    throw new AdminActionError('failed-precondition',
      'You cannot remove your own administrator access. Ask another '
      + 'administrator to do it, so the platform is never left without one.');
  }

  const ref = db.collection('admins').doc(uid);
  if (!(await ref.get()).exists) {
    throw new AdminActionError('not-found',
      'That account is not a platform administrator.');
  }

  await ref.delete();

  // The record being removed is the only place this person was named, so the
  // reason given goes into the audit entry or nowhere. Bounded, because the
  // audit log is not a notes field.
  const reason = typeof data?.reason === 'string'
    ? data.reason.trim().slice(0, MESSAGE_LIMITS.reason) : '';

  await writeAudit({
    action: ADMIN_ACTIONS.REVOKED,
    actorUid: callerUid,
    targetType: 'user',
    targetId: uid,
    orgId: null,
    details: reason ? { reason } : {},
  });

  return { uid };
}

/**
 * Hide a real organization and everything it has published, in a way that can
 * be undone.
 *
 * Ta'ziyah never permanently deletes a real organization: the audit trail and
 * every past auditLog entry naming it have to keep resolving to something,
 * and a genuine Firestore delete cannot be undone if the archiving turns out
 * to be a mistake. Archiving instead moves the organization to a status the
 * public directory already treats as invisible, and pulls every one of its
 * published notices back to draft, which the public feed already treats as
 * invisible too (see firestore.rules, isPublic). Nothing new is hidden by a
 * new mechanism; this reuses both.
 *
 * Deliberately refuses `sample-` organizations: that prefix has its own
 * real-delete path (firestore.rules, `orgId.matches('^sample-.*')`), meant for
 * data this platform created for testing and can simply remove. Sample
 * organizations have no need of an archive/restore lifecycle.
 *
 * @param {object} deps  {db, writeAudit, timestamp, deleteField}
 * @param {string|null} callerUid
 * @param {{orgId: string, reason?: string}} data
 */
export async function archiveOrganization(deps, callerUid, data) {
  const { db, writeAudit, timestamp } = deps;
  await assertCallerIsAdmin(db, callerUid);

  const orgId = typeof data?.orgId === 'string' ? data.orgId.trim() : '';
  if (!orgId) {
    throw new AdminActionError('invalid-argument', 'No organization was named.');
  }
  if (SAMPLE_ID.test(orgId)) {
    throw new AdminActionError('failed-precondition',
      'Sample organizations are removed with the sample-data tool in Platform '
      + 'Settings, not archived. That prefix has its own permanent-delete path; '
      + 'it does not need an archive and restore lifecycle.');
  }

  const orgRef = db.collection('organizations').doc(orgId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    throw new AdminActionError('not-found', 'That organization no longer exists.');
  }
  const org = orgSnap.data();
  if (org.verificationStatus === 'archived') {
    throw new AdminActionError('failed-precondition',
      `${org.name || 'This organization'} is already archived.`);
  }

  const reason = typeof data?.reason === 'string'
    ? data.reason.trim().slice(0, MESSAGE_LIMITS.reason) : '';

  const publishedNotices = await db.collection('notices')
    .where('orgId', '==', orgId)
    .where('status', '==', 'published')
    .get();

  const writes = [{
    ref: orgRef,
    data: {
      verificationStatus: 'archived',
      statusBeforeArchive: org.verificationStatus,
      statusReason: reason,
      updatedAt: timestamp(),
      updatedBy: callerUid,
    },
  }];

  for (const noticeDoc of publishedNotices.docs) {
    const notice = noticeDoc.data();
    writes.push({
      ref: noticeDoc.ref,
      data: {
        status: 'draft',
        isPublic: false,
        archivedFromPublished: true,
        version: (notice.version || 1) + 1,
        lastEditedBy: callerUid,
        updatedAt: timestamp(),
      },
    });
  }

  await commitInChunks(db, writes);

  await writeAudit({
    action: ADMIN_ACTIONS.ORG_ARCHIVED,
    actorUid: callerUid,
    targetType: 'organization',
    targetId: orgId,
    orgId,
    details: reason
      ? { noticesArchived: publishedNotices.docs.length, reason }
      : { noticesArchived: publishedNotices.docs.length },
  });

  return { orgId, noticesArchived: publishedNotices.docs.length };
}

/**
 * Undo archiveOrganization: put the organization back to whatever status it
 * held before, and republish exactly the notices archiving pulled to draft.
 *
 * Only notices archiving itself touched are republished (those carrying
 * `archivedFromPublished: true`). A notice that was already a genuine draft
 * before the organization was archived never gets that marker and is left
 * exactly as it was; the same is true of a cancelled notice, which is
 * terminal and was never touched by archiving in the first place.
 *
 * @param {object} deps  {db, writeAudit, timestamp, deleteField}
 * @param {string|null} callerUid
 * @param {{orgId: string}} data
 */
export async function restoreOrganization(deps, callerUid, data) {
  const { db, writeAudit, timestamp, deleteField } = deps;
  await assertCallerIsAdmin(db, callerUid);

  const orgId = typeof data?.orgId === 'string' ? data.orgId.trim() : '';
  if (!orgId) {
    throw new AdminActionError('invalid-argument', 'No organization was named.');
  }

  const orgRef = db.collection('organizations').doc(orgId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    throw new AdminActionError('not-found', 'That organization no longer exists.');
  }
  const org = orgSnap.data();
  if (org.verificationStatus !== 'archived') {
    throw new AdminActionError('failed-precondition',
      `${org.name || 'This organization'} is not archived, so there is nothing to restore.`);
  }

  let restoredStatus = org.statusBeforeArchive;
  if (!RESTORABLE_STATUSES.includes(restoredStatus)) {
    // Should not normally happen: archiveOrganization always records this.
    // Falling back to 'verified' rather than refusing means a restore is
    // never blocked by a missing field, but it is loud about it, because the
    // fallback is a guess and whoever reads the logs should know one was made.
    console.warn(
      `restoreOrganization: ${orgId} has no usable statusBeforeArchive `
      + `(saw ${JSON.stringify(restoredStatus)}); restoring to 'verified'.`);
    restoredStatus = 'verified';
  }

  const archivedNotices = await db.collection('notices')
    .where('orgId', '==', orgId)
    .where('archivedFromPublished', '==', true)
    .get();

  const writes = [{
    ref: orgRef,
    data: {
      verificationStatus: restoredStatus,
      statusBeforeArchive: deleteField(),
      updatedAt: timestamp(),
      updatedBy: callerUid,
    },
  }];

  for (const noticeDoc of archivedNotices.docs) {
    const notice = noticeDoc.data();
    writes.push({
      ref: noticeDoc.ref,
      data: {
        status: 'published',
        isPublic: true,
        archivedFromPublished: deleteField(),
        version: (notice.version || 1) + 1,
        lastEditedBy: callerUid,
        updatedAt: timestamp(),
      },
    });
  }

  await commitInChunks(db, writes);

  await writeAudit({
    action: ADMIN_ACTIONS.ORG_RESTORED,
    actorUid: callerUid,
    targetType: 'organization',
    targetId: orgId,
    orgId,
    details: {
      noticesRestored: archivedNotices.docs.length,
      restoredStatus,
    },
  });

  return { orgId, restoredStatus, noticesRestored: archivedNotices.docs.length };
}

/**
 * Validate a one-off message before anything is sent.
 *
 * Split out from the sending so the bounds are testable on their own. The
 * body limit is not a formatting preference: this endpoint sends mail through
 * the project's own SMTP credentials, and an unbounded body is the difference
 * between a note to a masjid and a relay somebody else can use.
 */
export function checkMessage(data) {
  const orgId = typeof data?.orgId === 'string' ? data.orgId.trim() : '';
  const subject = typeof data?.subject === 'string' ? data.subject.trim() : '';
  const body = typeof data?.body === 'string' ? data.body.trim() : '';

  if (!orgId) {
    throw new AdminActionError('invalid-argument', 'No organization was named.');
  }
  if (!subject) {
    throw new AdminActionError('invalid-argument', 'A subject is required.');
  }
  if (subject.length > MESSAGE_LIMITS.subject) {
    throw new AdminActionError('invalid-argument',
      `The subject must be ${MESSAGE_LIMITS.subject} characters or fewer.`);
  }
  if (!body) {
    throw new AdminActionError('invalid-argument', 'A message is required.');
  }
  if (body.length > MESSAGE_LIMITS.body) {
    throw new AdminActionError('invalid-argument',
      `The message must be ${MESSAGE_LIMITS.body} characters or fewer. Send a `
      + 'short note and put anything longer in a document.');
  }
  return { orgId, subject, body };
}
