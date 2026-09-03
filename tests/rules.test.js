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

// Fixed, not Timestamp.now(), so a test that rewrites the whole organization
// document can reproduce createdAt exactly. The update rules pin createdAt,
// and a freshly generated "now" is a changed createdAt, which is a denial
// that says nothing about the clause the test is actually there to check.
const ORG_CREATED_AT = Timestamp.fromDate(new Date('2026-08-01T12:00:00Z'));

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
      createdAt: ORG_CREATED_AT, createdBy: OWNER,
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
  test('a redacted notice keeps its shape for later edits', async () => {
    // The retention job writes redactedAt through the Admin SDK. If the field
    // were not on the allowlist, every later client write would be rejected.
    await seedNotice('n1', { redactedAt: Timestamp.now(), deceasedName: null });
    await assertSucceeds(updateDoc(doc(as(STAFF), 'notices', 'n1'), {
      instructions: 'Corrected after redaction.',
      version: 2,
      lastEditedBy: STAFF,
    }));
  });

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

describe('sample data is removable, and nothing else becomes removable with it', () => {
  // The admin portal adds and removes testing data. That needs a delete
  // permission on two collections that otherwise allow none, so the exception
  // has to be provably narrow: it is keyed on a `sample-` id prefix, which a
  // Firestore-generated id can never have.

  const sampleOrg = async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', 'sample-masjid'), {
        name: 'Sample Masjid', type: 'masjid', address: '1 Example St',
        city: 'Toronto', province: 'ON', lat: 43.65, lng: -79.38, cell: 'dpz83',
        verificationStatus: 'verified', ownerUid: ADMIN, staffUids: [ADMIN],
        createdAt: Timestamp.now(), createdBy: ADMIN,
      });
    });
  };

  test('an admin can delete a sample organization', async () => {
    await sampleOrg();
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'organizations', 'sample-masjid')));
  });

  test('an admin still cannot delete a real organization', async () => {
    // The whole point of the prefix. VERIFIED_ORG has an ordinary id.
    await assertFails(deleteDoc(doc(as(ADMIN), 'organizations', VERIFIED_ORG)));
    await assertFails(deleteDoc(doc(as(OWNER), 'organizations', VERIFIED_ORG)));
  });

  test('nobody but an admin can delete a sample organization', async () => {
    await sampleOrg();
    for (const who of [OWNER, STAFF, OUTSIDER]) {
      await assertFails(deleteDoc(doc(as(who), 'organizations', 'sample-masjid')));
    }
    await assertFails(deleteDoc(doc(anon(), 'organizations', 'sample-masjid')));
  });

  test('an admin can delete a published sample notice', async () => {
    await seedNotice('sample-notice', { status: 'published', isPublic: true });
    await assertSucceeds(deleteDoc(doc(as(ADMIN), 'notices', 'sample-notice')));
  });

  test('a real published notice still cannot be deleted by anyone', async () => {
    // It is cancelled, never deleted: a shared link must explain itself
    // rather than go dead, and the audit trail has to keep pointing at
    // something.
    await seedNotice('real-notice', { status: 'published', isPublic: true });
    for (const who of [ADMIN, OWNER, STAFF, OUTSIDER]) {
      await assertFails(deleteDoc(doc(as(who), 'notices', 'real-notice')));
    }
  });

  test('an id that merely contains "sample-" is not enough', async () => {
    await seedNotice('not-a-sample-notice', { status: 'published', isPublic: true });
    await assertFails(deleteDoc(doc(as(ADMIN), 'notices', 'not-a-sample-notice')));
  });
});

describe('platform settings', () => {
  test('anyone may read a setting, since the app needs it before sign-in', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'platformSettings', 'sampleData'), {
        enabled: true, updatedAt: Timestamp.now(), updatedBy: ADMIN,
      });
    });
    await assertSucceeds(getDoc(doc(anon(), 'platformSettings', 'sampleData')));
  });

  test('only a platform admin may change one', async () => {
    const value = { enabled: false, updatedAt: serverTimestamp(), updatedBy: OUTSIDER };
    await assertFails(setDoc(doc(as(OUTSIDER), 'platformSettings', 'sampleData'), value));
    await assertFails(setDoc(doc(as(OWNER), 'platformSettings', 'sampleData'),
      { ...value, updatedBy: OWNER }));
    await assertSucceeds(setDoc(doc(as(ADMIN), 'platformSettings', 'sampleData'),
      { enabled: false, updatedAt: serverTimestamp(), updatedBy: ADMIN }));
  });

  test('an admin cannot attribute a change to someone else, or smuggle in fields', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'sampleData'),
      { enabled: false, updatedAt: serverTimestamp(), updatedBy: OWNER }));
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'sampleData'),
      { enabled: false, updatedAt: serverTimestamp(), updatedBy: ADMIN, extra: 'x' }));
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'sampleData'),
      { enabled: 'yes', updatedAt: serverTimestamp(), updatedBy: ADMIN }));
  });

  test('settings are never deleted, only flipped', async () => {
    await assertFails(deleteDoc(doc(as(ADMIN), 'platformSettings', 'sampleData')));
  });
});

describe('the platform settings document the admin portal edits', () => {
  // /platformSettings/platform holds everything the Platform Settings section
  // writes. It is deliberately not a free-form document: the field list is
  // closed, every field is type checked, every number is bounded and every
  // string has a length limit. Nothing in it decides who may read or write
  // anything, which is why a platform administrator is allowed to change it
  // at all.

  const settings = (overrides = {}) => ({
    notificationRadiusKm: 25,
    reminderMinutes: 120,
    organizationTypes: ['masjid', 'funeral_home'],
    supportEmail: 'support@example.com',
    privacyEmail: 'privacy@example.com',
    optionalDeceasedName: true,
    optionalBurialLocation: true,
    optionalInstructions: true,
    announcementEnabled: false,
    announcementMessage: '',
    updatedAt: serverTimestamp(),
    updatedBy: ADMIN,
    ...overrides,
  });

  const write = (who, overrides) =>
    setDoc(doc(as(who), 'platformSettings', 'platform'),
      settings({ updatedBy: who, ...overrides }));

  test('a platform admin may write a complete, well-formed document', async () => {
    await assertSucceeds(write(ADMIN));
  });

  test('anyone may read it, since the announcement shows before sign-in', async () => {
    await assertSucceeds(write(ADMIN));
    await assertSucceeds(getDoc(doc(anon(), 'platformSettings', 'platform')));
  });

  test('nobody but a platform admin may write it', async () => {
    await assertFails(write(OUTSIDER));
    await assertFails(write(OWNER));
    await assertFails(write(STAFF));
  });

  test('an admin cannot attribute the change to someone else', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'platform'),
      settings({ updatedBy: OWNER })));
  });

  test('an unknown field is rejected outright', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'platform'),
      settings({ adminUids: [ADMIN] })));
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'platform'),
      settings({ apiKey: 'secret' })));
  });

  test('a missing field is rejected: the form always sends the whole document', async () => {
    const partial = settings();
    delete partial.supportEmail;
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'platform'), partial));
  });

  test('every field is type checked', async () => {
    for (const wrong of [
      { notificationRadiusKm: '25' },
      { reminderMinutes: 12.5 },
      { organizationTypes: 'masjid' },
      { supportEmail: 42 },
      { privacyEmail: null },
      { optionalDeceasedName: 'yes' },
      { optionalBurialLocation: 1 },
      { optionalInstructions: null },
      { announcementEnabled: 'on' },
      { announcementMessage: 7 },
    ]) {
      await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'platform'),
        settings(wrong)));
    }
  });

  test('numbers are bounded, so a setting cannot be driven to nonsense', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'platform'),
      settings({ notificationRadiusKm: 0 })));
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'platform'),
      settings({ notificationRadiusKm: 5000 })));
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'platform'),
      settings({ reminderMinutes: -1 })));
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'platform'),
      settings({ reminderMinutes: 100000 })));
  });

  test('the announcement is a short notice, not a document', async () => {
    await assertSucceeds(setDoc(doc(as(ADMIN), 'platformSettings', 'platform'),
      settings({ announcementEnabled: true, announcementMessage: 'x'.repeat(280) })));
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'platform'),
      settings({ announcementEnabled: true, announcementMessage: 'x'.repeat(281) })));
  });

  test('a contact address cannot be an essay either', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'platform'),
      settings({ supportEmail: `${'a'.repeat(120)}@example.com` })));
  });

  test('organization types must come from the enum the org rule accepts', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'platform'),
      settings({ organizationTypes: ['masjid', 'charity'] })));
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'platform'),
      settings({ organizationTypes: [] })));
  });

  test('it is never deleted', async () => {
    await assertSucceeds(write(ADMIN));
    await assertFails(deleteDoc(doc(as(ADMIN), 'platformSettings', 'platform')));
  });

  test('a settings key nobody knows about cannot be created at all', async () => {
    await assertFails(setDoc(doc(as(ADMIN), 'platformSettings', 'somethingElse'),
      { enabled: true, updatedAt: serverTimestamp(), updatedBy: ADMIN }));
  });
});

describe('updatedBy on an organization', () => {
  // Optional, so every writer that predates it keeps working, and pinned to
  // the caller when present, so the audit trigger can name a real account for
  // a suspension or a staff removal instead of recording that something
  // happened and nobody did it.

  const orgFields = (overrides = {}) => ({
    name: 'Test Masjid', type: 'masjid',
    address: '100 Example St', city: 'Toronto', province: 'ON',
    lat: 43.6532, lng: -79.3832, cell: 'dpz83',
    verificationStatus: 'verified',
    ownerUid: OWNER, staffUids: [OWNER, STAFF],
    createdAt: ORG_CREATED_AT, createdBy: OWNER,
    ...overrides,
  });

  test('an admin may stamp their own uid on a change', async () => {
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'organizations', VERIFIED_ORG),
      { verificationStatus: 'suspended', statusReason: 'x', updatedBy: ADMIN }));
  });

  test('an admin cannot stamp somebody else on it', async () => {
    await assertFails(updateDoc(doc(as(ADMIN), 'organizations', VERIFIED_ORG),
      { verificationStatus: 'suspended', statusReason: 'x', updatedBy: OWNER }));
  });

  test('an owner cannot claim an edit was made by an administrator', async () => {
    await assertFails(updateDoc(doc(as(OWNER), 'organizations', VERIFIED_ORG),
      { phone: '416-555-0100', updatedBy: ADMIN }));
    await assertSucceeds(updateDoc(doc(as(OWNER), 'organizations', VERIFIED_ORG),
      { phone: '416-555-0100', updatedBy: OWNER }));
  });

  test('leaving it out is still a valid write', async () => {
    await assertSucceeds(updateDoc(doc(as(OWNER), 'organizations', VERIFIED_ORG),
      { phone: '416-555-0101' }));
    await assertSucceeds(setDoc(doc(as(ADMIN), 'organizations', VERIFIED_ORG),
      orgFields({ verificationStatus: 'suspended' })));
  });
});

describe('a platform admin correcting a notice', () => {
  // The takedown clause was, until now, the only way an administrator could
  // touch a notice, and it forces a cancellation. These pin the narrower
  // clause beside it: correct, hide, restore, and nothing else.

  const corrected = (overrides = {}) => noticeDoc({
    version: 2, lastEditedBy: ADMIN, ...overrides,
  });

  test('an admin can correct a published notice without cancelling it', async () => {
    await seedNotice('n1', { status: 'published', isPublic: true });
    await assertSucceeds(setDoc(doc(as(ADMIN), 'notices', 'n1'),
      corrected({ deceasedName: 'Corrected Name' })));
  });

  test('an admin can pull a notice back to a draft, and publish it again', async () => {
    await seedNotice('n1', { status: 'published', isPublic: true });
    await assertSucceeds(setDoc(doc(as(ADMIN), 'notices', 'n1'),
      corrected({ status: 'draft', isPublic: false })));
    await assertSucceeds(setDoc(doc(as(ADMIN), 'notices', 'n1'),
      corrected({ version: 3, status: 'published', isPublic: true })));
  });

  test('cancellation stays terminal: a cancelled notice cannot be revived', async () => {
    await seedNotice('n1', { status: 'cancelled', isPublic: true });
    await assertFails(setDoc(doc(as(ADMIN), 'notices', 'n1'),
      corrected({ status: 'published', isPublic: true })));
    await assertFails(setDoc(doc(as(ADMIN), 'notices', 'n1'),
      corrected({ status: 'draft', isPublic: false })));
  });

  test('the correcting admin must name themselves', async () => {
    await seedNotice('n1', { status: 'published', isPublic: true });
    await assertFails(setDoc(doc(as(ADMIN), 'notices', 'n1'),
      corrected({ lastEditedBy: OWNER })));
  });

  test('the version counter still has to advance by exactly one', async () => {
    await seedNotice('n1', { status: 'published', isPublic: true });
    await assertFails(setDoc(doc(as(ADMIN), 'notices', 'n1'),
      corrected({ version: 1 })));
    await assertFails(setDoc(doc(as(ADMIN), 'notices', 'n1'),
      corrected({ version: 7 })));
  });

  test('authorship and ownership are still immutable', async () => {
    await seedNotice('n1', { status: 'published', isPublic: true });
    await assertFails(setDoc(doc(as(ADMIN), 'notices', 'n1'),
      corrected({ orgId: PENDING_ORG })));
    await assertFails(setDoc(doc(as(ADMIN), 'notices', 'n1'),
      corrected({ createdBy: ADMIN })));
    await assertFails(setDoc(doc(as(ADMIN), 'notices', 'n1'),
      corrected({ createdAt: Timestamp.fromDate(new Date('2020-01-01T00:00:00Z')) })));
  });

  test('a private field still cannot be smuggled onto the public document', async () => {
    await seedNotice('n1', { status: 'published', isPublic: true });
    await assertFails(setDoc(doc(as(ADMIN), 'notices', 'n1'),
      corrected({ familyPhone: '416-555-0100' })));
  });

  test('nobody who is not an admin gets this clause', async () => {
    await seedNotice('n1', { status: 'published', isPublic: true });
    await assertFails(setDoc(doc(as(OUTSIDER), 'notices', 'n1'),
      noticeDoc({ version: 2, lastEditedBy: OUTSIDER })));
  });
});

describe('following is a community action, not a coordinator one', () => {
  // Following is stored on the device (public/js/follows.js) and writes
  // nothing, so the only thing it needs from the backend is the ability to
  // read the list of verified organizations. These pin that this stays true
  // for someone with no account and no relationship to any organization,
  // because the moment it needs more, following starts failing with a
  // message about publishing rights.

  test('a visitor with no account can list verified organizations', async () => {
    await assertSucceeds(getDocs(query(collection(anon(), 'organizations'),
      where('verificationStatus', '==', 'verified'))));
  });

  test('a signed-in community member can list verified organizations', async () => {
    // OUTSIDER is staff of nothing verified and is not an admin.
    await assertSucceeds(getDocs(query(collection(as(OUTSIDER), 'organizations'),
      where('verificationStatus', '==', 'verified'))));
  });

  test('a visitor can open one verified organization directly', async () => {
    // The /o/{id} page, reached by following a masjid.
    await assertSucceeds(getDoc(doc(anon(), 'organizations', VERIFIED_ORG)));
  });

  test('unverified organizations stay invisible to a community member', async () => {
    await assertFails(getDoc(doc(anon(), 'organizations', PENDING_ORG)));
    await assertFails(getDoc(doc(as(STAFF), 'organizations', PENDING_ORG)));
  });

  test('reading an organization grants nothing over it', async () => {
    // The separation that matters: a community member may read every verified
    // organization, and must still not be able to edit one, publish for one,
    // or add themselves to its staff.
    await assertFails(updateDoc(doc(as(OUTSIDER), 'organizations', VERIFIED_ORG), {
      name: 'Renamed By A Follower',
    }));
    await assertFails(updateDoc(doc(as(OUTSIDER), 'organizations', VERIFIED_ORG), {
      staffUids: [OWNER, STAFF, OUTSIDER],
    }));
    await assertFails(addDoc(collection(as(OUTSIDER), 'notices'), {
      orgId: VERIFIED_ORG, orgName: 'Test Masjid', status: 'published',
      isPublic: true, showDeceasedName: false,
      janazahAt: Timestamp.fromDate(new Date(Date.now() + 86400000)),
      timeZone: 'America/Toronto',
      prayerLocation: { name: 'Hall', address: '1 A St', lat: 43.6, lng: -79.3, cell: 'dpz83' },
      version: 1, createdBy: OUTSIDER, createdAt: serverTimestamp(),
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

  test('an admin cannot attribute a verification to a different account', async () => {
    // The server-written audit trail reads verifiedBy to say who verified an
    // organization. If a client could set it to any uid it likes, that
    // attribution would be worthless.
    await assertFails(updateDoc(doc(as(ADMIN), 'organizations', PENDING_ORG), {
      verificationStatus: 'verified', verifiedBy: OWNER,
      verifiedAt: serverTimestamp(),
    }));
  });

  test('an admin editing something unrelated does not have to re-supply verifiedBy', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'organizations', PENDING_ORG), {
        verificationStatus: 'verified', verifiedBy: ADMIN, verifiedAt: Timestamp.now(),
      });
    });
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'organizations', PENDING_ORG), {
      statusReason: 'Phone number on file was out of date; corrected.',
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

  test('a registration may carry the country the address picker resolved', async () => {
    // `country` was added to orgKeys when the form stopped asking for
    // coordinates and started resolving a real address. Additive only: it
    // widens what may be stored, and grants nothing.
    await assertSucceeds(addDoc(collection(as(OUTSIDER), 'organizations'), {
      name: 'Geocoded Masjid', type: 'masjid', address: '100 Queen St W',
      city: 'Toronto', province: 'ON', postalCode: 'M5H 2N2', country: 'Canada',
      lat: 43.6532, lng: -79.3832, cell: 'dpz83',
      verificationStatus: 'pending',
      ownerUid: OUTSIDER, staffUids: [OUTSIDER],
      createdAt: serverTimestamp(), createdBy: OUTSIDER,
    }));
  });

  test('coordinates are still required, and still have to be real numbers', async () => {
    // The form no longer shows lat/lng, but they remain the basis of every
    // nearby feature. Rules stay the backstop against an organization that
    // no distance calculation could ever place.
    const base = {
      name: 'No Coords Masjid', type: 'masjid', address: '1 A St',
      city: 'Toronto', province: 'ON', cell: 'dpz83',
      verificationStatus: 'pending',
      ownerUid: OUTSIDER, staffUids: [OUTSIDER],
      createdAt: serverTimestamp(), createdBy: OUTSIDER,
    };
    await assertFails(addDoc(collection(as(OUTSIDER), 'organizations'), base));
    await assertFails(addDoc(collection(as(OUTSIDER), 'organizations'),
      { ...base, lat: '43.6532', lng: '-79.3832' }));
    await assertFails(addDoc(collection(as(OUTSIDER), 'organizations'),
      { ...base, lat: 91, lng: -79.3832 }));
  });

  test('a rejected organization cannot promote itself back into the queue', async () => {
    // Being turned down is the strongest motive anyone has to try this, and
    // the applicant still owns the document afterwards, so it is worth
    // proving rather than assuming the pending case covers it.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'organizations', PENDING_ORG), {
        verificationStatus: 'rejected', statusReason: 'Could not confirm.',
      });
    });
    for (const status of ['pending', 'verified']) {
      await assertFails(updateDoc(doc(as(OUTSIDER), 'organizations', PENDING_ORG), {
        verificationStatus: status,
      }));
    }
    // Nor by clearing the administrator's reason so the decline reads as
    // never having happened.
    await assertFails(updateDoc(doc(as(OUTSIDER), 'organizations', PENDING_ORG), {
      statusReason: '',
    }));
  });

  test('a suspended organization cannot reinstate itself', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'organizations', VERIFIED_ORG), {
        verificationStatus: 'suspended', statusReason: 'Under review.',
      });
    });
    await assertFails(updateDoc(doc(as(OWNER), 'organizations', VERIFIED_ORG), {
      verificationStatus: 'verified',
    }));
  });

  test('a non-owner staff member cannot change verification status', async () => {
    await assertFails(updateDoc(doc(as(STAFF), 'organizations', VERIFIED_ORG), {
      verificationStatus: 'suspended',
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

describe('staff join requests', () => {
  const requestDoc = (uid, overrides = {}) => ({
    uid, email: 'someone@example.com', displayName: 'Someone',
    status: 'pending', requestedAt: serverTimestamp(),
    ...overrides,
  });

  test('the owner can approve a request, attributed to themselves', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', VERIFIED_ORG, 'staffRequests', OUTSIDER),
        requestDoc(OUTSIDER));
    });
    await assertSucceeds(updateDoc(
      doc(as(OWNER), 'organizations', VERIFIED_ORG, 'staffRequests', OUTSIDER),
      { status: 'approved', decidedBy: OWNER, decidedAt: serverTimestamp() }));
  });

  test('the owner cannot attribute the decision to someone else', async () => {
    // Same reasoning as verifiedBy: the audit trail reads decidedBy to say
    // who approved or rejected a request, so it has to name the real actor.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', VERIFIED_ORG, 'staffRequests', OUTSIDER),
        requestDoc(OUTSIDER));
    });
    await assertFails(updateDoc(
      doc(as(OWNER), 'organizations', VERIFIED_ORG, 'staffRequests', OUTSIDER),
      { status: 'approved', decidedBy: STAFF, decidedAt: serverTimestamp() }));
  });

  test('a platform admin can reject a request, attributed to themselves', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', VERIFIED_ORG, 'staffRequests', OUTSIDER),
        requestDoc(OUTSIDER));
    });
    await assertSucceeds(updateDoc(
      doc(as(ADMIN), 'organizations', VERIFIED_ORG, 'staffRequests', OUTSIDER),
      { status: 'rejected', decidedBy: ADMIN, decidedAt: serverTimestamp() }));
  });

  test('a non-owner staff member cannot decide a request at all', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', VERIFIED_ORG, 'staffRequests', OUTSIDER),
        requestDoc(OUTSIDER));
    });
    await assertFails(updateDoc(
      doc(as(STAFF), 'organizations', VERIFIED_ORG, 'staffRequests', OUTSIDER),
      { status: 'approved', decidedBy: STAFF, decidedAt: serverTimestamp() }));
  });

  test('a user can request access to an organization for themselves only', async () => {
    await assertSucceeds(setDoc(
      doc(as(OUTSIDER), 'organizations', VERIFIED_ORG, 'staffRequests', OUTSIDER),
      requestDoc(OUTSIDER)));
    await assertFails(setDoc(
      doc(as(OUTSIDER), 'organizations', VERIFIED_ORG, 'staffRequests', STAFF),
      requestDoc(STAFF)));
  });
});

describe('audit trail integrity', () => {
  // Entries are written only by Cloud Functions triggers through the Admin
  // SDK (functions/index.js, functions/lib/audit-log.js), which bypasses
  // rules entirely. That is what makes the trail unforgeable: it is not that
  // a client's write is carefully constrained, it is that no client write is
  // accepted at all, from anyone, in any role, including a platform admin.
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

  test('no client, of any role, can create an entry', async () => {
    for (const db of [anon(), as(STAFF), as(OWNER), as(ADMIN)]) {
      await assertFails(addDoc(collection(db, 'auditLog'), entry()));
    }
  });

  test('a well-formed, self-attributed, correctly-timed entry still cannot be created', async () => {
    // Confirms the closure is unconditional: this is exactly the shape a
    // legitimate client write used to take, and it is rejected purely for
    // being a client write, not for any longer being malformed.
    await assertFails(addDoc(collection(as(STAFF), 'auditLog'), entry({ actorUid: STAFF })));
  });

  test('an existing entry cannot be altered, by anyone', async () => {
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

  test('an administrator can resolve a report but not rewrite it', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'reports', 'r1'),
        { ...report(), createdAt: Timestamp.now() });
    });

    await assertSucceeds(updateDoc(doc(as(ADMIN), 'reports', 'r1'), {
      status: 'resolved', resolution: 'Notice taken down.',
      resolvedBy: ADMIN, resolvedAt: serverTimestamp(),
    }));

    // The reported facts are not the administrator's to change.
    await assertFails(updateDoc(doc(as(ADMIN), 'reports', 'r1'), {
      status: 'dismissed', reason: 'other', resolvedBy: ADMIN,
    }));
    await assertFails(updateDoc(doc(as(ADMIN), 'reports', 'r1'), {
      status: 'dismissed', noticeId: 'somethingElse', resolvedBy: ADMIN,
    }));
    await assertFails(updateDoc(doc(as(ADMIN), 'reports', 'r1'), {
      status: 'dismissed', reportedBy: ADMIN, resolvedBy: ADMIN,
    }));
    // And the outcome must be attributed to whoever actually decided it.
    await assertFails(updateDoc(doc(as(ADMIN), 'reports', 'r1'), {
      status: 'dismissed', resolvedBy: STAFF,
    }));
  });

  test('a member cannot resolve their own report', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'reports', 'r1'),
        { ...report(), createdAt: Timestamp.now() });
    });
    await assertFails(updateDoc(doc(as(OUTSIDER), 'reports', 'r1'),
      { status: 'resolved', resolvedBy: OUTSIDER }));
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

describe('email preferences', () => {
  const prefs = (overrides = {}) => ({
    email: 'someone@example.com', followedMasjidPosts: true,
    noticeUpdates: true, updatedAt: serverTimestamp(),
    updatedBy: OUTSIDER, ...overrides,
  });

  test('a signed-in person can create their own preferences', async () => {
    await assertSucceeds(setDoc(doc(as(OUTSIDER), 'emailPreferences', OUTSIDER), prefs()));
  });

  test('a person can read and update their own preferences', async () => {
    await setDoc(doc(as(OUTSIDER), 'emailPreferences', OUTSIDER), prefs());
    await assertSucceeds(getDoc(doc(as(OUTSIDER), 'emailPreferences', OUTSIDER)));
    await assertSucceeds(updateDoc(doc(as(OUTSIDER), 'emailPreferences', OUTSIDER),
      { nearbyAlerts: true, updatedAt: serverTimestamp(), updatedBy: OUTSIDER }));
  });

  test('a person can delete their own preferences, withdrawing consent', async () => {
    await setDoc(doc(as(OUTSIDER), 'emailPreferences', OUTSIDER), prefs());
    await assertSucceeds(deleteDoc(doc(as(OUTSIDER), 'emailPreferences', OUTSIDER)));
  });

  test('nobody can write another person’s preferences', async () => {
    await assertFails(setDoc(doc(as(STAFF), 'emailPreferences', OUTSIDER), prefs()));
  });

  test('nobody, not even a platform admin, can read another person’s preferences', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'emailPreferences', OUTSIDER), prefs());
    });
    await assertFails(getDoc(doc(as(STAFF), 'emailPreferences', OUTSIDER)));
    await assertFails(getDoc(doc(as(ADMIN), 'emailPreferences', OUTSIDER)));
  });

  test('an unauthenticated visitor cannot write or read a preference record', async () => {
    await assertFails(setDoc(doc(anon(), 'emailPreferences', OUTSIDER), prefs()));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'emailPreferences', OUTSIDER), prefs());
    });
    await assertFails(getDoc(doc(anon(), 'emailPreferences', OUTSIDER)));
  });

  test('the collection cannot be listed by anyone', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'emailPreferences', OUTSIDER), prefs());
    });
    await assertFails(getDocs(collection(as(OUTSIDER), 'emailPreferences')));
    await assertFails(getDocs(collection(as(ADMIN), 'emailPreferences')));
  });

  test('an unknown key is rejected', async () => {
    await assertFails(setDoc(doc(as(OUTSIDER), 'emailPreferences', OUTSIDER),
      prefs({ phone: '555-0100' })));
  });

  test('a preference record with no email address is rejected', async () => {
    const { email, ...rest } = prefs();
    await assertFails(setDoc(doc(as(OUTSIDER), 'emailPreferences', OUTSIDER), rest));
  });

  test('an oversized email string is rejected', async () => {
    await assertFails(setDoc(doc(as(OUTSIDER), 'emailPreferences', OUTSIDER),
      prefs({ email: `${'x'.repeat(250)}@example.com` })));
  });

  test('a category flag must be a boolean, not a string or number', async () => {
    await assertFails(setDoc(doc(as(OUTSIDER), 'emailPreferences', OUTSIDER),
      prefs({ followedMasjidPosts: 'yes' })));
    await assertFails(setDoc(doc(as(OUTSIDER), 'emailPreferences', OUTSIDER),
      prefs({ nearbyAlerts: 1 })));
  });

  test('updatedBy is pinned to whoever is actually writing', async () => {
    await assertFails(setDoc(doc(as(OUTSIDER), 'emailPreferences', OUTSIDER),
      prefs({ updatedBy: STAFF })));
  });

  test('an anonymous session can create its own preferences, the same as filing a report', async () => {
    // firestore.rules cannot tell an anonymous Firebase Auth session from any
    // other: both are simply request.auth with a uid, which is exactly what
    // makes this collection reachable without an account, the same way
    // /reports already is.
    await assertSucceeds(setDoc(doc(as('anon-uid'), 'emailPreferences', 'anon-uid'),
      prefs({ updatedBy: 'anon-uid' })));
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
  test('the notification rate counter cannot be reset by a client', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orgNotificationRates', VERIFIED_ORG),
        { windowStart: Date.now(), count: 99 });
    });
    for (const db of [anon(), as(STAFF), as(OWNER), as(ADMIN)]) {
      await assertFails(getDoc(doc(db, 'orgNotificationRates', VERIFIED_ORG)));
      await assertFails(setDoc(doc(db, 'orgNotificationRates', VERIFIED_ORG), { count: 0 }));
    }
  });

  test('notification bookkeeping is closed to every client', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'notificationRuns', 'n1_published_v1'),
        { noticeId: 'n1', kind: 'published' });
    });
    for (const db of [anon(), as(STAFF), as(ADMIN)]) {
      await assertFails(getDoc(doc(db, 'notificationRuns', 'n1_published_v1')));
      await assertFails(setDoc(doc(db, 'notificationRuns', 'forged'), { noticeId: 'n1' }));
    }
  });

  test('there is nowhere for a user position to be stored', async () => {
    // The nearby feature must stay device-side. If a future change adds a
    // location collection, this fails and forces the decision to be explicit.
    for (const name of ['userLocations', 'locations', 'devices', 'presence']) {
      await assertFails(setDoc(doc(as(STAFF), name, STAFF), { lat: 43.6, lng: -79.3 }));
      await assertFails(setDoc(doc(anon(), name, 'x'), { lat: 43.6, lng: -79.3 }));
    }
  });

  test('an unmatched collection is not writable', async () => {
    await assertFails(setDoc(doc(as(STAFF), 'userLocations', STAFF), { lat: 43.6, lng: -79.3 }));
    await assertFails(getDoc(doc(as(STAFF), 'userLocations', STAFF)));
  });
});

// ---------------------------------------------------------------------------

describe('the verification application is private', () => {
  // Section 15 of the requirement, enforced rather than promised: applicant
  // name, work email, phone and written explanation must never be reachable
  // by the community, by other organizations, or by a public Firestore read,
  // and approving the organization must not change that.

  const submission = (uid, overrides = {}) => ({
    applicantName: 'Yusuf Siddiqui',
    applicantRole: 'imam',
    applicantEmail: 'personal@example.com',
    workEmail: 'imam@testmasjid.ca',
    phone: '+1 416 555 0100',
    roleExplanation: 'I lead the daily prayers and handle funeral arrangements.',
    authorized: true,
    emailVerifiedAtSubmit: false,
    verificationMethods: ['listed_on_website', 'work_email'],
    submittedBy: uid,
    submittedAt: Timestamp.now(),
    ...overrides,
  });

  async function seedApplication(orgId, uid, docId = 'submitted') {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', orgId, 'application', docId),
        submission(uid));
    });
  }

  test('the owner can submit an application for their own organization', async () => {
    await assertSucceeds(setDoc(
      doc(as(OUTSIDER), 'organizations', PENDING_ORG, 'application', 'submitted'),
      submission(OUTSIDER)));
  });

  test('the owner can read back and correct their own submission', async () => {
    await seedApplication(PENDING_ORG, OUTSIDER);
    await assertSucceeds(getDoc(
      doc(as(OUTSIDER), 'organizations', PENDING_ORG, 'application', 'submitted')));
    // "Request more information" asks them to do exactly this.
    await assertSucceeds(setDoc(
      doc(as(OUTSIDER), 'organizations', PENDING_ORG, 'application', 'submitted'),
      submission(OUTSIDER, { roleExplanation: 'Adding the detail you asked for.' })));
  });

  test('a platform admin can read it', async () => {
    await seedApplication(PENDING_ORG, OUTSIDER);
    await assertSucceeds(getDoc(
      doc(as(ADMIN), 'organizations', PENDING_ORG, 'application', 'submitted')));
  });

  test('an anonymous visitor cannot read it', async () => {
    await seedApplication(PENDING_ORG, OUTSIDER);
    await assertFails(getDoc(
      doc(anon(), 'organizations', PENDING_ORG, 'application', 'submitted')));
  });

  test('a signed-in community user cannot read it', async () => {
    await seedApplication(PENDING_ORG, OUTSIDER);
    await assertFails(getDoc(
      doc(as(STAFF), 'organizations', PENDING_ORG, 'application', 'submitted')));
  });

  test('another organization’s owner cannot read it', async () => {
    await seedApplication(PENDING_ORG, OUTSIDER);
    await assertFails(getDoc(
      doc(as(OWNER), 'organizations', PENDING_ORG, 'application', 'submitted')));
  });

  test('approving the organization does not make the application public', async () => {
    // The whole reason this data is not a set of fields on the organization
    // document: that document becomes world-readable on approval.
    await seedApplication(VERIFIED_ORG, OWNER);
    await assertSucceeds(getDoc(doc(anon(), 'organizations', VERIFIED_ORG)));
    await assertFails(getDoc(
      doc(anon(), 'organizations', VERIFIED_ORG, 'application', 'submitted')));
  });

  test('non-owner staff of the same organization cannot read it', async () => {
    // Staff are added by the owner and are not necessarily the applicant.
    // Their personal contact details are not shared sideways.
    await seedApplication(VERIFIED_ORG, OWNER);
    await assertFails(getDoc(
      doc(as(STAFF), 'organizations', VERIFIED_ORG, 'application', 'submitted')));
  });

  test('a user cannot file an application against an organization they do not own', async () => {
    await assertFails(setDoc(
      doc(as(STAFF), 'organizations', VERIFIED_ORG, 'application', 'submitted'),
      submission(STAFF)));
    await assertFails(setDoc(
      doc(as(OUTSIDER), 'organizations', VERIFIED_ORG, 'application', 'submitted'),
      submission(OUTSIDER)));
  });

  test('a submission cannot name someone else as the submitter', async () => {
    await assertFails(setDoc(
      doc(as(OUTSIDER), 'organizations', PENDING_ORG, 'application', 'submitted'),
      submission(OWNER)));
  });

  test('an unauthorized submission is refused at write time', async () => {
    // The authorization declaration is the substance of the checkbox, so it
    // is checked here rather than only in the form.
    await assertFails(setDoc(
      doc(as(OUTSIDER), 'organizations', PENDING_ORG, 'application', 'submitted'),
      submission(OUTSIDER, { authorized: false })));
  });

  test('a field nobody defined cannot be smuggled in', async () => {
    await assertFails(setDoc(
      doc(as(OUTSIDER), 'organizations', PENDING_ORG, 'application', 'submitted'),
      submission(OUTSIDER, { verificationStatus: 'verified' })));
    await assertFails(setDoc(
      doc(as(OUTSIDER), 'organizations', PENDING_ORG, 'application', 'submitted'),
      submission(OUTSIDER, { trustScore: 100 })));
  });

  test('a submission without the optional fields is still valid', async () => {
    await assertSucceeds(setDoc(
      doc(as(OUTSIDER), 'organizations', PENDING_ORG, 'application', 'submitted'), {
        applicantName: 'A Name',
        applicantRole: 'other',
        applicantRoleOther: 'Volunteer funeral coordinator',
        applicantEmail: 'a@example.com',
        authorized: true,
        emailVerifiedAtSubmit: false,
        submittedBy: OUTSIDER,
        submittedAt: Timestamp.now(),
      }));
  });

  test('the confirmed-email signal is pinned to the auth token', async () => {
    // The reviewer's panel reads this as "sign-in email confirmed". A value
    // the browser could simply set to true would be worth nothing, so the
    // rule compares it against the token rather than trusting the document.
    await assertFails(setDoc(
      doc(as(OUTSIDER), 'organizations', PENDING_ORG, 'application', 'submitted'),
      submission(OUTSIDER, { emailVerifiedAtSubmit: true })));

    // With a genuinely confirmed token, true is accepted and false is not.
    const verified = env.authenticatedContext(OUTSIDER, { email_verified: true }).firestore();
    await assertSucceeds(setDoc(
      doc(verified, 'organizations', PENDING_ORG, 'application', 'submitted'),
      submission(OUTSIDER, { emailVerifiedAtSubmit: true })));
    await assertFails(setDoc(
      doc(verified, 'organizations', PENDING_ORG, 'application', 'submitted'),
      submission(OUTSIDER, { emailVerifiedAtSubmit: false })));
  });

  test('confirming an inbox does not verify the organization', async () => {
    // Section 4 of the requirement, enforced rather than described: a
    // confirmed sign-in email must not shortcut anything. The organization
    // is still pending, still unable to publish.
    const verified = env.authenticatedContext(OUTSIDER, { email_verified: true }).firestore();
    await assertSucceeds(setDoc(
      doc(verified, 'organizations', PENDING_ORG, 'application', 'submitted'),
      submission(OUTSIDER, { emailVerifiedAtSubmit: true })));
    await assertFails(updateDoc(
      doc(verified, 'organizations', PENDING_ORG), { verificationStatus: 'verified' }));
  });

  test('evidence cannot be deleted from a client, by anyone', async () => {
    await seedApplication(PENDING_ORG, OUTSIDER);
    for (const db of [as(OUTSIDER), as(ADMIN), as(STAFF), anon()]) {
      await assertFails(deleteDoc(
        doc(db, 'organizations', PENDING_ORG, 'application', 'submitted')));
    }
  });
});

describe('internal review notes', () => {
  test('an admin can write and read them', async () => {
    await assertSucceeds(setDoc(
      doc(as(ADMIN), 'organizations', PENDING_ORG, 'application', 'review'),
      { notes: 'Called the listed office number; spoke to the applicant.',
        updatedAt: Timestamp.now(), updatedBy: ADMIN }));
    await assertSucceeds(getDoc(
      doc(as(ADMIN), 'organizations', PENDING_ORG, 'application', 'review')));
  });

  test('the applicant cannot read the notes written about them', async () => {
    // A reviewer has to be able to write frankly.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', PENDING_ORG, 'application', 'review'),
        { notes: 'Unable to confirm by phone.', updatedAt: Timestamp.now(), updatedBy: ADMIN });
    });
    await assertFails(getDoc(
      doc(as(OUTSIDER), 'organizations', PENDING_ORG, 'application', 'review')));
  });

  test('the applicant cannot write notes about themselves', async () => {
    await assertFails(setDoc(
      doc(as(OUTSIDER), 'organizations', PENDING_ORG, 'application', 'review'),
      { notes: 'Verified, looks good.', updatedAt: Timestamp.now(), updatedBy: ADMIN }));
  });

  test('a note cannot be attributed to a different admin', async () => {
    await assertFails(setDoc(
      doc(as(ADMIN), 'organizations', PENDING_ORG, 'application', 'review'),
      { notes: 'x', updatedAt: Timestamp.now(), updatedBy: 'some-other-admin' }));
  });
});

describe('needs_information is an administrator-only status', () => {
  // The middle option between approving on insufficient evidence and
  // declining a masjid that has done nothing wrong. It must behave exactly
  // like pending as far as a client is concerned.

  test('an administrator can ask for more information', async () => {
    await assertSucceeds(updateDoc(doc(as(ADMIN), 'organizations', PENDING_ORG), {
      verificationStatus: 'needs_information',
      statusReason: 'Please tell us who on the board asked you to register this.',
    }));
  });

  test('an owner cannot move their own organization out of it', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'organizations', PENDING_ORG),
        { verificationStatus: 'needs_information' });
    });
    await assertFails(updateDoc(doc(as(OUTSIDER), 'organizations', PENDING_ORG),
      { verificationStatus: 'verified' }));
    await assertFails(updateDoc(doc(as(OUTSIDER), 'organizations', PENDING_ORG),
      { verificationStatus: 'pending' }));
    // Nor can they quietly erase the administrator's question.
    await assertFails(updateDoc(doc(as(OUTSIDER), 'organizations', PENDING_ORG),
      { statusReason: '' }));
  });

  test('an organization in this state still cannot publish', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'organizations', PENDING_ORG),
        { verificationStatus: 'needs_information' });
    });
    await assertFails(addDoc(collection(as(OUTSIDER), 'notices'),
      noticeDoc({ orgId: PENDING_ORG, createdBy: OUTSIDER })));
  });

  test('a registration cannot be created directly in this state', async () => {
    // Otherwise an applicant could land themselves somewhere that looks
    // reviewed without anyone having reviewed it.
    await assertFails(addDoc(collection(as(OUTSIDER), 'organizations'), {
      name: 'Sideways Masjid', type: 'masjid',
      address: '1 St', city: 'Toronto', province: 'ON',
      lat: 43.6, lng: -79.4, cell: 'dpz83',
      verificationStatus: 'needs_information',
      ownerUid: OUTSIDER, staffUids: [OUTSIDER],
      createdAt: Timestamp.now(), createdBy: OUTSIDER,
    }));
  });

  test('the applicant can still correct their application while in it', async () => {
    // The whole point of the status: there is something for them to do.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'organizations', PENDING_ORG),
        { verificationStatus: 'needs_information' });
    });
    await assertSucceeds(setDoc(
      doc(as(OUTSIDER), 'organizations', PENDING_ORG, 'application', 'submitted'), {
        applicantName: 'A Name', applicantRole: 'imam',
        applicantEmail: 'a@example.com', authorized: true,
        emailVerifiedAtSubmit: false, submittedBy: OUTSIDER,
        roleExplanation: 'The detail the administrator asked for.',
        submittedAt: Timestamp.now(),
      }));
  });

  test('a made-up status is still refused', async () => {
    await assertFails(updateDoc(doc(as(ADMIN), 'organizations', PENDING_ORG),
      { verificationStatus: 'super_verified' }));
  });
});
