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
  if (AMBIGUOUS.has(code)) {
    return 'That email address and password did not match. Check both and try again.';
  }
  return MESSAGES[code]
    ?? 'Something went wrong signing in. Try again in a moment.';
}
