// Following, once there are two clients.
//
// Until the mobile app existed, following a masjid was a list in
// localStorage and there was no user record to protect. That was a deliberate
// decision and a good one, and it does not survive contact with a second
// client: localStorage does not travel between a phone and a browser.
//
// /users/{uid} is the answer, and these tests are what keep it from becoming
// anything more. The authorization side is in rules.test.js; this file covers
// the client behaviour that the rules cannot see, and the two places the
// client and the rules have to agree.

import { test, describe, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const sync = readFileSync('public/js/account-sync.js', 'utf8');
const followsSource = readFileSync('public/js/follows.js', 'utf8');
const rules = readFileSync('firestore.rules', 'utf8');
const account = readFileSync('public/js/views/account.js', 'utf8');

// follows.js has no imports, so it runs here directly given somewhere to
// store things. That absence is itself load-bearing; see the test below.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const follows = await import('../public/js/follows.js');

beforeEach(() => store.clear());

describe('signed out, following is exactly what it always was', () => {
  test('follows.js needs no account, no network and no Firebase', () => {
    // The most important property on the most important path. Reading the
    // feed and following a masjid must never require signing in, so the
    // module every view calls during a render must not depend on any of it.
    assert.ok(!/from 'firebase/.test(followsSource),
      'follows.js has grown a Firebase import; signed-out following now needs a network');
    assert.ok(!/await |async /.test(followsSource.replace(/\/\/.*$/gm, '')),
      'follows.js has become asynchronous; nine call sites read it during a render');
  });

  test('following and unfollowing still work with nothing signed in', () => {
    assert.equal(follows.isFollowing('org-a'), false);
    follows.follow('org-a');
    assert.deepEqual(follows.followedOrgIds(), ['org-a']);
    assert.equal(follows.toggleFollow('org-a'), false);
    assert.deepEqual(follows.followedOrgIds(), []);
  });

  test('following the same masjid twice does not list it twice', () => {
    follows.follow('org-a');
    follows.follow('org-a');
    assert.deepEqual(follows.followedOrgIds(), ['org-a']);
  });
});

describe('the mirror is told about changes', () => {
  test('a change announces the new list', () => {
    const seen = [];
    const stop = follows.onChange((ids) => seen.push(ids));
    follows.follow('org-a');
    follows.follow('org-b');
    follows.unfollow('org-a');
    stop();
    follows.follow('org-c');

    assert.deepEqual(seen, [['org-a'], ['org-a', 'org-b'], ['org-b']]);
    assert.equal(seen.length, 3, 'a listener kept being called after unsubscribing');
  });

  test('a list arriving from the account does not announce', () => {
    // Otherwise the merge would write what it just read straight back to the
    // server, on every sign-in, forever.
    const seen = [];
    follows.onChange((ids) => seen.push(ids));
    follows.replaceFromAccount(['org-a', 'org-b']);
    assert.deepEqual(follows.followedOrgIds(), ['org-a', 'org-b']);
    assert.deepEqual(seen, []);
  });

  test('a listener that throws does not lose the follow', () => {
    follows.onChange(() => { throw new Error('deliberate'); });
    follows.follow('org-a');
    assert.deepEqual(follows.followedOrgIds(), ['org-a']);
  });
});

describe('what the account copy may contain', () => {
  test('the client writes only the keys the rules permit', () => {
    const block = rules.match(/function userKeys\(\)\s*\{[\s\S]*?\}/);
    assert.ok(block, 'userKeys() not found in firestore.rules');
    for (const key of ['followedOrgIds', 'prefs', 'updatedAt']) {
      assert.ok(block[0].includes(`'${key}'`), `${key} is written but not allowed`);
      assert.ok(sync.includes(key), `${key} is allowed by the rules but never written`);
    }
  });

  test('no position, no identity and no attendance is written', () => {
    // The reason /users has a key allowlist at all. The rules reject these;
    // this checks the client does not even try, so a rejected write can never
    // be the thing that makes following look broken.
    const body = sync.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const forbidden of [
      'lat', 'lng', 'cell', 'attended', 'viewed', 'displayName', 'email',
    ]) {
      assert.ok(!new RegExp(`\\b${forbidden}\\s*:`).test(body),
        `account-sync.js writes ${forbidden}, which must never leave the device`);
    }
  });

  test('the preference set matches the rules on both sides', () => {
    const block = rules.match(/function prefsKeys\(\)\s*\{[\s\S]*?\}/);
    assert.ok(block, 'prefsKeys() not found in firestore.rules');
    for (const key of ['radiusKm', 'alertScope', 'followAlerts']) {
      assert.ok(block[0].includes(`'${key}'`), `${key} is not allowed by the rules`);
      assert.ok(sync.includes(key), `${key} is allowed by the rules but never synced`);
    }
  });

  test('the follow list is capped at the number the rules cap at', () => {
    const cap = rules.match(/followedOrgIds\.size\(\)\s*<=\s*(\d+)/);
    assert.ok(cap, 'the rules must cap the follow list');
    assert.ok(sync.includes(`slice(0, ${cap[1]})`),
      `account-sync.js must trim to ${cap[1]} so a write is never rejected for length`);
  });
});

describe('the merge cannot lose somebody\'s masjids', () => {
  test('sign-in unions the two lists rather than replacing either', () => {
    // Three followed on a phone and two in a browser means five. A
    // replacement here would silently unfollow whichever set signed in
    // first, and the reader would find out by not being told about a funeral.
    assert.match(sync, /new Set\(\[\.\.\.here, \.\.\.there\]\)/,
      'the merge must be a union of both sides');
    assert.ok(!/followedOrgIds:\s*there/.test(sync),
      'the account copy must not simply overwrite the local list');
  });

  test('an anonymous session is not treated as an account', () => {
    // Every report opens one. They are handles for rate limiting, not people,
    // and the rules reject a write from one, so attempting it would produce a
    // permission error on an ordinary path.
    assert.match(sync, /!user\.isAnonymous/,
      'account-sync must ignore anonymous sessions');
  });

  test('a failed mirror never blocks a follow', () => {
    assert.match(sync, /console\.error\('account-sync push'/,
      'a failed push must be logged and swallowed, not thrown');
    assert.ok(!/throw /.test(sync), 'account-sync must not throw into a render path');
  });
});

describe('deleting an account takes its record with it', () => {
  test('the record is deleted before the account, while that is still possible', () => {
    // Afterwards nobody can: the rules open this document to its own account
    // and to nobody else, not even an administrator, so one left behind is
    // unreachable forever.
    const deleteRecord = account.indexOf('deleteAccountRecord()');
    const deleteAccount = account.indexOf('deleteUser(auth.currentUser)');
    assert.ok(deleteRecord > 0, 'the account page must delete the /users document');
    assert.ok(deleteAccount > 0, 'the account page must still delete the account');
    assert.ok(deleteRecord < deleteAccount,
      'the /users document must be deleted before the account that owns it');
  });
});
