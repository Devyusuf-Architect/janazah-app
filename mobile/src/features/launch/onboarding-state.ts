// Whether the welcome panels have been seen.
//
// Device-local, and deliberately not part of the account. Somebody reinstalling
// the app on a new phone should see the explanation again: they are being
// asked for a location permission and a notification permission, and the
// screen that says why those matter is the one thing standing between the
// request and a person deciding blind.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'taziyah.onboarded';

export async function hasOnboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    // Storage unavailable. Showing the welcome again is the harmless failure;
    // skipping it is not.
    return false;
  }
}

export async function markOnboarded(): Promise<void> {
  await AsyncStorage.setItem(KEY, '1').catch(() => {});
}
