// What the app says when Firestore denies a write.
//
// "permission-denied" is one code covering situations that mean completely
// different things to the person reading the message. The failure this pins
// is a real one that reached production: someone registering a masjid for the
// first time was told their organization "may not be verified yet, or you may
// not be authorized to publish for it", on the screen where they were creating
// that organization. It is meaningless there (there is nothing to verify yet)
// and it reads as a warning not to continue, at the one moment a masjid is
// deciding whether to trust the platform at all.
//
// ui.js cannot be imported here: it touches document. These read the source,
// the same approach tests/takedown.test.js uses for the same reason.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const ui = readFileSync('public/js/ui.js', 'utf8');
const org = readFileSync('public/js/views/org.js', 'utf8');
const app = readFileSync('public/js/app.js', 'utf8');

/** The body of one PERMISSION_DENIED entry. */
function message(key) {
  const match = ui.match(new RegExp(`\\n  ${key}:\\n?([\\s\\S]*?),\\n  [a-z]+:`));
  assert.ok(match, `no PERMISSION_DENIED entry for "${key}"`);
  return match[1].replace(/\s*\+\s*/g, ' ').replace(/'/g, '').replace(/\s+/g, ' ').trim();
}

describe('permission-denied copy', () => {
  test('friendlyError takes a context, and falls back when given none', () => {
    assert.match(ui, /export function friendlyError\(err, context\)/,
      'friendlyError must accept a context argument');
    assert.match(ui, /PERMISSION_DENIED\[context\] \|\| PERMISSION_DENIED\.default/,
      'an unknown or absent context must fall back rather than throw');
  });

  test('the registration message does not mention verification or publishing', () => {
    const text = message('register');
    assert.doesNotMatch(text, /verified/i,
      'nothing is verified yet at registration; saying so is meaningless here');
    assert.doesNotMatch(text, /authorized to publish/i,
      'registration is not a publishing attempt');
    assert.doesNotMatch(text, /permission denied/i,
      'the raw failure mode is not useful to an applicant');
  });

  test('the registration message tells the applicant it is not their fault', () => {
    const text = message('register');
    assert.match(text, /nothing you entered is wrong/i,
      'an applicant must not be left thinking their details caused this');
  });

  test('registration uses the registration context, not the default', () => {
    assert.match(org, /friendlyError\(err, 'register'\)/,
      'the registration form must ask for the registration message');
  });

  test('the publish-time message still explains verification', () => {
    // The original wording is correct here, which is the whole reason the
    // registration case needed its own rather than a reworded shared one.
    const text = message('publish');
    assert.match(text, /approved by a\s+platform\s+administrator|verified/i,
      'a publish denial should still point at verification');
  });

  test('a failure to load organizations is not thrown as a toast on arrival', () => {
    // It runs on every sign-in, before the person has done anything. A red
    // banner at that moment reads as an accusation.
    assert.doesNotMatch(app, /toast\(friendlyError\(err\), 'error'\);\s*\n\s*return \[\]/,
      'loadContext must not toast; the view surfaces it in place instead');
    assert.match(app, /ctx\.orgsError = err/,
      'the error should be recorded on the context for the view to render');
    assert.match(org, /ctx\.orgsError/,
      'the organizations view must render the load failure it was handed');
  });
});
