// Which backend this build talks to.
//
// Split out of src/lib/firebase.ts so that asking the question costs nothing:
// firebase.ts imports the native SDK, and anything importing it becomes
// device-only and untestable. This is two constants and no imports, so the
// error copy and the development banner can both read it without dragging
// Firebase in behind them.
//
// The rule itself mirrors public/js/firebase.js. A development build talks to
// the local emulator suite unless EXPO_PUBLIC_USE_LIVE is set, which is the
// native equivalent of the web app's ?live=1. A release build never connects
// to an emulator whatever the environment says, because the check is on
// __DEV__ first.

import { Platform } from 'react-native';

/**
 * The host the emulators are reachable at from the device.
 *
 * 10.0.2.2 is the Android emulator's alias for the host machine's loopback.
 * A real device on the same network needs the machine's LAN address instead,
 * which is what EXPO_PUBLIC_EMULATOR_HOST is for.
 */
export const emulatorHost = process.env.EXPO_PUBLIC_EMULATOR_HOST
  ?? (Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1');

export const usingEmulator =
  __DEV__ && process.env.EXPO_PUBLIC_USE_LIVE !== '1';
