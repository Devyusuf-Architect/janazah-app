// Settings, appearance preferences, and two-factor authentication.
//
// The thing being protected here is that two-factor authentication is real.
// A flag in a database saying "mfaEnabled: true" would look identical on this
// screen and protect nobody: an attacker with the password would sign straight
// in, because nothing would be checking. So the tests below pin that enrolment
// goes through Firebase's own multi-factor API and that no local record of
// "2FA is on" exists anywhere to be believed instead.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { THEMES, TEXT_SIZES } from '../public/js/prefs.js';

const account = readFileSync('public/js/views/account.js', 'utf8');
const authView = readFileSync('public/js/views/auth.js', 'utf8');
const css = readFileSync('public/css/styles.css', 'utf8');
const index = readFileSync('public/index.html', 'utf8');

describe('two-factor authentication is genuine', () => {
  test('enrolment goes through Firebase multi-factor, not a stored flag', () => {
    assert.match(account, /multiFactor\(auth\.currentUser\)\.getSession\(\)/);
    assert.match(account, /TotpMultiFactorGenerator\.generateSecret\(session\)/);
    assert.match(account, /TotpMultiFactorGenerator\.assertionForEnrollment\(secret, digits\)/);
    assert.match(account, /multiFactor\(auth\.currentUser\)\.enroll\(assertion/);
  });

  test('nothing anywhere records "two-factor is on" as data we could believe', () => {
    // A boolean in Firestore or localStorage would be settable by anyone
    // willing to edit JavaScript, and the screen would then say On while the
    // account was protected by its password alone.
    for (const forged of ['mfaEnabled', 'twoFactorEnabled', 'has2fa', 'mfaOn']) {
      assert.ok(!account.includes(forged), `${forged} must not exist`);
      assert.ok(!readFileSync('firestore.rules', 'utf8').includes(forged),
        `${forged} must not be a stored field`);
    }
    // The status shown comes from Firebase's own enrolment list, every time.
    assert.match(account, /function enrolledFactors\(\)[\s\S]{0,160}multiFactor\(auth\.currentUser\)\.enrolledFactors/);
  });

  test('the status is read from Firebase, not cached', () => {
    const group = account.slice(account.indexOf('function twoFactorGroup'));
    assert.match(group.slice(0, 400), /const on = enrolled\.length > 0/);
  });

  test('sign-in resolves the challenge with the real assertion', () => {
    assert.match(authView, /getMultiFactorResolver/);
    assert.match(authView, /TotpMultiFactorGenerator\.assertionForSignIn\(/);
    assert.match(authView, /resolver\.resolveSignIn\(assertion\)/);
  });

  test('a wrong code says so plainly, in both places it can be entered', () => {
    for (const file of [account, authView]) {
      assert.match(file, /The code could not be verified\. Please try again\./);
    }
  });

  test('turning it off takes a deliberate confirmation', () => {
    // Not a toggle: a mis-tap on a phone must not silently remove somebody's
    // second factor.
    const disable = account.slice(account.indexOf('function confirmDisable'));
    assert.match(disable.slice(0, 900), /remove\.disabled = true;/);
    assert.match(disable.slice(0, 900), /confirmCheck\.addEventListener\('change'/);
    assert.match(disable, /multiFactor\(auth\.currentUser\)\.unenroll\(factor\)/);
  });
});

describe('the secret never leaves the browser', () => {
  const qr = readFileSync('public/js/qr.js', 'utf8');

  test('the QR code is drawn locally, not fetched from an image service', () => {
    // The otpauth URI contains the TOTP shared secret. Handing it to a chart
    // or QR service would hand that service the second factor itself.
    assert.ok(!/chart\.googleapis|qrserver|api\.qrcode|fetch\(/.test(qr),
      'the QR module must make no network request');
    assert.match(account, /import \{ qrSvg \} from '\.\.\/qr\.js'/);
  });

  test('the code is drawn black on white regardless of theme', () => {
    // A QR tinted to match a dark page is one some cameras will not read.
    assert.match(qr, /fill', '#000000'/);
    assert.match(qr, /fill', '#ffffff'/);
  });

  test('the manual setup key is offered for anyone who cannot scan', () => {
    assert.match(account, /Can’t scan\? Enter the key by hand/);
    assert.match(account, /secret\.secretKey/);
  });

  test('a failure to draw the code does not block enrolment', () => {
    assert.match(account, /The code could not be drawn\. Use the setup key below/);
  });
});

describe('configuration problems are ours, not the user’s', () => {
  test('no developer instructions are shown to a person', () => {
    for (const leak of ['phase-5-notes', 'Identity Platform upgrade with TOTP enabled. See']) {
      assert.ok(!account.includes(`'${leak}`), `${leak} must not reach the screen`);
    }
    assert.match(account, /Two-factor authentication is temporarily unavailable\./);
  });

  test('the technical reason goes to the console instead', () => {
    const fn = account.slice(account.indexOf('function unavailableMessage'));
    assert.match(fn, /console\.error\([\s\S]{0,320}Identity Platform/);
    assert.match(fn, /Multi-factor authentication > Authenticator app \(TOTP\)/);
  });
});

describe('the settings page', () => {
  test('it is sections with a menu, not one long card', () => {
    for (const section of ['Profile', 'Account', 'Notifications', 'Location',
                           'Appearance', 'Privacy']) {
      assert.ok(account.includes(`label: '${section}'`), `missing section: ${section}`);
    }
    assert.match(css, /\.settings \{[\s\S]{0,200}grid-template-columns: 12\.5rem/);
  });

  test('changing a section repaints the panel, not the page', () => {
    // Re-rendering would lose the scroll position and the open section, which
    // is what makes a settings screen feel cheap.
    const show = account.slice(account.indexOf('const show = (key)'));
    assert.match(show.slice(0, 500), /panel\.replaceChildren\(\)/);
    assert.ok(!/renderAccount\(mount/.test(show.slice(0, 500)),
      'a section change must not re-render the whole page');
  });

  test('the menu becomes a scrollable row on a narrow screen', () => {
    const narrow = css.slice(css.indexOf('@media (max-width: 760px)'));
    assert.match(narrow.slice(0, 900), /\.settings-nav \{[\s\S]{0,220}flex-direction: row/);
  });

  test('only fields that can really be changed are offered', () => {
    // A phone number or an uploaded avatar would need a stored user record,
    // which this application deliberately does not have.
    assert.match(account, /updateProfile\(auth\.currentUser, \{ displayName/);
    assert.ok(!/name: 'phone'|id: 'phoneNumber'/.test(account),
      'a phone field would need a user record this app does not keep');
    assert.match(account, /is no profile stored on our side/);
  });

  test('a Google account is not offered a password to change', () => {
    assert.match(account, /usesPassword\(user\)\s*\n?\s*\?\s*row\('Password'/);
    assert.match(account, /your password is managed by Google/);
  });

  test('following is summarised, not duplicated', () => {
    assert.match(account, /Masjids followed: \$\{follows\.followedOrgIds\(\)\.length\}/);
    assert.match(account, /href: '\/following' \}, 'Manage following'/);
  });

  test('deleting an account is confirmed, and blocked for an owner', () => {
    // The organization record names them as owner and the audit trail points
    // at them; deleting would leave a verified masjid nobody can administer.
    assert.match(account, /store\.myOrganizations\(auth\.currentUser\.uid\)/);
    assert.match(account, /An organization cannot be left without an owner/);
    assert.match(account, /deleteUser\(auth\.currentUser\)/);
    const del = account.slice(account.indexOf('async function confirmDelete'));
    assert.match(del, /remove\.disabled = true;/);
  });
});

describe('notification toggles do what they say', () => {
  const push = readFileSync('public/js/push.js', 'utf8');
  const location = readFileSync('public/js/location.js', 'utf8');

  test('turning off followed-masjid alerts unsubscribes the device', () => {
    // Hiding messages after they arrive is not "off"; the device must stop
    // being told.
    assert.match(push, /settings\.followAlerts[\s\S]{0,120}followedOrgIds\(\)\.map/);
    assert.match(location, /followAlerts: true,/);
    assert.match(location, /followAlerts: parsed\.followAlerts !== false,/);
  });

  test('nearby alerts still work through the existing scope setting', () => {
    assert.match(account, /alertScope: on \? 'nearby' : 'follows'/);
    assert.match(account, /push\.syncTopics\(\)/);
  });

  test('the page is honest about what cannot be turned off', () => {
    // A correction or a cancellation reaches only people who were told about
    // the original notice, and it is the one message nobody should miss.
    assert.match(account, /cannot be switched off separately/);
    assert.match(account, /already on their way/);
  });
});

describe('appearance', () => {
  test('three themes, with the system default kept', () => {
    assert.deepEqual(THEMES.map((t) => t.value), ['system', 'light', 'dark']);
    assert.deepEqual(TEXT_SIZES.map((t) => t.value), ['standard', 'large']);
  });

  test('"system" removes the attribute rather than resolving it', async () => {
    // Resolving it once would freeze the choice: a device switching to night
    // mode at sunset would be ignored until the page was reloaded.
    const prefs = readFileSync('public/js/prefs.js', 'utf8');
    assert.match(prefs, /if \(next\.theme === 'system'\) delete root\.dataset\.theme;/);
  });

  test('the dark palette is identical under both selectors', () => {
    // One is the system preference, the other an explicit choice. A token
    // added to one and not the other is a theme that is subtly wrong only for
    // some people, and nobody would notice for months.
    const media = css.slice(css.indexOf(':root:not([data-theme="light"]) {'));
    const fromSystem = media.slice(media.indexOf('{') + 1, media.indexOf('\n  }'));
    const explicit = css.slice(css.indexOf(':root[data-theme="dark"] {'));
    const fromChoice = explicit.slice(explicit.indexOf('{') + 1, explicit.indexOf('\n}'));
    const normalise = (text) => text.split('\n')
      .map((line) => line.trim()).filter(Boolean).join('\n');
    assert.ok(normalise(fromSystem).length > 400, 'the palette should be substantial');
    assert.equal(normalise(fromChoice), normalise(fromSystem));
  });

  test('the choice is applied before the first paint', () => {
    // Applying it from a module would run after render, so somebody who chose
    // Light on a dark-mode device would watch the app flash dark first.
    assert.match(index, /<script>[\s\S]{0,700}taziyah\.appearance[\s\S]{0,400}<\/script>\s*<\/head>/);
    for (const file of ['public/index.html', 'public/console.html']) {
      assert.match(readFileSync(file, 'utf8'), /dataset\.theme = a\.theme/);
    }
  });

  test('larger text scales the whole interface, not just body copy', () => {
    assert.match(css, /:root\[data-text="large"\] \{ font-size: 112\.5%; \}/);
    assert.match(css, /font-family: var\(--sans\);\s*\n\s*font-size: 1rem;/,
      'body must be in rem, or the root size cannot move it');
  });
});

describe('scrolling keeps the reader’s place', () => {
  const motion = readFileSync('public/js/motion.js', 'utf8');
  const feed = readFileSync('public/js/feed.js', 'utf8');

  test('going back returns to where they were', () => {
    // On this site "their place" is often a specific funeral they were
    // reading about halfway down a long list.
    assert.match(motion, /export function rememberScroll/);
    assert.match(motion, /export function restoreScroll/);
    assert.match(feed, /rememberScroll\(location\.pathname \+ location\.search\)/);
    assert.match(feed, /route\(\{ back: true \}\)/);
  });

  test('a fresh navigation starts at the top', () => {
    assert.match(motion, /const to = remembered \? positions\.get\(key\) \?\? 0 : 0;/);
  });

  test('the restore is instant, not animated', () => {
    // Animating to a restored position means watching the page scroll itself.
    const fn = motion.slice(motion.indexOf('export function restoreScroll'));
    assert.ok(!/behavior: 'smooth'/.test(fn.slice(0, 400)));
  });

  test('the browser is taken out of the loop', () => {
    assert.match(motion, /history\.scrollRestoration = 'manual'/);
    assert.match(feed, /ownScrollRestoration\(\);/);
  });
});

describe('an unavailable second factor never leaks developer text', () => {
  const fn = account.slice(account.indexOf('function unavailableMessage'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));

  test('the fallback during setup is the plain sentence, not the raw error', () => {
    // The person has pressed one button. "Missing phoneEnrollmentInfo" or a
    // pointer to a file in this repository is not something they can act on.
    assert.match(body, /if \(duringSetup \|\| looksLikeConfiguration\)/);
    assert.match(body, /return 'Two-factor authentication is temporarily unavailable\.';/);
    const setup = account.slice(account.indexOf('async function startEnrolment'));
    assert.match(setup.slice(0, 900), /unavailableMessage\(err, \{ duringSetup: true \}\)/);
  });

  test('only the three things a person can act on are passed through', () => {
    for (const actionable of [
      'auth/requires-recent-login', 'auth/invalid-verification-code', 'auth/unverified-email',
    ]) {
      assert.ok(body.includes(actionable), `${actionable} should have its own message`);
    }
  });

  test('the emulator limitation is written down where it will be read', () => {
    // Otherwise the next person to touch this concludes the feature is broken
    // because it fails every time they test it locally.
    assert.match(body, /Auth emulator does not implement TOTP/);
  });
});
