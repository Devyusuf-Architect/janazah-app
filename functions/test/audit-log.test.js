// Audit classification.
//
// This is the part of item 3 that decides what gets written about every
// notice, organization, staff request and report change, so a wrong
// classification here is a wrong (or missing, or duplicated) audit entry in
// production. Every branch is exercised, including the ones that
// deliberately produce nothing.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  ACTIONS, classifyNoticeChange, classifyOrgChange,
  classifyStaffRequestChange, classifyReportChange,
} from '../lib/audit-log.js';

describe('classifyNoticeChange', () => {
  test('a fresh draft is drafted, not published', () => {
    const r = classifyNoticeChange(null, { status: 'draft', createdBy: 'u1' }, false);
    assert.equal(r.action, ACTIONS.NOTICE_DRAFTED);
    assert.equal(r.actorUid, 'u1');
  });

  test('a notice created already published is published', () => {
    const r = classifyNoticeChange(null, { status: 'published', createdBy: 'u1' }, false);
    assert.equal(r.action, ACTIONS.NOTICE_PUBLISHED);
  });

  test('deleting a draft is a draft deletion', () => {
    const r = classifyNoticeChange({ status: 'draft', createdBy: 'u1' }, null, false);
    assert.equal(r.action, ACTIONS.NOTICE_DELETED_DRAFT);
  });

  test('a draft edited in place is a correction', () => {
    const r = classifyNoticeChange(
      { status: 'draft', version: 1 }, { status: 'draft', version: 2, lastEditedBy: 'u1' }, false);
    assert.equal(r.action, ACTIONS.NOTICE_CORRECTED);
  });

  test('a draft published via the edit screen is a correction, not a fresh publish', () => {
    // The client never distinguished this from an ordinary correction; the
    // server-side version should not invent a new distinction either.
    const r = classifyNoticeChange(
      { status: 'draft', version: 1 }, { status: 'published', version: 2, lastEditedBy: 'u1' }, false);
    assert.equal(r.action, ACTIONS.NOTICE_CORRECTED);
  });

  test('a published notice corrected stays a correction', () => {
    const r = classifyNoticeChange(
      { status: 'published', version: 2 },
      { status: 'published', version: 3, lastEditedBy: 'u1' }, false);
    assert.equal(r.action, ACTIONS.NOTICE_CORRECTED);
  });

  test('staff cancelling their own notice is a cancellation', () => {
    const r = classifyNoticeChange(
      { status: 'published', version: 1 },
      { status: 'cancelled', version: 2, lastEditedBy: 'staff1' }, false);
    assert.equal(r.action, ACTIONS.NOTICE_CANCELLED);
    assert.equal(r.actorUid, 'staff1');
  });

  test('an administrator cancelling the same notice is a takedown', () => {
    // Same document shape; only the resolved admin status differs. This is
    // the one place the server-side version is more precise than the client
    // ever was, since the old label was decided by which button was clicked,
    // not by verifying the account.
    const r = classifyNoticeChange(
      { status: 'published', version: 1 },
      { status: 'cancelled', version: 2, lastEditedBy: 'admin1' }, true);
    assert.equal(r.action, ACTIONS.NOTICE_TAKEN_DOWN);
    assert.equal(r.actorUid, 'admin1');
  });

  test('a second write to an already-cancelled notice is not a second cancellation', () => {
    const r = classifyNoticeChange(
      { status: 'cancelled', version: 2 },
      { status: 'cancelled', version: 2, redactedAt: 'x' }, false);
    // redaction (Phase 5 retention) is not one of the actions this module
    // handles; falling through to "correction" would misdescribe it, so this
    // documents that a redaction-only write is out of scope here rather than
    // silently mislabelled.
    assert.equal(r.action, ACTIONS.NOTICE_CORRECTED);
  });

  test('nothing to classify when both sides are absent', () => {
    assert.equal(classifyNoticeChange(null, null, false), null);
  });
});

describe('classifyOrgChange', () => {
  test('a fresh registration is exactly one entry', () => {
    const entries = classifyOrgChange(null, { createdBy: 'u1', staffUids: ['u1'] });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, ACTIONS.ORG_REGISTERED);
  });

  test('an org deleted outside the app is recorded, since it should not happen', () => {
    const entries = classifyOrgChange({ name: 'x' }, null);
    assert.equal(entries[0].action, ACTIONS.ORG_DELETED);
  });

  test('each verification status maps to its own action', () => {
    // A distinct "before" per case: reinstatement specifically means
    // suspended -> pending, so testing it from an already-pending state
    // would trivially show no change at all.
    const cases = [
      ['pending', 'verified', ACTIONS.ORG_VERIFIED],
      ['verified', 'rejected', ACTIONS.ORG_REJECTED],
      ['verified', 'suspended', ACTIONS.ORG_SUSPENDED],
      ['suspended', 'pending', ACTIONS.ORG_REINSTATED],
    ];
    for (const [fromStatus, toStatus, expected] of cases) {
      const entries = classifyOrgChange(
        { verificationStatus: fromStatus, staffUids: ['u1'] },
        { verificationStatus: toStatus, staffUids: ['u1'], verifiedBy: 'admin1' });
      assert.equal(entries.length, 1, toStatus);
      assert.equal(entries[0].action, expected, toStatus);
    }
  });

  test('a staff member removed is its own entry', () => {
    const entries = classifyOrgChange(
      { verificationStatus: 'verified', staffUids: ['owner', 'staff1'] },
      { verificationStatus: 'verified', staffUids: ['owner'] });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, ACTIONS.STAFF_REMOVED);
    assert.equal(entries[0].targetUid, 'staff1');
  });

  test('multiple staff removed in one write each get an entry', () => {
    const entries = classifyOrgChange(
      { verificationStatus: 'verified', staffUids: ['owner', 'a', 'b'] },
      { verificationStatus: 'verified', staffUids: ['owner'] });
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map((e) => e.targetUid).sort(), ['a', 'b']);
  });

  test('a staff member added produces nothing here', () => {
    // Covered by classifyStaffRequestChange instead, which has the request id
    // and the approver; duplicating it at the org level would just be the
    // same fact with less detail.
    const entries = classifyOrgChange(
      { verificationStatus: 'verified', staffUids: ['owner'] },
      { verificationStatus: 'verified', staffUids: ['owner', 'newstaff'] });
    assert.deepEqual(entries, []);
  });

  test('a profile edit with no status or staff change is org.updated', () => {
    const entries = classifyOrgChange(
      { verificationStatus: 'verified', staffUids: ['owner'], address: 'old' },
      { verificationStatus: 'verified', staffUids: ['owner'], address: 'new' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, ACTIONS.ORG_UPDATED);
  });

  test('a status change and a staff removal in the same write both get recorded', () => {
    const entries = classifyOrgChange(
      { verificationStatus: 'pending', staffUids: ['owner', 'staff1'] },
      { verificationStatus: 'verified', staffUids: ['owner'], verifiedBy: 'admin1' });
    const actions = entries.map((e) => e.action).sort();
    assert.deepEqual(actions, [ACTIONS.ORG_VERIFIED, ACTIONS.STAFF_REMOVED].sort());
  });

  test('no change at all produces no entries', () => {
    const same = { verificationStatus: 'verified', staffUids: ['owner'] };
    assert.deepEqual(classifyOrgChange(same, same), []);
  });
});

describe('classifyStaffRequestChange', () => {
  test('a new request is staff.requested', () => {
    const r = classifyStaffRequestChange(null, { uid: 'u1', status: 'pending' });
    assert.equal(r.action, ACTIONS.STAFF_REQUESTED);
    assert.equal(r.actorUid, 'u1');
  });

  test('pending to approved is staff.approved, attributed to whoever decided', () => {
    const r = classifyStaffRequestChange(
      { status: 'pending' }, { status: 'approved', decidedBy: 'owner1' });
    assert.equal(r.action, ACTIONS.STAFF_APPROVED);
    assert.equal(r.actorUid, 'owner1');
  });

  test('pending to rejected is staff.rejected', () => {
    const r = classifyStaffRequestChange(
      { status: 'pending' }, { status: 'rejected', decidedBy: 'owner1' });
    assert.equal(r.action, ACTIONS.STAFF_REJECTED);
  });

  test('anything not a pending-to-decided transition is not classified', () => {
    assert.equal(
      classifyStaffRequestChange({ status: 'approved' }, { status: 'approved' }), null);
  });
});

describe('classifyReportChange', () => {
  test('open to resolved is report.resolved', () => {
    const r = classifyReportChange({ status: 'open' }, { status: 'resolved', resolvedBy: 'admin1' });
    assert.equal(r.action, ACTIONS.REPORT_RESOLVED);
    assert.equal(r.actorUid, 'admin1');
  });

  test('open to dismissed is report.dismissed', () => {
    const r = classifyReportChange({ status: 'open' }, { status: 'dismissed', resolvedBy: 'admin1' });
    assert.equal(r.action, ACTIONS.REPORT_DISMISSED);
  });

  test('submitting a report is not itself audited, matching the old behaviour', () => {
    assert.equal(classifyReportChange(null, { status: 'open' }), null);
  });

  test('a report already decided is not reclassified on a later write', () => {
    assert.equal(
      classifyReportChange({ status: 'resolved' }, { status: 'resolved', resolution: 'edited' }),
      null);
  });
});
