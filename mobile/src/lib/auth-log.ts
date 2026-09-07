// One tagged trace of the whole authentication path.
//
// Sign-in on a phone has four places it can fail and only one of them is the
// password: which backend the build points at, the credential exchange
// itself, the listener that tells React about it, and the navigation guard
// that decides where somebody lands. Until now a failure in any of them
// arrived as the same sentence, which is how a build pointed at a dead
// emulator and a genuinely wrong password became indistinguishable.
//
// Everything here is development only and compiled out of a release build:
// each function returns immediately when __DEV__ is false, and the minifier
// drops a branch behind a false constant.
//
//   adb logcat -s ReactNativeJS | grep taziyah-auth
//
// The tag is one word so that grep is enough. Nothing here logs an email
// address, a password, a token or an ID token: a uid and a provider name are
// what identify a session, and they are what a log needs.

const TAG = 'taziyah-auth';

export function authLog(step: string, detail?: Record<string, unknown>): void {
  if (!__DEV__) return;
  const pairs = detail
    ? Object.entries(detail)
      .map(([key, value]) => `${key}=${format(value)}`)
      .join(' ')
    : '';
  console.log(`${TAG} ${step}${pairs ? ` ${pairs}` : ''}`);
}

export function authError(step: string, error: unknown): void {
  if (!__DEV__) return;
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message;
  console.error(
    `${TAG} ${step} FAILED code=${format(code)} message=${format(message)}`,
  );
}

/**
 * Short, and never a secret.
 *
 * An ID token or an email address in a log is a credential in a log. What
 * matters for tracing a sign-in is the uid, the provider, and whether a thing
 * was null, so anything long is reported by its length instead.
 */
function format(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    return value.length > 80 ? `<${value.length} chars>` : value;
  }
  if (Array.isArray(value)) return `[${value.join(',')}]`;
  return String(value);
}
