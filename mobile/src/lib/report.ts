// Reporting a notice that looks wrong.
//
// Writes to /reports, which the rules allow any signed-in caller to create
// and only a platform administrator to read. Anonymous counts as signed in,
// which is the whole reason the app signs in anonymously at launch: the rules
// pin reportedBy to the authenticated caller, and that is what makes abuse
// handling and rate limiting possible without collecting anything about
// anyone.
//
// The reasons are the web app's, including family_takedown, which is the
// actual route for a family asking that a notice come down faster than the
// retention policy. It is a real process described on /privacy, not a
// category on a form.

import { addDoc, serverTimestamp } from '@react-native-firebase/firestore';

import { reportsRef } from './collections';
import { auth } from './firebase';
import { signInAnonymously } from '@react-native-firebase/auth';

/**
 * The reasons somebody can give, and they are not this app's to choose.
 *
 * Reports from the app and from the website land in one queue, and
 * public/js/views/admin.js turns the stored value into a label for the
 * administrator reading it. A value that is not in that map arrives as a
 * report nobody can categorise, which is how a fraud report gets triaged as
 * though it were a typo. These are the web's values, in the web's order, with
 * wording short enough for a phone. test/report-reasons.test.ts reads the
 * admin console and fails if the two ever drift apart again.
 *
 * family_takedown is first because it is the most time-sensitive thing on the
 * list and a distressed person should not have to scroll for it.
 */
export const REPORT_REASONS = [
  {
    value: 'family_takedown',
    label: 'I am family and want this taken down',
  },
  {
    value: 'incorrect_details',
    label: 'The time or place is wrong',
  },
  {
    value: 'already_cancelled',
    label: 'This Janazah was cancelled',
  },
  {
    value: 'duplicate',
    label: 'This is already announced elsewhere',
  },
  {
    value: 'privacy',
    label: 'It shares something the family did not approve',
  },
  {
    value: 'fraudulent',
    label: 'I believe this notice is fake',
  },
  {
    value: 'other',
    label: 'Something else',
  },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

/** The rules cap this; truncating here gives a better failure than a denial. */
const MAX_DETAIL = 1000;

export async function submitReport(
  noticeId: string,
  reason: ReportReason,
  detail: string,
): Promise<void> {
  // Reading needs no account, so there may be no session yet at this point.
  const user = auth.currentUser ?? (await signInAnonymously(auth)).user;

  const payload: Record<string, unknown> = {
    noticeId,
    reportedBy: user.uid,
    reason,
    status: 'open',
    createdAt: serverTimestamp(),
  };
  const trimmed = detail.trim();
  if (trimmed) payload.detail = trimmed.slice(0, MAX_DETAIL);

  await addDoc(reportsRef(), payload);
}
