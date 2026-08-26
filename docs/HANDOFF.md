# Ta'ziyah — project brief

Paste this whole file into a new Claude conversation to bring it up to speed on
the project. It covers what the app does, how it is built, which decisions were
deliberate and why, what is finished, and what is still open.

Repository: `https://github.com/Devyusuf-Architect/janazah-app`

---

## 1. What the app is for

Janazah (Islamic funeral) information is scattered across WhatsApp groups,
masjid announcements and word of mouth. People miss funerals they would have
attended, sometimes while standing a few streets away, because they never heard
in time.

This is one trusted place where **verified** masjids and funeral coordinators
publish Janazah notices, and community members find out in time to attend.

Three kinds of user:

- **Masjid staff and funeral coordinators** publish, correct and cancel
  notices. Several staff can be authorised per masjid. A masjid must be
  verified by a platform administrator before it can publish anything.
- **Community members** see current and upcoming Janazahs, follow specific
  masjids, and can opt in to alerts for any Janazah near where they currently
  are, including from masjids they do not follow.
- **A platform administrator** verifies organisations and handles reports of
  incorrect or fraudulent notices.

The feature that matters most is the **nearby alert**: opt in, pick a distance,
and hear about a Janazah close to where you actually are right now, not your
home address.

## 2. Constraints that are not negotiable

These come from the requirements and shaped most of the architecture:

- Only verified masjids and approved coordinators can publish.
- A user's location must never be visible to masjids, to other users, or to
  anyone but that user and whatever logic decides to send an alert. No travel
  history may be stored or exposed.
- Private family information, internal notes and phone numbers must never
  appear in a public notice.
- Every create, edit and cancellation needs an audit trail of who and when.
- Location access and nearby alerts are opt in, clearly explained, and can be
  switched off at any time.
- It must hold up under Canadian privacy expectations (PIPEDA): minimal
  retention, no unnecessary collection.

## 3. Current status

**Feature complete for the MVP scope.** Phases 1 to 5 are built and tested.

| Phase | What | State |
| --- | --- | --- |
| 1 | Coordinator and administrator console | done |
| 2 | Public community feed | done |
| 3 | Nearby matching, on the device | done |
| 4 | Push notifications | done, needs the Blaze plan |
| 5 | Retention, rate limits, MFA, triage, privacy page | done |

Tests: 97 unit, 60 security rule, and one browser run through the whole product
path. All green. `npm test`.

Not yet done: deployed to a real project and used by an actual masjid. See
section 8.

## 4. Stack and layout

Plain HTML, CSS and ES modules with **no build step and no framework**. Firebase
for the backend. The Firebase SDK is loaded from a CDN through an import map in
each HTML page, which is the single place its version is pinned.

```
public/
  index.html          Public site: home, feed, near me, masjids, about,
                      sign-in, dashboard   →  /, /janazahs, /near-me,
                      /masjids, /register-masjid, /about, /n/{id}, /privacy, /terms,
                      /signin, /dashboard
  console.html        Coordinator + admin console    →  /console
  css/styles.css      The whole design system
  firebase-messaging-sw.js   Service worker for push
  js/
    config.js         Firebase config + app constants (committed on purpose)
    firebase.js       SDK init, auto-connects to emulators on localhost
    store.js          Every Firestore read and write
    model.js          Notice shape, validation, the public field allowlist
    notice-view.js    How a notice renders, shared by feed/preview/admin
    geo.js            Geohash, distance, the alert cell grid
    geocode.js        Address search for org registration (never user location)
    location.js       Nearby matching, all of it on the device
    push.js           FCM token and topic subscription
    alerts.js         In-page alerts (the fallback when push is unavailable)
    follows.js        Followed masjids, in localStorage
    audit.js          Audit trail reads (writes are server-side, see below)
    nav.js            The public site's nav bar and mobile menu toggle
    ui.js             DOM helpers, icons, toasts, modals
    feed.js / app.js  Entry points for the two pages
    views/            home, feed, nearby, alerts-panel, masjids, about,
                      privacy, terms, auth, dashboard, register-masjid,
                      notices, org,
                      admin, account
      auth.js         Sign-in/up, shared by the console and the public site's
                      /signin via a `variant` (copy differs; same accounts,
                      same rules-enforced roles)
      dashboard.js    Community dashboard: composes follows.js, location.js,
                      nearby.js's panels and account.js, writes nothing new
functions/            Cloud Functions (the only server code)
  index.js            subscribeDevice, onNoticeWritten, enforceRetention
  lib/notify.js       What to send and to whom
  lib/topics.js       Topic naming and validation
  lib/retention.js    The retention policy
  lib/limits.js       Notification rate limiting
firestore.rules       The security model. Read this first.
demo/                 Self-contained preview build (no backend)
scripts/              setup, preflight, demo seeding, screenshots
tests/                Unit, rules and browser tests
docs/                 Deployment guide and per-phase notes
```

**`firestore.rules` is the most important file in the repository.** In phases
1 to 3 there was no server code at all, so the rules are the entire security
model, and `tests/rules.test.js` is what proves they hold.

## 5. Data model

```
/organizations/{orgId}
    name, type (masjid | funeral_home | other), address, city, province,
    lat, lng, cell, verificationStatus (pending|verified|rejected|suspended),
    verifiedAt, verifiedBy, ownerUid, staffUids[], createdAt, createdBy
  /staffRequests/{uid}          join requests the owner approves

/notices/{noticeId}             PUBLIC. Strict field allowlist in the rules.
    orgId, orgName, status (draft|published|cancelled), isPublic,
    deceasedName, showDeceasedName, janazahAt, timeZone, timeLabel,
    prayerLocation {name,address,lat,lng,cell}, burialLocation, instructions,
    version, createdBy, createdAt, publishedAt, cancelledAt, cancelReason,
    correctionNote, redactedAt
  /private/details              STAFF ONLY. Family contacts, internal notes.

/admins/{uid}                   Platform administrators. No client may write.
/auditLog/{id}                  No client write at all, of any kind, by anyone.
                                 Written only by Cloud Functions triggers.
/reports/{id}                   Community and system reports.
/notificationRuns/{id}          Delivery bookkeeping. Closed to all clients.
/orgNotificationRates/{orgId}   Rate limit counters. Closed to all clients.
```

There is **no collection for user locations**, and the rules deny any
collection not explicitly matched, so one cannot appear by accident.

## 5b. Organization verification

A masjid or funeral coordinator registers through a four-step form
(organization, then the applicant, then evidence, then a review pass), lands
as `pending`, and cannot publish until a platform administrator approves it.
The five states (`pending`, `needs_information`, `verified`, `rejected`,
`suspended`), the private `application` subcollection that holds everything
about the applicant, the read-time verification signals, and the rules
that stop anyone approving themselves are documented in
[`docs/verification-workflow.md`](verification-workflow.md), which is also
the contract the Admin Portal is being built against.

## 6. Decisions that were deliberate

Anyone proposing changes should know why these are the way they are. Several
are departures from the original build spec, made on purpose.

**Nearby matching runs on the device.** The spec wanted each opted-in user's
current geohash stored and queried at publish time. That means operating a live
index of where thousands of Canadian Muslims are: a subpoena target, a breach
target, an insider-access target. Instead, notice locations are public and few
while user locations are private and many, so the match happens in the browser
against notices the feed already downloaded. The end-to-end test sets a
distinctive browser position and greps every Firestore collection for it, so a
regression that started sending positions fails the build.

**Push uses coarse area topics.** A device works out which geohash cells cover
its radius and asks to be subscribed. The request is acted on and discarded,
never stored or logged. A notice is published to the cells covering its own
location. The backend therefore has no way to ask which devices are in an area.
Filtering happens at subscription time, not on arrival, because browsers
penalise a push that displays nothing.

**A notice is two documents.** The public one has an explicit field allowlist in
the rules, so a family phone number is rejected at write time rather than hidden
at read time. `tests/public-surface.test.js` pins the exact public field set and
cross-checks it against the rules in both directions, so adding a public field
fails the build until someone decides to.

**No `notifiedUids`.** The spec wanted a list of who received a notice so
cancellations could reach them. That is a record of who was near a particular
funeral. Cancellations go to the same topics the original did instead.

**The audit log is a separate append-only collection**, not an `editHistory`
array on the notice. A trail stored on the record it audits, writable by the
audited party, is not a trail.

**`organizations`, not `masajid`.** The requirements ask whether funeral homes
should publish after verification. The answer is eventually yes.

**Community members need no account.** Reading the feed and following a masjid
require no sign-in and no user record. Follows live in `localStorage`. Anonymous
auth exists only so a report is attributable enough to rate limit.

**Rate limits gate notifications, never notices.** A genuine Janazah must always
be publishable; a false positive that silenced one would be far worse than a
burst of notifications.

**The duplicate check warns and never blocks**, and errs towards silence, for
the same reason.

## 7. Running it

```bash
npm install
npm run demo        # whole app locally, seeded, no Firebase project needed
npm test            # 97 unit + 60 rules + browser run
npm run preview     # build/preview.html: the community app in one file
npm run setup       # writes public/js/config.js from a pasted Firebase config
npm run deploy      # after firebase use --add
```

Needs Node 20, 22 or 24 (not newer; the Firebase tooling does not support it
yet) and Java for the emulators. `npm run preflight` checks both.

Full deployment walkthrough: `docs/deployment.md`.

All sample data is deliberately fictional: names are "Fulan ibn Fulan", the
Arabic equivalent of John Doe, organisations are named "Sample Masjid", and
addresses are example streets. `tests/sample-data.test.js` enforces this,
because a demo of a funeral app must not look like a real funeral.

## 8. What is still open

Real work, not oversights. Any of these is a reasonable next task.

**Before real families use it**

1. The privacy page needs a named accountable person and a contact address.
   PIPEDA requires one, and `public/js/views/privacy.js` currently says so
   rather than inventing it.
2. Push delivery has never been tested against real FCM; the emulator cannot
   emulate sending. Manual checklist in `docs/phase-4-notes.md`.
3. The retention job has never run against real data.
4. Nobody outside the author has tried to break it.
5. ~~No terms of service, and no stated process for a family asking that a
   notice come down faster than the retention policy.~~ **Resolved.**
   `/terms` covers who may publish and what happens when a notice is wrong;
   the "family_takedown" report reason plus the "Asking for a notice to come
   down" section on `/privacy` is the actual flow, not only a policy
   statement.

**Product gaps**

6. Duplicate notices produce two notifications for one funeral; the tag is per
   notice, not per funeral.
7. Notification volume has a scope control but no per-day cap or digest.
8. The "All notices" feed is nationwide with no distance filter; only "Near me"
   filters.
9. The coordinator composer is one long column. It would be better as steps
   (who and when, then where, then anything private) with a live preview
   alongside on a desktop.
10. Arabic and Urdu names, transliteration and right-to-left support are not
    addressed.

**Known limitations**

11. ~~Audit entries for client actions are written from the browser.~~
    **Resolved.** Every notice, organization, staff request and report change
    is now audited by a Cloud Functions trigger
    (`functions/lib/audit-log.js`, wired up in `functions/index.js`), and
    `firestore.rules` closes `/auditLog` to every client write. An entry can
    no longer be skipped by whichever action should have produced it, because
    the write is no longer the client's job.
12. iPhone push requires the page be added to the Home Screen. The app detects
    and explains this, but expect a meaningful share never to complete it. That
    is the strongest argument for a native wrapper.

## 9. How to work on this

- Read `firestore.rules` before changing anything about data.
- Run `npm test` before and after. If a rules test fails, the rule is the
  authority, not the client code.
- Do not add a field to a public notice without updating
  `tests/public-surface.test.js`, which will fail until you do. That is on
  purpose: it forces the decision to be explicit.
- Do not add a collection for user positions. If a change seems to need one,
  that is a signal the design has drifted.
- Keep sample data fictional.
- No build step, no framework, no runtime dependency beyond the Firebase SDK.
  This is meant to be maintainable by one person some years from now.
