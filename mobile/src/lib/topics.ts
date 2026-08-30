// Which notification topics this device should be subscribed to.
//
// Pure, so it can be tested directly, and separated from notifications.ts for
// the same reason nearby.ts is separated from location.ts: this is the part
// with the decisions in it.
//
// It has to agree with three other places, and a disagreement is silent
// rather than loud. If this computes a different cell set from
// public/js/push.js, the two clients hear about different funerals. If it
// names a topic functions/lib/topics.js would reject, the subscription call
// fails. If the grid drifts from the one the Cloud Function publishes to, a
// device is subscribed to areas no notice is ever sent to and simply never
// hears anything.

import { subscriptionCells } from '../shared/geo';
import type { LocationPrefs, Point } from './nearby';

export const cellTopic = (hash: string): string => `cell_${hash}`;
export const orgTopic = (orgId: string): string => `org_${orgId}`;

/**
 * The topics this device should be subscribed to right now.
 *
 * Identical to public/js/push.js. Two switches narrow it, and both work by
 * unsubscribing rather than by discarding messages on arrival, because the
 * device ceasing to be told is the only version of "off" that is true.
 */
export function desiredTopics(
  prefs: LocationPrefs,
  point: Point | null,
  followedOrgIds: string[],
): string[] {
  const topics = new Set(
    prefs.followAlerts ? followedOrgIds.map(orgTopic) : [],
  );

  if (prefs.alertScope !== 'follows' && prefs.enabled && point) {
    const { cells } = subscriptionCells(point.lat, point.lng, prefs.radiusKm);
    for (const cell of cells) topics.add(cellTopic(cell));
  }

  return [...topics].sort();
}

/** The difference to send, so moving a few kilometres is not a full re-subscribe. */
export function topicDelta(current: string[], desired: string[]): {
  subscribe: string[];
  unsubscribe: string[];
} {
  const have = new Set(current);
  const want = new Set(desired);
  return {
    subscribe: desired.filter((topic) => !have.has(topic)),
    unsubscribe: current.filter((topic) => !want.has(topic)),
  };
}
