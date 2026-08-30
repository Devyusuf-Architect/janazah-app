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

import { Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import { getAuth, connectAuthEmulator } from '@react-native-firebase/auth';
import { getFirestore, connectFirestoreEmulator } from '@react-native-firebase/firestore';

/**
 * The host the emulators are reachable at from the device.
 *
 * 10.0.2.2 is the Android emulator's alias for the host machine's loopback.
 * A real device on the same network needs the machine's LAN address instead,
 * which is what EXPO_PUBLIC_EMULATOR_HOST is for.
 */
const emulatorHost = process.env.EXPO_PUBLIC_EMULATOR_HOST
  ?? (Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1');

export const usingEmulator =
  __DEV__ && process.env.EXPO_PUBLIC_USE_LIVE !== '1';

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
  if (!usingEmulator || connected) return;
  connected = true;
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`);
  connectFirestoreEmulator(db, emulatorHost, 8080);
  // Deliberately not logged with the host in a release build; __DEV__ gates
  // the whole function, so this only ever runs during development.
  console.info(`Ta'ziyah is using the Firebase emulators at ${emulatorHost}.`);
}
