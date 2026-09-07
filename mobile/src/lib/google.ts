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
  if (configured || !isGoogleConfigured()) return;
  configured = true;
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
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
    const result = await GoogleSignin.signIn();
    if (result.type === 'cancelled') return null;
    const idToken = result.data?.idToken;
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

    // Logged before anything is turned into a message for a person, and
    // always, not only in development. Without this the only thing that ever
    // reached anybody was the neutral sentence below, which names none of the
    // four things that could be wrong. `adb logcat -s ReactNativeJS` shows it.
    console.error(
      `[Ta'ziyah] Google sign-in failed. code=${String(code ?? 'none')} `
      + `message=${String(nativeMessage ?? 'none')}`,
    );

    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new GoogleSignInError(
        'Google Play services are not available on this device. '
        + 'You can sign in with an email address and password instead.',
        'no-play-services',
      );
    }

    if (isDeveloperError(code, nativeMessage)) {
      console.error(`[Ta'ziyah] ${DEVELOPER_ERROR_HINT}`);
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

/** Sign out of Google too, so the next sign-in offers the account chooser. */
export async function signOutGoogle(): Promise<void> {
  if (!configured) return;
  await GoogleSignin.signOut().catch(() => {});
}
