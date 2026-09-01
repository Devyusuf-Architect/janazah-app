// What happened, from a before/after document diff.
//
// No Firebase imports, same discipline as notify.js, topics.js and limits.js:
// this only decides what an audit entry should say, and the caller (the
// trigger in index.js) does the actual reading and writing. That keeps the
// classification logic unit-testable without an emulator.
//
// This exists because the old client-written audit trail had a real gap: a
// determined staff member could perform an action and simply not call the
// audit write. Firestore triggers close that gap structurally, not by trying
// harder to remember: the trigger fires on the document write itself, so
// there is no code path that changes a notice, an organization, a staff
// request or a report without an entry being written about it.
//
// The action taxonomy here matches what the client used to write, entry for
// entry, because the point of this module is to move where the writing
// happens, not to redesign what gets recorded.

export const ACTIONS = {
  ORG_REGISTERED: 'org.registered',
  ORG_UPDATED: 'org.updated',
  ORG_VERIFIED: 'org.verified',
  ORG_REJECTED: 'org.rejected',
  ORG_INFO_REQUESTED: 'org.info_requested',
  ORG_SUSPENDED: 'org.suspended',
  ORG_REINSTATED: 'org.reinstated',
  ORG_DELETED: 'org.deleted',
  STAFF_REQUESTED: 'staff.requested',
  STAFF_APPROVED: 'staff.approved',
  STAFF_REJECTED: 'staff.rejected',
  STAFF_REMOVED: 'staff.removed',
  NOTICE_DRAFTED: 'notice.drafted',
  NOTICE_PUBLISHED: 'notice.published',
  NOTICE_CORRECTED: 'notice.corrected',
  NOTICE_CANCELLED: 'notice.cancelled',
  NOTICE_UNPUBLISHED: 'notice.unpublished',
  NOTICE_REPUBLISHED: 'notice.republished',
  NOTICE_DELETED_DRAFT: 'notice.draft_deleted',
  NOTICE_TAKEN_DOWN: 'notice.admin_takedown',
  REPORT_RESOLVED: 'report.resolved',
  REPORT_DISMISSED: 'report.dismissed',
};

const ORG_STATUS_ACTION = {
  verified: ACTIONS.ORG_VERIFIED,
  rejected: ACTIONS.ORG_REJECTED,
  suspended: ACTIONS.ORG_SUSPENDED,
  needs_information: ACTIONS.ORG_INFO_REQUESTED,
  pending: ACTIONS.ORG_REINSTATED,
};

/**
 * A notice change needs to know whether the actor who made it is a platform
 * administrator only for one case: distinguishing a staff cancellation from
 * an admin takedown, since the document itself does not record which kind of
 * account made the change, only who (lastEditedBy). Everything else is
 * decided from status and existence alone.
 *
 * @param {object|null} before
 * @param {object|null} after
 * @param {boolean} isActorAdmin  Whether `after.lastEditedBy` (or, for a
 *   first publish, `after.createdBy`) is a platform administrator. Resolved
 *   by the caller, which has Firestore access; this function does not.
 * @returns {{action: string, actorUid: string|null}|null}
 */
export function classifyNoticeChange(before, after, isActorAdmin) {
  if (!before && after) {
    return {
      action: after.status === 'published' ? ACTIONS.NOTICE_PUBLISHED : ACTIONS.NOTICE_DRAFTED,
      actorUid: after.createdBy ?? null,
    };
  }

  if (before && !after) {
    // Rules only allow deleting a draft, so this is always that.
    return { action: ACTIONS.NOTICE_DELETED_DRAFT, actorUid: before.lastEditedBy ?? before.createdBy ?? null };
  }

  if (!before || !after) return null;

  const actorUid = after.lastEditedBy ?? after.createdBy ?? null;

  if (before.status !== 'cancelled' && after.status === 'cancelled') {
    return {
      action: isActorAdmin ? ACTIONS.NOTICE_TAKEN_DOWN : ACTIONS.NOTICE_CANCELLED,
      actorUid,
    };
  }

  // A published notice pulled back out of public view, and the same notice
  // put back. Both are corrections in the loose sense, but they are the two
  // changes where what happened to the public feed matters more than what
  // happened to the fields, and an audit trail that records them as plain
  // corrections cannot answer "why did this disappear for six hours".
  //
  // publishedAt is what separates a republish from an ordinary first publish
  // out of the edit screen: it is stamped on the first publish and kept
  // afterwards, so a draft that carries one has been public before.
  if (before.status === 'published' && after.status === 'draft') {
    return { action: ACTIONS.NOTICE_UNPUBLISHED, actorUid };
  }
  if (before.status === 'draft' && after.status === 'published' && before.publishedAt) {
    return { action: ACTIONS.NOTICE_REPUBLISHED, actorUid };
  }

  // Anything else that reached this point is a correction: a draft edited in
  // place, a draft published for the first time via the edit screen, or a
  // published notice corrected. The client never distinguished these three
  // as separate audit actions, so this does not either.
  return { action: ACTIONS.NOTICE_CORRECTED, actorUid };
}

/**
 * An organization document change. Returns zero or more entries: usually one,
 * occasionally two if a single write genuinely changed two independent facts
 * (verification status and the staff list, say), and zero for a change that
 * is fully accounted for elsewhere.
 *
 * A staff list that grew is exactly that last case: it happens as the second
 * half of approveStaffRequest, and the staffRequests-level classification
 * below already produces a staff.approved entry naming the request and the
 * approver. Logging it again here, with less detail, would be a duplicate
 * rather than a second fact.
 *
 * @returns {{action: string, actorUid: string|null}[]}
 */
export function classifyOrgChange(before, after) {
  if (!before && after) {
    return [{ action: ACTIONS.ORG_REGISTERED, actorUid: after.createdBy ?? null }];
  }

  if (before && !after) {
    // Rules forbid deleting an organization; if one is deleted some other
    // way (direct Admin SDK use, a console action), that is worth a record
    // precisely because it should not be able to happen through the app.
    return [{ action: ACTIONS.ORG_DELETED, actorUid: null }];
  }

  if (!before || !after) return [];

  const entries = [];

  // verifiedBy is only written on an approval, so it cannot be the actor for
  // a suspension or a decline. updatedBy is written by every client path that
  // changes an organization and is pinned to the caller by firestore.rules,
  // which makes it the general answer; verifiedBy stays ahead of it so an
  // approval is still attributed to whoever actually approved it even if some
  // other field was carried along in the same write.
  const orgActor = after.verifiedBy ?? after.updatedBy ?? null;

  if (before.verificationStatus !== after.verificationStatus) {
    entries.push({
      action: ORG_STATUS_ACTION[after.verificationStatus] || ACTIONS.ORG_UPDATED,
      actorUid: orgActor,
    });
  }

  const beforeStaff = new Set(before.staffUids || []);
  const afterStaff = new Set(after.staffUids || []);
  const removed = [...beforeStaff].filter((uid) => !afterStaff.has(uid));
  const grew = [...afterStaff].some((uid) => !beforeStaff.has(uid));

  for (const removedUid of removed) {
    entries.push({
      action: ACTIONS.STAFF_REMOVED,
      actorUid: after.updatedBy ?? null,
      targetUid: removedUid,
    });
  }

  if (entries.length === 0 && !grew && JSON.stringify(before) !== JSON.stringify(after)) {
    // Neither status nor the staff list changed, but something did: a
    // profile field (name, address, contact email, and so on). A document
    // that genuinely did not change at all, timestamps included, gets no
    // entry rather than a spurious org.updated.
    entries.push({ action: ACTIONS.ORG_UPDATED, actorUid: after.updatedBy ?? null });
  }

  return entries;
}

/**
 * A staffRequests/{uid} document change.
 * @returns {{action: string, actorUid: string|null}|null}
 */
export function classifyStaffRequestChange(before, after) {
  if (!before && after) {
    return { action: ACTIONS.STAFF_REQUESTED, actorUid: after.uid ?? null };
  }
  if (!before || !after) return null;

  if (before.status === 'pending' && after.status === 'approved') {
    return { action: ACTIONS.STAFF_APPROVED, actorUid: after.decidedBy ?? null };
  }
  if (before.status === 'pending' && after.status === 'rejected') {
    return { action: ACTIONS.STAFF_REJECTED, actorUid: after.decidedBy ?? null };
  }
  return null;
}

/**
 * A reports/{id} document change. Submission itself was never audited (the
 * report document is its own record of that), only the resolution.
 * @returns {{action: string, actorUid: string|null}|null}
 */
export function classifyReportChange(before, after) {
  if (!before || !after) return null;
  if (before.status !== 'open') return null;

  if (after.status === 'resolved') {
    return { action: ACTIONS.REPORT_RESOLVED, actorUid: after.resolvedBy ?? null };
  }
  if (after.status === 'dismissed') {
    return { action: ACTIONS.REPORT_DISMISSED, actorUid: after.resolvedBy ?? null };
  }
  return null;
}
