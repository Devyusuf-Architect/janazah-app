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

import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

/** Public client identifier, not a secret. Absent until the console is set up. */
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

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
    if (code === statusCodes.SIGN_IN_CANCELLED) return null;
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new GoogleSignInError(
        'Google Play services are not available on this device. '
        + 'You can sign in with an email address and password instead.',
        'no-play-services',
      );
    }
    throw new GoogleSignInError(
      'Google sign-in could not be completed. '
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
