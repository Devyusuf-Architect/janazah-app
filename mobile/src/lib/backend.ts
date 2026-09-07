// Which backend this build talks to, decided in exactly one place.
//
// Split out of src/lib/firebase.ts so that asking the question costs nothing:
// firebase.ts imports the native SDK, and anything importing it becomes
// device-only and untestable. This module reaches for no Firebase service, so
// the error copy and the development banner can both read the answer without
// dragging the SDK in behind them.
//
// The rule mirrors public/js/firebase.js. A development build talks to the
// local emulator suite unless it is told to go live, which is the native
// equivalent of the web app's ?live=1. A release build never connects to an
// emulator whatever the environment says, because the check is on __DEV__
// first.
//
// The switch is read twice, from two places, on purpose.
//
//   Constants.expoConfig.extra.backend, written by app.config.ts. The config
//   is evaluated fresh every time Metro serves a manifest, so this reflects
//   the environment the bundler is running in right now.
//
//   process.env.EXPO_PUBLIC_USE_LIVE, which Babel inlines into the bundle at
//   transform time. Correct, but transform output is cached, so after
//   changing the variable a stale bundle can still carry the old value.
//
// Either saying live means live. That way a cached `false` cannot override a
// freshly evaluated config, which is the failure this arrangement exists to
// prevent: a build that looked live and quietly still pointed at 10.0.2.2.

import Constants from 'expo-constants';
import { Platform } from 'react-native';

type BackendExtra = { live?: boolean; emulatorHost?: string };

const extra = (Constants.expoConfig?.extra?.backend ?? {}) as BackendExtra;

/**
 * The host the emulators are reachable at from the device.
 *
 * 10.0.2.2 is the Android emulator's alias for the host machine's loopback.
 * A real device on the same network needs the machine's LAN address instead,
 * which is what EXPO_PUBLIC_EMULATOR_HOST is for.
 */
export const emulatorHost = extra.emulatorHost
  || process.env.EXPO_PUBLIC_EMULATOR_HOST
  || (Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1');

/** Told to use the real project. See the note above on why this is read twice. */
const askedForLive =
  extra.live === true || process.env.EXPO_PUBLIC_USE_LIVE === '1';

export const usingEmulator = __DEV__ && !askedForLive;

/**
 * Emulator ports, matching the emulators block in the repository's
 * firebase.json. Every service listed here is connected together by
 * connectEmulators, or none of them is: a build that authenticated locally
 * and called deployed Cloud Functions was the mixed state this pins shut.
 */
export const emulatorPorts = {
  auth: 9099,
  firestore: 8080,
  functions: 5001,
} as const;

/** The region the Cloud Functions are deployed to. Same as Firestore's. */
export const functionsRegion = 'northamerica-northeast1';

/** One line naming the target, for logs and for the development banner. */
export const backendTarget = usingEmulator
  ? `emulator ${emulatorHost}`
  : 'live Firebase';
