// Granting and revoking platform administration.
//
// These two functions are the only way administration is handed out now that
// the portal has controls for it, and firestore.rules still refuses every
// client write to /admins. That makes the authorization check in this module
// the whole defence: if it lets a non-administrator through, any signed-in
// account on Ta'ziyah can make itself an administrator. So the refusals are
// tested as carefully as the successes, and the self-revoke refusal is tested
// because the alternative is a platform nobody can administer.

import { test, describe, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  AdminActionError, ADMIN_ACTIONS, MESSAGE_LIMITS, normalizeEmail,
  assertCallerIsAdmin, grantAdmin, revokeAdmin, checkMessage,
} from '../lib/admin-management.js';

/**
 * A Firestore stand-in over a plain map of `collection/doc` to data, with
 * just the four calls this module makes. Small on purpose: the point is to
 * exercise the decisions, not to reimplement Firestore.
 */
function fakeDb(seed = {}) {
  const docs = new Map(Object.entries(seed));
  const deleted = [];
  return {
    docs,
    deleted,
    collection: (name) => ({
      doc: (id) => {
        const key = `${name}/${id}`;
        return {
          get: async () => ({
            exists: docs.has(key),
            data: () => docs.get(key),
          }),
          set: async (value) => { docs.set(key, value); },
          delete: async () => { docs.delete(key); deleted.push(key); },
        };
      },
    }),
  };
}

const fakeAuth = (byEmail) => ({
  getUserByEmail: async (email) => {
    const user = byEmail[email];
    if (!user) throw new Error('auth/user-not-found');
    return user;
  },
});

function harness({ admins = {}, users = {} } = {}) {
  const db = fakeDb(admins);
  const audit = [];
  return {
    db,
    audit,
    deps: {
      db,
      auth: fakeAuth(users),
      writeAudit: async (entry) => { audit.push(entry); },
      timestamp: () => 'SERVER_TIME',
    },
  };
}

const rejects = async (promise, code) => {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof AdminActionError, `expected a refusal, got ${err}`);
    assert.equal(err.code, code);
    return true;
  });
};

describe('assertCallerIsAdmin', () => {
  test('an unauthenticated caller is refused', async () => {
    const { db } = harness();
    await rejects(assertCallerIsAdmin(db, null), 'unauthenticated');
  });

  test('a signed-in caller who is not an administrator is refused', async () => {
    const { db } = harness({ admins: { 'admins/boss': { email: 'boss@example.com' } } });
    await rejects(assertCallerIsAdmin(db, 'ordinary-user'), 'permission-denied');
  });

  test('the check reads the caller uid, never anything the caller sent', async () => {
    // The only input is the uid argument, which the callable takes from
    // request.auth. There is no field in request.data this can be fooled by.
    const { db } = harness({ admins: { 'admins/boss': { email: 'boss@example.com' } } });
    assert.deepEqual(await assertCallerIsAdmin(db, 'boss'), { email: 'boss@example.com' });
  });
});

describe('grantAdmin', () => {
  let h;
  beforeEach(() => {
    h = harness({
      admins: { 'admins/boss': { email: 'boss@example.com' } },
      users: { 'new@example.com': { uid: 'new-uid', email: 'new@example.com' } },
    });
  });

  test('an ordinary account cannot grant administration to anybody', async () => {
    await rejects(
      grantAdmin(h.deps, 'ordinary-user', { email: 'new@example.com' }),
      'permission-denied');
    assert.equal(h.db.docs.has('admins/new-uid'), false, 'nothing may be written');
    assert.equal(h.audit.length, 0);
  });

  test('an unauthenticated caller cannot grant administration', async () => {
    await rejects(grantAdmin(h.deps, null, { email: 'new@example.com' }), 'unauthenticated');
  });

  test('an administrator grants it, and the record says who and when', async () => {
    const result = await grantAdmin(h.deps, 'boss', { email: 'new@example.com' });
    assert.deepEqual(result, { uid: 'new-uid', email: 'new@example.com' });
    assert.deepEqual(h.db.docs.get('admins/new-uid'), {
      email: 'new@example.com',
      grantedAt: 'SERVER_TIME',
      grantedBy: 'boss',
    });
  });

  test('the grant is audited, against the granting administrator', async () => {
    await grantAdmin(h.deps, 'boss', { email: 'new@example.com' });
    assert.equal(h.audit.length, 1);
    assert.equal(h.audit[0].action, ADMIN_ACTIONS.GRANTED);
    assert.equal(h.audit[0].actorUid, 'boss');
    assert.equal(h.audit[0].targetId, 'new-uid');
  });

  test('the audit entry carries no email address', () => {
    // The audit log is read in the portal. Ta'ziyah keeps addresses out of
    // documents other people read, and an entry is not an exception.
    return grantAdmin(h.deps, 'boss', { email: 'new@example.com' }).then(() => {
      assert.equal(JSON.stringify(h.audit[0]).includes('@'), false);
    });
  });

  test('an address with no account is refused, and says what to do', async () => {
    await rejects(grantAdmin(h.deps, 'boss', { email: 'nobody@example.com' }), 'not-found');
    try {
      await grantAdmin(h.deps, 'boss', { email: 'nobody@example.com' });
    } catch (err) {
      assert.match(err.message, /nobody@example\.com/);
      assert.match(err.message, /create an account/);
    }
  });

  test('an address is matched however it was typed', async () => {
    const result = await grantAdmin(h.deps, 'boss', { email: '  NEW@Example.com ' });
    assert.equal(result.uid, 'new-uid');
  });

  test('something that is not an email address is refused before any lookup', async () => {
    for (const bad of [undefined, null, '', '   ', 'not-an-address', 42, { email: 'x' }]) {
      await rejects(grantAdmin(h.deps, 'boss', { email: bad }), 'invalid-argument');
    }
  });

  test('granting to somebody who already has it says so rather than rewriting', async () => {
    await grantAdmin(h.deps, 'boss', { email: 'new@example.com' });
    h.audit.length = 0;
    await rejects(grantAdmin(h.deps, 'boss', { email: 'new@example.com' }), 'already-exists');
    assert.equal(h.audit.length, 0, 'a refused grant is not an audit entry');
  });
});

describe('revokeAdmin', () => {
  let h;
  beforeEach(() => {
    h = harness({
      admins: {
        'admins/boss': { email: 'boss@example.com' },
        'admins/other': { email: 'other@example.com' },
      },
    });
  });

  test('an administrator cannot revoke their own access', async () => {
    // The failure this prevents is a platform with zero administrators, which
    // nothing in the app can undo: only the Firebase console can.
    await rejects(revokeAdmin(h.deps, 'boss', { uid: 'boss' }), 'failed-precondition');
    assert.equal(h.db.docs.has('admins/boss'), true, 'the record must survive');
    assert.equal(h.audit.length, 0);
  });

  test('the self-revoke refusal happens even when it is the only administrator', async () => {
    const solo = harness({ admins: { 'admins/boss': { email: 'boss@example.com' } } });
    await rejects(revokeAdmin(solo.deps, 'boss', { uid: 'boss' }), 'failed-precondition');
    assert.equal(solo.db.docs.has('admins/boss'), true);
  });

  test('an ordinary account cannot revoke an administrator', async () => {
    await rejects(revokeAdmin(h.deps, 'ordinary-user', { uid: 'other' }), 'permission-denied');
    assert.equal(h.db.docs.has('admins/other'), true);
    assert.equal(h.audit.length, 0);
  });

  test('an unauthenticated caller cannot revoke anybody', async () => {
    await rejects(revokeAdmin(h.deps, null, { uid: 'other' }), 'unauthenticated');
    assert.equal(h.db.docs.has('admins/other'), true);
  });

  test('an administrator revokes another, and it is audited', async () => {
    const result = await revokeAdmin(h.deps, 'boss', { uid: 'other' });
    assert.deepEqual(result, { uid: 'other' });
    assert.equal(h.db.docs.has('admins/other'), false);
    assert.equal(h.audit[0].action, ADMIN_ACTIONS.REVOKED);
    assert.equal(h.audit[0].actorUid, 'boss');
    assert.equal(h.audit[0].targetId, 'other');
  });

  test('the reason given is kept, because the record itself is gone', async () => {
    await revokeAdmin(h.deps, 'boss', { uid: 'other', reason: 'Left the team.' });
    assert.equal(h.audit[0].details.reason, 'Left the team.');
  });

  test('a very long reason is cut rather than stored whole', async () => {
    await revokeAdmin(h.deps, 'boss', { uid: 'other', reason: 'x'.repeat(9000) });
    assert.equal(h.audit[0].details.reason.length, MESSAGE_LIMITS.reason);
  });

  test('revoking somebody who is not an administrator says so', async () => {
    await rejects(revokeAdmin(h.deps, 'boss', { uid: 'stranger' }), 'not-found');
    assert.equal(h.audit.length, 0);
  });

  test('a missing uid is refused before anything is read', async () => {
    for (const bad of [undefined, null, '', '   ', 7]) {
      await rejects(revokeAdmin(h.deps, 'boss', { uid: bad }), 'invalid-argument');
    }
  });
});

describe('checkMessage', () => {
  const good = { orgId: 'org-1', subject: 'A question', body: 'Assalamu alaikum.' };

  test('a complete message passes, trimmed', () => {
    assert.deepEqual(
      checkMessage({ orgId: ' org-1 ', subject: ' A question ', body: ' Hello. ' }),
      { orgId: 'org-1', subject: 'A question', body: 'Hello.' });
  });

  test('every part is required', () => {
    for (const missing of ['orgId', 'subject', 'body']) {
      const data = { ...good, [missing]: '   ' };
      assert.throws(() => checkMessage(data), (err) => err.code === 'invalid-argument');
    }
  });

  test('the body is bounded, so this is not a relay', () => {
    // The endpoint sends through the project's own SMTP credentials. An
    // unbounded body is the difference between a note and a mail cannon.
    assert.throws(
      () => checkMessage({ ...good, body: 'x'.repeat(MESSAGE_LIMITS.body + 1) }),
      (err) => err.code === 'invalid-argument');
    assert.doesNotThrow(
      () => checkMessage({ ...good, body: 'x'.repeat(MESSAGE_LIMITS.body) }));
  });

  test('the subject is bounded too', () => {
    assert.throws(
      () => checkMessage({ ...good, subject: 'x'.repeat(MESSAGE_LIMITS.subject + 1) }),
      (err) => err.code === 'invalid-argument');
  });
});

describe('normalizeEmail', () => {
  test('trims and lowercases, and survives anything that is not a string', () => {
    assert.equal(normalizeEmail('  A@B.CA '), 'a@b.ca');
    for (const junk of [null, undefined, 5, {}, []]) {
      assert.equal(normalizeEmail(junk), '');
    }
  });
});
