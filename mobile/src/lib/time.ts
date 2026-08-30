// Prayer times, as a phone should show them.
//
// The web app renders one long absolute string ("Fri, Oct 3, 2025, 1:30 p.m.")
// and that is right for a page. In a list of rows on a phone it is the widest
// thing on screen and the hardest to scan, so this splits it into a day and a
// time that can be laid out separately, and says "Today" and "Tomorrow" where
// they apply, because that is what somebody is actually asking.
//
// Two rules are inherited from public/js/model.js and must not be relaxed:
//
//   The time is rendered in the NOTICE'S zone, never the reader's. A Janazah
//   at 1:30pm in Toronto must not read as 10:30am to someone in Vancouver
//   looking at the same notice.
//
//   The zone abbreviation is shown only when the notice is outside the
//   default zone. Most masjids here are on Eastern time, so printing it every
//   time is noise; leaving it off when the notice is somewhere else would let
//   somebody arrive hours after the burial. test/time.test.ts checks this
//   agrees with the web module rather than trusting the comment.

import { DEFAULT_TIME_ZONE } from '../shared/config';
import type { Notice } from './notice';

export type FormattedTime = {
  /** "Today", "Tomorrow", or "Fri 3 Oct". */
  day: string;
  /** "1:30 p.m." */
  time: string;
  /** "PDT", or empty when the notice is in the default zone. */
  zone: string;
  /** The masjid's own words, such as "after Dhuhr". */
  label: string;
  /** True once the prayer time has passed. */
  past: boolean;
};

const EMPTY: FormattedTime = {
  day: '', time: '', zone: '', label: '', past: false,
};

/** Calendar days between two instants, as seen in a given zone. */
function daysApart(a: Date, b: Date, timeZone: string): number | null {
  try {
    const key = (date: Date) => new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone,
    }).format(date);
    // Comparing formatted calendar dates rather than subtracting milliseconds,
    // because "tomorrow" is a calendar fact and 25 hours away can still be
    // today when the clocks change.
    const from = Date.parse(`${key(a)}T00:00:00Z`);
    const to = Date.parse(`${key(b)}T00:00:00Z`);
    if (Number.isNaN(from) || Number.isNaN(to)) return null;
    return Math.round((to - from) / 86_400_000);
  } catch {
    return null;
  }
}

export function formatNoticeTime(
  notice: Pick<Notice, 'janazahAt' | 'timeZone' | 'timeLabel'>,
  now: Date = new Date(),
): FormattedTime {
  const at = notice.janazahAt;
  if (!at) return EMPTY;

  const zone = notice.timeZone || DEFAULT_TIME_ZONE;
  const showZone = zone !== DEFAULT_TIME_ZONE;

  let time = '';
  let weekday = '';
  try {
    time = new Intl.DateTimeFormat('en-CA', {
      hour: 'numeric', minute: '2-digit', timeZone: zone,
    }).format(at);
    weekday = new Intl.DateTimeFormat('en-CA', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: zone,
    }).format(at);
  } catch {
    // Hermes without full ICU for this zone. A wrong-looking absolute time is
    // far better than no time at all on a funeral notice.
    time = at.toLocaleTimeString();
    weekday = at.toDateString();
  }

  let zoneName = '';
  if (showZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone, timeZoneName: 'short',
      }).formatToParts(at);
      zoneName = parts.find((p) => p.type === 'timeZoneName')?.value ?? zone;
    } catch {
      zoneName = zone;
    }
  }

  const offset = daysApart(now, at, zone);
  const day = offset === 0 ? 'Today'
    : offset === 1 ? 'Tomorrow'
    : offset === -1 ? 'Yesterday'
    : weekday;

  return {
    day,
    time,
    zone: zoneName,
    label: notice.timeLabel ?? '',
    past: at.getTime() < now.getTime(),
  };
}

/** One line, for a screen reader and for anywhere a single string is wanted. */
export function timeSentence(formatted: FormattedTime): string {
  return [
    formatted.day,
    formatted.time,
    formatted.zone,
    formatted.label ? `(${formatted.label})` : '',
  ].filter(Boolean).join(' ');
}

/**
 * How long until the prayer, in words, or null when it is further off than a
 * day or already past.
 *
 * Deliberately coarse and deliberately absent most of the time. A countdown
 * on a funeral notice would be ghoulish; "in about 2 hours" is only shown
 * when it is the most useful thing on the row.
 */
export function timeUntil(at: Date | null, now: Date = new Date()): string | null {
  if (!at) return null;
  const minutes = Math.round((at.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0 || minutes > 12 * 60) return null;
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `in about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}
