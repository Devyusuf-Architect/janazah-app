// Publishing rate limits.
//
// The risk being managed is not load, it is a compromised or misused
// coordinator account sending a burst of push notifications to a community.
// A real masjid publishes a handful of notices a day at most.
//
// Notices are never blocked: a genuine Janazah must always be publishable, and
// a false positive that silenced a real one would be far worse than a burst of
// notifications. What the limit gates is the *notification*, and it raises a
// report for an administrator either way.

export const LIMITS = {
  /** Notifications one organization may trigger in the window below. */
  notificationsPerWindow: 8,
  windowMinutes: 60,
};

/**
 * Decide whether this organization may send another notification.
 *
 * @param {{windowStart?: number, count?: number}|null} state  Stored counter.
 * @param {number} now  Epoch milliseconds.
 * @returns {{allowed: boolean, next: {windowStart: number, count: number}, tripped: boolean}}
 */
export function checkAndCount(state, now) {
  const windowMs = LIMITS.windowMinutes * 60 * 1000;
  const started = Number(state?.windowStart) || 0;
  const expired = now - started >= windowMs;

  const windowStart = expired ? now : started;
  const previous = expired ? 0 : Number(state?.count) || 0;
  const count = previous + 1;

  return {
    allowed: count <= LIMITS.notificationsPerWindow,
    // The counter keeps climbing past the limit so an administrator can see
    // how big the burst was, not merely that one happened.
    next: { windowStart, count },
    // True only on the notification that crosses the line, so one report is
    // raised per burst rather than one per message.
    tripped: count === LIMITS.notificationsPerWindow + 1,
  };
}
