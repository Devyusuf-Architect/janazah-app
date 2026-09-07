// Which auth listener the app subscribes to, and why it matters.
//
// This is a regression test for a real bug, and the bug is subtle enough that
// the wrong version looks completely correct.
//
// Every launch signs in anonymously, so the current user when somebody taps
// Continue with Google is an anonymous one, and the first-time path links the
// Google credential onto it rather than starting a new session. Linking does
// not change the uid. Android's FirebaseAuth.AuthStateListener does not fire
// when the uid is unchanged, and react-native-firebase emits
// onAuthStateChanged only from that native listener: its lib/index.ts drives
// _handleAuthStateChanged from the native auth_state_changed event, while a
// resolved credential goes through _setUserCredential, which emits
// onUserChanged and nothing else.
//
// So with onAuthStateChanged, React kept the stale anonymous user after a
// successful Google sign-in. isAnonymous stayed true, the account gate
// decided nobody was signed in, and navigating to the tabs bounced straight
// back to sign-in. The Google flow completed and the app returned with nobody
// signed in, while email and password worked, because those change the uid.
//
// onIdTokenChanged is a superset: sign-in, sign-out, token refresh, and link,
// which mints a new token. src/lib/auth.tsx imports native Firebase, so this
// checks the source rather than running it, in the same way as
// test/location.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../src/lib/auth.tsx'), 'utf8');

const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('the provider subscribes to onIdTokenChanged', () => {
  assert.match(code, /onIdTokenChanged\(auth,/);
});

test('it does not subscribe to onAuthStateChanged', () => {
  // Not a style preference. onAuthStateChanged misses a link onto an
  // anonymous session, which is exactly the first-time Google path.
  assert.doesNotMatch(code, /onAuthStateChanged/);
});

test('every auth action pushes the current user into React itself', () => {
  // Belt and braces, so the app never depends on which listener a given
  // provider happens to trigger.
  //
  // Searched from the useMemo that builds the context value, because the same
  // names appear above it in the AuthValue type and matching those would pass
  // against an implementation that does nothing.
  const impl = code.slice(code.indexOf('useMemo<AuthValue>'));
  assert.notEqual(impl, '', 'the auth context value is no longer a useMemo');

  for (const action of [
    'signIn:',
    'signUp:',
    'signInWithGoogleCredential:',
    'signOut:',
  ]) {
    const start = impl.indexOf(action);
    assert.notEqual(start, -1, `${action} is gone from the auth context`);
    const body = impl.slice(start, impl.indexOf('},', start));
    assert.match(
      body, /syncUser\(\)/,
      `${action} does not sync the user, so a provider whose listener does `
      + 'not fire would leave the app looking signed out',
    );
  }
});

test('the anonymous session is still started when there is no user', () => {
  // The wall keeps anonymous sessions out of the app, but they still exist:
  // reports and topic subscriptions need something to attribute against.
  assert.match(code, /signInAnonymously\(auth\)/);
});
