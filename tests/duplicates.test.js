// Duplicate detection.
//
// This only ever warns. The asymmetry that shapes it: missing a duplicate
// costs the community a second notification for one funeral, while a false
// positive that discouraged a coordinator from publishing could cost someone
// the chance to attend. So it errs towards silence.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { looksLikeDuplicate, normaliseName } = await import('../public/js/model.js');
const { distanceKm } = await import('../public/js/geo.js');

const TORONTO = { lat: 43.6532, lng: -79.3832 };
const MISSISSAUGA = { lat: 43.5890, lng: -79.6441 };   // ~22 km
const VANCOUVER = { lat: 49.2827, lng: -123.1207 };

const at = (iso) => new Date(iso);

const notice = (over = {}) => ({
  orgId: 'org1',
  orgName: 'Masjid A',
  status: 'published',
  deceasedName: 'Ahmad Ibrahim',
  showDeceasedName: true,
  janazahAt: at('2026-12-01T18:30:00Z'),
  prayerLocation: { ...TORONTO, name: 'Hall', address: '1 St' },
  ...over,
});

const dup = (a, b) => looksLikeDuplicate(a, b, distanceKm);

describe('normaliseName', () => {
  test('ignores case, accents and punctuation', () => {
    assert.equal(normaliseName('Aḥmad  Ibrāhīm!'), normaliseName('ahmad ibrahim'));
    assert.equal(normaliseName("Al-Sayyid O'Neill"), 'al sayyid o neill');
  });

  test('handles nothing gracefully', () => {
    assert.equal(normaliseName(null), '');
    assert.equal(normaliseName(undefined), '');
  });
});

describe('looksLikeDuplicate', () => {
  test('flags the same name at the same time from another masjid nearby', () => {
    assert.equal(dup(notice(), notice({ orgId: 'org2', orgName: 'Masjid B' })), true);
  });

  test('flags a name written differently', () => {
    assert.equal(dup(notice(), notice({ orgId: 'org2', deceasedName: 'aḥmad ibrahim' })), true);
  });

  test('flags a fuller version of the same name', () => {
    assert.equal(
      dup(notice({ deceasedName: 'Ahmad Ibrahim' }),
          notice({ orgId: 'org2', deceasedName: 'Ahmad Ibrahim Al-Sayyid' })),
      true);
  });

  test('does not flag the same name on a different day', () => {
    assert.equal(
      dup(notice(), notice({ orgId: 'org2', janazahAt: at('2026-12-03T18:30:00Z') })),
      false);
  });

  test('does not flag the same name three thousand kilometres away', () => {
    assert.equal(
      dup(notice(), notice({
        orgId: 'org2',
        prayerLocation: { ...VANCOUVER, name: 'Hall', address: '1 St' },
      })),
      false);
  });

  test('does not flag two different people at the same masjid on the same day', () => {
    // Different names, six hours apart: two genuine Janazahs.
    assert.equal(
      dup(notice({ janazahAt: at('2026-12-01T13:00:00Z') }),
          notice({ deceasedName: 'Fatima Yusuf', janazahAt: at('2026-12-01T19:00:00Z') })),
      false);
  });

  test('flags the same masjid posting twice for the same slot', () => {
    // Even with different names this is worth a second look, because it is
    // usually a coordinator submitting twice.
    assert.equal(
      dup(notice({ janazahAt: at('2026-12-01T18:30:00Z') }),
          notice({ deceasedName: 'Someone Else', janazahAt: at('2026-12-01T19:00:00Z') })),
      true);
  });

  test('never flags a cancelled notice', () => {
    assert.equal(dup(notice(), notice({ orgId: 'org2', status: 'cancelled' })), false);
  });

  test('does not flag on a withheld name alone', () => {
    // Two notices with no public name are not evidence of anything.
    assert.equal(
      dup(notice({ deceasedName: '', showDeceasedName: false, orgId: 'orgA' }),
          notice({ deceasedName: '', showDeceasedName: false, orgId: 'orgB',
                   prayerLocation: { ...MISSISSAUGA, name: 'H', address: '2 St' } })),
      false);
  });

  test('survives a missing or unusable time rather than throwing', () => {
    assert.equal(dup(notice({ janazahAt: null }), notice()), false);
    assert.equal(dup(notice(), notice({ janazahAt: 'not a date' })), false);
  });

  test('survives a notice with no coordinates', () => {
    assert.equal(
      dup(notice({ prayerLocation: { name: 'H', address: '1 St' } }),
          notice({ orgId: 'org2' })),
      false);
  });
});
