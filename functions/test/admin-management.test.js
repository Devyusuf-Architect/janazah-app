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
  archiveOrganization, restoreOrganization,
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

/**
 * A richer Firestore stand-in for archiveOrganization/restoreOrganization:
 * still a plain map of `collection/doc` to data, but this time with the
 * `where().get()` and `batch()` shapes those two functions actually use.
 * Only `==` is implemented, because that is all either function ever asks
 * of a query.
 */
const DELETE_FIELD = Symbol('deleteField');

function fakeFirestore(seed = {}) {
  const docs = new Map(Object.entries(seed).map(([k, v]) => [k, { ...v }]));

  function applyPatch(before, patch) {
    const next = { ...before };
    for (const [key, value] of Object.entries(patch)) {
      if (value === DELETE_FIELD) delete next[key];
      else next[key] = value;
    }
    return next;
  }

  function refFor(name, id) {
    const key = `${name}/${id}`;
    return {
      id,
      get: async () => ({ exists: docs.has(key), data: () => docs.get(key) }),
      set: async (value) => { docs.set(key, value); },
      update: async (patch) => { docs.set(key, applyPatch(docs.get(key) || {}, patch)); },
      delete: async () => { docs.delete(key); },
    };
  }

  return {
    docs,
    collection: (name) => ({
      doc: (id) => refFor(name, id),
      where(field, op, value) {
        if (op !== '==') throw new Error(`fakeFirestore only supports "==", got "${op}"`);
        const filters = [[field, value]];
        const built = {
          where(f2, o2, v2) {
            if (o2 !== '==') throw new Error(`fakeFirestore only supports "==", got "${o2}"`);
            filters.push([f2, v2]);
            return built;
          },
          async get() {
            const matches = [];
            for (const [key, data] of docs.entries()) {
              if (!key.startsWith(`${name}/`)) continue;
              const id = key.slice(name.length + 1);
              if (filters.every(([f, v]) => data[f] === v)) {
                matches.push({ id, ref: refFor(name, id), data: () => data });
              }
            }
            return { docs: matches };
          },
        };
        return built;
      },
    }),
    batch() {
      const ops = [];
      return {
        update: (ref, data) => ops.push(async () => ref.update(data)),
        set: (ref, data) => ops.push(async () => ref.set(data)),
        delete: (ref) => ops.push(async () => ref.delete()),
        commit: async () => { for (const op of ops) await op(); },
      };
    },
  };
}

function orgHarness(seed = {}) {
  const db = fakeFirestore(seed);
  const audit = [];
  return {
    db,
    audit,
    deps: {
      db,
      writeAudit: async (entry) => { audit.push(entry); },
      timestamp: () => 'SERVER_TIME',
      deleteField: () => DELETE_FIELD,
    },
  };
}

const BOSS = { 'admins/boss': { email: 'boss@example.com' } };

describe('archiveOrganization', () => {
  test('a non-administrator cannot archive anything', async () => {
    const h = orgHarness({
      ...BOSS,
      'organizations/org-1': { name: 'Test Masjid', verificationStatus: 'verified' },
    });
    await rejects(archiveOrganization(h.deps, 'ordinary-user', { orgId: 'org-1' }), 'permission-denied');
    assert.equal(h.db.docs.get('organizations/org-1').verificationStatus, 'verified');
    assert.equal(h.audit.length, 0);
  });

  test('an organization that does not exist is refused, not silently skipped', async () => {
    const h = orgHarness({ ...BOSS });
    await rejects(archiveOrganization(h.deps, 'boss', { orgId: 'ghost' }), 'not-found');
  });

  test('a sample organization is refused: it has its own delete path', async () => {
    const h = orgHarness({
      ...BOSS,
      'organizations/sample-1': { name: 'Sample Masjid', verificationStatus: 'verified' },
    });
    await rejects(
      archiveOrganization(h.deps, 'boss', { orgId: 'sample-1' }), 'failed-precondition');
    assert.equal(h.db.docs.get('organizations/sample-1').verificationStatus, 'verified');
  });

  test('an already-archived organization is refused rather than re-archived', async () => {
    const h = orgHarness({
      ...BOSS,
      'organizations/org-1': {
        name: 'Test Masjid', verificationStatus: 'archived', statusBeforeArchive: 'verified',
      },
    });
    await rejects(archiveOrganization(h.deps, 'boss', { orgId: 'org-1' }), 'failed-precondition');
  });

  test('archiving records the prior status, the reason, and who did it', async () => {
    const h = orgHarness({
      ...BOSS,
      'organizations/org-1': { name: 'Test Masjid', verificationStatus: 'suspended' },
    });
    const result = await archiveOrganization(h.deps, 'boss', { orgId: 'org-1', reason: 'Repeated complaints.' });
    assert.deepEqual(result, { orgId: 'org-1', noticesArchived: 0 });
    const org = h.db.docs.get('organizations/org-1');
    assert.equal(org.verificationStatus, 'archived');
    assert.equal(org.statusBeforeArchive, 'suspended');
    assert.equal(org.statusReason, 'Repeated complaints.');
    assert.equal(org.updatedBy, 'boss');
    assert.equal(org.updatedAt, 'SERVER_TIME');
  });

  test('published notices are pulled to draft; drafts and cancellations are left alone', async () => {
    const h = orgHarness({
      ...BOSS,
      'organizations/org-1': { name: 'Test Masjid', verificationStatus: 'verified' },
      'notices/n-published': { orgId: 'org-1', status: 'published', isPublic: true, version: 2 },
      'notices/n-draft': { orgId: 'org-1', status: 'draft', isPublic: false, version: 1 },
      'notices/n-cancelled': { orgId: 'org-1', status: 'cancelled', isPublic: true, version: 3 },
      'notices/n-other-org': { orgId: 'org-2', status: 'published', isPublic: true, version: 1 },
    });
    const result = await archiveOrganization(h.deps, 'boss', { orgId: 'org-1' });
    assert.equal(result.noticesArchived, 1);

    const published = h.db.docs.get('notices/n-published');
    assert.equal(published.status, 'draft');
    assert.equal(published.isPublic, false);
    assert.equal(published.archivedFromPublished, true);
    assert.equal(published.version, 3);
    assert.equal(published.lastEditedBy, 'boss');

    assert.deepEqual(h.db.docs.get('notices/n-draft'),
      { orgId: 'org-1', status: 'draft', isPublic: false, version: 1 });
    assert.deepEqual(h.db.docs.get('notices/n-cancelled'),
      { orgId: 'org-1', status: 'cancelled', isPublic: true, version: 3 });
    assert.deepEqual(h.db.docs.get('notices/n-other-org'),
      { orgId: 'org-2', status: 'published', isPublic: true, version: 1 });
  });

  test('the archive is audited with the organization, the actor and the notice count', async () => {
    const h = orgHarness({
      ...BOSS,
      'organizations/org-1': { name: 'Test Masjid', verificationStatus: 'verified' },
      'notices/n1': { orgId: 'org-1', status: 'published', version: 1 },
      'notices/n2': { orgId: 'org-1', status: 'published', version: 1 },
    });
    await archiveOrganization(h.deps, 'boss', { orgId: 'org-1', reason: 'Closed permanently.' });
    assert.equal(h.audit.length, 1);
    assert.equal(h.audit[0].action, ADMIN_ACTIONS.ORG_ARCHIVED);
    assert.equal(h.audit[0].actorUid, 'boss');
    assert.equal(h.audit[0].orgId, 'org-1');
    assert.equal(h.audit[0].details.noticesArchived, 2);
    assert.equal(h.audit[0].details.reason, 'Closed permanently.');
  });

  test('a missing orgId is refused before anything is read', async () => {
    const h = orgHarness({ ...BOSS });
    for (const bad of [undefined, null, '', '   ', 7]) {
      await rejects(archiveOrganization(h.deps, 'boss', { orgId: bad }), 'invalid-argument');
    }
  });
});

describe('restoreOrganization', () => {
  test('a non-administrator cannot restore anything', async () => {
    const h = orgHarness({
      ...BOSS,
      'organizations/org-1': { verificationStatus: 'archived', statusBeforeArchive: 'verified' },
    });
    await rejects(restoreOrganization(h.deps, 'ordinary-user', { orgId: 'org-1' }), 'permission-denied');
    assert.equal(h.db.docs.get('organizations/org-1').verificationStatus, 'archived');
  });

  test('an organization that is not archived is refused', async () => {
    const h = orgHarness({
      ...BOSS,
      'organizations/org-1': { name: 'Test Masjid', verificationStatus: 'verified' },
    });
    await rejects(restoreOrganization(h.deps, 'boss', { orgId: 'org-1' }), 'failed-precondition');
  });

  test('an organization that does not exist is refused', async () => {
    const h = orgHarness({ ...BOSS });
    await rejects(restoreOrganization(h.deps, 'boss', { orgId: 'ghost' }), 'not-found');
  });

  test('restoring returns the organization to whatever status preceded the archive, not hardcoded to verified', async () => {
    const h = orgHarness({
      ...BOSS,
      'organizations/org-1': {
        name: 'Test Masjid', verificationStatus: 'archived', statusBeforeArchive: 'suspended',
      },
    });
    const result = await restoreOrganization(h.deps, 'boss', { orgId: 'org-1' });
    assert.equal(result.restoredStatus, 'suspended');
    const org = h.db.docs.get('organizations/org-1');
    assert.equal(org.verificationStatus, 'suspended');
    assert.equal('statusBeforeArchive' in org, false, 'the marker is removed, not left as undefined');
    assert.equal(org.updatedBy, 'boss');
  });

  test('exactly the notices archiving auto-drafted are republished, and the marker is removed', async () => {
    const h = orgHarness({
      ...BOSS,
      'organizations/org-1': {
        name: 'Test Masjid', verificationStatus: 'archived', statusBeforeArchive: 'verified',
      },
      'notices/n-auto-drafted': {
        orgId: 'org-1', status: 'draft', isPublic: false, version: 3, archivedFromPublished: true,
      },
      'notices/n-genuine-draft': {
        orgId: 'org-1', status: 'draft', isPublic: false, version: 1,
      },
      'notices/n-cancelled': {
        orgId: 'org-1', status: 'cancelled', isPublic: true, version: 2,
      },
    });
    const result = await restoreOrganization(h.deps, 'boss', { orgId: 'org-1' });
    assert.equal(result.noticesRestored, 1);

    const restored = h.db.docs.get('notices/n-auto-drafted');
    assert.equal(restored.status, 'published');
    assert.equal(restored.isPublic, true);
    assert.equal('archivedFromPublished' in restored, false);
    assert.equal(restored.version, 4);
    assert.equal(restored.lastEditedBy, 'boss');

    // Untouched: never carried the marker, so archiving never drafted it and
    // restoring must not republish it as though it had.
    assert.deepEqual(h.db.docs.get('notices/n-genuine-draft'),
      { orgId: 'org-1', status: 'draft', isPublic: false, version: 1 });
    assert.deepEqual(h.db.docs.get('notices/n-cancelled'),
      { orgId: 'org-1', status: 'cancelled', isPublic: true, version: 2 });
  });

  test('a missing statusBeforeArchive falls back to verified rather than blocking the restore', async () => {
    const h = orgHarness({
      ...BOSS,
      'organizations/org-1': { name: 'Test Masjid', verificationStatus: 'archived' },
    });
    const result = await restoreOrganization(h.deps, 'boss', { orgId: 'org-1' });
    assert.equal(result.restoredStatus, 'verified');
  });

  test('the restore is audited with the organization, the actor and the notice count', async () => {
    const h = orgHarness({
      ...BOSS,
      'organizations/org-1': {
        name: 'Test Masjid', verificationStatus: 'archived', statusBeforeArchive: 'verified',
      },
      'notices/n1': { orgId: 'org-1', status: 'draft', archivedFromPublished: true, version: 1 },
    });
    await restoreOrganization(h.deps, 'boss', { orgId: 'org-1' });
    assert.equal(h.audit.length, 1);
    assert.equal(h.audit[0].action, ADMIN_ACTIONS.ORG_RESTORED);
    assert.equal(h.audit[0].actorUid, 'boss');
    assert.equal(h.audit[0].orgId, 'org-1');
    assert.equal(h.audit[0].details.noticesRestored, 1);
    assert.equal(h.audit[0].details.restoredStatus, 'verified');
  });

  test('a missing orgId is refused before anything is read', async () => {
    const h = orgHarness({ ...BOSS });
    for (const bad of [undefined, null, '', '   ', 7]) {
      await rejects(restoreOrganization(h.deps, 'boss', { orgId: bad }), 'invalid-argument');
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
