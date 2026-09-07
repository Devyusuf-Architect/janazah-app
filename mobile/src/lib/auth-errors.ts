// Firebase auth errors, in words a person can act on.
//
// Two rules taken from the web app's error copy (tests/error-copy.test.js
// pins the equivalents there):
//
//   Never say whether an email address has an account. "No user found" and
//   "wrong password" both mean the same thing to the person typing, and told
//   apart they confirm who is registered to anyone who asks.
//
//   Never print a raw Firebase code. "auth/invalid-credential" tells somebody
//   standing outside a masjid nothing at all.

import { emulatorHost, usingEmulator } from './backend';

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That does not look like an email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/weak-password': 'Choose a password of at least six characters.',
  'auth/email-already-in-use':
    'There is already an account for that address. Try signing in instead.',
  'auth/too-many-requests':
    'Too many attempts from this device. Wait a few minutes and try again.',
  'auth/network-request-failed':
    'Could not reach Ta’ziyah. Check your connection and try again.',
  'auth/user-disabled':
    'This account has been disabled. Write to us at taziyah.com if that is wrong.',
  'auth/operation-not-allowed':
    'That way of signing in is not switched on for Ta’ziyah yet.',
  'auth/invalid-verification-code':
    'That code was not accepted. Check your authenticator app and try the current code.',
  'auth/invalid-credential':
    'That email address and password did not match. Check both and try again.',
};

/** These are all the same answer on purpose. See the note above. */
const AMBIGUOUS = new Set([
  'auth/user-not-found',
  'auth/wrong-password',
  'auth/invalid-login-credentials',
]);

export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';

  // The one case where the honest message is about the build rather than the
  // person. A development build points at the local Firebase emulators
  // unless EXPO_PUBLIC_USE_LIVE=1, and with none running every sign-in fails
  // with a network error, for every provider and every account, including one
  // that works perfectly on the website. "Check your connection" sends
  // somebody to look at their wifi, which is the wrong place entirely.
  if (code === 'auth/network-request-failed' && __DEV__ && usingEmulator) {
    return `This build is pointed at the Firebase emulators at ${emulatorHost}, `
      + 'not at the live project, and nothing answered. Start them with '
      + '`npm run demo` from the repository root, or rebuild with '
      + 'EXPO_PUBLIC_USE_LIVE=1 to sign in against real accounts.';
  }

  // auth/unknown is not a cause, it is react-native-firebase saying it could
  // not map the Android exception. The cause is inside the message, in the
  // brackets Firebase puts it in, and until this existed the screen showed
  // "something went wrong" for every one of them alike.
  if (__DEV__ && code === 'auth/unknown') {
    const message = String((error as { message?: string })?.message ?? '').trim();
    const reason = nativeReason(message);
    const hint = reason ? UNKNOWN_HINTS[reason] : undefined;
    return [
      message || 'Firebase reported auth/unknown with no message.',
      hint,
      usingEmulator
        ? `This build is pointed at the Firebase emulators at ${emulatorHost}. `
          + 'The Auth emulator does not accept a real Google ID token, and it '
          + 'has none of your live accounts. Rebuild with '
          + 'EXPO_PUBLIC_USE_LIVE=1 to sign in against the real project.'
        : undefined,
    ].filter(Boolean).join('\n\n');
  }

  if (AMBIGUOUS.has(code)) {
    return 'That email address and password did not match. Check both and try again.';
  }
  if (__DEV__ && !MESSAGES[code] && !AMBIGUOUS.has(code)) {
    // An unmapped code is worth naming to a developer rather than hiding
    // behind "something went wrong".
    return `Sign-in failed: ${code || 'no code'}. See the log for detail.`;
  }
  return MESSAGES[code]
    ?? 'Something went wrong signing in. Try again in a moment.';
}

/**
 * The reason Firebase brackets at the end of an internal-error message.
 *
 * Android surfaces its backend failures as "An internal error has occurred.
 * [ CONFIGURATION_NOT_FOUND ]" and react-native-firebase has no code for
 * that, so it reports auth/unknown. The bracketed part is the actual answer.
 */
function nativeReason(message: string): string | undefined {
  return message.match(/\[\s*([^\]]+?)\s*\]/)?.[1];
}

/**
 * What the common ones mean, for a development build only.
 *
 * Every entry here is a statement about configuration, which is the only
 * thing auth/unknown ever turns out to be: the app, the project and the
 * OAuth client have to agree, and when they do not, Firebase says so in a
 * word rather than a sentence.
 */
const UNKNOWN_HINTS: Record<string, string> = {
  CONFIGURATION_NOT_FOUND:
    'The project in google-services.json has no configuration for this '
    + 'sign-in method. Check that the Android app is registered in this '
    + 'Firebase project and that the provider is enabled under '
    + 'Authentication > Sign-in method.',
  OPERATION_NOT_ALLOWED:
    'The provider is switched off in the Firebase console, under '
    + 'Authentication > Sign-in method.',
  INVALID_IDP_RESPONSE:
    'Firebase rejected the Google ID token. The usual cause is that the token '
    + 'was issued for an OAuth client belonging to a different project than '
    + 'the one in google-services.json. Compare the audience and '
    + 'configuredWebClientId lines logged by `google token`.',
  AUDIENCE_MISMATCH:
    'The Google ID token was issued for a different OAuth client than the one '
    + 'this Firebase project expects. Compare the audience and '
    + 'configuredWebClientId lines logged by `google token`.',
};
