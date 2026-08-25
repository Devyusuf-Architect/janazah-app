// Notification topic naming.
//
// Two kinds of audience, and the difference matters for privacy:
//
//   org_{orgId}   Followers of a masjid. Says nothing about where anyone is.
//   cell_{hash}   Devices near an area, where the hash is a geohash prefix.
//
// A cell topic names an area, never a point, and the shortest prefixes cover
// hundreds of kilometres. Nothing anywhere records which device subscribed to
// which cell: the device asks to be subscribed, the subscription is made, and
// the request is not stored or logged.

// Geohash alphabet: base32 without a, i, l or o.
const GEOHASH = /^[0-9bcdefghjkmnpqrstuvwxyz]+$/;
const ORG_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const MIN_CELL_PRECISION = 2;
export const MAX_CELL_PRECISION = 5;

export const cellTopic = (hash) => `cell_${hash}`;
export const orgTopic = (orgId) => `org_${orgId}`;

/**
 * Every cell topic a notice at this location should be sent to: its own
 * geohash truncated to each supported precision.
 *
 * A device subscribes at whichever precision suits its chosen radius, so
 * publishing to all of them is what makes a single subscription match
 * regardless of the radius the reader picked.
 */
export function cellTopicsForHash(hash) {
  if (typeof hash !== 'string' || !GEOHASH.test(hash)) return [];
  const topics = [];
  for (let p = MIN_CELL_PRECISION; p <= MAX_CELL_PRECISION; p++) {
    if (hash.length >= p) topics.push(cellTopic(hash.slice(0, p)));
  }
  return topics;
}

/** Reject anything that is not one of our own topic names. */
export function isValidTopic(topic) {
  if (typeof topic !== 'string' || topic.length > 80) return false;
  if (topic.startsWith('cell_')) {
    const hash = topic.slice(5);
    return hash.length >= MIN_CELL_PRECISION
      && hash.length <= MAX_CELL_PRECISION
      && GEOHASH.test(hash);
  }
  if (topic.startsWith('org_')) return ORG_ID.test(topic.slice(4));
  return false;
}
