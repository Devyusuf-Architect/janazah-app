// Day grouping, including the case the whole thing exists to get right.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { groupByDay, dayKey, dayTitle } from '../src/lib/grouping.ts';

// 8pm Toronto on the 2nd, which is already the 3rd in UTC and still the 2nd
// in Vancouver. Any of the three could be picked by a careless implementation.
const NOW = new Date('2026-10-02T20:00:00-04:00');

const at = (iso: string, timeZone = 'America/Toronto') =>
  ({ janazahAt: new Date(iso), timeZone });

test('a notice is grouped by the calendar day in its own zone', () => {
  // 11pm Toronto on the 2nd. In UTC that is the 3rd, and grouping by UTC
  // would file tonight's Janazah under tomorrow.
  const [group] = groupByDay([at('2026-10-02T23:00:00-04:00')], NOW);
  assert.equal(group?.key, '2026-10-02');
  assert.equal(group?.title, 'Today');
});

test('a notice in another zone keeps that zone\'s day', () => {
  // 9pm Vancouver on the 2nd is midnight Toronto on the 3rd. The notice is on
  // the 2nd for the people attending it, which is whose day counts.
  const [group] = groupByDay(
    [at('2026-10-02T21:00:00-07:00', 'America/Vancouver')], NOW,
  );
  assert.equal(group?.key, '2026-10-02');
});

test('groups keep the order the feed arrived in', () => {
  const groups = groupByDay([
    at('2026-10-02T13:00:00-04:00'),
    at('2026-10-02T17:00:00-04:00'),
    at('2026-10-03T10:00:00-04:00'),
    at('2026-10-05T10:00:00-04:00'),
  ], NOW);

  assert.deepEqual(groups.map((g) => g.title), [
    'Today', 'Tomorrow', 'Monday, October 5',
  ]);
  assert.deepEqual(groups.map((g) => g.items.length), [2, 1, 1]);
});

test('a notice with no time is kept, under its own heading', () => {
  const groups = groupByDay([
    { janazahAt: null, timeZone: 'America/Toronto' },
    at('2026-10-02T13:00:00-04:00'),
  ], NOW);

  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.title, 'Time to be confirmed');
});

test('dayKey and dayTitle agree on what today is', () => {
  const key = dayKey(NOW, 'America/Toronto');
  assert.equal(dayTitle(key, key, 'never'), 'Today');
});
