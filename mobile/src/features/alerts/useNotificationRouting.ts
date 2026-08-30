// Opening the right notice when a notification is tapped.
//
// Three separate cases, and missing any one of them means a tap that appears
// to do nothing:
//
//   The app is in the foreground. FCM hands the message to onMessage and
//   Android displays nothing, so the app has to show it itself. It does that
//   as a quiet in-app notification rather than a system one, because a banner
//   for something the reader is already looking at is noise.
//
//   The app is in the background. onNotificationOpenedApp fires when the
//   notification is tapped.
//
//   The app was not running at all. getInitialNotification returns the
//   message that started it, once. This is the case most often missed,
//   because it does not happen while somebody is testing with the app open.
//
// An Android App Link on https://taziyah.com/n/{id} is handled separately, by
// expo-router's own linking, since the route tree already matches that path.

import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  getMessaging, onMessage, onNotificationOpenedApp, getInitialNotification,
  type RemoteMessage,
} from '@react-native-firebase/messaging';

import { app } from '../../lib/firebase';
import { CHANNEL_ID } from '../../lib/notifications';
import { remember } from './inbox';

type Message = RemoteMessage;

/** The notice a message points at, or null if it is not one of ours. */
export function noticeIdFrom(message: Message | null | undefined): string | null {
  const data = message?.data ?? {};
  const id = typeof data.noticeId === 'string' ? data.noticeId : null;
  if (id && /^[A-Za-z0-9_-]{1,128}$/.test(id)) return id;

  // Fall back to the link, which carries the same id. Parsed rather than
  // followed: a message is untrusted input, and the app should navigate to
  // one of its own routes rather than open whatever URL it was handed.
  const link = typeof data.link === 'string' ? data.link : '';
  const match = link.match(/\/n\/([A-Za-z0-9_-]{1,128})\/?$/);
  return match ? match[1]! : null;
}

function openNotice(id: string): void {
  router.push(`/n/${id}`);
}

export function useNotificationRouting(): void {
  // A cold start delivers its notification once, and React's development
  // double-invocation would otherwise route twice.
  const handledColdStart = useRef(false);

  useEffect(() => {
    const messaging = getMessaging(app);

    // Foreground. Shown as a local notification on the same channel, so it
    // looks and sounds like the ones that arrive when the app is closed.
    const unsubscribeForeground = onMessage(messaging, async (message) => {
      const id = noticeIdFrom(message);
      if (id) await remember(message);
      const title = message.notification?.title;
      const body = message.notification?.body;
      if (!title && !body) return;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: title ?? 'Janazah notice',
          body: body ?? '',
          data: { noticeId: id ?? '' },
        },
        trigger: null,
      }).catch(() => {});
    });

    // Backgrounded, then tapped.
    const unsubscribeOpened = onNotificationOpenedApp(messaging, (message) => {
      const id = noticeIdFrom(message);
      if (id) openNotice(id);
    });

    // Not running at all, started by the tap.
    if (!handledColdStart.current) {
      handledColdStart.current = true;
      getInitialNotification(messaging).then((message) => {
        const id = noticeIdFrom(message);
        if (id) openNotice(id);
      }).catch(() => {});
    }

    // A tap on a notification this app raised itself, which is the
    // foreground case above and the reminders.
    const tapSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          Record<string, unknown> | undefined;
        const id = typeof data?.noticeId === 'string' ? data.noticeId : '';
        if (id) openNotice(id);
      },
    );

    return () => {
      unsubscribeForeground();
      unsubscribeOpened();
      tapSubscription.remove();
    };
  }, []);
}

export { CHANNEL_ID };
