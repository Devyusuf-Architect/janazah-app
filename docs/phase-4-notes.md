# Phase 4: push notifications

Alerts that reach a device when the page is closed. This is the phase that
needs server-side code, because sending to Firebase Cloud Messaging requires a
service account credential and that cannot live in a browser.

## What this costs

Cloud Functions requires the **Blaze** plan. A card must be attached to the
project. The free allowance is two million invocations a month and this app
will use a few dozen a day, so the bill rounds to zero, but the account is
pay-as-you-go from then on. Set a billing alert at a low threshold.

Multi-factor authentication for coordinators also becomes available on Blaze,
through the Identity Platform upgrade. That is worth doing at the same time.

## How it works, and why the backend still cannot locate anyone

The obvious design stores each user's current position and queries it when a
notice is published. That means running a live index of where thousands of
people are. This does the opposite:

1. A device works out which coarse **area cells** cover the radius its owner
   chose, using the same geohash grid as Phase 3.
2. It asks `subscribeDevice` to subscribe its messaging token to those cell
   topics, plus one topic per masjid it follows.
3. The call is acted on and discarded. Nothing is written to Firestore, and
   the topic names are never logged: only counts are.
4. When a notice is published, `onNoticeWritten` sends it to the cell topics
   covering **the notice's own location**, which is public information, plus
   the masjid's topic. FCM decides which devices those reach.

So the backend never receives a user position, and holds no way to ask which
devices are in a given area.

Be precise about the residual exposure rather than overclaiming: during a
subscription call the service transiently sees which cells a device wants. It
does not store or log them, and it cannot enumerate them afterwards. A cell is
an area of several kilometres, never a point. That is a real improvement on a
queryable location index, and it is the honest limit of what a hosted service
can promise.

## Why filtering happens at subscription time

A browser penalises a push that arrives and shows nothing: Chrome will display
its own "site updated in the background" message. So a device must only be
subscribed to areas it actually wants, rather than receiving everything and
discarding what is out of range.

That is why `subscriptionCells()` drops to a coarser precision as the radius
widens, keeping the topic count under forty:

| Radius  | Precision | Cells |
| ------- | --------- | ----- |
| 5 km    | 5         | ~12   |
| 10 km   | 5         | ~35   |
| 20 km   | 4         | ~6    |
| 50 km   | 4         | ~24   |
| Any     | 2         | ~4    |

The consequence, stated in the UI: at wider radii the area is coarse, so a
notice somewhat beyond the chosen distance can still arrive. For a funeral
notice, hearing about one slightly too far away is a much cheaper error than
not hearing at all.

A notice is published to **every** precision of its own cell, so a device
subscribed at any precision matches.

## Duplicates

Someone who both follows a masjid and is within its area is subscribed to two
matching topics and receives two messages. Every message carries
`tag: janazah-{noticeId}`, so the second replaces the first and one
notification is shown. A correction replaces the original for the same reason,
with `renotify` set so it is not silent.

## Cancellations

A cancellation goes to the same topics the original publication did, so it
reaches the same people. This is why no list of who was notified is kept: such
a list would be a record of who was near a particular funeral, which the
requirements forbid.

## Console setup

1. **Upgrade the project to Blaze.** Set a budget alert.
2. **Build > Cloud Messaging > Web configuration > Generate key pair.** Copy
   the key into `APP.vapidKey` in `public/js/config.js`. Like the rest of that
   file it is a public identifier, not a secret. Left unset, push stays off and
   the UI says so instead of failing oddly.
3. Set the site origin, so the link in a notification points at your feed
   rather than the placeholder. Create `functions/.env`:

   ```
   SITE_ORIGIN=https://your-project-id.web.app
   ```

   That file is gitignored. Leaving it out means the first deploy prompts for
   the value instead.

4. Deploy:

   ```bash
   cd functions && npm install && cd ..
   firebase deploy --only functions,hosting,firestore:rules
   ```

## iPhone

Apple allows web push only for pages installed to the Home Screen. The app
detects an uninstalled iPhone and shows the Share, then "Add to Home Screen"
instruction rather than appearing broken. Expect a meaningful share of iPhone
users never to complete it: that is the strongest argument for the native
wrapper, and it is a conversion problem rather than a technical one.

Android Chrome has no such restriction.

## What is tested, and what is not

Tested: which changes notify and which do not, topic derivation and
validation, message contents including that a withheld name never appears and
that a notice carrying a private-looking field is refused outright, cell
coverage and the precision fallback, and that the bookkeeping collection is
closed to every client.

Not tested end to end: actual delivery. The Firebase emulator does not
emulate FCM sending, so the last hop needs a real project and a real device.
Do that before any launch:

- publish a notice and confirm it arrives on a locked Android phone
- correct it and confirm the notification replaces rather than stacks
- cancel it and confirm the cancellation arrives
- confirm a follower who is also nearby sees one notification, not two
- confirm an iPhone installed to the Home Screen receives one

## Still open

- **Notification volume.** In a dense city, "any Janazah nearby" could be
  several alerts a day, which is the fastest route to someone switching them
  off entirely. A per-day cap or a digest is not built.
- **Duplicate notices** from two coordinators posting the same funeral still
  produce two notifications, because the tag is per notice, not per funeral.
- **Retention.** Nothing purges a deceased person's name after the prayer.
