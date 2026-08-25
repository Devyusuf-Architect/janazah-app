// Sample data must be visibly fictional.
//
// A demo of a funeral app is shown to community members. If the notices name
// a real masjid at a real address, someone can reasonably think a real Janazah
// is happening, or that a real institution announced one that never took
// place. Coordinates are fine, since a coordinate names nobody and the
// distance logic has to be exercised against a real map.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const { SAMPLE_ORGS, SAMPLE_NOTICES, SAMPLE_PRIVATE } =
  await import('../demo/sample-data.js');

const everything = JSON.stringify({ SAMPLE_ORGS, SAMPLE_NOTICES, SAMPLE_PRIVATE });

describe('sample notices are visibly fictional', () => {
  test('every organization is named as a sample', () => {
    for (const org of SAMPLE_ORGS) {
      assert.match(org.name, /^Sample /,
        `"${org.name}" could be mistaken for a real institution`);
    }
  });

  test('every published name is a recognisable placeholder', () => {
    for (const notice of SAMPLE_NOTICES) {
      if (!notice.deceasedName) continue;
      assert.match(notice.deceasedName, /Fulan/,
        `"${notice.deceasedName}" reads as a real person's name`);
    }
  });

  test('addresses point at example streets, never real ones', () => {
    const addresses = [
      ...SAMPLE_ORGS.map((o) => o.address),
      ...SAMPLE_NOTICES.flatMap((n) => [n.prayerLocation?.address, n.burialLocation?.address]),
    ].filter(Boolean);

    assert.ok(addresses.length >= 6, 'expected addresses to check');
    for (const address of addresses) {
      assert.match(address, /Example/,
        `"${address}" looks like a real address; a fake notice must not send anyone to a real building`);
    }
  });

  test('burial locations are named as samples too', () => {
    for (const notice of SAMPLE_NOTICES) {
      if (!notice.burialLocation) continue;
      assert.match(notice.burialLocation.name, /^Sample /,
        `"${notice.burialLocation.name}" could be a real cemetery`);
    }
  });

  test('no real phone number shape, even in the private fixture', () => {
    // 555-01xx is the reserved fictional range.
    assert.match(SAMPLE_PRIVATE.familyContactPhone, /^555-01\d\d$/);
  });

  test('one notice withholds the name, since that is the case worth showing', () => {
    const withheld = SAMPLE_NOTICES.filter((n) => !n.showDeceasedName);
    assert.ok(withheld.length >= 1, 'expected a notice with the name withheld');
    for (const notice of withheld) {
      assert.equal(notice.deceasedName, undefined,
        'a withheld name must be absent, not present and hidden');
    }
  });

  test('the sample set covers the states worth demonstrating', () => {
    const statuses = new Set(SAMPLE_NOTICES.map((n) => n.status));
    assert.ok(statuses.has('published'));
    assert.ok(statuses.has('cancelled'), 'a cancellation should be visible in a demo');
    assert.ok(SAMPLE_NOTICES.some((n) => n.correctionNote), 'so should a correction');
    assert.ok(SAMPLE_NOTICES.some((n) => n.burialLocation), 'and a burial location');
  });
});

describe('nothing real is left anywhere in the demo fixtures', () => {
  const REAL_PLACES = [
    'Danforth', 'Meadowvale', 'Mavis Road', 'Dundas', 'Britannia',
    'Birchmount', 'Pine Hills', 'Progress Avenue',
  ];

  test('the shared fixture names no real street or cemetery', () => {
    for (const place of REAL_PLACES) {
      assert.ok(!everything.includes(place), `"${place}" is a real place`);
    }
  });

  test('the scripts that seed a demo use the shared fixture', () => {
    // Guards against a copy drifting back in, which is how this happened.
    for (const file of ['scripts/seed-demo.mjs', 'demo/fake-store.js']) {
      const source = readFileSync(file, 'utf8');
      assert.match(source, /sample-data\.js/, `${file} should import the shared fixture`);
      for (const place of REAL_PLACES) {
        assert.ok(!source.includes(place), `${file} still names "${place}"`);
      }
    }
  });
});
