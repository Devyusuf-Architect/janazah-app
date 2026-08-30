// Reminders.
//
// Scheduled on the device with expo-notifications, and never server-side.
// That is a privacy decision rather than a technical one: a list of reminders
// held on the backend would be a record of which funerals a person intends to
// attend, which is exactly the kind of thing this application has gone out of
// its way not to hold anywhere.
//
// The consequence is honest and worth stating in the interface: a reminder
// lives on the phone that set it. It does not follow the reader to another
// device, and reinstalling the app loses it.

import * as Notifications from 'expo-notifications';

import { CHANNEL_ID } from '../../lib/notifications';
import type { Notice } from '../../lib/notice';
import { displayName } from '../../lib/notice';

/** How long before the prayer a reminder fires. */
export const LEAD_MINUTES = 90;

/**
 * A stable identifier, so setting a reminder twice replaces rather than
 * stacks, and so it can be cancelled without keeping a list anywhere.
 */
const idFor = (noticeId: string) => `janazah-reminder-${noticeId}`;

export type ReminderState = 'set' | 'unset' | 'too-late';

/** When the reminder for this notice should fire, or null if it cannot. */
export function fireAt(notice: Notice, now = new Date()): Date | null {
  if (!notice.janazahAt) return null;
  const at = new Date(notice.janazahAt.getTime() - LEAD_MINUTES * 60_000);
  // A reminder in the past would fire immediately, which is worse than not
  // offering one: it reads as a notification about a funeral that is already
  // starting.
  return at.getTime() > now.getTime() + 60_000 ? at : null;
}

export async function isSet(noticeId: string): Promise<boolean> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.some((item) => item.identifier === idFor(noticeId));
  } catch {
    return false;
  }
}

/**
 * Set a reminder, replacing any earlier one for the same notice.
 *
 * The content is composed here rather than stored, and deliberately says only
 * what a lock screen should: that a Janazah is soon, and where. Somebody
 * else may be holding the phone.
 */
export async function set(notice: Notice): Promise<ReminderState> {
  const at = fireAt(notice);
  if (!at) return 'too-late';

  const who = displayName(notice);
  await cancel(notice.id);
  await Notifications.scheduleNotificationAsync({
    identifier: idFor(notice.id),
    content: {
      title: who ? `Janazah for ${who} soon` : 'Janazah soon',
      body: [
        notice.orgName,
        notice.prayerLocation?.address || notice.prayerLocation?.name,
      ].filter(Boolean).join('\n'),
      data: { noticeId: notice.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId: CHANNEL_ID,
    },
  });
  return 'set';
}

export async function cancel(noticeId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(idFor(noticeId))
    .catch(() => {
      // Nothing was scheduled, which is the state the caller wanted anyway.
    });
}

/**
 * Drop reminders for notices that have been and gone.
 *
 * Android keeps a scheduled notification until it fires or is cancelled, so
 * without this a reinstall-free device slowly accumulates them. Called at
 * launch; cheap, and failure is not worth reporting.
 */
export async function prune(now = Date.now()): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      const trigger = item.trigger as { date?: number | string } | null;
      const at = trigger?.date ? new Date(trigger.date).getTime() : null;
      if (at !== null && at < now) {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
  } catch {
    // Nothing here is load-bearing.
  }
}
