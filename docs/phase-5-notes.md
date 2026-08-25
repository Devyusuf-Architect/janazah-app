# Phase 5: launch hardening

The phase that makes the difference between something that demonstrates well
and something that can be put in front of grieving families.

## Retention

The policy lives in `functions/lib/retention.js` and is enforced by a daily
scheduled function. `public/js/retention-policy.js` mirrors the numbers so the
privacy page states the same periods rather than a hand-written guess. **Change
both together**, and the privacy page with them.

| What | Kept for | Why |
| --- | --- | --- |
| Family contacts, internal notes | 7 days after the prayer | Useless once the Janazah is over, and the most sensitive thing in the system |
| The deceased's name, instructions | 30 days after the prayer | Then removed from the public notice, which itself stays so an old link explains rather than breaks |
| Notification delivery records | 30 days | Counts and notice ids only |
| Resolved reports | 90 days | Long enough to see a pattern of abuse |
| Audit trail | Indefinitely | It is what makes a fraudulent notice traceable. It refers to notices by id and never holds a name |

Redaction leaves the notice in place and marks it with `redactedAt`. That field
is on the rules allowlist, which matters: a field the retention job writes
through the Admin SDK but that the rules do not permit would silently break
every later client write. There is a test for exactly that.

## Notification rate limiting

The risk is not load. It is a compromised coordinator account sending a burst
of push notifications to a whole community.

`functions/lib/limits.js` allows eight notifications per organization per hour.
Past that, **notifications** are suppressed and a report is raised for a
platform administrator. **Notices are never blocked**: a genuine Janazah must
always be publishable, and a false positive that silenced a real one would be
far worse than a burst of notifications. The counter keeps climbing past the
limit so an administrator can see how large a burst was, and only the message
that crosses the line raises a report, so the queue is not flooded too.

A corrupt or missing counter always allows the send. That direction of failure
is deliberate.

## Notification volume, from the reader's side

In a dense city, alerts for every Janazah within twenty kilometres could be
several a day, and that is the fastest route to someone switching notifications
off entirely, which ends the app's usefulness.

The alerts panel now offers a scope: everything nearby plus masajid you follow,
or only masajid you follow. Choosing the narrower option unsubscribes the
device from the area topics, so the volume is controlled at the source rather
than by sending messages and hiding them. Hiding them is not an option anyway:
browsers penalise a push that displays nothing.

## Duplicate notices

Two coordinators announcing the same funeral produces two cards and two
notifications for one Janazah.

Before publishing, the console checks published notices within twelve hours of
the new one and warns when it sees a matching name within twenty-five
kilometres, or the same organization posting twice within two hours. The
warning names the existing notice and links to it, and the confirmation
checkbox changes wording to acknowledge it.

It only ever warns. The asymmetry that shapes the thresholds: missing a
duplicate costs a second notification, while a false positive that discouraged
a coordinator could cost someone the chance to attend a funeral. So it errs
towards silence, and there are tests for both directions.

## Two-step sign-in for coordinators

Time-based codes, not SMS: no phone number is collected, and SMS is the weakest
of the common second factors.

Coordinators enrol under **Account**. Sign-in handles the second step. If the
project has not had the Identity Platform upgrade, the screen says so plainly
instead of failing oddly.

**Console step:** upgrade to Identity Platform and enable TOTP under
Authentication > Sign-in method. This is the same Blaze upgrade push already
needs.

The setup key is shown as text for manual entry rather than as a QR code, which
avoids a QR library. Authenticator apps all accept manual entry. A QR would be
better and is worth adding later.

## Report triage

Administrators can now resolve or dismiss a report with a recorded reason,
rather than only reading the queue. The rules let an administrator set the
outcome but not rewrite what was reported, who reported it, or when, and force
the outcome to be attributed to whoever actually decided it.

System-raised reports (currently only the rate limit) appear in the same queue.

## The public surface

`tests/public-surface.test.js` pins the exact set of fields readable by anyone
on the internet, and cross-checks it against `firestore.rules` in both
directions: nothing the rules allow may be absent from the client's list, and
nothing on the client's list may be missing from the rules. Adding a field is
therefore a deliberate act that fails the build until someone updates the test.

It also asserts that the rules mention no stored user position anywhere, so a
future change that adds one has to be argued for rather than slipped in.

## Console steps for this phase

1. **Upgrade to Identity Platform** and enable TOTP, under Authentication >
   Sign-in method. (Blaze, same as push.)
2. Deploy the scheduled retention job, which needs Cloud Scheduler:

   ```bash
   firebase deploy --only functions,firestore:rules,firestore:indexes,hosting
   ```

   The first deploy of `enforceRetention` may prompt to enable the Cloud
   Scheduler API. It runs daily at 04:17 America/Toronto.
3. Confirm the retention job ran: check the Cloud Scheduler history the day
   after deploying, and look for `notice.redacted` entries in the audit log
   once notices are old enough.

## Before launch, still outstanding

These are decisions and work, not oversights:

- **The privacy page needs a named accountable person and a real contact
  address.** PIPEDA requires an accountable individual. The page says so in
  place of inventing one.
- **Delivery has never been tested against real FCM.** The emulator does not
  emulate sending. The manual checklist is in `docs/phase-4-notes.md`.
- **The retention job has never run against real data.** Watch the first few
  runs rather than assuming.
- **Nobody has tried to break it.** A pen test, or at minimum someone other
  than the author trying to publish as an unverified masjid, read another
  organization's private notes, or forge an audit entry.
- **No terms of service**, and no stated process for a family asking that a
  notice be removed faster than the retention policy would.
