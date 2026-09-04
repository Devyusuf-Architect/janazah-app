// Haptics.
//
// Used for four things and nothing else: following or unfollowing a masjid,
// setting or clearing a reminder, opening a step in the guide, and sending a
// report. Each is a decision the person made, and the tap confirms the app
// heard it.
//
// Not used for navigation, not used for arriving content, and never for a
// notification about a death. A phone buzzing to announce a funeral is the
// wrong register entirely, and that path does not go through this file
// anyway: the notification channel's own vibration pattern is set once in
// src/lib/notifications.ts.
//
// Every call is fire and forget. A device with the motor disabled, or with
// haptics turned off in system settings, resolves or rejects and nothing
// above ever waits on it.

import * as Haptics from 'expo-haptics';

/** A decision registered: a follow, a reminder, a step opening. */
export function tapped(): void {
  Haptics.selectionAsync().catch(() => {});
}

/** Something completed that the person will want confirmed. */
export function succeeded(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    .catch(() => {});
}

/** Something refused. Used sparingly; an error message says more. */
export function failed(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    .catch(() => {});
}
