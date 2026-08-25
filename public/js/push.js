// Push notifications that reach a device even when this page is closed.
//
// How the privacy property survives having a server involved:
//
//   The device works out which coarse area cells cover its chosen radius and
//   asks to be subscribed to those topics. The backend performs the
//   subscription and discards the request. It is never written to Firestore
//   and never logged. When a notice is published, the backend sends it to the
//   topics covering the *notice's* location, which is public information, and
//   FCM decides which devices those reach. At no point does the backend hold a
//   position, or a way to ask which devices are in a given area.
//
// The cell set is a compromise, and worth naming: a topic identifies an area,
// typically a few kilometres across, not a point. That is coarser than the
// on-device matching in Phase 3, and it is the price of reaching a locked
// phone at all.

import { getMessaging, getToken, deleteToken, isSupported }
  from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { app } from './firebase.js';
import { firebaseConfig, APP } from './config.js';
import { subscriptionCells } from './geo.js';
import * as loc from './location.js';
import { followedOrgIds } from './follows.js';
import { ensureSignedIn } from './store.js';

const KEY = 'janazah.push';

function state() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object'
      ? { token: null, topics: [], ...parsed }
      : { token: null, topics: [] };
  } catch {
    return { token: null, topics: [] };
  }
}

function saveState(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Push will simply re-subscribe next time rather than diffing.
  }
}

export const isConfigured = () =>
  typeof APP.vapidKey === 'string' && APP.vapidKey.length > 20
  && !APP.vapidKey.startsWith('REPLACE');

export async function supported() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (!('Notification' in window)) return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export const permission = () =>
  ('Notification' in window ? Notification.permission : 'unsupported');

export const isEnabled = () => !!state().token;

/**
 * The topics this device should be subscribed to right now: the areas covering
 * its radius, and every masjid it follows.
 */
export function desiredTopics() {
  const topics = new Set(followedOrgIds().map((id) => `org_${id}`));
  const settings = loc.settings();
  if (settings.enabled && settings.last) {
    const { cells } = subscriptionCells(
      settings.last.lat, settings.last.lng, settings.radiusKm);
    for (const cell of cells) topics.add(`cell_${cell}`);
  }
  return [...topics].sort();
}

/** Registers the messaging service worker, passing it the project config. */
async function registerWorker() {
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey,
    projectId: firebaseConfig.projectId,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
  });
  return navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${params.toString()}`, { scope: '/' });
}

const callSubscribe = (payload) =>
  httpsCallable(getFunctions(app, 'northamerica-northeast1'), 'subscribeDevice')(payload);

/**
 * Bring the backend's idea of this device's topics in line with what it should
 * be. Sends only the difference, so moving a few kilometres does not
 * re-subscribe to everything.
 */
export async function syncTopics() {
  const current = state();
  if (!current.token) return { changed: 0 };

  const desired = desiredTopics();
  const have = new Set(current.topics);
  const want = new Set(desired);

  const subscribe = desired.filter((t) => !have.has(t));
  const unsubscribe = current.topics.filter((t) => !want.has(t));
  if (!subscribe.length && !unsubscribe.length) return { changed: 0 };

  await ensureSignedIn();
  // Chunked, because a wide radius plus many follows can exceed what one call
  // accepts.
  const CHUNK = 50;
  for (let i = 0; i < Math.max(subscribe.length, unsubscribe.length); i += CHUNK) {
    await callSubscribe({
      token: current.token,
      subscribe: subscribe.slice(i, i + CHUNK),
      unsubscribe: unsubscribe.slice(i, i + CHUNK),
    });
  }

  saveState({ ...current, topics: desired });
  return { changed: subscribe.length + unsubscribe.length };
}

export class PushError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PushError';
    this.code = code;
  }
}

/** Turn push on. Called only from an explicit user action. */
export async function enable() {
  if (!isConfigured()) {
    throw new PushError(
      'Push is not configured for this site yet. A Web Push certificate key ' +
      'is needed. See docs/phase-4-notes.md.', 'unconfigured');
  }
  if (!(await supported())) {
    throw new PushError(
      'This browser cannot receive push notifications. On iPhone, add this ' +
      'page to your Home Screen first, then turn alerts on from there.',
      'unsupported');
  }

  const granted = await Notification.requestPermission();
  if (granted !== 'granted') {
    throw new PushError(
      'Your browser declined notifications for this site. You can change ' +
      'that in its settings for this page.', 'denied');
  }

  const registration = await registerWorker();
  await navigator.serviceWorker.ready;

  let token;
  try {
    token = await getToken(getMessaging(app), {
      vapidKey: APP.vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch (err) {
    throw new PushError(
      `Could not register this device for notifications. ${err.message}`, 'token');
  }
  if (!token) throw new PushError('No messaging token was issued.', 'token');

  saveState({ token, topics: [] });
  await syncTopics();
  return token;
}

/** Turn push off and unsubscribe from everything this device was receiving. */
export async function disable() {
  const current = state();
  if (current.token) {
    try {
      await ensureSignedIn();
      const CHUNK = 50;
      for (let i = 0; i < current.topics.length; i += CHUNK) {
        await callSubscribe({
          token: current.token,
          subscribe: [],
          unsubscribe: current.topics.slice(i, i + CHUNK),
        });
      }
    } catch (err) {
      // Losing the token still stops delivery to this device; a stale
      // subscription with no token behind it reaches nobody.
      console.error('Could not unsubscribe cleanly', err);
    }
    try {
      await deleteToken(getMessaging(app));
    } catch (err) {
      console.error('Could not delete the messaging token', err);
    }
  }
  saveState({ token: null, topics: [] });
}

/**
 * iPhone only offers push to pages installed on the Home Screen, so the app
 * has to be able to say so rather than appearing broken.
 */
export function iosNeedsInstall() {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia?.('(display-mode: standalone)').matches
    || navigator.standalone === true;
  return isIos && !installed;
}
