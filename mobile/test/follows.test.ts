// Following, and the merge that makes two clients into one product.
//
// The union is the piece worth testing hardest. The wrong operation here does
// not throw and does not look broken: it silently unfollows masjids somebody
// deliberately chose on their other device, and they find out by not being
// told about a funeral.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The pure half. follows.ts itself imports AsyncStorage and Firestore, which
// node --test cannot load, and which is why the rules live in a module with
// no native imports.
import { union, sanitisePrefs, MAX_FOLLOWS } from '../src/lib/follow-merge.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

test('signing in unions the two lists rather than replacing either', () => {
  // Three followed on a phone, two in a browser, means five. Whichever
  // client signs in second must not discard the other's work.
  const phone = ['a', 'b', 'c'];
  const browser = ['d', 'e'];
  assert.deepEqual(union(phone, browser), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(union(browser, phone), ['d', 'e', 'a', 'b', 'c']);
});

test('the union deduplicates', () => {
  assert.deepEqual(union(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(union(['a', 'a'], ['a']), ['a']);
});

test('either side being empty is not a reason to lose the other', () => {
  assert.deepEqual(union([], ['a', 'b']), ['a', 'b']);
  assert.deepEqual(union(['a', 'b'], []), ['a', 'b']);
  assert.deepEqual(union([], []), []);
});

test('the union is capped at the same number the rules cap at', () => {
  // Exceeding it would make every subsequent write fail, which would look
  // like following being broken rather than like a limit.
  const many = Array.from({ length: 250 }, (_, i) => `org-${i}`);
  assert.equal(union(many, ['extra']).length, MAX_FOLLOWS);

  const rules = readFileSync(resolve(repoRoot, 'firestore.rules'), 'utf8');
  assert.match(
    rules,
    new RegExp(`followedOrgIds\\.size\\(\\)\\s*<=\\s*${MAX_FOLLOWS}`),
    'MAX_FOLLOWS must match the cap in firestore.rules',
  );
});

test('preferences are trimmed to exactly what the rules allow', () => {
  // Sending a key the rules do not permit fails the whole write, so anything
  // extra is dropped here rather than discovered as a permission denial.
  const cleaned = sanitisePrefs({
    radiusKm: 20,
    alertScope: 'follows',
    followAlerts: false,
    // @ts-expect-error deliberately passing something that must not survive
    lat: 43.6532,
  });
  assert.deepEqual(cleaned, {
    radiusKm: 20, alertScope: 'follows', followAlerts: false,
  });
});

test('an unrecognised alert scope becomes the safe default', () => {
  // 'nearby' is the wider of the two, so a corrupt value means somebody hears
  // about more funerals rather than fewer. That is the right way to fail.
  // @ts-expect-error deliberately invalid
  assert.equal(sanitisePrefs({ radiusKm: 10, alertScope: 'everything' })!.alertScope, 'nearby');
});

test('preferences with no usable radius are not written at all', () => {
  assert.equal(sanitisePrefs(null), null);
  assert.equal(sanitisePrefs({}), null);
  // @ts-expect-error deliberately invalid
  assert.equal(sanitisePrefs({ radiusKm: 'far' }), null);
});

test('followAlerts defaults on, and only an explicit false turns it off', () => {
  assert.equal(sanitisePrefs({ radiusKm: 10 })!.followAlerts, true);
  assert.equal(sanitisePrefs({ radiusKm: 10, followAlerts: false })!.followAlerts, false);
});

test('the synced preference set is exactly what the rules permit', () => {
  // Both ends of the contract, checked against each other. Adding a key on
  // one side without the other is the failure this catches.
  const rules = readFileSync(resolve(repoRoot, 'firestore.rules'), 'utf8');
  const block = rules.match(/function prefsKeys\(\)\s*\{[\s\S]*?\}/);
  assert.ok(block, 'prefsKeys() not found in firestore.rules');

  const cleaned = sanitisePrefs({ radiusKm: 10, alertScope: 'nearby', followAlerts: true })!;
  for (const key of Object.keys(cleaned)) {
    assert.ok(block![0].includes(`'${key}'`), `${key} is written but not allowed by the rules`);
  }
  for (const key of ['radiusKm', 'alertScope', 'followAlerts']) {
    assert.ok(key in cleaned, `${key} is allowed by the rules but never written`);
  }
});

test('nothing about a position or an attendance is in the synced shape', () => {
  // The reason /users has a key allowlist at all. If this list ever needs
  // widening, that is a decision to make in the rules first.
  const cleaned = sanitisePrefs({ radiusKm: 10 })!;
  for (const forbidden of ['lat', 'lng', 'cell', 'location', 'attended', 'viewed']) {
    assert.equal(forbidden in cleaned, false, `${forbidden} must never be synced`);
  }
});
