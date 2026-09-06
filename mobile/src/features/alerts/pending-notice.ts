// The notice a cold start was launched to open.
//
// Tapping a notification when the app is not running is the single most
// important way into this app, and it had a race in it. FCM's
// getInitialNotification resolves within a few tens of milliseconds and
// pushed /n/{id} straight away; the splash then finished deciding where to
// send somebody, a few hundred milliseconds later, and replaced it. The tap
// appeared to open the app and lose the notice.
//
// So the tap does not navigate. It leaves the id here, and whoever owns the
// initial decision picks it up: the splash when there is already an account,
// sign-in when there is not, so a notification that arrives while a session
// has expired still lands on the right notice once somebody signs in.
//
// A module-level slot rather than state or storage. It exists for the few
// hundred milliseconds between a process starting and a screen being ready,
// it must not survive that process, and it is read exactly once.

let pending: string | null = null;
let settled = false;

/**
 * Called by the splash once it has decided where to send somebody.
 *
 * Before this, nothing else may navigate: whatever it pushed would be
 * replaced. After it, a tap can route immediately, which is the ordinary
 * case of tapping a notification while the app is already running.
 */
export function markLaunchSettled(): void {
  settled = true;
}

export const launchSettled = (): boolean => settled;

export function setPendingNotice(id: string): void {
  pending = id;
}

/** Reads and clears. A second caller gets null, which is the point. */
export function takePendingNotice(): string | null {
  const id = pending;
  pending = null;
  return id;
}

/** Whether one is waiting, without consuming it. */
export const hasPendingNotice = (): boolean => pending !== null;
