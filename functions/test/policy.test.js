// Retention and rate limit policy.
//
// Both decide when the system stops doing something, and a mistake in either
// is silent: too little retention destroys an audit trail, too much keeps a
// dead person's name public forever, and a broken rate limit either floods a
// community or silences a real Janazah.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import { RETENTION, daysAgo, redactionPatch, needsRedaction } from '../lib/retention.js';
import { LIMITS, checkAndCount } from '../lib/limits.js';

describe('retention policy', () => {
  test('private details go before the public name does', () => {
    // Family contacts are useless after the prayer; the notice itself is a
    // public record for a while longer.
    assert.ok(RETENTION.privateDetailsDays < RETENTION.publicNameDays);
  });

  test('daysAgo counts backwards from the given moment', () => {
    const now = Date.UTC(2026, 0, 31);
    assert.equal(daysAgo(30, now).toISOString(), new Date(Date.UTC(2026, 0, 1)).toISOString());
  });

  test('redaction removes the name and free text, and marks the notice', () => {
    const patch = redactionPatch('SERVER_TIME');
    assert.equal(patch.deceasedName, null);
    assert.equal(patch.showDeceasedName, false);
    assert.equal(patch.instructions, '');
    assert.equal(patch.correctionNote, '');
    assert.equal(patch.redactedAt, 'SERVER_TIME');
  });

  test('redaction leaves the notice itself in place', () => {
    // An old shared link should explain what happened, not break.
    const patch = redactionPatch('SERVER_TIME');
    for (const kept of ['status', 'janazahAt', 'prayerLocation', 'orgId', 'orgName']) {
      assert.equal(kept in patch, false, `redaction must not touch ${kept}`);
    }
  });

  test('a notice is only redacted once', () => {
    assert.equal(needsRedaction({ deceasedName: 'A Name' }), true);
    assert.equal(needsRedaction({ instructions: 'Park behind' }), true);
    assert.equal(needsRedaction({ correctionNote: 'Time moved' }), true);
    assert.equal(needsRedaction({ deceasedName: 'A Name', redactedAt: 'x' }), false);
    assert.equal(needsRedaction({ orgName: 'Masjid' }), false);
  });
});

describe('notification rate limit', () => {
  const now = 1_000_000_000_000;
  const windowMs = LIMITS.windowMinutes * 60 * 1000;

  test('a first notification is allowed and starts the window', () => {
    const result = checkAndCount(null, now);
    assert.equal(result.allowed, true);
    assert.equal(result.next.count, 1);
    assert.equal(result.next.windowStart, now);
  });

  test('allows exactly the budget, then stops', () => {
    let state = null;
    for (let i = 1; i <= LIMITS.notificationsPerWindow; i++) {
      const result = checkAndCount(state, now);
      assert.equal(result.allowed, true, `message ${i} should be allowed`);
      state = result.next;
    }
    const over = checkAndCount(state, now);
    assert.equal(over.allowed, false);
    assert.equal(over.tripped, true);
  });

  test('raises one report per burst, not one per message', () => {
    let state = { windowStart: now, count: LIMITS.notificationsPerWindow };
    const first = checkAndCount(state, now);
    assert.equal(first.tripped, true);
    const second = checkAndCount(first.next, now);
    assert.equal(second.allowed, false);
    assert.equal(second.tripped, false, 'only the crossing message reports');
  });

  test('keeps counting past the limit so the size of a burst is visible', () => {
    const state = { windowStart: now, count: 50 };
    assert.equal(checkAndCount(state, now).next.count, 51);
  });

  test('the window rolls over', () => {
    const spent = { windowStart: now, count: 99 };
    const later = checkAndCount(spent, now + windowMs);
    assert.equal(later.allowed, true);
    assert.equal(later.next.count, 1);
    assert.equal(later.next.windowStart, now + windowMs);
  });

  test('a corrupt counter does not lock an organization out', () => {
    // Whatever is in storage, a genuine Janazah must still be announceable.
    for (const junk of [{}, { count: 'lots' }, { windowStart: 'soon' }, null, undefined]) {
      assert.equal(checkAndCount(junk, now).allowed, true, JSON.stringify(junk));
    }
  });
});
