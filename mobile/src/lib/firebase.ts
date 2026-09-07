// Firebase initialisation for the native client.
//
// The project is not configured here. React Native Firebase reads
// google-services.json at build time, so there is one place the project is
// named and it is the same file the Android build already needs. There is no
// equivalent of public/js/config.js on this side, and deliberately so: a
// second hand-maintained copy of the project details is a way for the two
// clients to end up pointed at different projects.
//
// The emulator switch mirrors public/js/firebase.js. A development build
// talks to the local emulator suite unless EXPO_PUBLIC_USE_LIVE is set, which
// is the native equivalent of the web's ?live=1. A release build never
// connects to an emulator, whatever the environment says, because the check
// below is on __DEV__ first.

import { getApp } from '@react-native-firebase/app';
import { getAuth, connectAuthEmulator } from '@react-native-firebase/auth';
import { getFirestore, connectFirestoreEmulator } from '@react-native-firebase/firestore';

import { authLog } from './auth-log';
import { emulatorHost, usingEmulator } from './backend';

// The two flags live in src/lib/backend.ts, which imports nothing native, so
// the error copy and the development banner can read them without pulling the
// Firebase SDK in behind them.
export { emulatorHost, usingEmulator } from './backend';

export const app = getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

let connected = false;

/**
 * Called once from the root layout, before anything reads or writes.
 *
 * Idempotent: React Fast Refresh re-runs module bodies, and connecting an
 * emulator twice throws.
 */
export function connectEmulators(): void {
  // Said on every launch, whichever way it goes, because "which backend is
  // this build talking to" is the first question any sign-in failure raises
  // and the app used to answer it only by implication. A dead emulator and a
  // wrong password produced the same message.
  authLog('backend', {
    project: app.options.projectId,
    target: usingEmulator ? `emulator ${emulatorHost}` : 'live Firebase',
    hint: usingEmulator
      ? 'set EXPO_PUBLIC_USE_LIVE=1 and restart Metro with -c for live data'
      : 'none',
  });

  if (!usingEmulator || connected) return;
  connected = true;
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`);
  connectFirestoreEmulator(db, emulatorHost, 8080);
}
