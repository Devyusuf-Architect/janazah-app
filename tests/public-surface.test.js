// What the world can read.
//
// A notice document is world-readable once published. This file pins the exact
// set of fields that may appear on it, so adding one becomes a deliberate act
// that fails the build until someone updates this list and thinks about it.
//
// The rules enforce the allowlist; this asserts the allowlist is the set we
// meant. Both matter: the rules stop an accident, this stops a decision made
// without noticing.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { NOTICE_PUBLIC_KEYS, FORBIDDEN_PUBLIC_FIELDS } =
  await import('../public/js/model.js');

/** Every field a community member, or anyone at all, may see on a notice. */
const EXPECTED_PUBLIC_FIELDS = [
  // Who published it
  'orgId', 'orgName', 'orgType',
  // Lifecycle
  'status', 'isPublic', 'version',
  'createdBy', 'createdAt', 'updatedAt', 'lastEditedBy',
  'publishedAt', 'cancelledAt', 'cancelReason', 'correctionNote', 'redactedAt',
  // The notice itself
  'deceasedName', 'showDeceasedName',
  'janazahAt', 'timeZone', 'timeLabel',
  'prayerLocation', 'burialLocation', 'instructions',
];

describe('the public surface of a notice', () => {
  test('is exactly the set we intend', () => {
    assert.deepEqual(
      [...NOTICE_PUBLIC_KEYS].sort(),
      [...EXPECTED_PUBLIC_FIELDS].sort(),
      'The public field list changed. Anything added here is readable by ' +
      'anyone on the internet, forever, including by search engines. Confirm ' +
      'that is intended, then update EXPECTED_PUBLIC_FIELDS.');
  });

  test('carries a staff identifier but nothing else about a person', () => {
    // createdBy and lastEditedBy are opaque uids, which the audit trail needs.
    // No email, no name, no phone number belongs on a public document.
    for (const field of NOTICE_PUBLIC_KEYS) {
      assert.ok(!/email|phone|contact|address$|notes/i.test(field)
        || field === 'prayerLocation' || field === 'burialLocation',
        `"${field}" looks like personal information on a public document`);
    }
  });

  test('the forbidden list and the allowlist do not overlap', () => {
    for (const forbidden of FORBIDDEN_PUBLIC_FIELDS) {
      assert.ok(!NOTICE_PUBLIC_KEYS.includes(forbidden),
        `"${forbidden}" is both allowed and forbidden`);
    }
  });
});

describe('the rules agree with the client', () => {
  const rules = readFileSync('firestore.rules', 'utf8');

  test('every allowed field appears in the rules allowlist', () => {
    // The rules are the enforcement. If the client believes a field is
    // publishable and the rules do not, publishing simply fails; the reverse
    // is worse, because it means an unreviewed field can be written.
    const block = rules.slice(
      rules.indexOf('function noticePublicKeys()'),
      rules.indexOf('function noticeRequiredKeys()'));
    for (const field of NOTICE_PUBLIC_KEYS) {
      assert.ok(block.includes(`'${field}'`), `firestore.rules is missing "${field}"`);
    }
  });

  test('the rules allow nothing the client does not know about', () => {
    const block = rules.slice(
      rules.indexOf('function noticePublicKeys()'),
      rules.indexOf('function noticeRequiredKeys()'));
    for (const quoted of block.match(/'[a-zA-Z]+'/g) || []) {
      const field = quoted.slice(1, -1);
      assert.ok(NOTICE_PUBLIC_KEYS.includes(field),
        `firestore.rules allows "${field}" which model.js does not list`);
    }
  });

  test('user positions have no home anywhere in the rules', () => {
    // Nearby matching runs on the device. If a location collection is ever
    // added, this fails and forces the decision to be explicit.
    assert.ok(!/lastKnownGeohash|userLocation|lastPosition/i.test(rules),
      'the rules mention a stored user position');
  });

  test('the audit log cannot be written by any client, at all', () => {
    // Item 3 (server-side audit writes): entries are written only by Cloud
    // Functions triggers through the Admin SDK, which bypasses rules
    // entirely, so this must be closed to every client action, not just
    // update and delete. A client that could still create an entry could
    // still forge one, which is exactly the gap this closes.
    const block = rules.slice(rules.indexOf('match /auditLog/'));
    assert.match(block.slice(0, 1200), /allow create, update, delete: if false;/);
  });
});
