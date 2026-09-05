// store.myOrganizations() caching, added when the dashboard started calling
// it (to decide whether to show the staff-only quick actions) on top of its
// existing callers (the console's own context load/refresh, and the account
// page's "your masjids" list).
//
// Same reasoning and the same approach as tests/verified-orgs-cache.test.js:
// store.js cannot be imported directly in a plain Node test (it pulls in
// firebase.js, which expects a browser), so this checks the source text for
// the specific things the design calls for.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const store = readFileSync('public/js/store.js', 'utf8');

describe('myOrganizations() is cached, briefly and per uid', () => {
  test('a call within the TTL for the same uid reuses the cached promise, not a fresh query', () => {
    const fn = store.slice(
      store.indexOf('export async function myOrganizations'),
      store.indexOf('export function invalidateMyOrganizations'),
    );
    assert.match(fn, /myOrgsCache/, 'must consult the cache slot');
    assert.match(fn, /myOrgsCache\.uid === uid/, 'a different uid must not be served the wrong cache');
    assert.match(fn, /return myOrgsCache\.promise/, 'a warm cache must return the cached promise, not re-fetch');
  });

  test('a failed fetch does not poison the cache for the rest of the TTL window', () => {
    const fn = store.slice(
      store.indexOf('export async function myOrganizations'),
      store.indexOf('export function invalidateMyOrganizations'),
    );
    assert.match(fn, /promise\.catch\(/, 'a rejection must clear the cache slot so the next call retries');
  });

  test('an explicit invalidate function exists and drops the cache', () => {
    const fn = store.slice(store.indexOf('export function invalidateMyOrganizations'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    assert.match(body, /myOrgsCache\s*=\s*null/);
  });

  test('the actual Firestore query moved into a private helper, not duplicated', () => {
    const matches = store.match(/where\('staffUids', 'array-contains', uid\)/g) || [];
    assert.equal(matches.length, 1, 'the my-organizations query should exist exactly once');
  });
});

describe('every write that changes a staffUids array invalidates the cache', () => {
  for (const fnName of ['registerOrganization', 'approveStaffRequest', 'removeStaff']) {
    test(`${fnName} calls invalidateMyOrganizations()`, () => {
      const start = store.indexOf(`export async function ${fnName}`);
      assert.notEqual(start, -1, `${fnName} should still exist in store.js`);
      const nextExport = store.indexOf('\nexport ', start + 1);
      const body = store.slice(start, nextExport === -1 ? undefined : nextExport);
      assert.match(body, /invalidateMyOrganizations\(\)/,
        `${fnName} changes a staffUids array and must invalidate the cache`);
    });
  }
});
