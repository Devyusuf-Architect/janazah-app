// One tagged trace of the whole authentication path.
//
// Sign-in on a phone has five places it can fail and only one of them is the
// password: which backend the build points at, the native Google flow, the
// Firebase credential exchange, the listener that tells React about it, and
// the navigation guard that decides where somebody lands. Until this existed
// a failure in any of them arrived as the same sentence.
//
// Two rules, both learned the hard way.
//
// It never calls console.error or console.warn. Both raise LogBox, which
// throws a full-screen overlay over the app for a failure the screen is
// already reporting properly, and in the middle of a sign-in that is worse
// than useless: it hides the thing you are trying to watch. Everything goes
// through console.log.
//
// It does not truncate a message. The first version shortened anything over
// eighty characters to "<86 chars>", which is exactly what it did to the one
// Firebase message that would have named the cause. Only values that actually
// look like a credential are redacted now, and they are redacted because they
// are credentials, not because they are long.
//
// Development only. Every function returns immediately when __DEV__ is false,
// and the minifier drops a branch behind a false constant.
//
//   adb logcat -s ReactNativeJS | grep taziyah-auth

const TAG = 'taziyah-auth';

export function authLog(step: string, detail?: Record<string, unknown>): void {
  if (!__DEV__) return;
  console.log(`${TAG} ${step}${detail ? ` ${pairs(detail)}` : ''}`);
}

/**
 * Everything an error is carrying, including the native fields.
 *
 * react-native-firebase wraps Android exceptions in a NativeFirebaseError,
 * whose `code` is often the useless "auth/unknown" while `nativeErrorCode`
 * and `nativeErrorMessage` carry what actually went wrong. Printing only the
 * code is how a Google sign-in failure looked identical to every other one.
 */
export function authError(step: string, error: unknown): void {
  if (!__DEV__) return;

  const e = (error ?? {}) as Record<string, unknown> & { message?: string };
  const fields: Record<string, unknown> = {
    name: e.name,
    code: e.code,
    message: e.message,
    // NativeFirebaseError. See its type in
    // @react-native-firebase/app/lib/internal/NativeFirebaseError.
    namespace: e.namespace,
    nativeErrorCode: e.nativeErrorCode,
    nativeErrorMessage: e.nativeErrorMessage,
    operationType: e.operationType,
    userInfo: e.userInfo,
    customData: e.customData,
    cause: e.cause,
  };

  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `  ${key}: ${format(value)}`);

  // Anything the SDK attached that is not in the list above. A field nobody
  // anticipated is exactly the field worth seeing.
  const known = new Set([...Object.keys(fields), 'stack', 'jsStack']);
  for (const key of Object.keys(e)) {
    if (!known.has(key)) lines.push(`  ${key}: ${format(e[key])}`);
  }

  console.log(`${TAG} ${step} FAILED\n${lines.join('\n')}`);
}

const pairs = (detail: Record<string, unknown>) =>
  Object.entries(detail).map(([k, v]) => `${k}=${format(v)}`).join(' ');

/**
 * Readable, and never a credential.
 *
 * An ID token in a log is a credential in a log, so anything JWT-shaped is
 * reported by its length. Everything else is printed in full, however long:
 * the whole point of this file is that the long ones are the useful ones.
 */
function format(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    // Three base64url segments separated by dots is a JWT and nothing else.
    if (/^[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}$/.test(value)) {
      return `<token, ${value.length} chars>`;
    }
    return value;
  }
  if (Array.isArray(value)) return `[${value.map(format).join(', ')}]`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
