// The compact time formatter, checked against the rule it inherits.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatNoticeTime, timeUntil, timeSentence } from '../src/lib/time.ts';

const notice = (janazahAt: Date, timeZone: string, timeLabel = '') =>
  ({ janazahAt, timeZone, timeLabel });

// A fixed instant so these do not drift with the wall clock: 1:30pm Toronto.
const NOW = new Date('2026-10-02T12:00:00-04:00');
const AT = new Date('2026-10-02T13:30:00-04:00');

test('the time is rendered in the notice\'s zone, not the reader\'s', () => {
  const toronto = formatNoticeTime(notice(AT, 'America/Toronto'), NOW);
  const vancouver = formatNoticeTime(notice(AT, 'America/Vancouver'), NOW);

  assert.match(toronto.time, /1:30/);
  // Same instant, a different zone on the notice: 10:30 rather than 1:30.
  assert.match(vancouver.time, /10:30/);
});

test('the zone abbreviation appears only outside the default zone', () => {
  // The web module makes exactly this distinction (public/js/model.js), and
  // getting it wrong in either direction is somebody arriving at the wrong
  // time or reading noise on every notice.
  assert.equal(formatNoticeTime(notice(AT, 'America/Toronto'), NOW).zone, '');
  assert.notEqual(formatNoticeTime(notice(AT, 'America/Vancouver'), NOW).zone, '');
});

test('today and tomorrow are named', () => {
  assert.equal(formatNoticeTime(notice(AT, 'America/Toronto'), NOW).day, 'Today');

  const tomorrow = new Date('2026-10-03T13:30:00-04:00');
  assert.equal(
    formatNoticeTime(notice(tomorrow, 'America/Toronto'), NOW).day, 'Tomorrow',
  );

  const later = new Date('2026-10-09T13:30:00-04:00');
  const day = formatNoticeTime(notice(later, 'America/Toronto'), NOW).day;
  assert.match(day, /Fri/);
});

test('a day boundary is a calendar fact, not 24 hours', () => {
  // 11pm today and 1am tomorrow are two hours apart and two different days.
  const lateTonight = new Date('2026-10-02T23:00:00-04:00');
  const earlyTomorrow = new Date('2026-10-03T01:00:00-04:00');
  assert.equal(
    formatNoticeTime(notice(lateTonight, 'America/Toronto'), NOW).day, 'Today',
  );
  assert.equal(
    formatNoticeTime(notice(earlyTomorrow, 'America/Toronto'), NOW).day, 'Tomorrow',
  );
});

test('the masjid\'s own words for the time are kept', () => {
  const formatted = formatNoticeTime(
    notice(AT, 'America/Toronto', 'after Dhuhr'), NOW,
  );
  assert.equal(formatted.label, 'after Dhuhr');
  assert.match(timeSentence(formatted), /\(after Dhuhr\)/);
});

test('a missing time formats to nothing rather than to 1969', () => {
  const formatted = formatNoticeTime(
    { janazahAt: null, timeZone: 'America/Toronto', timeLabel: '' }, NOW,
  );
  assert.equal(formatted.day, '');
  assert.equal(formatted.time, '');
});

test('the countdown is coarse, and absent when it would not help', () => {
  assert.equal(timeUntil(new Date(NOW.getTime() + 30 * 60_000), NOW), 'in 30 min');
  assert.equal(timeUntil(new Date(NOW.getTime() + 2 * 3600_000), NOW), 'in about 2 hours');
  // Already past.
  assert.equal(timeUntil(new Date(NOW.getTime() - 60_000), NOW), null);
  // Further off than half a day: the date says it better.
  assert.equal(timeUntil(new Date(NOW.getTime() + 20 * 3600_000), NOW), null);
});
