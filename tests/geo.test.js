// Directions links: one working URL per map app, and no broken links.
//
// Waze has no address-only mode, so it should never appear unless there are
// real coordinates to send it. Google and Apple both fall back to a text
// query, matching the pattern the app already used for Google alone.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { directionsOptions, directionsUrl } from '../public/js/geo.js';

const withCoords = { name: 'Masjid Al-Noor', address: '123 Main St', lat: 43.7, lng: -79.4 };
const addressOnly = { name: 'Masjid Al-Noor', address: '123 Main St' };

describe('directionsOptions', () => {
  test('offers Google, Apple and Waze when coordinates are known', () => {
    const options = directionsOptions(withCoords);
    assert.deepEqual(options.map((o) => o.key), ['google', 'apple', 'waze']);
    assert.equal(options[0].href, 'https://www.google.com/maps/dir/?api=1&destination=43.7,-79.4');
    assert.equal(options[1].href, 'https://maps.apple.com/?daddr=43.7,-79.4');
    assert.equal(options[2].href, 'https://waze.com/ul?ll=43.7,-79.4&navigate=yes');
  });

  test('falls back to a text query for Google and Apple without coordinates', () => {
    const options = directionsOptions(addressOnly);
    assert.deepEqual(options.map((o) => o.key), ['google', 'apple']);
    const q = encodeURIComponent('Masjid Al-Noor, 123 Main St');
    assert.equal(options[0].href, `https://www.google.com/maps/dir/?api=1&destination=${q}`);
    assert.equal(options[1].href, `https://maps.apple.com/?q=${q}`);
  });

  test('Waze is left out rather than linked to something broken', () => {
    const options = directionsOptions(addressOnly);
    assert.ok(!options.some((o) => o.key === 'waze'));
  });

  test('every option is a well-formed https link', () => {
    for (const loc of [withCoords, addressOnly]) {
      for (const opt of directionsOptions(loc)) {
        assert.match(opt.href, /^https:\/\//);
        assert.ok(opt.label, `${opt.key} needs a label`);
      }
    }
  });
});

describe('directionsUrl', () => {
  test('stays the single Google Maps link, for callers that just want one', () => {
    assert.equal(directionsUrl(withCoords), directionsOptions(withCoords)[0].href);
    assert.match(directionsUrl(withCoords), /^https:\/\/www\.google\.com\/maps\/dir\//);
  });
});
