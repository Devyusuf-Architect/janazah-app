// The slot that stops a cold start from losing the notice it was opened for.
//
// Tapping a notification when the app is not running is the most important
// way into this app, and it used to race: the tap pushed /n/{id} within tens
// of milliseconds, and the splash replaced it a few hundred milliseconds
// later when it finished deciding where to send somebody. The tap opened the
// app and lost the notice.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  setPendingNotice, takePendingNotice, hasPendingNotice,
  markLaunchSettled, launchSettled,
} from '../src/features/alerts/pending-notice.ts';

test('nothing is pending to begin with', () => {
  assert.equal(hasPendingNotice(), false);
  assert.equal(takePendingNotice(), null);
});

test('a pending notice is read exactly once', () => {
  setPendingNotice('abc123');
  assert.equal(hasPendingNotice(), true);
  assert.equal(takePendingNotice(), 'abc123');

  // The second reader gets nothing, which is what stops the splash and
  // sign-in from both opening it.
  assert.equal(takePendingNotice(), null);
  assert.equal(hasPendingNotice(), false);
});

test('the last tap wins', () => {
  setPendingNotice('first');
  setPendingNotice('second');
  assert.equal(takePendingNotice(), 'second');
});

test('nothing may navigate until the splash has decided', () => {
  // Ordering matters more than the value: before the splash settles, a tap
  // must leave its id here rather than push a screen the splash will replace.
  assert.equal(launchSettled(), false);
  markLaunchSettled();
  assert.equal(launchSettled(), true);
});
