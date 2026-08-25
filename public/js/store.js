// Data access. Every Firestore read and write goes through here so that the
// query shapes the security rules depend on live in one place.

import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp, onSnapshot, increment,
} from 'firebase/firestore';

import { signInAnonymously } from 'firebase/auth';
import { db, auth } from './firebase.js';
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
  if (form.website?.trim()) payload.website = form.website.trim();

  const ref = await addDoc(collection(db, 'organizations'), payload);
  return ref.id;
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

export async function updateOrganizationProfile(orgId, patch) {
  const fields = { ...patch, updatedAt: serverTimestamp() };
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
      // While the samples are on, a failed read still shows something rather
      // than an empty site. This is what makes the flag useful before the
      // security rules have been deployed.
      if (isSampleMode()) cb(sortByTime(sampleNotices()));
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
