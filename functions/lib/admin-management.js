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
};

/** Bounds on the one-off message an administrator can send to an organization. */
export const MESSAGE_LIMITS = { subject: 150, body: 4000, reason: 500 };

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
