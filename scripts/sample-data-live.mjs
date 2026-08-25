// Put visibly fictional sample data into a REAL Firebase project, so testers
// see a populated app, and take it out again cleanly before launch.
//
//   npm run sample:add      write it
//   npm run sample:remove   take it out
//
// This is not the local demo. `npm run demo` seeds the emulator and throws it
// away on Ctrl+C; this writes to whichever project `firebase use` points at,
// where the data persists and is visible to anyone who opens the site.
//
// Two properties matter, and both are enforced rather than intended:
//
// 1. It is unmistakably fake. The data is imported verbatim from
//    demo/sample-data.js, which tests/sample-data.test.js already pins:
//    every organization is named "Sample ...", every published name contains
//    "Fulan" (the Arabic equivalent of John Doe), and every address is an
//    example street. A demo of a funeral app must never look like a real
//    funeral, and reusing the checked data is what guarantees that here
//    rather than a second copy nobody is testing.
//
// 2. It comes out completely. Every document is written at a deterministic
//    id prefixed `sample-`, so removal is exact and needs no manifest, and
//    re-running the seed overwrites rather than accumulating duplicates.
//    Nothing else in the database is touched.
//
// Deliberately no marker field on the documents. The rules pin an exact set
// of allowed keys on an organization (orgKeys) and on a public notice, so an
// extra "isSample" field would make every seeded record fail validation the
// moment an administrator tried to edit it. The id prefix carries the same
// information and costs nothing.
//
// Runs through the Admin SDK, which bypasses security rules. That is what
// lets it create organizations already `verified` without going through the
// approval workflow, which is correct for sample data and is also why this
// script can only ever be run by someone holding real project credentials.

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { SAMPLE_ORGS, SAMPLE_NOTICES, SAMPLE_PRIVATE } from '../demo/sample-data.js';

const PREFIX = 'sample-';
const SEED_UID = 'sample-data-seed';

const remove = process.argv.includes('--remove');
const projectId = process.env.GCLOUD_PROJECT
  || process.env.GOOGLE_CLOUD_PROJECT
  || process.env.FIREBASE_PROJECT;

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!getApps().length) {
  try {
    initializeApp({ credential: applicationDefault(), projectId });
  } catch (err) {
    die(`Could not authenticate: ${err.message}\n\n`
      + 'This writes to a real project, so it needs real credentials:\n'
      + '  gcloud auth application-default login\n'
      + 'or set GOOGLE_APPLICATION_CREDENTIALS to a service account key file.\n'
      + 'Set GCLOUD_PROJECT to the project id if it is not picked up.');
  }
}

const db = getFirestore();
const id = (raw) => `${PREFIX}${raw}`;

/** Everything this script has ever written, found by id prefix alone. */
async function seededDocs(collectionName) {
  // A prefix range needs an upper bound that sorts after every "sample-" id:
  // the prefix with its last character incremented ("sample-" -> "sample.").
  // Using the prefix itself as both bounds, the easy mistake here, matches
  // nothing at all and would make removal silently do nothing.
  const end = PREFIX.slice(0, -1)
    + String.fromCharCode(PREFIX.charCodeAt(PREFIX.length - 1) + 1);
  const col = db.collection(collectionName);
  const snap = await col
    .where('__name__', '>=', col.doc(PREFIX))
    .where('__name__', '<', col.doc(end))
    .get();
  // Belt and braces: the range is right, but this deletes from a live
  // database, so nothing without the prefix is handed back regardless of
  // what the query returned.
  return snap.docs.filter((d) => d.id.startsWith(PREFIX));
}

async function removeSample() {
  let removed = 0;

  for (const doc of await seededDocs('notices')) {
    // The private subcollection has to go with it, or a family contact
    // outlives the notice it belonged to.
    const priv = await doc.ref.collection('private').get();
    for (const p of priv.docs) await p.ref.delete();
    await doc.ref.delete();
    removed += 1;
  }

  for (const doc of await seededDocs('organizations')) {
    await doc.ref.delete();
    removed += 1;
  }

  console.log(`\nRemoved ${removed} sample document${removed === 1 ? '' : 's'}.`);
  if (!removed) console.log('Nothing to remove: this project holds no sample data.');
  console.log('Anything not written by this script was left alone.\n');
}

async function addSample() {
  const now = Timestamp.now();

  for (const org of SAMPLE_ORGS) {
    const { id: rawId, ...fields } = org;
    await db.collection('organizations').doc(id(rawId)).set({
      ...fields,
      // Verified outright: the point is a populated app to look at, and the
      // approval workflow is exercised by registering a real organization,
      // not by these.
      verificationStatus: 'verified',
      verifiedAt: now,
      verifiedBy: SEED_UID,
      statusReason: 'Sample data. Not a real organization.',
      ownerUid: SEED_UID,
      staffUids: [SEED_UID],
      createdAt: now,
      createdBy: SEED_UID,
    });
  }

  for (const notice of SAMPLE_NOTICES) {
    const { id: rawId, orgId, orgType, janazahAt, ...fields } = notice;
    await db.collection('notices').doc(id(rawId)).set({
      ...fields,
      orgId: id(orgId),
      janazahAt: Timestamp.fromDate(janazahAt instanceof Date ? janazahAt : new Date(janazahAt)),
      createdBy: SEED_UID,
      createdAt: now,
      publishedAt: now,
    });
  }

  const { noticeId, ...priv } = SAMPLE_PRIVATE;
  await db.collection('notices').doc(id(noticeId))
    .collection('private').doc('details').set(priv);

  console.log(`\nAdded ${SAMPLE_ORGS.length} sample organizations and `
    + `${SAMPLE_NOTICES.length} sample notices.`);
  console.log('Every one is named "Sample ..." or "Fulan ...", so a tester '
    + 'cannot mistake it for a real Janazah.');
  console.log('\nTake it out before launch:  npm run sample:remove\n');
}

const target = projectId || '(the project firebase-admin resolves by default)';
if (/^demo-/.test(String(projectId))) {
  die(`${projectId} is an emulator-only project id. For local sample data use `
    + '`npm run demo`, which seeds the emulator and wipes it on exit.');
}

console.log(`\n${remove ? 'Removing' : 'Adding'} sample data on: ${target}`);
await (remove ? removeSample() : addSample());
