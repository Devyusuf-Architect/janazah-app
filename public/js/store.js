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
import { assertPublicNoticeShape, buildPublicNotice, buildPrivateDetails } from './model.js';
import { writeAudit, ACTIONS } from './audit.js';

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
  if (form.contactEmail?.trim()) payload.contactEmail = form.contactEmail.trim();
  if (form.website?.trim()) payload.website = form.website.trim();

  const ref = await addDoc(collection(db, 'organizations'), payload);
  await writeAudit(ACTIONS.ORG_REGISTERED, {
    targetType: 'organization', targetId: ref.id, orgId: ref.id,
    details: { name: payload.name, type: payload.type },
  });
  return ref.id;
}

export async function getOrganization(orgId) {
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
  const snap = await getDocs(query(
    collection(db, 'organizations'),
    where('verificationStatus', '==', 'verified'),
  ));
  return snap.docs.map(withId).sort((a, b) => a.name.localeCompare(b.name));
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
  await writeAudit(ACTIONS.ORG_UPDATED, {
    targetType: 'organization', targetId: orgId, orgId,
    details: { fields: Object.keys(patch) },
  });
}

const STATUS_ACTIONS = {
  verified: ACTIONS.ORG_VERIFIED,
  rejected: ACTIONS.ORG_REJECTED,
  suspended: ACTIONS.ORG_SUSPENDED,
  pending: ACTIONS.ORG_REINSTATED,
};

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
  await writeAudit(STATUS_ACTIONS[status] || 'org.status_changed', {
    targetType: 'organization', targetId: orgId, orgId,
    details: { status, reason },
  });
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
  await writeAudit(ACTIONS.STAFF_REQUESTED, {
    targetType: 'staffRequest', targetId: user.uid, orgId,
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
  await writeAudit(ACTIONS.STAFF_APPROVED, {
    targetType: 'staffRequest', targetId: requestUid, orgId,
  });
}

export async function rejectStaffRequest(orgId, requestUid) {
  const user = auth.currentUser;
  await updateDoc(doc(db, 'organizations', orgId, 'staffRequests', requestUid), {
    status: 'rejected',
    decidedAt: serverTimestamp(),
    decidedBy: user.uid,
  });
  await writeAudit(ACTIONS.STAFF_REJECTED, {
    targetType: 'staffRequest', targetId: requestUid, orgId,
  });
}

export async function removeStaff(orgId, staffUid, currentStaffUids) {
  await updateDoc(doc(db, 'organizations', orgId), {
    staffUids: currentStaffUids.filter((u) => u !== staffUid),
    updatedAt: serverTimestamp(),
  });
  await writeAudit(ACTIONS.STAFF_REMOVED, {
    targetType: 'user', targetId: staffUid, orgId,
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

  await writeAudit(publish ? ACTIONS.NOTICE_PUBLISHED : ACTIONS.NOTICE_DRAFTED, {
    targetType: 'notice', targetId: ref.id, orgId: org.id,
    details: { janazahAt: form.janazahAt, prayer: form.prayerName },
  });
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

  await writeAudit(ACTIONS.NOTICE_CORRECTED, {
    targetType: 'notice', targetId: noticeId, orgId: org.id,
    details: { version: payload.version, note: note || '' },
  });
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
  await writeAudit(asAdmin ? ACTIONS.NOTICE_TAKEN_DOWN : ACTIONS.NOTICE_CANCELLED, {
    targetType: 'notice', targetId: noticeId, orgId: existing.orgId,
    details: { reason: reason || '' },
  });
}

export async function deleteDraft(noticeId, existing) {
  await deleteDoc(doc(db, 'notices', noticeId));
  await writeAudit(ACTIONS.NOTICE_DELETED_DRAFT, {
    targetType: 'notice', targetId: noticeId, orgId: existing.orgId,
  });
}

export async function getNotice(noticeId) {
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
    (snap) => cb(snap.docs.map(withId)),
    (err) => console.error('watchPublicNotices', err),
  );
}
