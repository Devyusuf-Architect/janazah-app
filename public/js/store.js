// Data access. Every Firestore read and write goes through here so that the
// query shapes the security rules depend on live in one place.

import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, onSnapshot, increment,
  documentId,
} from 'firebase/firestore';

import { signInAnonymously } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from './firebase.js';
import { geohash } from './geo.js';
import { APP } from './config.js';
import {
  isSampleMode, sampleNotices, sampleOrgs, sampleNoticeById, sampleOrgById,
  withSamples,
} from './sample-mode.js';
import {
  assertPublicNoticeShape, buildPublicNotice, buildPrivateDetails,
  looksLikeDuplicate, DUPLICATE_WINDOW_HOURS,
} from './model.js';
import { distanceKm } from './geo.js';

const withId = (snap) => ({ id: snap.id, ...snap.data() });

// ---------------------------------------------------------------- admins

/** Whether the signed-in user is a platform admin. */
export async function isPlatformAdmin(uid) {
  if (!uid) return false;
  try {
    return (await getDoc(doc(db, 'admins', uid))).exists();
  } catch {
    // Rules allow reading only your own admin document; a denial means no.
    return false;
  }
}

// ----------------------------------------------------- platform settings

/** Whether the app is showing sample data, or null if it has never been set. */
export async function readSampleDataSetting() {
  try {
    const snap = await getDoc(doc(db, 'platformSettings', 'sampleData'));
    if (!snap.exists()) return null;
    const value = snap.data()?.enabled;
    return typeof value === 'boolean' ? value : null;
  } catch {
    // Unreadable, usually because the rules are not deployed yet. The caller
    // falls back to the build-time flag in config.js rather than failing.
    return null;
  }
}

/** Platform administrators only; the rules enforce that, not this function. */
export async function writeSampleDataSetting(enabled) {
  await setDoc(doc(db, 'platformSettings', 'sampleData'), {
    enabled,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid,
  });
}

/**
 * The settings document the admin portal's Platform Settings section edits.
 * Publicly readable, so this runs before anyone signs in. Null when it has
 * never been written, or cannot be read, and the caller falls back to the
 * built-in defaults rather than failing.
 */
export async function readPlatformSettings() {
  try {
    const snap = await getDoc(doc(db, 'platformSettings', 'platform'));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

/**
 * Write the whole settings document. Always whole, never a merge: the rules
 * require every field to be present and in range, so a partial write is
 * rejected rather than leaving the document half-typed.
 */
export async function writePlatformSettings(values) {
  await setDoc(doc(db, 'platformSettings', 'platform'), {
    ...values,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid,
  });
}

// --------------------------------------------------------------- sample data
//
// Written and removed by a platform administrator from the admin portal. Every
// document uses a `sample-` id, which is what lets firestore.rules permit
// deleting these and nothing else: a real notice is never deletable once
// published, and a real organization is never deletable at all.
//
// Deliberately built on the same rules everything else goes through. An
// organization is created `pending` and then verified in a second step,
// exactly as a real registration is, because the create rule allows nothing
// else. Nothing here is a special server-side path.

const SAMPLE_PREFIX = 'sample-';
const sampleId = (raw) => `${SAMPLE_PREFIX}${raw}`;

export async function seedSampleData(orgs, notices) {
  const uid = auth.currentUser.uid;

  for (const { id: rawId, ...org } of orgs) {
    const ref = doc(db, 'organizations', sampleId(rawId));
    // Step one: a registration, in the only shape the create rule accepts.
    await setDoc(ref, {
      ...org,
      verificationStatus: 'pending',
      ownerUid: uid,
      staffUids: [uid],
      createdAt: serverTimestamp(),
      createdBy: uid,
    });
    // Step two: the administrator verifies it, the same call the admin
    // portal's Approve button makes.
    await updateDoc(ref, {
      verificationStatus: 'verified',
      verifiedAt: serverTimestamp(),
      verifiedBy: uid,
      statusReason: 'Sample data. Not a real organization.',
      updatedAt: serverTimestamp(),
    });
  }

  for (const sample of notices) {
    const {
      id: rawId, orgId, janazahAt, status, version,
      cancelReason, cancelledAt, correctionNote, ...notice
    } = sample;
    const ref = doc(db, 'notices', sampleId(rawId));

    // Created the only way the rules allow anyone to create a notice:
    // version 1, and either a draft or published. A sample that is meant to
    // end up cancelled or corrected gets there the same way a real one does,
    // through a second write, rather than by being written into a state no
    // coordinator could have produced.
    await setDoc(ref, {
      ...notice,
      orgId: sampleId(orgId),
      status: status === 'draft' ? 'draft' : 'published',
      janazahAt: janazahAt instanceof Date ? janazahAt : new Date(janazahAt),
      version: 1,
      createdBy: uid,
      createdAt: serverTimestamp(),
      publishedAt: serverTimestamp(),
    });

    if (status === 'cancelled') {
      await updateDoc(ref, {
        status: 'cancelled',
        cancelReason: cancelReason || '',
        cancelledAt: serverTimestamp(),
        version: 2,
        lastEditedBy: uid,
        updatedAt: serverTimestamp(),
      });
    } else if (correctionNote) {
      await updateDoc(ref, {
        correctionNote,
        version: 2,
        lastEditedBy: uid,
        updatedAt: serverTimestamp(),
      });
    }
  }
}

/** Everything this platform ever wrote as sample data, found by id prefix. */
async function samplePrefixed(collectionName) {
  const col = collection(db, collectionName);
  // The upper bound is the prefix with its last character incremented, so the
  // range covers every id starting with it and nothing else.
  const end = SAMPLE_PREFIX.slice(0, -1)
    + String.fromCharCode(SAMPLE_PREFIX.charCodeAt(SAMPLE_PREFIX.length - 1) + 1);
  const snap = await getDocs(query(col,
    where(documentId(), '>=', SAMPLE_PREFIX),
    where(documentId(), '<', end)));
  return snap.docs.filter((d) => d.id.startsWith(SAMPLE_PREFIX));
}

/** @returns {Promise<number>} how many documents were removed. */
export async function removeSampleData() {
  let removed = 0;
  for (const name of ['notices', 'organizations']) {
    for (const d of await samplePrefixed(name)) {
      await deleteDoc(d.ref);
      removed += 1;
    }
  }
  return removed;
}

/** How much sample data is currently stored, for the admin portal to show. */
export async function countSampleData() {
  const [notices, orgs] = await Promise.all([
    samplePrefixed('notices'), samplePrefixed('organizations'),
  ]);
  return { notices: notices.length, orgs: orgs.length };
}

// --------------------------------------------------------- organizations

export async function registerOrganization(form) {
  const user = auth.currentUser;
  const lat = Number(form.lat);
  const lng = Number(form.lng);

  const payload = {
    name: form.name.trim(),
    type: form.type,
    address: form.address.trim(),
    city: form.city.trim(),
    province: form.province.trim(),
    lat,
    lng,
    cell: geohash(lat, lng, APP.cellPrecision),
    verificationStatus: 'pending',
    ownerUid: user.uid,
    staffUids: [user.uid],
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  };
  if (form.postalCode?.trim()) payload.postalCode = form.postalCode.trim().toUpperCase();
  // Set by the address picker from the chosen result, not typed.
  if (form.country?.trim()) payload.country = form.country.trim();
  if (form.contactEmail?.trim()) payload.contactEmail = form.contactEmail.trim();
  if (form.phone?.trim()) payload.phone = form.phone.trim();
  if (form.website?.trim()) payload.website = form.website.trim();

  const ref = await addDoc(collection(db, 'organizations'), payload);

  // The application is a second write, not part of the same batch, and that
  // is forced by the rules rather than an oversight: writing it requires
  // isOrgOwner(orgId), and inside a batch every write is evaluated against
  // the state before the batch, where the organization does not yet exist.
  //
  // If this write fails the organization still exists as pending with no
  // application attached, which a reviewer sees plainly and can ask about.
  // That is a better failure than losing the registration entirely.
  if (form.applicantName) await saveApplication(ref.id, form);
  return ref.id;
}

// ------------------------------------------------- verification application
//
// organizations/{id}/application/submitted is private: the owner and platform
// administrators, nobody else, before or after approval (firestore.rules).
// None of it belongs on the organization document, which becomes world
// readable the moment an administrator approves it.

/** Write or correct the applicant's own submission. */
export async function saveApplication(orgId, form) {
  const user = auth.currentUser;
  const payload = {
    applicantName: form.applicantName.trim(),
    applicantRole: form.applicantRole,
    applicantEmail: (form.applicantEmail || user.email || '').trim(),
    authorized: true,
    // Sent, but not trusted: firestore.rules pins this to the auth token, so
    // a browser claiming true here is rejected rather than believed.
    emailVerifiedAtSubmit: !!user.emailVerified,
    submittedBy: user.uid,
    submittedAt: serverTimestamp(),
  };
  const optional = {
    applicantRoleOther: form.applicantRoleOther,
    workEmail: form.workEmail,
    phone: form.applicantPhone,
    roleExplanation: form.roleExplanation,
    staffPageUrl: form.staffPageUrl,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value?.trim()) payload[key] = value.trim();
  }
  if (Array.isArray(form.verificationMethods) && form.verificationMethods.length) {
    payload.verificationMethods = form.verificationMethods;
  }
  await setDoc(doc(db, 'organizations', orgId, 'application', 'submitted'), payload);
}

/**
 * Record an uploaded supporting document against the application.
 *
 * A merge rather than a rewrite: the upload finishes after the submission is
 * already stored, and re-sending the whole application would race with an
 * applicant who has meanwhile corrected it.
 */
export async function attachApplicationDocument(orgId, { path, name }) {
  await setDoc(
    doc(db, 'organizations', orgId, 'application', 'submitted'),
    { documentPath: path, documentName: name, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** The applicant's submission. Null when there is none, or none readable. */
export async function getApplication(orgId) {
  const snap = await getDoc(doc(db, 'organizations', orgId, 'application', 'submitted'));
  return snap.exists() ? snap.data() : null;
}

/** Internal reviewer notes. Administrators only; the applicant never sees these. */
export async function getReviewNotes(orgId) {
  try {
    const snap = await getDoc(doc(db, 'organizations', orgId, 'application', 'review'));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

export async function saveReviewNotes(orgId, notes) {
  const user = auth.currentUser;
  await setDoc(doc(db, 'organizations', orgId, 'application', 'review'), {
    notes: String(notes || ''),
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
}

export async function getOrganization(orgId) {
  const sample = sampleOrgById(orgId);
  if (sample) return sample;
  const snap = await getDoc(doc(db, 'organizations', orgId));
  return snap.exists() ? withId(snap) : null;
}

/** Organizations the signed-in user is staff of. */
export async function myOrganizations(uid) {
  const snap = await getDocs(query(
    collection(db, 'organizations'),
    where('staffUids', 'array-contains', uid),
  ));
  return snap.docs.map(withId);
}

/** Verified organizations, for the public feed and the follow list. */
export async function verifiedOrganizations() {
  let live = [];
  try {
    const snap = await getDocs(query(
      collection(db, 'organizations'),
      where('verificationStatus', '==', 'verified'),
    ));
    live = snap.docs.map(withId);
  } catch (err) {
    // Same reasoning as watchPublicNotices: with samples on, a failed read
    // must not empty the directory. With them off the error is real and is
    // rethrown for the view to report.
    if (!isSampleMode()) throw err;
    console.error('verifiedOrganizations', err);
  }
  return withSamples(live, sampleOrgs())
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Platform admin view of the verification queue. */
export function watchOrganizationsByStatus(status, cb) {
  return onSnapshot(
    query(collection(db, 'organizations'), where('verificationStatus', '==', status)),
    (snap) => cb(snap.docs.map(withId)),
    (err) => console.error('watchOrganizationsByStatus', status, err),
  );
}

/**
 * Every organization, whatever its status. Platform administrators only:
 * isPlatformAdmin() in the list rule does not depend on the documents
 * returned, so an unfiltered query is permitted for them and rejected for
 * everybody else.
 */
export function watchAllOrganizations(cb, max = 400) {
  return onSnapshot(
    query(collection(db, 'organizations'), limit(max)),
    (snap) => cb(snap.docs.map(withId).sort((a, b) =>
      (a.name || '').localeCompare(b.name || ''))),
    (err) => { console.error('watchAllOrganizations', err); cb(null, err); },
  );
}

export async function updateOrganizationProfile(orgId, patch) {
  const fields = {
    ...patch, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid,
  };
  if (Number.isFinite(patch.lat) && Number.isFinite(patch.lng)) {
    fields.cell = geohash(patch.lat, patch.lng, APP.cellPrecision);
  }
  await updateDoc(doc(db, 'organizations', orgId), fields);
}

/** Platform admin decision on an organization. */
export async function setVerificationStatus(orgId, status, reason = '') {
  const user = auth.currentUser;
  const patch = {
    verificationStatus: status,
    statusReason: reason,
    updatedAt: serverTimestamp(),
    // Pinned to the caller by firestore.rules. Without it a decision to
    // suspend or decline reaches the audit trail with no actor at all:
    // verifiedBy is only written on an approval.
    updatedBy: user.uid,
  };
  if (status === 'verified') {
    patch.verifiedAt = serverTimestamp();
    patch.verifiedBy = user.uid;
  }
  await updateDoc(doc(db, 'organizations', orgId), patch);
}

// ------------------------------------------------------------------ staff

export async function requestStaffAccess(orgId) {
  const user = auth.currentUser;
  await setDoc(doc(db, 'organizations', orgId, 'staffRequests', user.uid), {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    status: 'pending',
    requestedAt: serverTimestamp(),
  });
}

export async function listStaffRequests(orgId) {
  const snap = await getDocs(collection(db, 'organizations', orgId, 'staffRequests'));
  return snap.docs.map(withId);
}

/**
 * Approve a join request. Two writes, and they are not atomic: rules forbid
 * a client from touching staffUids and the request in one transaction that
 * they could also partially satisfy. Order matters, so grant access first and
 * mark the request second; a failure between the two leaves an approved staff
 * member with a stale pending request, which is visible and harmless.
 */
export async function approveStaffRequest(orgId, requestUid, currentStaffUids) {
  const user = auth.currentUser;
  if (!currentStaffUids.includes(requestUid)) {
    await updateDoc(doc(db, 'organizations', orgId), {
      staffUids: [...currentStaffUids, requestUid],
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
  }
  await updateDoc(doc(db, 'organizations', orgId, 'staffRequests', requestUid), {
    status: 'approved',
    decidedAt: serverTimestamp(),
    decidedBy: user.uid,
  });
}

export async function rejectStaffRequest(orgId, requestUid) {
  const user = auth.currentUser;
  await updateDoc(doc(db, 'organizations', orgId, 'staffRequests', requestUid), {
    status: 'rejected',
    decidedAt: serverTimestamp(),
    decidedBy: user.uid,
  });
}

export async function removeStaff(orgId, staffUid, currentStaffUids) {
  await updateDoc(doc(db, 'organizations', orgId), {
    staffUids: currentStaffUids.filter((u) => u !== staffUid),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid,
  });
}

// ---------------------------------------------------------------- notices

/**
 * Create a notice, as a draft or published outright.
 * Private details go to a subcollection, never onto the public document.
 */
export async function createNotice(form, org, { publish }) {
  const user = auth.currentUser;
  const status = publish ? 'published' : 'draft';
  const payload = buildPublicNotice(form, { org, uid: user.uid, status });

  payload.createdAt = serverTimestamp();
  if (publish) payload.publishedAt = serverTimestamp();
  assertPublicNoticeShape(payload);

  const ref = await addDoc(collection(db, 'notices'), payload);

  const priv = buildPrivateDetails(form);
  if (Object.keys(priv).length) {
    await setDoc(doc(db, 'notices', ref.id, 'private', 'details'), {
      ...priv, updatedAt: serverTimestamp(), updatedBy: user.uid,
    });
  }

  return ref.id;
}

/**
 * Correct an existing notice. `version` advances by exactly one, which the
 * rules require; a concurrent edit therefore fails loudly instead of silently
 * overwriting a colleague's correction.
 */
export async function correctNotice(noticeId, existing, form, org, { publish, note }) {
  const user = auth.currentUser;
  const status = publish ? 'published' : existing.status;
  const payload = buildPublicNotice(form, { org, uid: user.uid, status });

  payload.createdBy = existing.createdBy;
  payload.createdAt = existing.createdAt;
  payload.version = (existing.version || 1) + 1;
  payload.lastEditedBy = user.uid;
  payload.updatedAt = serverTimestamp();
  payload.publishedAt = existing.publishedAt || (publish ? serverTimestamp() : undefined);
  if (payload.publishedAt === undefined) delete payload.publishedAt;
  if (note?.trim()) payload.correctionNote = note.trim();

  assertPublicNoticeShape(payload);
  await setDoc(doc(db, 'notices', noticeId), payload);

  const priv = buildPrivateDetails(form);
  if (Object.keys(priv).length) {
    await setDoc(doc(db, 'notices', noticeId, 'private', 'details'), {
      ...priv, updatedAt: serverTimestamp(), updatedBy: user.uid,
    }, { merge: true });
  }
}

/**
 * Cancel a published notice. Cancellation is terminal and the document stays
 * readable, so a shared link shows the cancellation rather than 404ing.
 * Phase 4 will notify everyone who received the original from here.
 */
export async function cancelNotice(noticeId, existing, reason, { asAdmin = false } = {}) {
  const user = auth.currentUser;
  await updateDoc(doc(db, 'notices', noticeId), {
    status: 'cancelled',
    isPublic: true,
    cancelledAt: serverTimestamp(),
    cancelReason: reason || '',
    lastEditedBy: user.uid,
    updatedAt: serverTimestamp(),
    version: increment(1),
  });
}

/**
 * A platform administrator's edit of somebody else's notice.
 *
 * The whole document is rewritten, because the notice rules validate the
 * resulting document rather than the diff, and the version counter advances
 * by one so a concurrent edit by the organization fails loudly instead of
 * being silently overwritten. lastEditedBy names the administrator, which the
 * rules require for this clause and which is what lets the audit trigger
 * attribute the change to a real account.
 *
 * Not a route around the organization: it cannot touch a cancelled notice,
 * cannot cancel one (cancelNotice is that path, and stays terminal), and
 * cannot move a notice between organizations. firestore.rules enforces all
 * three, not this function.
 */
async function adminWriteNotice(noticeId, existing, patch) {
  const user = auth.currentUser;
  const { id, ...current } = existing;
  const payload = {
    ...current,
    ...patch,
    version: (existing.version || 1) + 1,
    lastEditedBy: user.uid,
    updatedAt: serverTimestamp(),
  };
  // Same guard the coordinator's own path uses: refuse to send a private
  // field to a public document, before the rules get the chance to.
  assertPublicNoticeShape(payload);
  await setDoc(doc(db, 'notices', noticeId), payload);
}

/** Correct the text of a notice as a platform administrator. */
export async function adminCorrectNotice(noticeId, existing, fields, note) {
  const patch = { ...fields };
  if (note?.trim()) patch.correctionNote = note.trim();
  await adminWriteNotice(noticeId, existing, patch);
}

/**
 * Hide a published notice, or put a hidden one back.
 *
 * Hiding reuses the draft status the app already has rather than a second,
 * parallel notion of hidden: a draft is not public, is not in the feed, and
 * can be published again, which is exactly what hiding and restoring mean.
 */
export async function adminSetNoticeVisibility(noticeId, existing, visible) {
  await adminWriteNotice(noticeId, existing, {
    status: visible ? 'published' : 'draft',
    isPublic: visible,
  });
}

/**
 * Every notice, soonest last. Platform administrators only, for the same
 * reason watchAllOrganizations is: the admin clause in the list rule does not
 * depend on the documents returned.
 */
export function watchAllNotices(cb, max = 300) {
  return onSnapshot(
    query(collection(db, 'notices'), orderBy('janazahAt', 'desc'), limit(max)),
    (snap) => cb(snap.docs.map(withId)),
    (err) => { console.error('watchAllNotices', err); cb(null, err); },
  );
}

export async function deleteDraft(noticeId) {
  await deleteDoc(doc(db, 'notices', noticeId));
}

export async function getNotice(noticeId) {
  const sample = sampleNoticeById(noticeId);
  if (sample) return sample;
  const snap = await getDoc(doc(db, 'notices', noticeId));
  return snap.exists() ? withId(snap) : null;
}

export async function getNoticePrivate(noticeId) {
  try {
    const snap = await getDoc(doc(db, 'notices', noticeId, 'private', 'details'));
    return snap.exists() ? snap.data() : {};
  } catch {
    return {};
  }
}

/** One organization's notices, newest first. Staff and platform admins. */
export async function listOrgNotices(orgId, max = 50) {
  const snap = await getDocs(query(
    collection(db, 'notices'),
    where('orgId', '==', orgId),
    orderBy('createdAt', 'desc'),
    limit(max),
  ));
  return snap.docs.map(withId);
}

/** Everything belonging to one organization, staff view, drafts included. */
export function watchOrgNotices(orgId, cb) {
  return onSnapshot(
    query(collection(db, 'notices'), where('orgId', '==', orgId), orderBy('createdAt', 'desc')),
    (snap) => cb(snap.docs.map(withId)),
    (err) => console.error('watchOrgNotices', err),
  );
}

/**
 * Published notices that might be announcing the same funeral as this draft.
 *
 * Reads the public feed window, which any visitor may read, and compares in
 * the browser. Returns an empty list on failure: a duplicate check that cannot
 * run must never stand between a coordinator and a genuine Janazah.
 */
export async function findPossibleDuplicates(candidate, { excludeId = null } = {}) {
  try {
    const at = candidate.janazahAt instanceof Date
      ? candidate.janazahAt : new Date(candidate.janazahAt);
    if (Number.isNaN(at.getTime())) return [];
    const windowMs = DUPLICATE_WINDOW_HOURS * 3600 * 1000;

    const snap = await getDocs(query(
      collection(db, 'notices'),
      where('isPublic', '==', true),
      where('janazahAt', '>=', new Date(at.getTime() - windowMs)),
      where('janazahAt', '<=', new Date(at.getTime() + windowMs)),
      limit(100),
    ));

    return snap.docs
      .map(withId)
      .filter((existing) => existing.id !== excludeId)
      .filter((existing) => looksLikeDuplicate(candidate, existing, distanceKm));
  } catch (err) {
    console.error('findPossibleDuplicates', err);
    return [];
  }
}

/**
 * Sign in anonymously if there is no session yet.
 *
 * Reading the feed needs no account. Filing a report does, because the rules
 * pin `reportedBy` to the authenticated caller, which is what makes rate
 * limiting and abuse handling possible later. An anonymous session gives a
 * stable identifier and collects nothing about the person.
 */
export async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser;
  const { user } = await signInAnonymously(auth);
  return user;
}

// ------------------------------------------------------- email preferences

/**
 * The email preference record for whoever is currently signed in (an
 * anonymous session or a real account, ensureSignedIn does not care which),
 * or null if they have never set one.
 *
 * Null is the ordinary case, not a missing record to recover from: nobody
 * has this document until they explicitly give an email address, and its
 * absence is what every sender treats as "send nothing".
 */
export async function getEmailPreferences() {
  const user = await ensureSignedIn();
  const snap = await getDoc(doc(db, 'emailPreferences', user.uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Save the email preference record for whoever is currently signed in.
 * Always a whole-document set, matching the rules, which validate the
 * document as written rather than as a partial patch.
 */
export async function saveEmailPreferences({
  email, followedMasjidPosts, noticeUpdates, nearbyAlerts,
}) {
  const user = await ensureSignedIn();
  await setDoc(doc(db, 'emailPreferences', user.uid), {
    email: email.trim(),
    followedMasjidPosts: !!followedMasjidPosts,
    noticeUpdates: !!noticeUpdates,
    nearbyAlerts: !!nearbyAlerts,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
}

/**
 * Withdraw consent entirely: no address is kept, rather than a record with
 * every category left unchecked.
 */
export async function deleteEmailPreferences() {
  const user = await ensureSignedIn();
  await deleteDoc(doc(db, 'emailPreferences', user.uid));
}

/** Community report of an incorrect or fraudulent notice. */
export async function submitReport(noticeId, reason, detail) {
  const user = await ensureSignedIn();
  const payload = {
    noticeId,
    reportedBy: user.uid,
    reason,
    status: 'open',
    createdAt: serverTimestamp(),
  };
  if (detail?.trim()) payload.detail = detail.trim().slice(0, 1000);
  await addDoc(collection(db, 'reports'), payload);
}

/** Platform admin triage of a community report. */
export async function resolveReport(reportId, status, resolution) {
  const user = auth.currentUser;
  await updateDoc(doc(db, 'reports', reportId), {
    status,
    resolution: resolution || '',
    resolvedBy: user.uid,
    resolvedAt: serverTimestamp(),
  });
}

/** Every report, newest first. Platform administrators only. */
export async function listReports(max = 200) {
  const snap = await getDocs(query(
    collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(max)));
  return snap.docs.map(withId);
}

// ------------------------------------------------------------- audit trail
//
// Entries are written only by Cloud Functions triggers through the Admin SDK
// (functions/index.js). Nothing here writes: firestore.rules closes /auditLog
// to every client write, which is what makes the trail unforgeable in fact
// rather than in intent: there is no client code path, correct or malicious,
// that can produce a document change without a matching entry appearing, or
// that can write an entry not corresponding to a real change. See
// functions/lib/audit-log.js for what gets written and why.

/** The whole trail, newest first. Platform administrators only. */
export async function auditRecent(max = 200) {
  const snap = await getDocs(query(
    collection(db, 'auditLog'), orderBy('at', 'desc'), limit(max)));
  return snap.docs.map(withId);
}

/** Recent audit entries for one organization. Staff and platform admins only. */
export async function auditForOrg(orgId, max = 100) {
  const snap = await getDocs(query(
    collection(db, 'auditLog'),
    where('orgId', '==', orgId),
    orderBy('at', 'desc'),
    limit(max),
  ));
  return snap.docs.map(withId);
}

/**
 * The audit history of one notice.
 *
 * Filtered in the browser rather than by a second where() clause on purpose:
 * the orgId + at index already exists, and adding a targetId one would be a
 * new composite index to deploy for a query that this narrows to a handful of
 * rows anyway.
 */
export async function auditForNotice(orgId, noticeId, max = 200) {
  const entries = await auditForOrg(orgId, max);
  return entries.filter((e) => e.targetId === noticeId);
}

/**
 * The most recent notification fan-out entry for each of an organization's
 * notices, keyed by notice id.
 *
 * onNoticeWritten (functions/index.js) already writes a `notification.*`
 * audit entry every time a publish, correction or cancellation goes out (or
 * is suppressed by the rate limiter); this only reads that back. entries
 * come from auditForOrg newest-first, so the first `notification.*` row seen
 * per notice is its latest.
 */
export async function latestNotificationByNotice(orgId, max = 300) {
  const entries = await auditForOrg(orgId, max);
  const byNotice = new Map();
  for (const entry of entries) {
    if (!entry.action?.startsWith('notification.')) continue;
    if (!byNotice.has(entry.targetId)) byNotice.set(entry.targetId, entry);
  }
  return byNotice;
}

// ------------------------------------------------------ platform admins
//
// /admins is read-only from every client, and stays that way: firestore.rules
// has `allow write: if false` on it, deliberately, so that no bug and no
// compromised session in this app can write an administrator record.
//
// Granting and revoking therefore do not happen here at all. They are
// callable Cloud Functions (functions/index.js) which use the Admin SDK, and
// which read the caller's own /admins document server-side before doing
// anything. That is stricter than a rule on a client-writable collection, and
// it is also the only way to address somebody by email: a browser can look a
// user up by uid and nothing else.

/** The current platform administrators. Platform administrators only. */
export async function listPlatformAdmins() {
  const snap = await getDocs(collection(db, 'admins'));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/**
 * Make an existing account a platform administrator.
 *
 * Rejects with the function's own error when there is no account for the
 * address, which is the common case and is worth showing verbatim: the person
 * has to sign up before they can be given anything.
 *
 * @param {string} email
 * @returns {Promise<{uid: string, email: string}>}
 */
export async function grantPlatformAdmin(email) {
  const call = httpsCallable(functions, 'grantAdmin');
  const { data } = await call({ email });
  return data;
}

/**
 * Remove platform administration from an account.
 *
 * The server refuses to act on the caller's own uid, so this cannot be used
 * to leave the platform with no administrators at all.
 */
export async function revokePlatformAdmin(uid, reason = '') {
  const call = httpsCallable(functions, 'revokeAdmin');
  const { data } = await call({ uid, reason });
  return data;
}

/**
 * Send one message from the administrators to one organization.
 *
 * The address is resolved on the server, from the organization's contact
 * email or its owner's sign-in address, and is never returned here. This
 * screen knows that a message went, not where.
 */
export async function sendOrganizationMessage(orgId, subject, body) {
  const call = httpsCallable(functions, 'sendOrganizationMessage');
  const { data } = await call({ orgId, subject, body });
  return data;
}

/**
 * The public feed. The isPublic filter is required, not cosmetic: rules match
 * a list request against its query, so dropping it makes the read fail.
 */
export function watchPublicNotices(cb, max = 200) {
  const cutoff = new Date(Date.now() - APP.currentWindowHours * 3600 * 1000);
  return onSnapshot(
    query(
      collection(db, 'notices'),
      where('isPublic', '==', true),
      where('janazahAt', '>=', cutoff),
      orderBy('janazahAt', 'asc'),
      limit(max),
    ),
    // Sample notices are folded in here rather than in each view, so every
    // surface that reads the feed (the feed itself, the dashboard preview and
    // an organization's page) shows the same thing without knowing about it.
    (snap) => cb(sortByTime(withSamples(snap.docs.map(withId), sampleNotices()))),
    (err) => {
      console.error('watchPublicNotices', err);
      // A failed read must still resolve the caller out of "loading" -- every
      // page that shows this list (home, dashboard, feed, an organization's
      // page, welcome) otherwise shows its loading skeleton forever, which
      // reads as a broken page rather than an empty or erroring one. While
      // samples are on, showing them is strictly better than nothing; once
      // they are off (production), an empty list at least resolves the UI to
      // its real empty state instead of hanging silently.
      cb(isSampleMode() ? sortByTime(sampleNotices()) : []);
    },
  );
}

/** Soonest first, matching the server-side orderBy the query asks for. */
function sortByTime(notices) {
  const ms = (n) => {
    const at = n.janazahAt?.toDate ? n.janazahAt.toDate() : n.janazahAt;
    return at instanceof Date ? at.getTime() : 0;
  };
  return [...notices].sort((a, b) => ms(a) - ms(b));
}
