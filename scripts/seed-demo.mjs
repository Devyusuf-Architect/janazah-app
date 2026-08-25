// Fills a freshly started emulator with a realistic demo, so the app can be
// tried without a Firebase project, a credit card, or any manual setup.
//
//   npm run demo
//
// Writes through the emulator's REST APIs rather than the app, so it needs no
// browser. Those APIs bypass security rules, which is exactly what an
// administrator doing this by hand in the console would also be doing.

import { setTimeout as sleep } from 'node:timers/promises';

const PROJECT = 'demo-janazah';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto';
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

/** A Date at a given local hour, `dayOffset` days from today. */
function at(dayOffset, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const now = () => new Date();

async function seed() {
  await waitForEmulators();

  const adminUid = await createUser('admin@example.com', 'Platform Admin');
  const coordUid = await createUser('coordinator@example.com', 'Bilal Haddad');
  const memberUid = await createUser('member@example.com', 'Community Member');

  await put(`admins/${adminUid}`, { email: 'admin@example.com' });

  const orgs = [
    {
      id: 'org-alnoor', name: 'Masjid Al-Noor', type: 'masjid',
      address: '480 Danforth Avenue', city: 'Toronto', province: 'ON',
      postalCode: 'M4K 1P6', lat: 43.6772, lng: -79.3480, cell: 'dpz89',
      contactEmail: 'office@alnoor.example', verificationStatus: 'verified',
    },
    {
      id: 'org-icm', name: 'Islamic Centre of Mississauga', type: 'masjid',
      address: '2550 Dundas Street West', city: 'Mississauga', province: 'ON',
      postalCode: 'L5K 2L3', lat: 43.5601, lng: -79.6444, cell: 'dpz2v',
      contactEmail: 'info@icm.example', verificationStatus: 'verified',
    },
    {
      id: 'org-pending', name: 'Brampton Muslim Association', type: 'other',
      address: '10 Gillingham Drive', city: 'Brampton', province: 'ON',
      postalCode: 'L6X 5A5', lat: 43.6890, lng: -79.7600, cell: 'dpz1r',
      contactEmail: 'salam@bma.example', verificationStatus: 'pending',
    },
  ];

  for (const org of orgs) {
    const { id, verificationStatus, ...rest } = org;
    await put(`organizations/${id}`, {
      ...rest,
      verificationStatus,
      ownerUid: coordUid,
      staffUids: [coordUid],
      createdAt: now(),
      createdBy: coordUid,
      ...(verificationStatus === 'verified'
        ? { verifiedAt: now(), verifiedBy: adminUid, statusReason: 'Confirmed by phone.' }
        : {}),
    });
  }

  const notice = (over) => ({
    orgId: 'org-alnoor',
    orgName: 'Masjid Al-Noor',
    orgType: 'masjid',
    status: 'published',
    isPublic: true,
    showDeceasedName: false,
    timeZone: ZONE,
    version: 1,
    createdBy: coordUid,
    createdAt: now(),
    publishedAt: now(),
    ...over,
  });

  await put('notices/n-ahmad', notice({
    deceasedName: 'Ahmad Ibrahim Al-Sayyid',
    showDeceasedName: true,
    janazahAt: at(1, 13, 30),
    timeLabel: 'After Dhuhr',
    prayerLocation: {
      name: 'Masjid Al-Noor, main prayer hall',
      address: '480 Danforth Avenue, Toronto',
      lat: 43.6772, lng: -79.3480, cell: 'dpz89',
    },
    burialLocation: {
      name: 'Meadowvale Cemetery', address: '7732 Mavis Road, Brampton',
      lat: 43.6900, lng: -79.7350,
    },
    instructions: 'Please arrive ten minutes early. Parking is available behind '
      + 'the building and on the side street. The burial follows immediately '
      + 'after the prayer.',
  }));

  // Private side of that notice: never public, staff-only, and the thing to
  // check for when testing that nothing leaks.
  await put('notices/n-ahmad/private/details', {
    familyContactName: 'Yusuf Al-Sayyid',
    familyContactPhone: '416-555-0142',
    internalNotes: 'Family has asked that no photographs be taken.',
    updatedAt: now(),
    updatedBy: coordUid,
  });

  await put('notices/n-withheld', notice({
    janazahAt: at(1, 18, 15),
    prayerLocation: {
      name: 'Masjid Al-Noor, main prayer hall',
      address: '480 Danforth Avenue, Toronto',
      lat: 43.6772, lng: -79.3480, cell: 'dpz89',
    },
    instructions: 'The family has asked that the name not be shared publicly.',
  }));

  await put('notices/n-fatima', notice({
    orgId: 'org-icm',
    orgName: 'Islamic Centre of Mississauga',
    deceasedName: 'Fatima Yusuf',
    showDeceasedName: true,
    janazahAt: at(2, 11, 0),
    prayerLocation: {
      name: 'Islamic Centre of Mississauga',
      address: '2550 Dundas Street West, Mississauga',
      lat: 43.5601, lng: -79.6444, cell: 'dpz2v',
    },
    burialLocation: {
      name: 'Islamic Cemetery of Mississauga',
      address: '1201 Britannia Road West, Mississauga',
      lat: 43.6100, lng: -79.7100,
    },
  }));

  // A cancelled notice, so the cancellation state is visible without waiting.
  await put('notices/n-cancelled', notice({
    deceasedName: 'Ibrahim Musa',
    showDeceasedName: true,
    janazahAt: at(1, 15, 45),
    status: 'cancelled',
    version: 2,
    cancelledAt: now(),
    cancelReason: 'The prayer has moved to another masjid at the family’s request.',
    lastEditedBy: coordUid,
    prayerLocation: {
      name: 'Masjid Al-Noor, main prayer hall',
      address: '480 Danforth Avenue, Toronto',
      lat: 43.6772, lng: -79.3480, cell: 'dpz89',
    },
  }));

  // A draft, which must never appear on the public feed.
  await put('notices/n-draft', notice({
    status: 'draft',
    isPublic: false,
    janazahAt: at(3, 12, 0),
    prayerLocation: {
      name: 'Masjid Al-Noor, main prayer hall',
      address: '480 Danforth Avenue, Toronto',
      lat: 43.6772, lng: -79.3480, cell: 'dpz89',
    },
  }));

  await put('reports/r-demo', {
    noticeId: 'n-withheld',
    reportedBy: memberUid,
    reason: 'incorrect_details',
    detail: 'I think the prayer time is an hour later than posted.',
    status: 'open',
    createdAt: now(),
  });

  for (const [action, targetId] of [
    ['org.registered', 'org-alnoor'], ['org.verified', 'org-alnoor'],
    ['notice.published', 'n-ahmad'], ['notice.published', 'n-withheld'],
    ['notice.cancelled', 'n-cancelled'],
  ]) {
    await put(`auditLog/seed-${action}-${targetId}`, {
      actorUid: action.startsWith('org.verified') ? adminUid : coordUid,
      actorEmail: action.startsWith('org.verified') ? 'admin@example.com' : 'coordinator@example.com',
      action,
      targetType: action.startsWith('org') ? 'organization' : 'notice',
      targetId,
      orgId: 'org-alnoor',
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

  Seeded: 3 published notices (one with the name withheld), one
  cancelled, one draft, one open report, and one notice carrying
  private family details that must never appear publicly.

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
