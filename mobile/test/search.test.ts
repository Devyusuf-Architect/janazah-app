// Search, and the one thing about it that must never regress.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { search, matches, fold, whereLine } from '../src/lib/search.ts';
import type { Notice } from '../src/lib/notice.ts';

const notice = (over: Partial<Notice>): Notice => ({
  id: 'n1',
  orgId: 'o1',
  orgName: 'Sample Masjid of Toronto',
  orgType: 'masjid',
  status: 'published',
  isPublic: true,
  deceasedName: null,
  showDeceasedName: false,
  janazahAt: new Date('2026-10-02T13:30:00-04:00'),
  timeZone: 'America/Toronto',
  timeLabel: '',
  prayerLocation: {
    name: 'Sample Masjid',
    address: '1 Example Street, Toronto',
    lat: 43.65,
    lng: -79.38,
  },
  burialLocation: null,
  instructions: '',
  version: 1,
  publishedAt: null,
  cancelledAt: null,
  cancelReason: '',
  correctionNote: '',
  redactedAt: null,
  ...over,
});

test('a private name is never findable, though it is on the document', () => {
  // The family's decision, not ours. The name stays on the notice until
  // retention redacts it, so search has to check the flag and not the value.
  const priv = notice({ deceasedName: 'Fulan ibn Fulan', showDeceasedName: false });
  assert.equal(matches(priv, 'Fulan'), false);
  assert.deepEqual(search([priv], 'Fulan'), []);

  const shared = notice({ deceasedName: 'Fulan ibn Fulan', showDeceasedName: true });
  assert.equal(matches(shared, 'Fulan'), true);
});

test('the masjid, the city and the address are searchable', () => {
  const n = notice({});
  assert.ok(matches(n, 'Masjid'));
  assert.ok(matches(n, 'Toronto'));
  assert.ok(matches(n, 'Example'));
});

test('every word must match, in any order', () => {
  const n = notice({});
  assert.ok(matches(n, 'toronto masjid'));
  assert.equal(matches(n, 'masjid ottawa'), false);
});

test('words match by prefix, not by substring', () => {
  const n = notice({});
  assert.ok(matches(n, 'mas'), 'a prefix should match');
  assert.equal(matches(n, 'asjid'), false, 'the middle of a word should not');
});

test('accents and apostrophes fold, because names are spelled many ways', () => {
  assert.equal(fold('Taʼziyah'), fold('Taziyah'));
  const accented = notice({ orgName: 'Masjid al-Salām' });
  assert.ok(matches(accented, 'salam'), 'a hyphenated, accented name should match');
});

test('an empty query matches nothing rather than everything', () => {
  assert.deepEqual(search([notice({})], '   '), []);
});

test('a name match outranks an address match', () => {
  const byName = notice({
    id: 'byName',
    deceasedName: 'Fulan Ahmad',
    showDeceasedName: true,
    orgName: 'Another Masjid',
  });
  const byAddress = notice({
    id: 'byAddress',
    prayerLocation: {
      name: 'Prayer hall',
      address: '4 Ahmad Street, Toronto',
      lat: 43.6,
      lng: -79.4,
    },
  });
  const results = search([byAddress, byName], 'Ahmad');
  assert.deepEqual(results.map((r) => r.id), ['byName', 'byAddress']);
});

test('instructions and cancellation reasons are not searchable', () => {
  // Public, but prose about one funeral. Matching on it produces confusing
  // results rather than useful ones.
  const n = notice({
    instructions: 'Parking behind the plaza',
    cancelReason: 'Postponed at the family request',
  });
  assert.equal(matches(n, 'plaza'), false);
  assert.equal(matches(n, 'postponed'), false);
});

test('a list row does not print the masjid name twice', () => {
  // A masjid usually holds the prayer at itself, so prayerLocation.name is
  // very often the organization's own name. The address is what is useful
  // then; when the prayer is somewhere else, the place name is.
  assert.equal(
    whereLine('Sample Islamic Centre', {
      name: 'Sample Islamic Centre', address: '42 Example Avenue, Mississauga',
    }),
    '42 Example Avenue, Mississauga',
  );
  assert.equal(
    whereLine('Sample Masjid of Scarborough', {
      name: 'Sample Masjid', address: '1 Example Street, Scarborough',
    }),
    '1 Example Street, Scarborough',
    'a place name contained in the organization name still counts as the same place',
  );
  assert.equal(
    whereLine('Sample Masjid of Scarborough', {
      name: 'Example Community Hall', address: '9 Other Road',
    }),
    'Example Community Hall',
    'somewhere else is exactly what a reader needs to see',
  );
  assert.equal(whereLine('Sample Masjid', null), '');
});
