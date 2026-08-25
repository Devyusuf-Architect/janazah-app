// Turning a geocoder result into an organization's stored location.
//
// This is the step that replaced asking a masjid office for latitude and
// longitude by hand, so it is the step that decides whether nearby alerts
// reach the right people. A result that normalizes wrong does not fail
// loudly: it registers a masjid at the wrong coordinates, and nobody finds
// out until somebody misses a Janazah a few streets away.
//
// normalizeFeature is pure, so all of this runs with no network.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { normalizeFeature } from '../public/js/geocode.js';

const feature = (properties, coordinates = [-79.3832, 43.6532]) =>
  ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties });

describe('normalizeFeature', () => {
  test('reads coordinates in GeoJSON order, which is lng then lat', () => {
    // Getting this backwards puts a Toronto masjid in the Indian Ocean, and
    // both numbers are plausible on their own, so nothing else would catch it.
    const place = normalizeFeature(feature(
      { name: 'Test Masjid', city: 'Toronto', state: 'Ontario' },
      [-79.3832, 43.6532],
    ));
    assert.equal(place.lat, 43.6532);
    assert.equal(place.lng, -79.3832);
  });

  test('builds a street address from house number and street', () => {
    const place = normalizeFeature(feature({
      housenumber: '100', street: 'Queen Street West',
      city: 'Toronto', state: 'Ontario', postcode: 'M5H 2N2', country: 'Canada',
    }));
    assert.equal(place.address, '100 Queen Street West');
    assert.equal(place.city, 'Toronto');
    assert.equal(place.province, 'Ontario');
    assert.equal(place.postalCode, 'M5H 2N2');
    assert.equal(place.country, 'Canada');
  });

  test('falls back through the city-like fields a geocoder may use', () => {
    for (const [key, value] of [
      ['city', 'Toronto'], ['town', 'Ajax'], ['village', 'Norval'],
      ['district', 'Scarborough'], ['county', 'Peel'],
    ]) {
      const place = normalizeFeature(feature({ [key]: value, street: 'A St' }));
      assert.equal(place.city, value, `${key} should be usable as the city`);
    }
  });

  test('a named place with no street still gets an address', () => {
    const place = normalizeFeature(feature({ name: 'Masjid Al-Noor', city: 'Ottawa' }));
    assert.equal(place.address, 'Masjid Al-Noor');
  });

  test('the label does not repeat a part twice', () => {
    // Photon often returns name and street identical for a named building.
    const place = normalizeFeature(feature({
      name: 'Islamic Centre', street: 'Islamic Centre', city: 'Calgary',
    }));
    assert.equal(place.label.match(/Islamic Centre/g).length, 1,
      `expected one mention, got: ${place.label}`);
  });

  test('rejects a result with no usable coordinates', () => {
    assert.equal(normalizeFeature(null), null);
    assert.equal(normalizeFeature({ properties: { name: 'x' } }), null);
    assert.equal(normalizeFeature(feature({ name: 'x' }, [])), null);
    assert.equal(normalizeFeature(feature({ name: 'x' }, ['a', 'b'])), null);
  });

  test('rejects coordinates outside the possible range', () => {
    // A bad result must be dropped here rather than rejected later by
    // firestore.rules, which would surface as an unexplained failure at the
    // end of a form someone just filled in.
    assert.equal(normalizeFeature(feature({ name: 'x' }, [0, 91])), null);
    assert.equal(normalizeFeature(feature({ name: 'x' }, [181, 0])), null);
  });
});

describe('the registration form no longer asks for coordinates', () => {
  const org = readFileSync('public/js/views/org.js', 'utf8');

  test('no visible latitude or longitude input', () => {
    assert.doesNotMatch(org, /field\('lat',/, 'a visible latitude field is back');
    assert.doesNotMatch(org, /field\('lng',/, 'a visible longitude field is back');
    assert.doesNotMatch(org, /Right-click the building in Google Maps/,
      'the copy telling people to find coordinates by hand is back');
  });

  test('coordinates are still submitted, so nearby matching keeps working', () => {
    // store.registerOrganization reads form.lat/form.lng and derives the
    // geohash cell from them. Dropping them from the form entirely would
    // register organizations that no nearby feature can ever find.
    assert.match(org, /name: 'lat'/, 'lat must still reach the form payload');
    assert.match(org, /name: 'lng'/, 'lng must still reach the form payload');
  });

  test('submission is blocked until a suggestion is actually chosen', () => {
    assert.match(org, /if \(!picker\.selected\(\)\)/,
      'typed text that was never resolved has no coordinates');
  });

  test('the chosen location is confirmed back to the person', () => {
    assert.match(org, /Selected location: /,
      'the applicant must see which location they picked before submitting');
  });
});
