# Phase 3: nearby Janazahs, matched on the device

The core feature from the requirements, delivered in the form a web app can
honestly deliver it.

## The architecture, and why it differs from the build spec

The build spec proposed storing each opted-in user's current geohash on their
user document and running a geohash-range query over that collection whenever
a notice is published. That works, and it is the obvious Firebase pattern. It
also means operating a continuously refreshed index of where thousands of
Canadian Muslims currently are: a subpoena target, a breach target, and an
insider-access target, sitting badly against the requirement that the app use
only the location needed to decide whether to alert.

The asymmetry worth exploiting is that **notice locations are public and few,
while user locations are private and many**. So the match runs on the device,
against the notice list the feed has already downloaded. Concretely:

- `public/js/location.js` holds the position, the radius, and the matching.
- Nothing in it writes to Firestore. There is no collection for user
  locations, and `firestore.rules` denies any collection not explicitly
  matched, so one cannot be created by accident.
- The end-to-end test sets a distinctive browser position and then greps every
  Firestore collection for those digits. If a position ever reaches the
  backend, that test fails.

The backend therefore cannot learn where anyone is, even in principle. That is
a property of the architecture rather than a promise in a privacy policy.

## What is stored, and where

Only in `localStorage`, on the user's own device:

```
janazah.location = { enabled, radiusKm, alertsEnabled, last: { lat, lng, at } }
```

`last` is overwritten in place on every refresh. Nothing is appended, so no
travel history can accumulate. Turning the feature off calls `disable()`,
which sets `last` to null and writes that immediately: opting out erases
rather than merely stopping reading. Both behaviours are covered by tests.

`janazah.alertedNoticeIds` holds a bounded list of notice IDs already alerted
on, so the same notice does not alert twice. A notice ID says nothing about
where its reader was.

## Distance options

5, 10, 20, 50 km, and "Any distance". Default 10 km. A notice exactly at the
radius is included. Notices with no coordinates are skipped rather than
guessed at.

## "Current location" means what it says

Position is read only when the user asks for it: when they first opt in, and
when they press "Update my location". There is no background tracking, because
a web page cannot do it and pretending otherwise would be dishonest.

A position older than six hours is shown as stale, with a prompt to refresh,
rather than quietly presented as current.

## Alerts, stated precisely

The "Alert me when a new Janazah is published near me" toggle raises a browser
notification **while the page is open**. It is not a push notification and it
will not reach a locked phone. The UI says exactly that rather than implying
more.

Reaching a locked phone needs a server credential to send to FCM, which is
Phase 4 and still gated on the compute decision (Blaze, or a small external
endpoint).

## Consent

The permission prompt is never the first thing a user sees. A panel explains,
before the browser prompt, what the location is used for, that it is never
sent anywhere, that only the latest point is kept and is overwritten, that
opting out erases it, and that nobody can see which Janazahs they viewed or
attended. The end-to-end test asserts that this copy is present, so it cannot
be quietly dropped in a redesign.

Location requires a secure context. Over plain HTTP the panel says so instead
of failing silently.

## Known limits

- **Accuracy depends on the browser.** Coarse positioning is requested
  deliberately, since street-level precision is not needed to decide whether a
  Janazah 8 km away is worth mentioning.
- **The feed is still nationwide on the "All notices" tab.** Only the "Near
  me" tab filters by distance.
- **Duplicate notices still show twice.** Two coordinators posting the same
  funeral produce two nearby cards.
