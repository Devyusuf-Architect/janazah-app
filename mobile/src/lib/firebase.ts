// Firebase initialisation for the native client.
//
// The project is not configured here. React Native Firebase reads
// google-services.json at build time, so there is one place the project is
// named and it is the same file the Android build already needs. There is no
// equivalent of public/js/config.js on this side, and deliberately so: a
// second hand-maintained copy of the project details is a way for the two
// clients to end up pointed at different projects.
//
// Which backend it talks to is decided in src/lib/backend.ts and nowhere
// else. This file only acts on that decision, and acts on it for every
// service at once. See connectEmulators.

import { getApp } from '@react-native-firebase/app';
import { getAuth, connectAuthEmulator } from '@react-native-firebase/auth';
import { getFirestore, connectFirestoreEmulator } from '@react-native-firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from '@react-native-firebase/functions';

import { authLog } from './auth-log';
import {
  backendTarget, emulatorHost, emulatorPorts, functionsRegion, usingEmulator,
} from './backend';

// The flags live in src/lib/backend.ts, which imports nothing from the
// Firebase SDK, so the error copy and the development banner can read them
// without pulling it in behind them.
export {
  backendTarget, emulatorHost, emulatorPorts, functionsRegion, usingEmulator,
} from './backend';

export const app = getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * The one Functions instance in the app.
 *
 * Exported rather than constructed at each call site so that there is a
 * single object for connectEmulators to redirect. A second
 * getFunctions(app, region) elsewhere would be a second instance, and it
 * would keep calling the deployed functions while everything else was local.
 */
export const functions = getFunctions(app, functionsRegion);

let connected = false;

/**
 * Point every service at the same place.
 *
 * Called once from the root layout, before anything reads or writes.
 * Idempotent: React Fast Refresh re-runs module bodies, and connecting an
 * emulator twice throws.
 *
 * All three services move together. Auth and Firestore used to be redirected
 * and Cloud Functions were not, which meant a development build signed in
 * against a local emulator and then asked the *deployed* subscribeDevice to
 * register a device token for a uid that only existed on the developer's
 * machine. Mixed state like that fails in ways that look like anything but
 * its cause.
 *
 * Cloud Messaging is the one service that cannot join them: there is no FCM
 * emulator, so push tokens always come from the real project. It sends
 * nothing on its own, so a development build is quiet unless something
 * deployed decides to notify it.
 */
export function connectEmulators(): void {
  // Said on every launch, whichever way it goes, because "which backend is
  // this build talking to" is the first question any sign-in failure raises
  // and the app used to answer it only by implication. A dead emulator and a
  // wrong password produced the same message.
  authLog('backend', {
    project: app.options.projectId,
    target: backendTarget,
    services: usingEmulator
      ? `auth ${emulatorPorts.auth}, firestore ${emulatorPorts.firestore}, `
        + `functions ${emulatorPorts.functions} (messaging is always live)`
      : 'auth, firestore, functions, messaging',
    hint: usingEmulator
      ? 'run with EXPO_PUBLIC_USE_LIVE=1 for the real project'
      : 'none',
  });

  if (!usingEmulator || connected) return;
  connected = true;
  connectAuthEmulator(auth, `http://${emulatorHost}:${emulatorPorts.auth}`);
  connectFirestoreEmulator(db, emulatorHost, emulatorPorts.firestore);
  connectFunctionsEmulator(functions, emulatorHost, emulatorPorts.functions);
}
