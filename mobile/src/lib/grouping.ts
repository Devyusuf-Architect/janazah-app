// Grouping a feed by the day the prayer is on.
//
// A flat list of notices makes somebody read every row's date to answer the
// only question they came with, which is whether anything is today. Grouping
// answers it with one heading.
//
// The day is the calendar day in the NOTICE'S zone, for the same reason
// src/lib/time.ts formats times that way: a Janazah at 1:30pm in Toronto is on
// Friday for everyone looking at it, including someone in Vancouver for whom
// it is still Thursday morning. Grouping by the reader's local day would put
// it under the wrong heading and, worse, under a heading that says "Today"
// when it is not.
//
// Pure, so test/grouping.test.ts can check it without a device.

import { DEFAULT_TIME_ZONE } from '../shared/config';

export type DayGroup<T> = {
  /** A stable key: the calendar date in the notice's zone, as 2026-09-04. */
  key: string;
  /** "Today", "Tomorrow", or "Friday, September 4". */
  title: string;
  items: T[];
};

type Timed = { janazahAt: Date | null; timeZone?: string | null };

/** The calendar date in a given zone, as an ISO day such as 2026-10-02. */
export function dayKey(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone,
    }).format(at);
  } catch {
    // Hermes without full ICU for this zone. UTC is wrong by at most a day and
    // still groups the feed coherently, which is better than one group per
    // notice.
    return at.toISOString().slice(0, 10);
  }
}

/** How a group is headed. Relative for the two days people actually ask about. */
export function dayTitle(
  key: string, todayKey: string, tomorrowKey: string,
): string {
  if (key === todayKey) return 'Today';
  if (key === tomorrowKey) return 'Tomorrow';
  const at = Date.parse(`${key}T12:00:00Z`);
  if (Number.isNaN(at)) return key;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    }).format(new Date(at));
  } catch {
    return key;
  }
}

const nextDay = (at: Date) => new Date(at.getTime() + 86_400_000);

/**
 * Groups notices into days, keeping the order they arrived in.
 *
 * The feed is already sorted soonest first by the query, so groups come out
 * in time order without sorting again. Notices with no time at all keep their
 * position rather than being dropped: a notice whose time is still being
 * confirmed is exactly the one somebody is waiting for.
 */
export function groupByDay<T extends Timed>(
  items: T[], now: Date = new Date(),
): DayGroup<T>[] {
  const todayKey = dayKey(now, DEFAULT_TIME_ZONE);
  const tomorrowKey = dayKey(nextDay(now), DEFAULT_TIME_ZONE);

  const groups: DayGroup<T>[] = [];
  const byKey = new Map<string, DayGroup<T>>();

  for (const item of items) {
    const key = item.janazahAt
      ? dayKey(item.janazahAt, item.timeZone || DEFAULT_TIME_ZONE)
      : 'unscheduled';
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        title: key === 'unscheduled' ? 'Time to be confirmed' : dayTitle(key, todayKey, tomorrowKey),
        items: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
}
