// Who the app thinks may do what, checked against who the rules actually let.
//
// src/lib/org-role.ts is a mirror of clauses in firestore.rules, and a mirror
// that drifts is worse than no mirror: it either hides a section from the
// person it belongs to, or offers somebody a button whose write is refused.
// So these read the rules file itself rather than restating what it says.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  orgRole, roleLabel, canEditOrg, canManageNotices, canWithdrawOrg,
  WITHDRAWABLE_STATUSES, EDITABLE_ORG_FIELDS,
  draftFrom, changedFields, movedAddress, draftProblem, addressLine,
} from '../src/lib/org-role';
import type { Organization } from '../src/lib/notice';

const here = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(resolve(here, '../../firestore.rules'), 'utf8');

const org = (over: Partial<Organization> = {}): Organization => ({
  id: 'org1',
  name: 'Test Masjid',
  type: 'masjid',
  address: '100 Example St',
  city: 'Toronto',
  province: 'ON',
  lat: 43.65,
  lng: -79.38,
  verificationStatus: 'verified',
  ownerUid: 'owner',
  staffUids: ['owner', 'staff'],
  ...over,
});

describe('standing in an organization', () => {
  test('the owner is the owner even though they are also staff', () => {
    // The rules give an owner a superset of what a staff member may do, so
    // somebody who is both must be treated as the owner or they lose the
    // ability to withdraw their own registration.
    assert.equal(orgRole(org(), 'owner'), 'owner');
  });

  test('a listed staff member is staff', () => {
    assert.equal(orgRole(org(), 'staff'), 'staff');
  });

  test('everybody else is nobody', () => {
    assert.equal(orgRole(org(), 'stranger'), null);
    assert.equal(orgRole(org(), null), null);
    assert.equal(orgRole(null, 'owner'), null);
  });

  test('sample data belongs to nobody', () => {
    // src/lib/sample.ts gives every sample an empty staff list and no owner,
    // which is what stops a management card appearing on demo content.
    assert.equal(orgRole(org({ ownerUid: undefined, staffUids: [] }), 'owner'), null);
  });

  test('a role has a word for it, and nobody has none', () => {
    assert.equal(roleLabel('owner'), 'Owner');
    assert.equal(roleLabel('staff'), 'Staff');
    assert.equal(roleLabel(null), '');
  });
});

describe('what each role may do', () => {
  test('owner and staff may edit, a community member may not', () => {
    assert.equal(canEditOrg('owner'), true);
    assert.equal(canEditOrg('staff'), true);
    assert.equal(canEditOrg(null), false);
  });

  test('editing does not wait on verification', () => {
    // An organization that has been asked for more information has to be able
    // to correct itself, which is the whole point of that status.
    assert.equal(canEditOrg(orgRole(org({ verificationStatus: 'needs_information' }), 'staff')), true);
  });

  test('only a verified organization can be published for', () => {
    for (const status of ['pending', 'needs_information', 'rejected', 'suspended', 'withdrawn']) {
      assert.equal(canManageNotices('owner', org({ verificationStatus: status })), false, status);
    }
    assert.equal(canManageNotices('owner', org()), true);
  });

  test('a community member can never publish', () => {
    assert.equal(canManageNotices(null, org()), false);
  });

  test('only the owner can withdraw, and only before approval', () => {
    for (const status of WITHDRAWABLE_STATUSES) {
      assert.equal(canWithdrawOrg('owner', org({ verificationStatus: status })), true, status);
      assert.equal(canWithdrawOrg('staff', org({ verificationStatus: status })), false, status);
      assert.equal(canWithdrawOrg(null, org({ verificationStatus: status })), false, status);
    }
  });

  test('a verified or suspended organization cannot be withdrawn from the app', () => {
    // Both belong to a platform administrator: one because published notices
    // are behind it, the other because withdrawing would be an escape.
    assert.equal(canWithdrawOrg('owner', org({ verificationStatus: 'verified' })), false);
    assert.equal(canWithdrawOrg('owner', org({ verificationStatus: 'suspended' })), false);
  });
});

describe('the rules and this app agree', () => {
  test('the withdrawable statuses are the ones the rule names', () => {
    const clause = rules.slice(rules.indexOf('allow update: if isOrgOwner(orgId)\n        && validOrgShape()\n        && resource.data.verificationStatus'));
    const listed = clause.slice(0, clause.indexOf(']'));
    for (const status of WITHDRAWABLE_STATUSES) {
      assert.ok(listed.includes(`'${status}'`),
        `firestore.rules does not allow withdrawing from ${status}`);
    }
    for (const forbidden of ['verified', 'suspended', 'withdrawn']) {
      assert.equal(WITHDRAWABLE_STATUSES.includes(forbidden), false,
        `${forbidden} must not be withdrawable from a client`);
    }
  });

  test('withdrawn is a status the rules accept', () => {
    assert.ok(rules.includes("'suspended', 'withdrawn']"),
      'validOrgShape() does not list withdrawn');
  });

  test('every editable field is one the organization document allows', () => {
    const block = rules.slice(rules.indexOf('function orgKeys()'));
    const keys = block.slice(0, block.indexOf(';'));
    for (const field of EDITABLE_ORG_FIELDS) {
      assert.ok(keys.includes(`'${field}'`), `orgKeys() has no ${field}`);
    }
  });

  test('nothing the rules reserve is editable from the app', () => {
    // Status, ownership, the staff list and the stamps. The rules refuse all
    // of them from a client; this makes sure no code path even offers one.
    for (const reserved of [
      'verificationStatus', 'statusReason', 'verifiedAt', 'verifiedBy',
      'withdrawnAt', 'withdrawnBy', 'ownerUid', 'staffUids',
      'createdAt', 'createdBy',
    ]) {
      assert.equal((EDITABLE_ORG_FIELDS as readonly string[]).includes(reserved), false,
        `${reserved} must not be editable`);
    }
  });
});

describe('a draft of an edit', () => {
  test('an untouched form writes nothing', () => {
    assert.deepEqual(changedFields(org(), draftFrom(org())), {});
  });

  test('only what changed is sent', () => {
    const draft = { ...draftFrom(org()), phone: '+1 416 555 0100' };
    assert.deepEqual(changedFields(org(), draft), { phone: '+1 416 555 0100' });
  });

  test('whitespace alone is not a change', () => {
    const draft = { ...draftFrom(org()), name: '  Test Masjid  ' };
    assert.deepEqual(changedFields(org(), draft), {});
  });

  test('an address change is what moves the map pin', () => {
    assert.equal(movedAddress({ phone: '555' }), false);
    assert.equal(movedAddress({ city: 'Ottawa' }), true);
    assert.equal(movedAddress({ postalCode: 'K1A 0B1' }), true);
  });

  test('a masjid cannot be saved without a name or a place', () => {
    const base = draftFrom(org());
    assert.match(draftProblem({ ...base, name: '   ' }) ?? '', /name/i);
    assert.match(draftProblem({ ...base, address: '' }) ?? '', /address/i);
    assert.match(draftProblem({ ...base, city: '' }) ?? '', /city/i);
    assert.match(draftProblem({ ...base, province: '' }) ?? '', /province/i);
  });

  test('the name limit matches the one the rules enforce', () => {
    // validOrgShape() rejects a name over 140 characters. Saying so on the
    // screen is better than a write refused as "permission denied".
    assert.ok(rules.includes('name.size() <= 140'));
    const base = draftFrom(org());
    assert.equal(draftProblem({ ...base, name: 'x'.repeat(140) }), null);
    assert.ok(draftProblem({ ...base, name: 'x'.repeat(141) }));
  });

  test('an address that is nearly filled in is still geocodable', () => {
    assert.equal(
      addressLine({ ...draftFrom(org()), postalCode: '' }),
      '100 Example St, Toronto, ON',
    );
  });

  test('contact details are checked, and optional', () => {
    const base = draftFrom(org());
    assert.equal(draftProblem({ ...base, contactEmail: '', website: '' }), null);
    assert.ok(draftProblem({ ...base, contactEmail: 'not an address' }));
    assert.equal(draftProblem({ ...base, contactEmail: 'imam@example.org' }), null);
    assert.ok(draftProblem({ ...base, website: 'example.org' }));
    assert.equal(draftProblem({ ...base, website: 'https://example.org' }), null);
  });
});
