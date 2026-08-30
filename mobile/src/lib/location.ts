// Reading and storing the reader's position.
//
// The matching itself is in nearby.ts, which is pure and unit tested. This
// file is the part that touches the device: permissions, the sensor, and
// where the one point is kept.
//
// The property this has to preserve, carried over from public/js/location.js
// unchanged: a user's position is never written to Firestore, never sent to a
// masjid, and never leaves the phone. Three rules follow, and none is
// negotiable.
//
//   Only the most recent point is kept, overwritten in place. Nothing is
//   appended, so no travel history can accumulate.
//
//   Opting out erases. `disable()` deletes the stored point rather than
//   merely ceasing to read it. "Off" has to actually mean off.
//
//   Nothing here, or under src/features/nearby, imports Firestore.
//   test/location.test.ts asserts that structurally, so a change that starts
//   sending positions fails a test rather than shipping quietly. It is the
//   mobile counterpart of the web suite's end-to-end check, which sets a
//   distinctive position and then greps every collection for it.
//
// The point lives in expo-secure-store rather than AsyncStorage, which is a
// deliberate improvement on the web. AsyncStorage is a plain file in the app
// sandbox and is eligible for Android's automatic cloud backup; a coordinate
// is the one thing this app holds that should not travel into a Drive backup.
// SecureStore is Keystore-backed, and app.config.ts also turns allowBackup off.

import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  normalisePrefs, SETTINGS_HINT,
  type LocationPrefs, type PermissionState, type Point,
} from './nearby';

const POINT_KEY = 'taziyah.location.point';
const PREFS_KEY = 'taziyah.location.prefs';

// ------------------------------------------------------------- preferences

export async function readPrefs(): Promise<LocationPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return normalisePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return normalisePrefs(null);
  }
}

export async function writePrefs(
  patch: Partial<LocationPrefs>,
): Promise<LocationPrefs> {
  const next = { ...(await readPrefs()), ...patch };
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // The change still applies for this session. Losing a radius preference
    // is a nuisance; failing the screen over it would be worse.
  }
  return next;
}

// ------------------------------------------------------------- the position

export async function readPoint(): Promise<Point | null> {
  try {
    const raw = await SecureStore.getItemAsync(POINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Point>;
    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) return null;
    return { lat: parsed.lat!, lng: parsed.lng!, at: Number(parsed.at) || 0 };
  } catch {
    return null;
  }
}

/**
 * Store the current point.
 *
 * setItemAsync overwrites. There is no append here and there must never be
 * one: a list of points is a travel history, which this application does not
 * keep anywhere, on any device, at any time.
 */
async function writePoint(point: Point): Promise<void> {
  try {
    await SecureStore.setItemAsync(POINT_KEY, JSON.stringify(point));
  } catch {
    // Nearby still works for this session from the value held in memory.
  }
}

/**
 * Turn the feature off and erase the stored point in the same step.
 *
 * Opting out has to actually delete. Ceasing to read a stored coordinate is
 * not the same thing as not having one.
 */
export async function disable(): Promise<LocationPrefs> {
  await SecureStore.deleteItemAsync(POINT_KEY).catch(() => {});
  return writePrefs({ enabled: false });
}

// ------------------------------------------------------------- permissions

export async function permissionState(): Promise<PermissionState> {
  try {
    const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
    if (status === Location.PermissionStatus.GRANTED) return 'granted';
    // Android's "don't ask again" and a first-run undecided state look similar
    // to the app but need different words: one can still be prompted, the
    // other has to be changed in Settings.
    if (status === Location.PermissionStatus.DENIED) {
      return canAskAgain ? 'undetermined' : 'denied';
    }
    return 'undetermined';
  } catch {
    return 'unavailable';
  }
}

export class LocationError extends Error {
  readonly code: 'denied' | 'blocked' | 'unavailable';
  constructor(message: string, code: LocationError['code']) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

/**
 * Ask for permission and read the current position.
 *
 * The only place in the app that does either, and it runs only from an
 * explicit action by the reader. Accuracy is deliberately `Balanced` rather
 * than `High`: matching against masjids kilometres away does not need a fix
 * to the metre, and a coarser fix is both faster and less revealing.
 */
export async function requestPosition(): Promise<Point> {
  let granted: PermissionState;
  try {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    granted = status === Location.PermissionStatus.GRANTED
      ? 'granted'
      : (canAskAgain ? 'undetermined' : 'denied');
  } catch {
    throw new LocationError('This device cannot provide a location.', 'unavailable');
  }

  if (granted === 'denied') throw new LocationError(SETTINGS_HINT, 'blocked');
  if (granted !== 'granted') {
    throw new LocationError(
      'Ta’ziyah needs permission to use your location for this.', 'denied',
    );
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const point: Point = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      at: Date.now(),
    };
    await writePoint(point);
    return point;
  } catch {
    throw new LocationError(
      'Your location could not be read just now. Try again, or check that '
      + 'location services are on for this device.',
      'unavailable',
    );
  }
}

export * from './nearby';
