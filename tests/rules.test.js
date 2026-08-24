// Security rules tests.
//
// In Phase 1 there is no server code, so these rules are the whole security
// model. Each test below corresponds to a promise made in the requirements:
// only verified organizations publish, private family information cannot
// reach a public notice, a user cannot verify their own organization, and the
// audit trail cannot be rewritten.
//
// Run: npm run test:rules

import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach, describe } from 'node:test';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection,
  getDocs, query, where, serverTimestamp, Timestamp,
} from 'firebase/firestore';

let env;

const ADMIN = 'admin-uid';
const OWNER = 'owner-uid';
const STAFF = 'staff-uid';
const OUTSIDER = 'outsider-uid';

const VERIFIED_ORG = 'org-verified';
const PENDING_ORG = 'org-pending';

const prayerLocation = {
  name: 'Main Prayer Hall',
  address: '100 Example St, Toronto',
  lat: 43.6532,
  lng: -79.3832,
  cell: 'dpz83',
};

/** A minimally valid public notice document. */
function noticeDoc(overrides = {}) {
  return {
    orgId: VERIFIED_ORG,
    orgName: 'Test Masjid',
    status: 'published',
    isPublic: true,
    janazahAt: Timestamp.fromDate(new Date('2026-09-01T17:30:00Z')),
    timeZone: 'America/Toronto',
    prayerLocation,
    version: 1,
    createdBy: STAFF,
    createdAt: Timestamp.fromDate(new Date('2026-08-24T12:00:00Z')),
    ...overrides,
  };
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'janazah-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins', ADMIN), { email: 'admin@example.com' });

    await setDoc(doc(db, 'organizations', VERIFIED_ORG), {
      name: 'Test Masjid', type: 'masjid',
      address: '100 Example St', city: 'Toronto', province: 'ON',
      lat: 43.6532, lng: -79.3832, cell: 'dpz83',
      verificationStatus: 'verified',
      ownerUid: OWNER, staffUids: [OWNER, STAFF],
      createdAt: Timestamp.now(), createdBy: OWNER,
    });

    await setDoc(doc(db, 'organizations', PENDING_ORG), {
      name: 'Unverified Masjid', type: 'masjid',
      address: '200 Example St', city: 'Ottawa', province: 'ON',
      lat: 45.4215, lng: -75.6972, cell: 'f244m',
      verificationStatus: 'pending',
      ownerUid: OUTSIDER, staffUids: [OUTSIDER],
      createdAt: Timestamp.now(), createdBy: OUTSIDER,
    });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

async function seedNotice(id, overrides = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'notices', id), noticeDoc(overrides));
  });
}

// ---------------------------------------------------------------------------

describe('who may publish', () => {
  test('staff of a verified organization can publish', async () => {
    await assertSucceeds(
      addDoc(collection(as(STAFF), 'notices'), noticeDoc()));
  });

  test('staff of an unverified organization cannot publish', async () => {
    await assertFails(addDoc(collection(as(OUTSIDER), 'notices'),
      noticeDoc({ orgId: PENDING_ORG, createdBy: OUTSIDER })));
  });

  test('a non-staff user cannot publish on an organization’s behalf', async () => {
    await assertFails(addDoc(collection(as(OUTSIDER), 'notices'),
      noticeDoc({ createdBy: OUTSIDER })));
  });

  test('an anonymous visitor cannot publish', async () => {
    await assertFails(addDoc(collection(anon(), 'notices'), noticeDoc()));
  });

  test('a notice cannot be created claiming someone else as author', async () => {
    await assertFails(addDoc(collection(as(STAFF), 'notices'),
      noticeDoc({ createdBy: OWNER })));
  });
});

describe('private information cannot reach a public notice', () => {
  test('a family phone number on the public document is rejected', async () => {
    await assertFails(addDoc(collection(as(STAFF), 'notices'),
      noticeDoc({ familyContactPhone: '555-0100' })));
  });

  test('internal notes on the public document are rejected', async () => {
    await assertFails(addDoc(collection(as(STAFF), 'notices'),
      noticeDoc({ internalNotes: 'family prefers no visitors' })));
  });

  test('an unexpected field on the prayer location is rejected', async () => {
    await assertFails(addDoc(collection(as(STAFF), 'notices'),
      noticeDoc({ prayerLocation: { ...prayerLocation, contactPhone: '555-0100' } })));
  });

  test('staff can read the private subcollection of their own notice', async () => {
    await seedNotice('n1');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'notices', 'n1', 'private', 'details'),
        { familyContactPhone: '555-0100' });
    });
    await assertSucceeds(getDoc(doc(as(STAFF), 'notices', 'n1', 'private', 'details')));
  });

  test('an outsider cannot read the private subcollection', async () => {
    await seedNotice('n1');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'notices', 'n1', 'private', 'details'),
        { familyContactPhone: '555-0100' });
    });
    await assertFails(getDoc(doc(as(OUTSIDER), 'notices', 'n1', 'private', 'details')));
  });

  test('an anonymous visitor cannot read the private subcollection', async () => {
    await seedNotice('n1');
    await assertFails(getDoc(doc(anon(), 'notices', 'n1', 'private', 'details')));
  });
});

describe('public readability of the feed', () => {
  test('anyone can read a published notice', async () => {
    await seedNotice('n1');
    await assertSucceeds(getDoc(doc(anon(), 'notices', 'n1')));
  });

  test('a cancelled notice stays readable so shared links show the cancellation', async () => {
    await seedNotice('n1', { status: 'cancelled', isPublic: true });
    await assertSucceeds(getDoc(doc(anon(), 'notices', 'n1')));
  });

  test('a draft is not readable by the public', async () => {
    await seedNotice('n1', { status: 'draft', isPublic: false });
    await assertFails(getDoc(doc(anon(), 'notices', 'n1')));
  });

  test('a draft is readable by its own organization’s staff', async () => {
    await seedNotice('n1', { status: 'draft', isPublic: false });
    await assertSucceeds(getDoc(doc(as(STAFF), 'notices', 'n1')));
  });

  test('the feed query must be filtered to public notices', async () => {
    await seedNotice('n1');
    await assertFails(getDocs(collection(anon(), 'notices')));
    await assertSucceeds(getDocs(query(
      collection(anon(), 'notices'), where('isPublic', '==', true))));
  });

  test('isPublic must agree with status', async () => {
    await assertFails(addDoc(collection(as(STAFF), 'notices'),
      noticeDoc({ status: 'draft', isPublic: true })));
    await assertFails(addDoc(collection(as(STAFF), 'notices'),
      noticeDoc({ status: 'published', isPublic: false })));
  });
});

describe('corrections and cancellation', () => {
  test('staff can correct their own notice when the version advances by one', async () => {
    await seedNotice('n1');
    await assertSucceeds(updateDoc(doc(as(STAFF), 'notices', 'n1'), {
      instructions: 'Use the north entrance.',
      version: 2,
      lastEditedBy: STAFF,
    }));
  });

  test('a correction that does not advance the version is rejected', async () => {
    await seedNotice('n1');
    await assertFails(updateDoc(doc(as(STAFF), 'notices', 'n1'), {
      instructions: 'Use the north entrance.',
      lastEditedBy: STAFF,
    }));
  });

  test('a correction cannot reassign the notice to another organization', async () => {
    await seedNotice('n1');
    await assertFails(updateDoc(doc(as(STAFF), 'notices', 'n1'), {
      orgId: PENDING_ORG, version: 2, lastEditedBy: STAFF,
    }));
  });

  test('an outsider cannot correct a notice', async () => {
    await seedNotice('n1');
    await assertFails(updateDoc(doc(as(OUTSIDER), 'notices', 'n1'), {
      instructions: 'wrong', version: 2, lastEditedBy: OUTSIDER,
    }));
  });

  test('cancellation is terminal', async () => {
    await seedNotice('n1', { status: 'cancelled', isPublic: true, version: 2 });
    await assertFails(updateDoc(doc(as(STAFF), 'notices', 'n1'), {
      status: 'published', version: 3, lastEditedBy: STAFF,
    }));
  });

  test('a published notice cannot be deleted, only cancelled', async () => {
    await seedNotice('n1');
    await assertFails(deleteDoc(doc(as(STAFF), 'notices', 'n1')));
    await assertSucceeds(updateDoc(doc(as(STAFF), 'notices', 'n1'), {
      status: 'cancelled', isPublic: true, version: 2, lastEditedBy: STAFF,
    }));
  });

  test('a draft may be deleted', async () => {
    await seedNotice('n1', { status: 'draft', isPublic: false });
    await assertSucceeds(deleteDoc(doc(as(STAFF), 'notices', 'n1')));
  });

  test('a platform admin can take a notice down', async () => {
    await seedNotice('n1');
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'notices', 'n1'), {
      status: 'cancelled', isPublic: true, version: 2,
      cancelReason: 'Reported as fraudulent.',
    }));
  });
});

describe('verification cannot be self-granted', () => {
  test('an owner cannot verify their own organization', async () => {
    await assertFails(updateDoc(doc(as(OUTSIDER), 'organizations', PENDING_ORG), {
      verificationStatus: 'verified',
    }));
  });

  test('an owner can edit their organization profile', async () => {
    await assertSucceeds(updateDoc(doc(as(OUTSIDER), 'organizations', PENDING_ORG), {
      address: '201 Example St',
    }));
  });

  test('a platform admin can verify an organization', async () => {
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'organizations', PENDING_ORG), {
      verificationStatus: 'verified', verifiedBy: ADMIN,
      verifiedAt: serverTimestamp(), statusReason: 'Confirmed by phone.',
    }));
  });

  test('a new registration must be pending, self-owned and self-staffed', async () => {
    const base = {
      name: 'New Masjid', type: 'masjid', address: '1 A St',
      city: 'Calgary', province: 'AB', lat: 51.05, lng: -114.07, cell: 'c3nfm',
      createdAt: serverTimestamp(), createdBy: OUTSIDER,
    };
    await assertSucceeds(addDoc(collection(as(OUTSIDER), 'organizations'), {
      ...base, verificationStatus: 'pending',
      ownerUid: OUTSIDER, staffUids: [OUTSIDER],
    }));
    await assertFails(addDoc(collection(as(OUTSIDER), 'organizations'), {
      ...base, verificationStatus: 'verified',
      ownerUid: OUTSIDER, staffUids: [OUTSIDER],
    }));
    await assertFails(addDoc(collection(as(OUTSIDER), 'organizations'), {
      ...base, verificationStatus: 'pending',
      ownerUid: ADMIN, staffUids: [ADMIN],
    }));
  });

  test('a non-owner staff member cannot change the staff list', async () => {
    await assertFails(updateDoc(doc(as(STAFF), 'organizations', VERIFIED_ORG), {
      staffUids: [OWNER, STAFF, OUTSIDER],
    }));
  });

  test('an owner can add a staff member', async () => {
    await assertSucceeds(updateDoc(doc(as(OWNER), 'organizations', VERIFIED_ORG), {
      staffUids: [OWNER, STAFF, OUTSIDER],
    }));
  });

  test('an organization cannot be deleted', async () => {
    await assertFails(deleteDoc(doc(as(ADMIN), 'organizations', VERIFIED_ORG)));
  });

  test('listing organizations must be filtered to verified ones', async () => {
    await assertFails(getDocs(collection(anon(), 'organizations')));
    await assertSucceeds(getDocs(query(
      collection(anon(), 'organizations'),
      where('verificationStatus', '==', 'verified'))));
  });

  test('staff can list their own organizations while still pending', async () => {
    await assertSucceeds(getDocs(query(
      collection(as(OUTSIDER), 'organizations'),
      where('staffUids', 'array-contains', OUTSIDER))));
  });

  test('a user cannot list another user’s unverified organizations', async () => {
    await assertFails(getDocs(query(
      collection(as(STAFF), 'organizations'),
      where('staffUids', 'array-contains', OUTSIDER))));
  });
});

describe('audit trail integrity', () => {
  const entry = (overrides = {}) => ({
    actorUid: STAFF,
    actorEmail: 'staff@example.com',
    action: 'notice.published',
    targetType: 'notice',
    targetId: 'n1',
    orgId: VERIFIED_ORG,
    at: serverTimestamp(),
    details: {},
    ...overrides,
  });

  test('a signed-in user can append an entry for themselves', async () => {
    await assertSucceeds(addDoc(collection(as(STAFF), 'auditLog'), entry()));
  });

  test('an entry cannot be written under another user’s name', async () => {
    await assertFails(addDoc(collection(as(STAFF), 'auditLog'),
      entry({ actorUid: OWNER })));
  });

  test('an entry cannot be backdated', async () => {
    await assertFails(addDoc(collection(as(STAFF), 'auditLog'),
      entry({ at: Timestamp.fromDate(new Date('2020-01-01T00:00:00Z')) })));
  });

  test('an existing entry cannot be altered', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'auditLog', 'a1'),
        { ...entry(), at: Timestamp.now() });
    });
    await assertFails(updateDoc(doc(as(STAFF), 'auditLog', 'a1'), { action: 'nothing.happened' }));
    await assertFails(updateDoc(doc(as(ADMIN), 'auditLog', 'a1'), { action: 'nothing.happened' }));
  });

  test('an entry cannot be deleted, by anyone', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'auditLog', 'a1'),
        { ...entry(), at: Timestamp.now() });
    });
    await assertFails(deleteDoc(doc(as(STAFF), 'auditLog', 'a1')));
    await assertFails(deleteDoc(doc(as(ADMIN), 'auditLog', 'a1')));
  });

  test('an outsider cannot read another organization’s audit entries', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'auditLog', 'a1'),
        { ...entry(), at: Timestamp.now() });
    });
    await assertFails(getDoc(doc(as(OUTSIDER), 'auditLog', 'a1')));
    await assertSucceeds(getDoc(doc(as(STAFF), 'auditLog', 'a1')));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'auditLog', 'a1')));
  });
});

describe('platform admin records', () => {
  test('a user may check only their own admin record', async () => {
    await assertSucceeds(getDoc(doc(as(ADMIN), 'admins', ADMIN)));
    await assertSucceeds(getDoc(doc(as(OUTSIDER), 'admins', OUTSIDER)));
    await assertFails(getDoc(doc(as(OUTSIDER), 'admins', ADMIN)));
  });

  test('nobody can grant themselves admin from a client', async () => {
    await assertFails(setDoc(doc(as(OUTSIDER), 'admins', OUTSIDER), { email: 'x@example.com' }));
    await assertFails(setDoc(doc(as(ADMIN), 'admins', OUTSIDER), { email: 'x@example.com' }));
  });
});

describe('reports', () => {
  const report = (overrides = {}) => ({
    noticeId: 'n1', reportedBy: OUTSIDER, reason: 'incorrect_details',
    status: 'open', createdAt: serverTimestamp(), ...overrides,
  });

  test('a signed-in member can file a report', async () => {
    await assertSucceeds(addDoc(collection(as(OUTSIDER), 'reports'), report()));
  });

  test('a report cannot be filed under someone else’s name', async () => {
    await assertFails(addDoc(collection(as(OUTSIDER), 'reports'),
      report({ reportedBy: STAFF })));
  });

  test('a report cannot be filed pre-resolved', async () => {
    await assertFails(addDoc(collection(as(OUTSIDER), 'reports'),
      report({ status: 'resolved' })));
  });

  test('an unauthenticated visitor cannot file a report', async () => {
    // Reading the feed needs no account, but filing does: the rules pin
    // reportedBy to the caller, which is what makes abuse handling possible.
    await assertFails(addDoc(collection(anon(), 'reports'),
      report({ reportedBy: null })));
  });

  test('a report cannot carry an oversized detail field', async () => {
    await assertFails(addDoc(collection(as(OUTSIDER), 'reports'),
      report({ detail: 'x'.repeat(1001) })));
  });

  test('only a platform admin can read the report queue', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'reports', 'r1'),
        { ...report(), createdAt: Timestamp.now() });
    });
    await assertFails(getDoc(doc(as(OUTSIDER), 'reports', 'r1')));
    await assertFails(getDoc(doc(as(STAFF), 'reports', 'r1')));
    await assertSucceeds(getDoc(doc(as(ADMIN), 'reports', 'r1')));
  });
});

describe('the public feed needs no account', () => {
  test('a visitor with no account can read the feed', async () => {
    await seedNotice('n1');
    await assertSucceeds(getDocs(query(
      collection(anon(), 'notices'), where('isPublic', '==', true))));
  });

  test('a visitor with no account can read the verified masjid directory', async () => {
    await assertSucceeds(getDocs(query(
      collection(anon(), 'organizations'),
      where('verificationStatus', '==', 'verified'))));
  });

  test('a visitor cannot read the audit log', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'auditLog', 'a1'), {
        actorUid: STAFF, action: 'notice.published', targetType: 'notice',
        targetId: 'n1', orgId: VERIFIED_ORG, at: Timestamp.now(),
      });
    });
    await assertFails(getDoc(doc(anon(), 'auditLog', 'a1')));
  });

  test('a visitor cannot read a notice’s private details', async () => {
    await seedNotice('n1');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'notices', 'n1', 'private', 'details'),
        { familyContactPhone: '555-0100' });
    });
    await assertFails(getDoc(doc(anon(), 'notices', 'n1', 'private', 'details')));
  });
});

describe('everything else is closed', () => {
  test('an unmatched collection is not writable', async () => {
    await assertFails(setDoc(doc(as(STAFF), 'userLocations', STAFF), { lat: 43.6, lng: -79.3 }));
    await assertFails(getDoc(doc(as(STAFF), 'userLocations', STAFF)));
  });
});
