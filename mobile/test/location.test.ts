// Nearby matching, and the guarantee underneath it.
//
// The web suite proves the privacy property end to end: it sets a distinctive
// browser position, drives the whole product path, and then greps every
// Firestore collection for those digits. This is the mobile counterpart. It
// cannot drive a device, so it proves the same thing structurally instead, by
// asserting that the modules which hold a position have no way to send one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

// The pure half. location.ts itself imports Expo's native modules, which
// node --test cannot load, and which is exactly why the rules live in a
// module that has none.
import {
  nearbyNotices, noticeDistanceKm, annotate, normalisePrefs, isStale,
  RADIUS_OPTIONS, DEFAULTS, STALE_AFTER_MS,
} from '../src/lib/nearby.ts';
import type { Notice } from '../src/lib/notice.ts';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

// Downtown Toronto, and three places at known distances from it.
const FROM = { lat: 43.6532, lng: -79.3832, at: Date.now() };

const at = (id: string, lat: number, lng: number): Notice => ({
  id,
  orgId: 'o1',
  orgName: 'Sample Masjid',
  status: 'published',
  isPublic: true,
  deceasedName: null,
  showDeceasedName: false,
  janazahAt: new Date(),
  timeZone: 'America/Toronto',
  timeLabel: '',
  prayerLocation: { name: 'Sample Masjid', address: '1 Example Street', lat, lng },
  burialLocation: null,
  instructions: '',
  version: 1,
  publishedAt: null,
  cancelledAt: null,
  cancelReason: '',
  correctionNote: '',
  redactedAt: null,
});

const NEAR = at('near', 43.6600, -79.3900);      // roughly 1 km
const MID = at('mid', 43.7615, -79.4111);        // roughly 12 km
const FAR = at('far', 45.4215, -75.6972);        // Ottawa, roughly 350 km

// --------------------------------------------------------------- the guard

/** Every .ts and .tsx file under a directory. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

test('nothing that holds a position can write to Firestore', () => {
  // The rule this protects: a user's position is never written to Firestore,
  // never sent to a masjid, and never leaves the device. Matching happens
  // here, against notices already fetched.
  //
  // If a change genuinely seems to need a position on the server, the design
  // has drifted; do not relax this test to accommodate it.
  const holders = [
    resolve(projectRoot, 'src/lib/location.ts'),
    resolve(projectRoot, 'src/lib/nearby.ts'),
    ...sources(resolve(projectRoot, 'src/features/nearby')),
  ];

  for (const file of holders) {
    const source = readFileSync(file, 'utf8');
    const name = relative(projectRoot, file);
    assert.equal(
      /@react-native-firebase\/firestore/.test(source), false,
      `${name} imports Firestore, and it holds or handles a position`,
    );
    for (const call of ['addDoc', 'setDoc', 'updateDoc', 'runTransaction']) {
      assert.equal(
        new RegExp(`\\b${call}\\s*\\(`).test(source), false,
        `${name} calls ${call}, and it holds or handles a position`,
      );
    }
  }
});

test('the stored point is overwritten, never appended to', () => {
  // A list of points is a travel history. The store writes one key holding
  // one object; nothing in the module accumulates.
  const source = readFileSync(resolve(projectRoot, 'src/lib/location.ts'), 'utf8');
  assert.equal(/\.push\(/.test(source), false, 'location.ts appends somewhere');
  assert.match(source, /deleteItemAsync/, 'opting out must erase the point');
});

// ------------------------------------------------------------- the matching

test('distance is measured to the prayer location', () => {
  const km = noticeDistanceKm(NEAR, FROM);
  assert.ok(km !== null && km > 0.5 && km < 2, `expected about 1 km, got ${km}`);
});

test('a notice with no usable coordinates has no distance', () => {
  const noPlace = { ...NEAR, prayerLocation: null };
  assert.equal(noticeDistanceKm(noPlace, FROM), null);

  const noNumbers = {
    ...NEAR,
    prayerLocation: { name: 'Hall', address: 'somewhere', lat: NaN, lng: NaN },
  };
  assert.equal(noticeDistanceKm(noNumbers, FROM), null);
});

test('the radius filters, and the result is nearest first', () => {
  const within = nearbyNotices([FAR, MID, NEAR], FROM, 20);
  assert.deepEqual(within.map((n) => n.notice.id), ['near', 'mid']);

  const tight = nearbyNotices([FAR, MID, NEAR], FROM, 5);
  assert.deepEqual(tight.map((n) => n.notice.id), ['near']);
});

test('a radius of zero means any distance, still sorted', () => {
  const all = nearbyNotices([FAR, MID, NEAR], FROM, 0);
  assert.deepEqual(all.map((n) => n.notice.id), ['near', 'mid', 'far']);
});

test('with no position, nothing is nearby rather than everything', () => {
  assert.deepEqual(nearbyNotices([NEAR, MID], null, 10), []);
  assert.equal(annotate([NEAR], null).size, 0);
});

test('annotate measures without filtering', () => {
  const distances = annotate([NEAR, FAR], FROM);
  assert.equal(distances.size, 2, 'a far notice still gets a distance');
  assert.ok(distances.get('far')! > 300);
});

// ------------------------------------------------------------- preferences

test('preferences fall back to the design defaults, not to undefined', () => {
  assert.deepEqual(normalisePrefs(null), DEFAULTS);
  assert.deepEqual(normalisePrefs({}), DEFAULTS);
});

test('an unrecognised radius is replaced rather than trusted', () => {
  // A value not in RADIUS_OPTIONS cannot have come from this app's UI, so it
  // is corrupt storage or an older build, and the default is the right answer.
  assert.equal(normalisePrefs({ radiusKm: 9999 }).radiusKm, DEFAULTS.radiusKm);
  assert.equal(normalisePrefs({ radiusKm: 20 }).radiusKm, 20);
  assert.ok(RADIUS_OPTIONS.some((o) => o.km === 0), 'any distance must stay an option');
});

test('location is off unless it was explicitly turned on', () => {
  // Opt in, never opt out. Anything other than an exact true is off.
  assert.equal(normalisePrefs({ enabled: 'yes' }).enabled, false);
  assert.equal(normalisePrefs({ enabled: true }).enabled, true);
  assert.equal(DEFAULTS.enabled, false);
});

test('a point older than the stale window is not silently trusted', () => {
  const now = Date.now();
  assert.equal(isStale({ lat: 0, lng: 0, at: now }, now), false);
  assert.equal(isStale({ lat: 0, lng: 0, at: now - STALE_AFTER_MS - 1 }, now), true);
  assert.equal(isStale(null, now), true);
});
