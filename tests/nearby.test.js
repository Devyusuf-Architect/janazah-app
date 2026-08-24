// Distance and nearby-matching maths.
//
// These are pure functions, and the whole nearby feature is only as good as
// they are, so they are checked against values that follow from the formula
// rather than from memory.

import { test, describe, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';

// location.js reads localStorage at import time in some paths; give it one.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { geohash, distanceKm, formatDistance } = await import('../public/js/geo.js');
const locationModule = await import('../public/js/location.js');
const { nearbyNotices, noticeDistanceKm, isStale, settings, update, disable, STALE_AFTER_MS } =
  locationModule;

const EARTH_RADIUS_KM = 6371;

describe('distanceKm', () => {
  test('is zero for the same point', () => {
    assert.equal(distanceKm({ lat: 43.65, lng: -79.38 }, { lat: 43.65, lng: -79.38 }), 0);
  });

  test('one degree of longitude at the equator is one degree of arc', () => {
    // 2πR / 360, which is what the formula must reduce to on the equator.
    const expected = (2 * Math.PI * EARTH_RADIUS_KM) / 360;
    const actual = distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    assert.ok(Math.abs(actual - expected) < 0.001, `${actual} vs ${expected}`);
  });

  test('equator to pole is a quarter of the circumference', () => {
    const expected = (2 * Math.PI * EARTH_RADIUS_KM) / 4;
    const actual = distanceKm({ lat: 0, lng: 0 }, { lat: 90, lng: 0 });
    assert.ok(Math.abs(actual - expected) < 0.001, `${actual} vs ${expected}`);
  });

  test('is symmetric', () => {
    const a = { lat: 43.6532, lng: -79.3832 };
    const b = { lat: 49.2827, lng: -123.1207 };
    assert.ok(Math.abs(distanceKm(a, b) - distanceKm(b, a)) < 1e-9);
  });

  test('Toronto to Vancouver is a few thousand kilometres, not tens or millions', () => {
    // A sanity band wide enough to be certain of, narrow enough to catch a
    // radians/degrees or radius mix-up.
    const km = distanceKm({ lat: 43.6532, lng: -79.3832 }, { lat: 49.2827, lng: -123.1207 });
    assert.ok(km > 3000 && km < 3600, `got ${km}`);
  });
});

describe('geohash', () => {
  test('matches the standard reference encoding', () => {
    // The widely published worked example for this algorithm.
    assert.equal(geohash(57.64911, 10.40744, 11), 'u4pruydqqvj');
  });

  test('respects the requested precision', () => {
    assert.equal(geohash(43.6532, -79.3832, 5).length, 5);
    assert.equal(geohash(43.6532, -79.3832, 9).length, 9);
  });

  test('a shorter hash is a prefix of a longer one for the same point', () => {
    const long = geohash(43.6532, -79.3832, 9);
    assert.ok(long.startsWith(geohash(43.6532, -79.3832, 5)));
  });

  test('distant points do not share a coarse cell', () => {
    assert.notEqual(geohash(43.6532, -79.3832, 5), geohash(49.2827, -123.1207, 5));
  });

  test('rejects values that are not finite numbers', () => {
    assert.throws(() => geohash(NaN, 0), TypeError);
    assert.throws(() => geohash(0, undefined), TypeError);
  });
});

describe('formatDistance', () => {
  test('stays deliberately coarse', () => {
    assert.equal(formatDistance(0.4), 'under 1 km');
    assert.equal(formatDistance(3.27), '3.3 km');
    assert.equal(formatDistance(41.6), '42 km');
  });
});

describe('nearbyNotices', () => {
  const at = (lat, lng, id) => ({
    id, orgName: id, prayerLocation: { lat, lng, name: id, address: id },
  });

  // Roughly 1 km apart per 0.009 degrees of latitude.
  const here = { lat: 43.6532, lng: -79.3832 };
  const close = at(43.6577, -79.3832, 'close');       // ~0.5 km
  const mid = at(43.7432, -79.3832, 'mid');           // ~10 km
  const far = at(49.2827, -123.1207, 'far');          // Vancouver
  const noCoords = { id: 'nocoords', prayerLocation: { name: 'x', address: 'y' } };

  test('returns nothing without a position', () => {
    assert.deepEqual(nearbyNotices([close, mid], null, 10), []);
  });

  test('filters to the radius', () => {
    const ids = nearbyNotices([close, mid, far], here, 5).map((m) => m.notice.id);
    assert.deepEqual(ids, ['close']);
  });

  test('orders nearest first', () => {
    const ids = nearbyNotices([far, mid, close], here, 0).map((m) => m.notice.id);
    assert.deepEqual(ids, ['close', 'mid', 'far']);
  });

  test('a radius of zero means no limit', () => {
    assert.equal(nearbyNotices([close, mid, far], here, 0).length, 3);
  });

  test('skips notices with no coordinates rather than guessing', () => {
    const ids = nearbyNotices([close, noCoords], here, 50).map((m) => m.notice.id);
    assert.deepEqual(ids, ['close']);
    assert.equal(noticeDistanceKm(noCoords, here), null);
  });

  test('a notice exactly at the radius is included', () => {
    const km = noticeDistanceKm(mid, here);
    assert.equal(nearbyNotices([mid], here, km).length, 1);
    assert.equal(nearbyNotices([mid], here, km - 0.001).length, 0);
  });
});

describe('stored settings', () => {
  beforeEach(() => store.clear());

  test('defaults are off, with no position', () => {
    const s = settings();
    assert.equal(s.enabled, false);
    assert.equal(s.alertsEnabled, false);
    assert.equal(s.last, null);
    assert.equal(s.radiusKm, 10);
  });

  test('a position is overwritten in place, never appended', () => {
    update({ last: { lat: 1, lng: 1, at: 1000 } });
    update({ last: { lat: 2, lng: 2, at: 2000 } });
    const s = settings();
    assert.deepEqual(s.last, { lat: 2, lng: 2, at: 2000 });
    assert.equal(Array.isArray(s.last), false);
    assert.equal(JSON.parse(store.get('janazah.location')).last.lat, 2);
  });

  test('turning it off erases the stored position', () => {
    update({ enabled: true, alertsEnabled: true, last: { lat: 1, lng: 1, at: Date.now() } });
    const after = disable();
    assert.equal(after.enabled, false);
    assert.equal(after.alertsEnabled, false);
    assert.equal(after.last, null);
    assert.equal(settings().last, null);
    assert.ok(!JSON.stringify(store.get('janazah.location')).includes('"lat"'));
  });

  test('corrupt stored data falls back to the defaults', () => {
    store.set('janazah.location', 'not json');
    assert.equal(settings().enabled, false);
  });

  test('an old position is treated as stale', () => {
    assert.equal(isStale({ lat: 1, lng: 1, at: Date.now() }), false);
    assert.equal(isStale({ lat: 1, lng: 1, at: Date.now() - STALE_AFTER_MS - 1 }), true);
    assert.equal(isStale(null), true);
  });
});
