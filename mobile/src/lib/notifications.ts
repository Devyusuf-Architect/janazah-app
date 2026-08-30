// Push notifications.
//
// How the privacy property survives having a server involved, unchanged from
// public/js/push.js:
//
//   The device works out which coarse area cells cover its chosen radius and
//   asks to be subscribed to those topics. The backend performs the
//   subscription and discards the request; it is never written to Firestore
//   and never logged. When a notice is published, the backend sends it to the
//   topics covering the *notice's* location, which is public information, and
//   FCM decides which devices those reach. At no point does the backend hold
//   a position, or a way to ask which devices are in an area.
//
// The cell set is a compromise worth naming: a topic identifies an area,
// typically a few kilometres across, not a point. That is coarser than the
// on-device matching in Nearby, and it is the price of reaching a locked
// phone at all.
//
// Two things this file must get right or the feature silently does nothing:
//
//   The channel id must match ANDROID_CHANNEL in functions/lib/notify.js.
//   Naming a channel Android does not know drops every message into the
//   default one at whatever importance the system chose.
//
//   The token and the topic list stay on the device. They are not synced to
//   the account, because they describe this phone rather than this person.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  getMessaging, getToken, deleteToken, requestPermission,
  hasPermission, AuthorizationStatus,
} from '@react-native-firebase/messaging';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { signInAnonymously } from '@react-native-firebase/auth';

import { app, auth } from './firebase';
import { desiredTopics, topicDelta } from './topics';
import type { LocationPrefs, Point } from './nearby';

/** Must match ANDROID_CHANNEL in functions/lib/notify.js. */
export const CHANNEL_ID = 'janazah';

const STATE_KEY = 'taziyah.push';

/** The region the functions are deployed to. Same as Firestore's. */
const REGION = 'northamerica-northeast1';

/** Topic changes a single device may request in one call. Matches the server. */
const CHUNK = 50;

type PushState = { token: string | null; topics: string[] };

async function readState(): Promise<PushState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object'
      ? { token: null, topics: [], ...parsed }
      : { token: null, topics: [] };
  } catch {
    return { token: null, topics: [] };
  }
}

async function writeState(next: PushState): Promise<void> {
  try {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(next));
  } catch {
    // The device will simply re-subscribe to everything next time rather
    // than sending a difference.
  }
}

export const isEnabled = async (): Promise<boolean> => !!(await readState()).token;

/**
 * Create the notification channel.
 *
 * Called at launch, before any message can arrive, because a channel cannot
 * be created in response to one. Android ignores changes to a channel that
 * already exists, which is deliberate on their part: once somebody has chosen
 * a sound or turned it down, the app does not get to override them.
 */
export async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Janazah notices',
    description:
      'New Janazah notices, corrections and cancellations from the masjids '
      + 'you follow and from your area.',
    // HIGH, not MAX. A Janazah is urgent and often within hours, so it should
    // arrive promptly and make a sound; it should not take over the screen of
    // somebody who is driving or in a meeting.
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#14503f',
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function permissionState(): Promise<PermissionState> {
  try {
    const status = await hasPermission(getMessaging(app));
    if (status === AuthorizationStatus.AUTHORIZED
      || status === AuthorizationStatus.PROVISIONAL) return 'granted';
    if (status === AuthorizationStatus.DENIED) return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

export class PushError extends Error {
  readonly code: 'denied' | 'token' | 'unsupported';
  constructor(message: string, code: PushError['code']) {
    super(message);
    this.name = 'PushError';
    this.code = code;
  }
}

export const SETTINGS_HINT =
  'Notifications are turned off for Ta’ziyah. To turn them back on, open '
  + 'Android Settings, then Apps, then Ta’ziyah, then Notifications.';

const callSubscribe = (payload: {
  token: string; subscribe: string[]; unsubscribe: string[];
}) => httpsCallable(
  getFunctions(app, REGION), 'subscribeDevice',
)(payload);

/**
 * Turn notifications on.
 *
 * Called only from an explicit action, and only after a screen has explained
 * what will be sent. Android 13 and later shows the system prompt on the
 * first request and never again, so spending it on a cold launch is spending
 * it badly.
 */
export async function enable(): Promise<string> {
  await ensureChannel();

  const status = await requestPermission(getMessaging(app));
  const granted = status === AuthorizationStatus.AUTHORIZED
    || status === AuthorizationStatus.PROVISIONAL;
  if (!granted) throw new PushError(SETTINGS_HINT, 'denied');

  let token: string;
  try {
    token = await getToken(getMessaging(app));
  } catch (error) {
    throw new PushError(
      'This device could not be registered for notifications. '
      + `${(error as Error).message}`,
      'token',
    );
  }
  if (!token) throw new PushError('No messaging token was issued.', 'token');

  await writeState({ token, topics: [] });
  return token;
}

/**
 * Bring the backend's idea of this device's topics in line with what it
 * should be. Sends only the difference, so moving a few kilometres does not
 * re-subscribe to everything.
 */
export async function syncTopics(
  prefs: LocationPrefs,
  point: Point | null,
  followedOrgIds: string[],
): Promise<{ changed: number }> {
  const current = await readState();
  if (!current.token) return { changed: 0 };

  const desired = desiredTopics(prefs, point, followedOrgIds);
  const { subscribe, unsubscribe } = topicDelta(current.topics, desired);
  if (!subscribe.length && !unsubscribe.length) return { changed: 0 };

  // The callable requires a session. Anonymous is enough and is what the app
  // already has: it is a handle to rate limit against, not an identity.
  if (!auth.currentUser) await signInAnonymously(auth);

  for (let i = 0; i < Math.max(subscribe.length, unsubscribe.length); i += CHUNK) {
    await callSubscribe({
      token: current.token,
      subscribe: subscribe.slice(i, i + CHUNK),
      unsubscribe: unsubscribe.slice(i, i + CHUNK),
    });
  }

  await writeState({ ...current, topics: desired });
  return { changed: subscribe.length + unsubscribe.length };
}

/** Turn notifications off, and unsubscribe from everything this device had. */
export async function disable(): Promise<void> {
  const current = await readState();
  if (current.token) {
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
      for (let i = 0; i < current.topics.length; i += CHUNK) {
        await callSubscribe({
          token: current.token,
          subscribe: [],
          unsubscribe: current.topics.slice(i, i + CHUNK),
        });
      }
    } catch {
      // Losing the token still stops delivery to this device; a stale
      // subscription with no token behind it reaches nobody.
    }
    try {
      await deleteToken(getMessaging(app));
    } catch {
      // As above.
    }
  }
  await writeState({ token: null, topics: [] });
}

export { desiredTopics } from './topics';
