// Fills a freshly started emulator with a realistic demo, so the app can be
// tried without a Firebase project, a credit card, or any manual setup.
//
//   npm run demo
//
// Writes through the emulator's REST APIs rather than the app, so it needs no
// browser. Those APIs bypass security rules, which is exactly what an
// administrator doing this by hand in the console would also be doing.

import { setTimeout as sleep } from 'node:timers/promises';
import { SAMPLE_ORGS, SAMPLE_NOTICES, SAMPLE_PRIVATE } from '../demo/sample-data.js';

const PROJECT = 'demo-janazah';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const PASSWORD = 'demo-password';

// --- Firestore REST value encoding ------------------------------------------

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}

const toFields = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));

async function put(path, data) {
  const res = await fetch(`${DOCS}/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) throw new Error(`write ${path} failed: ${await res.text()}`);
}

async function createUser(email, displayName) {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, displayName, returnSecureToken: true }),
    });
  const body = await res.json();
  if (!res.ok) throw new Error(`creating ${email} failed: ${JSON.stringify(body)}`);
  return body.localId;
}

async function waitForEmulators() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const [a, f] = await Promise.all([fetch(AUTH), fetch(`${DOCS}/ping`)]);
      if (a.status && f.status) return;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('The emulators did not come up. Is Java installed?');
}

const now = () => new Date();

async function seed() {
  await waitForEmulators();

  const adminUid = await createUser('admin@example.com', 'Platform Admin');
  const coordUid = await createUser('coordinator@example.com', 'Bilal Haddad');
  const memberUid = await createUser('member@example.com', 'Community Member');

  await put(`admins/${adminUid}`, { email: 'admin@example.com' });

  for (const org of SAMPLE_ORGS) {
    const { id, cell, ...rest } = org;
    await put(`organizations/${id}`, {
      ...rest,
      cell,
      ownerUid: coordUid,
      staffUids: [coordUid],
      createdAt: now(),
      createdBy: coordUid,
      ...(org.verificationStatus === 'verified'
        ? { verifiedAt: now(), verifiedBy: adminUid, statusReason: 'Confirmed by phone.' }
        : {}),
    });
  }

  for (const notice of SAMPLE_NOTICES) {
    const { id, ...fields } = notice;
    await put(`notices/${id}`, {
      ...fields,
      createdBy: coordUid,
      createdAt: now(),
      ...(fields.status === 'published' ? { publishedAt: now() } : {}),
      ...(fields.status === 'cancelled'
        ? { cancelledAt: now(), lastEditedBy: coordUid } : {}),
    });
  }

  // The private side of one notice: staff-only, and the thing to check for
  // when testing that nothing leaks onto the public feed.
  await put(`notices/${SAMPLE_PRIVATE.noticeId}/private/details`, {
    familyContactName: SAMPLE_PRIVATE.familyContactName,
    familyContactPhone: SAMPLE_PRIVATE.familyContactPhone,
    internalNotes: SAMPLE_PRIVATE.internalNotes,
    updatedAt: now(),
    updatedBy: coordUid,
  });

  // A draft, which must never appear on the public feed.
  await put('notices/n-draft', {
    orgId: 'org-riverbend',
    orgName: 'Sample Masjid, Riverbend',
    orgType: 'masjid',
    status: 'draft',
    isPublic: false,
    version: 1,
    timeZone: SAMPLE_NOTICES[0].timeZone,
    janazahAt: new Date(Date.now() + 3 * 86400000),
    prayerLocation: SAMPLE_NOTICES[0].prayerLocation,
    createdBy: coordUid,
    createdAt: now(),
  });

  await put('reports/r-demo', {
    noticeId: 'n-withheld',
    reportedBy: memberUid,
    reason: 'incorrect_details',
    detail: 'I think the prayer time is an hour later than posted.',
    status: 'open',
    createdAt: now(),
  });

  for (const [action, targetId] of [
    ['org.registered', 'org-riverbend'], ['org.verified', 'org-riverbend'],
    ['notice.published', 'n-one'], ['notice.published', 'n-withheld'],
    ['notice.cancelled', 'n-cancelled'],
  ]) {
    await put(`auditLog/seed-${action}-${targetId}`, {
      actorUid: action.startsWith('org.verified') ? adminUid : coordUid,
      actorEmail: action.startsWith('org.verified') ? 'admin@example.com' : 'coordinator@example.com',
      action,
      targetType: action.startsWith('org') ? 'organization' : 'notice',
      targetId,
      orgId: 'org-riverbend',
      at: now(),
      details: {},
    });
  }

  console.log(`
────────────────────────────────────────────────────────────────────
  Janazah Notices is running with demo data.

  Community feed      http://127.0.0.1:5000
  Coordinator console http://127.0.0.1:5000/console
  Emulator dashboard  http://127.0.0.1:4000

  Sign in to the console with:

    Coordinator   coordinator@example.com   ${PASSWORD}
                  staff of two verified masajid, one still pending

    Administrator admin@example.com         ${PASSWORD}
                  verification queue, reports, audit log

  Seeded: published notices (one with the name withheld, one
  corrected), one cancelled, one draft, one open report, and one
  notice carrying private family details that must never appear
  publicly.

  All of it is invented. The names are the Arabic equivalent of
  "John Doe", the masajid are named "Sample", and the addresses are
  example streets. Nothing here refers to a real person or place.

  Nothing here touches a real Firebase project. Data is wiped when
  you stop the emulators with Ctrl+C.
────────────────────────────────────────────────────────────────────
`);
}

await seed();

if (process.argv.includes('--hold')) {
  console.log('  Press Ctrl+C to stop.\n');
  await new Promise(() => {});   // keep the emulators up for browsing
}
