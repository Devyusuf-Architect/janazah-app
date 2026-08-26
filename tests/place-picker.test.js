// Choosing where a Janazah will be prayed and where the burial is.
//
// These two fields decide whether the notice reaches people near enough to
// attend and whether the Directions link opens the right building. Both fail
// silently when they are wrong: nobody finds out until somebody misses a
// funeral. So the invariants worth pinning are that coordinates are never
// typed, that a half-entered location cannot be published, and that
// correcting a notice opens showing the location it already has.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const picker = readFileSync('public/js/views/place-picker.js', 'utf8');
const notices = readFileSync('public/js/views/notices.js', 'utf8');
const model = readFileSync('public/js/model.js', 'utf8');

describe('nobody is asked for coordinates', () => {
  test('the composer has no latitude or longitude field', () => {
    for (const gone of [
      "fieldGroup('prayerLat'", "fieldGroup('prayerLng'",
      "fieldGroup('burialLat'", "fieldGroup('burialLng'",
    ]) {
      assert.ok(!notices.includes(gone),
        `${gone} is back: a masjid office should not be looking up latitude `
        + 'and longitude to announce a funeral');
    }
    assert.ok(!/'Latitude'|'Longitude'/.test(notices),
      'the composer must not label a field Latitude or Longitude');
  });

  test('the coordinates still reach the payload under their existing names', () => {
    // buildPublicNotice reads form.prayerLat / form.prayerLng, and the geohash
    // cell is derived from them. Renaming these would publish notices that no
    // nearby search can find.
    for (const name of ['prayerLat', 'prayerLng', 'burialLat', 'burialLng',
                        'prayerAddress', 'burialAddress']) {
      assert.ok(picker.includes('${prefix}'), 'fields are built from the prefix');
      assert.ok(model.includes(name), `${name} must still exist in the model`);
    }
    assert.match(picker, /type: 'hidden', name: `\$\{prefix\}Lat`/);
    assert.match(picker, /type: 'hidden', name: `\$\{prefix\}Lng`/);
  });

  test('the address is the only thing that sets them', () => {
    const use = picker.slice(picker.indexOf('function usePlace'));
    const body = use.slice(0, use.indexOf('\n  }'));
    assert.match(body, /latInput\.value = String\(lat\)/);
    assert.match(body, /lngInput\.value = String\(lng\)/);
  });
});

describe('a location cannot be half-entered', () => {
  test('typing invalidates a previously chosen address', () => {
    // The box would otherwise show one address while the hidden coordinates
    // belonged to another, and the notice would publish the mismatch.
    const listener = picker.slice(picker.indexOf("search.addEventListener('input'"));
    assert.match(listener.slice(0, 400), /clearPlace\(\)/);
  });

  test('a required location with no coordinates blocks submission', () => {
    assert.match(picker, /if \(required && !hasPlace\(\)\)/);
    assert.match(picker, /working directions and people nearby are told/);
  });

  test('an optional location that was started but not finished also blocks', () => {
    // A cemetery name with no address publishes a burial location that no
    // Directions link can open, which is worse than omitting it.
    assert.match(picker, /if \(!required && \(named \|\| search\.value\.trim\(\)\) && !hasPlace\(\)\)/);
    assert.match(picker, /if \(!required && hasPlace\(\) && !named\)/);
  });

  test('an optional location left entirely blank is fine', () => {
    const missing = picker.slice(picker.indexOf('missing: () =>'));
    assert.match(missing, /return null;/);
  });

  test('the composer checks the pickers before the model validator', () => {
    // The pickers name the missing thing in its own words and put the cursor
    // there; validateNoticeForm still runs after, as the rules mirror.
    const validate = notices.slice(notices.indexOf('const validate = () => {'));
    const gate = validate.indexOf('picker.missing()');
    const model_ = validate.indexOf('validateNoticeForm(form_)');
    assert.ok(gate > 0 && gate < model_,
      'the pickers must be consulted before the generic validator');
  });
});

describe('correcting a notice', () => {
  test('the existing location is painted back after fillForm', () => {
    // Otherwise a correction opens on an empty search box, which reads as the
    // address having been lost, and somebody re-enters it under pressure.
    assert.match(notices, /fillForm\(form, priv\);[\s\S]{0,240}prayer\.hydrate\(\);\s*\n\s*burial\.hydrate\(\);/);
    assert.match(picker, /hydrate: \(\) => \{[\s\S]{0,200}search\.value = addressInput\.value/);
  });
});

describe('the search is scoped, and offers the obvious answer', () => {
  test('results are scoped to the organization’s own country and region', () => {
    // An unscoped search is how a prayer hall lands on a same-named street in
    // another country, and nothing later would catch it.
    assert.match(picker, /country: org\?\.country/);
    assert.match(picker, /region: org\?\.province/);
  });

  test('a masjid can use its own verified address in one press', () => {
    // Most Janazahs are prayed at the masjid publishing the notice, and that
    // address already has coordinates an administrator checked.
    assert.match(picker, /id: `\$\{prefix\}UseOrg`/);
    assert.match(notices, /shortcutLabel: `Use \$\{org\.name\}’s address`/);
  });

  test('the shortcut is not offered without real coordinates on file', () => {
    assert.match(picker, /shortcutLabel && org && Number\.isFinite\(org\.lat\)/);
  });

  test('a typed name is never overwritten by the geocoder', () => {
    // "Main prayer hall" is what mourners are looking for; the building's
    // name in a map database is not.
    assert.match(picker, /if \(!nameInput\.value\.trim\(\) && name\) nameInput\.value = name;/);
  });

  test('a lookup failure still leaves a way forward', () => {
    assert.match(picker, /save this as a draft/,
      'a geocoder outage must not strand somebody arranging a funeral');
  });
});

describe('being verified leads somewhere', () => {
  const org = readFileSync('public/js/views/org.js', 'utf8');

  test('a verified organization is offered publishing directly', () => {
    assert.match(org, /org\.verificationStatus === 'verified'[\s\S]{0,300}Publish a Janazah notice/);
  });

  test('the empty notices list says what this organization can do', () => {
    assert.match(notices, /is verified and can publish/);
    assert.match(notices, /cannot publish until a platform administrator/);
    assert.match(notices, /verified \? 'Publish the first notice' : 'Write a draft'/);
  });
});

describe('the prayer time can be stated in the right zone', () => {
  test('the list is not six Canadian zones', async () => {
    // Registration accepts organizations in any of the countries in
    // regions.js. A Janazah announced in the wrong zone is people arriving
    // hours after a burial has finished.
    const { timeZoneOptions } = await import('../public/js/model.js');
    const zones = timeZoneOptions();
    assert.ok(zones.length > 50, `only ${zones.length} time zones offered`);
    assert.ok(zones.includes('Asia/Karachi'));
    assert.ok(zones.includes('America/Toronto'));
  });

  test('an existing notice keeps the zone it was published in', async () => {
    // Reopening a correction must not silently move the prayer time.
    const { defaultTimeZone } = await import('../public/js/model.js');
    assert.equal(defaultTimeZone('Asia/Karachi'), 'Asia/Karachi');
  });

  test('a new notice defaults to somewhere real', async () => {
    const { defaultTimeZone, timeZoneOptions } = await import('../public/js/model.js');
    const chosen = defaultTimeZone(undefined);
    assert.ok(timeZoneOptions().includes(chosen), `${chosen} is not a real zone`);
  });

  test('an unknown stored zone falls back rather than being offered', async () => {
    const { defaultTimeZone, timeZoneOptions } = await import('../public/js/model.js');
    const chosen = defaultTimeZone('Mars/Olympus');
    assert.ok(timeZoneOptions().includes(chosen));
  });
});
