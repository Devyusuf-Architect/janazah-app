// What this device has been told about.
//
// Device-local and nothing else. It is a short list of the notices this phone
// received a notification for, so somebody who dismissed one on a lock screen
// can find it again, which is otherwise impossible: a dismissed Android
// notification is gone.
//
// Three deliberate limits, because a list of funerals somebody was told about
// is close enough to a record of which funerals they cared about to be worth
// handling carefully:
//
//   It never leaves the device. Not to Firestore, not to the account
//   document, not anywhere. The rules have no key that could hold it.
//   test/alerts.test.ts checks this module cannot write.
//
//   It holds ids and a timestamp, not content. The notice itself is fetched
//   fresh when it is opened, so a cancellation is never hidden behind a cached
//   copy of the original announcement.
//
//   It is capped, and turning notifications off clears it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RemoteMessage } from '@react-native-firebase/messaging';

const KEY = 'taziyah.alerts.inbox';

/** Beyond this, the older ones are not worth keeping. */
export const MAX_ENTRIES = 40;

export type InboxEntry = {
  noticeId: string;
  /** 'published' | 'updated' | 'cancelled', as sent. */
  kind: string;
  at: number;
};

export async function read(): Promise<InboxEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(
      (entry): entry is InboxEntry =>
        !!entry && typeof entry.noticeId === 'string' && typeof entry.at === 'number',
    );
  } catch {
    return [];
  }
}

/**
 * Record that a message arrived.
 *
 * The newest entry for a notice replaces any earlier one, so a cancellation
 * takes the place of the announcement rather than sitting beneath it.
 */
export async function remember(
  message: RemoteMessage,
): Promise<void> {
  const data = message?.data ?? {};
  const noticeId = typeof data.noticeId === 'string' ? data.noticeId : '';
  if (!noticeId) return;

  const kind = typeof data.kind === 'string' ? data.kind : 'published';
  const existing = await read();
  const next = [
    { noticeId, kind, at: Date.now() },
    ...existing.filter((entry) => entry.noticeId !== noticeId),
  ].slice(0, MAX_ENTRIES);

  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // The notification was still delivered, which is the part that matters.
  }
}

/** Called when notifications are turned off. Off has to mean off. */
export async function clear(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
