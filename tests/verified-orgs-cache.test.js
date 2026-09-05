// store.verifiedOrganizations() caching (item 1's fix).
//
// verifiedOrganizations() cannot be imported directly in a plain Node test:
// it pulls in firebase.js, which expects a browser. Same approach as
// tests/org-archive.test.js and tests/takedown.test.js: check the source text
// for the specific things that must hold. The rules and manual profiling
// (scripts run against the emulator, not part of this suite) are what proved
// the fetch count actually drops; this only proves the cache stays wired the
// way the design calls for, and does not leak into anything that must stay
// live.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const store = readFileSync('public/js/store.js', 'utf8');

describe('verifiedOrganizations() is cached, briefly and simply', () => {
  test('a call within the TTL reuses the same in-flight/resolved promise, not a fresh query', () => {
    const fn = store.slice(
      store.indexOf('export async function verifiedOrganizations'),
      store.indexOf('export function invalidateVerifiedOrganizations'),
    );
    assert.match(fn, /verifiedOrgsCache/, 'must consult the cache slot');
    assert.match(fn, /return verifiedOrgsCache\.promise/, 'a warm cache must return the cached promise, not re-fetch');
  });

  test('a failed fetch does not poison the cache for the rest of the TTL window', () => {
    const fn = store.slice(
      store.indexOf('export async function verifiedOrganizations'),
      store.indexOf('export function invalidateVerifiedOrganizations'),
    );
    assert.match(fn, /promise\.catch\(/, 'a rejection must clear the cache slot so the next call retries');
  });

  test('an explicit invalidate function exists and drops the cache', () => {
    const fn = store.slice(store.indexOf('export function invalidateVerifiedOrganizations'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    assert.match(body, /verifiedOrgsCache\s*=\s*null/);
  });

  test('the actual Firestore query moved into a private helper, not duplicated', () => {
    // There must be exactly one place that calls getDocs for organizations
    // filtered to verificationStatus == verified -- the cache wraps it, it
    // does not sit beside a second copy of the same query.
    const matches = store.match(/where\('verificationStatus', '==', 'verified'\)/g) || [];
    assert.equal(matches.length, 1, 'the verified-organizations query should exist exactly once');
  });
});

describe('every write that changes who counts as verified invalidates the cache', () => {
  for (const fnName of ['setVerificationStatus', 'archiveOrganization', 'restoreOrganization']) {
    test(`${fnName} calls invalidateVerifiedOrganizations()`, () => {
      const start = store.indexOf(`export async function ${fnName}`);
      assert.notEqual(start, -1, `${fnName} should still exist in store.js`);
      const nextExport = store.indexOf('\nexport ', start + 1);
      const body = store.slice(start, nextExport === -1 ? undefined : nextExport);
      assert.match(body, /invalidateVerifiedOrganizations\(\)/,
        `${fnName} changes the verified set and must invalidate the cache`);
    });
  }
});

describe('the cache never touches live listeners', () => {
  test('watchOrganizationsByStatus, watchAllOrganizations and other watch* functions still use onSnapshot directly', () => {
    for (const fnName of ['watchOrganizationsByStatus', 'watchAllOrganizations', 'watchPublicNotices', 'watchOrgNotices']) {
      const start = store.indexOf(`export function ${fnName}`);
      assert.notEqual(start, -1, `${fnName} should still exist`);
      const nextExport = store.indexOf('\nexport ', start + 1);
      const body = store.slice(start, nextExport === -1 ? undefined : nextExport);
      assert.match(body, /onSnapshot\(/, `${fnName} must keep delivering live updates via onSnapshot`);
      assert.doesNotMatch(body, /verifiedOrgsCache/, `${fnName} must not be affected by the one-shot cache`);
    }
  });
});
