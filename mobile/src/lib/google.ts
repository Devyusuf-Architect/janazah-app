// Native Google sign-in.
//
// Not the web's redirect flow. @react-native-google-signin talks to Google
// Play services, gets an ID token, and hands it to Firebase as a credential.
// That is why the redirect-URI problem currently keeping Continue with Google
// switched off on the web (config.js: googleSignIn: false) does not apply
// here: Android authenticates against its own OAuth client, keyed to the app's
// signing certificate rather than to a web origin.
//
// The webClientId below is the *web* OAuth client from the same Firebase
// project, which is what Firebase Auth expects an ID token to be issued for,
// even on Android. The Android OAuth client is matched by certificate
// fingerprint and is never named in code. Both are created in the Firebase
// console when the Android app is registered, and the SHA-1 and SHA-256
// fingerprints of both the EAS debug and release keystores have to be added
// there or sign-in fails with a developer error and nothing more useful.

import Constants from 'expo-constants';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { authError, authLog } from './auth-log';

/**
 * Public client identifier, not a secret.
 *
 * Read out of google-services.json at config time (see app.config.ts), so
 * there is one place the project is described and no second value to keep in
 * step with it. Empty when the file has no web OAuth client, which is what
 * hides the button rather than letting it fail on tap.
 */
const WEB_CLIENT_ID = String(
  Constants.expoConfig?.extra?.googleWebClientId ?? '',
);

export const isGoogleConfigured = (): boolean => WEB_CLIENT_ID.length > 0;

let configured = false;

export function configureGoogle(): void {
  if (configured) return;
  if (!isGoogleConfigured()) {
    authLog('google configure', {
      webClientId: 'missing',
      hint: 'google-services.json has no client_type 3 entry, so app.config.ts '
        + 'had nothing to put in extra.googleWebClientId',
    });
    return;
  }
  configured = true;
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  authLog('google configure', {
    // The identifier itself, not a secret: it is compiled into every copy of
    // the app and printed by any proxy. Which project it belongs to is
    // exactly the thing worth checking when Firebase rejects the token.
    webClientId: WEB_CLIENT_ID,
  });
}

export class GoogleSignInError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'GoogleSignInError';
    this.code = code;
  }
}

/**
 * Google Play services' DEVELOPER_ERROR, which is CommonStatusCodes.10.
 *
 * The library rejects with the string "10" and a message beginning
 * DEVELOPER_ERROR (see its RNGoogleSigninModule.handleSignInTaskResult), and
 * it means one thing on Android: the certificate that signed this build, with
 * this package name, does not match any Android OAuth client in the Firebase
 * project. It is never a network problem, never the user's account, and never
 * fixed by retrying.
 *
 * It is worth naming because the generic message below sends somebody looking
 * in exactly the wrong places.
 */
const DEVELOPER_ERROR = '10';

function isDeveloperError(code: unknown, message: unknown): boolean {
  return code === DEVELOPER_ERROR
    || String(message ?? '').includes('DEVELOPER_ERROR');
}

/**
 * What a developer needs, in a build where a developer is looking.
 *
 * Never shown to somebody who downloaded the app: a release build gets the
 * neutral message and the detail goes to the log instead.
 */
const DEVELOPER_ERROR_HINT =
  'DEVELOPER_ERROR (10). The signing certificate of this build is not '
  + 'registered against com.taziyah.app in the Firebase console, so Google '
  + 'has no Android OAuth client to match it to. A build from '
  + '`expo run:android` is signed with the DEBUG keystore, not the EAS '
  + 'release one, so its own SHA-1 has to be added as well. Print it with '
  + '`keytool -printcert -jarfile '
  + 'android/app/build/outputs/apk/debug/app-debug.apk`, add it in Firebase, '
  + 'download google-services.json again and rebuild.';

/**
 * Run the native flow and return the ID token for Firebase.
 *
 * Returns null when the person backed out, which is not an error and must not
 * be reported as one.
 */
export async function getGoogleIdToken(): Promise<string | null> {
  if (!isGoogleConfigured()) {
    throw new GoogleSignInError(
      'Continue with Google is not set up in this build yet.', 'unconfigured',
    );
  }
  configureGoogle();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    authLog('google play services ok');

    const result = await GoogleSignin.signIn();
    authLog('google picker', { type: result.type });
    if (result.type === 'cancelled') return null;

    const idToken = result.data?.idToken;
    // Length and issuer-audience are the two things worth knowing and the
    // token itself is never printed: authError redacts anything JWT-shaped,
    // and so does this. A token in a log is a credential in a log.
    authLog('google token', {
      idToken: idToken ? `present, ${idToken.length} chars` : 'MISSING',
      audience: idToken ? audienceOf(idToken) : 'n/a',
      configuredWebClientId: WEB_CLIENT_ID,
      // If these two disagree, Firebase rejects the credential and reports
      // auth/unknown rather than saying which client it expected.
      audienceMatches: idToken
        ? String(audienceOf(idToken) === WEB_CLIENT_ID)
        : 'n/a',
      serverAuthCode: result.data?.serverAuthCode ? 'present' : 'none',
      email: result.data?.user?.email ? 'present' : 'none',
    });
    if (!idToken) {
      throw new GoogleSignInError(
        'Google did not return a sign-in token. Try again.', 'no-token',
      );
    }
    return idToken;
  } catch (error) {
    if (error instanceof GoogleSignInError) throw error;
    const code = (error as { code?: string }).code;
    const nativeMessage = (error as { message?: string }).message;

    if (code === statusCodes.SIGN_IN_CANCELLED) return null;

    // Logged before anything is turned into a message for a person. Through
    // authError rather than console.error: console.error raises LogBox, and a
    // full-screen red overlay on top of a sign-in failure the screen is
    // already reporting hides the very thing you are trying to read.
    // `adb logcat -s ReactNativeJS | grep taziyah-auth` shows it.
    authError('google native', error);

    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new GoogleSignInError(
        'Google Play services are not available on this device. '
        + 'You can sign in with an email address and password instead.',
        'no-play-services',
      );
    }

    if (isDeveloperError(code, nativeMessage)) {
      authLog('google DEVELOPER_ERROR', { hint: DEVELOPER_ERROR_HINT });
      throw new GoogleSignInError(
        __DEV__
          ? DEVELOPER_ERROR_HINT
          : 'Google sign-in could not be completed. '
            + 'You can sign in with an email address and password instead.',
        DEVELOPER_ERROR,
      );
    }

    throw new GoogleSignInError(
      // The code is on screen in a development build so a device with no
      // logcat attached still says something specific.
      __DEV__
        ? `Google sign-in failed (${String(code ?? 'unknown')}). `
          + `${String(nativeMessage ?? '')}`.trim()
        : 'Google sign-in could not be completed. '
          + 'You can sign in with an email address and password instead.',
      String(code ?? 'unknown'),
    );
  }
}

/**
 * The `aud` claim of an ID token, which is the OAuth client it was issued for.
 *
 * Firebase accepts a Google ID token only when its audience is a client of
 * the same project, and rejects a good token from the wrong project with
 * auth/unknown and an internal-error message that does not say so. Reading
 * the claim is not verifying the token: nothing here trusts it, it is only
 * printed next to the client id the app asked for so the two can be compared.
 */
function audienceOf(idToken: string): string {
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return 'unreadable';
    const json = JSON.parse(decodeBase64Url(payload)) as { aud?: unknown };
    return typeof json.aud === 'string' ? json.aud : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * base64url to text, written out rather than reached for.
 *
 * atob exists in the Hermes runtime but is not in the type surface this
 * project compiles against, and a Buffer polyfill is a dependency for one
 * claim of one token. Twelve lines is cheaper than either.
 */
function decodeBase64Url(input: string): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const char of input) {
    const index = B64.indexOf(char);
    if (index < 0) continue;
    value = (value << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return out;
}

/** Sign out of Google too, so the next sign-in offers the account chooser. */
export async function signOutGoogle(): Promise<void> {
  if (!configured) return;
  await GoogleSignin.signOut().catch(() => {});
}
