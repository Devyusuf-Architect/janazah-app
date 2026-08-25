// Audit trail.
//
// Every create, edit and cancellation of a notice, and every verification
// decision, lands here. Rules make the collection append-only and force
// actorUid to the authenticated caller and `at` to server time, so entries
// cannot be forged under another name, backdated, altered or deleted.
//
// Known Phase 1 limitation: the write comes from the browser, so a determined
// staff member could perform an action and skip the audit write. Closing that
// needs server-side writes. Recorded in docs/phase-1-setup.md.

import {
  addDoc, collection, serverTimestamp, query, where, orderBy, limit, getDocs,
} from 'firebase/firestore';
import { db, auth } from './firebase.js';

export const ACTIONS = {
  ORG_REGISTERED: 'org.registered',
  ORG_UPDATED: 'org.updated',
  ORG_VERIFIED: 'org.verified',
  ORG_REJECTED: 'org.rejected',
  ORG_SUSPENDED: 'org.suspended',
  ORG_REINSTATED: 'org.reinstated',
  STAFF_REQUESTED: 'staff.requested',
  STAFF_APPROVED: 'staff.approved',
  STAFF_REJECTED: 'staff.rejected',
  STAFF_REMOVED: 'staff.removed',
  NOTICE_DRAFTED: 'notice.drafted',
  NOTICE_PUBLISHED: 'notice.published',
  NOTICE_CORRECTED: 'notice.corrected',
  NOTICE_CANCELLED: 'notice.cancelled',
  NOTICE_DELETED_DRAFT: 'notice.draft_deleted',
  NOTICE_TAKEN_DOWN: 'notice.admin_takedown',
  REPORT_RESOLVED: 'report.resolved',
  REPORT_DISMISSED: 'report.dismissed',
};

/**
 * Append an audit entry. Never throws into the caller's happy path: a failed
 * audit write is surfaced in the console and returned as false, because losing
 * the user's actual work to an audit failure is the worse outcome. Callers
 * that need to know can check the return value.
 */
export async function writeAudit(action, { targetType, targetId, orgId = null, details = {} }) {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    await addDoc(collection(db, 'auditLog'), {
      actorUid: user.uid,
      actorEmail: user.email || '',
      action,
      targetType,
      targetId,
      orgId,
      at: serverTimestamp(),
      details,
    });
    return true;
  } catch (err) {
    console.error('Audit write failed', action, targetId, err);
    return false;
  }
}

/** Recent audit entries for one organization. Staff and platform admins only. */
export async function auditForOrg(orgId, max = 100) {
  const snap = await getDocs(query(
    collection(db, 'auditLog'),
    where('orgId', '==', orgId),
    orderBy('at', 'desc'),
    limit(max),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
