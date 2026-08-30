# Ta'ziyah Mobile: architecture and plan

Analysis only. Nothing in the existing web application has been changed, and
no mobile code has been written yet. This document is the decision record that
should be agreed before either happens.

Written against commit `536ec00` on `claude/taziyah-android-mobile-bq2e51`.

---

## 0. What was inspected, and the state of the tests

`docs/HANDOFF.md`, the whole repository tree, `git status` (clean),
the last 30 commits, `firestore.rules` (all 490 lines), `storage.rules`,
`firestore.indexes.json`, `firebase.json`, `vercel.json`, every Cloud
Function and its libraries, and the client modules that carry the behaviour
this project cares about: `store.js`, `model.js`, `geo.js`, `location.js`,
`push.js`, `follows.js`, `prefs.js`, `verification.js`, `firebase.js`,
`config.js`, `firebase-messaging-sw.js`, the router in `feed.js`, and the
home, nearby, following, account and guide views.

Test results on this machine, after `npm install` at the root and in
`functions/`:

| Suite | Result |
| --- | --- |
| `npm run test:unit` | 393 tests, 90 suites, all pass |
| `npm run test:rules` | 112 tests, 17 suites, all pass |
| `npm run test:e2e` | ran, one assertion failed for an environmental reason (below) |

The end-to-end failure is not a defect in the app. This container ships
Chromium build 1194 while the pinned Playwright 1.62 expects 1234, so the
browser had to be substituted. In that older headless shell
`Notification.permission` resolves to `denied`, so the alerts panel correctly
renders its "blocked in your browser settings" branch, and the assertion at
`tests/e2e.smoke.mjs:811` is looking for the other branch, the one that says
page alerts "only works while a tab is open". Everything before it passed,
including the check that a visitor's position never reaches any Firestore
collection. On a machine with the matching browser this suite should be green,
and that should be confirmed before Phase 1 code lands.

---

## 1. Understanding of the current architecture

Ta'ziyah is a zero-build web application. Plain HTML, one stylesheet, and ES
modules loaded directly by the browser, with the Firebase SDK pinned in a
single import map per page. There is no framework, no bundler in the
production path, and no runtime dependency beyond Firebase. `esbuild` appears
only in the demo and test builds. That is a deliberate maintainability
decision recorded in the handoff, and it is the single most important fact for
this project, because it means **there is no component code to share with a
mobile app**. What can be shared is logic, and a surprising amount of the
logic is already pure.

Two entry points sit on one Firebase project (`janaza-app-5baf2`,
authDomain `taziyah.com`): `index.html`/`feed.js` for the community site, and
`console.html`/`app.js` for coordinators and administrators. Routing is
path-based and handled in the browser, with host rewrites sending everything
to `index.html`.

The backend is Firestore plus a small set of Cloud Functions in
`northamerica-northeast1`. `firestore.rules` is the enforcement layer, not a
convenience: for phases 1 to 3 there was no server code at all, so anything
the rules do not forbid is permitted to any client holding the public config.
The functions add three things the rules cannot do: FCM fan-out, an
append-only audit trail written by triggers rather than by clients, and a
nightly retention pass.

Three privacy properties are load-bearing and shape everything below.

**No user positions exist anywhere on the server.** Nearby matching runs in
the browser (`location.js`) against the public notice list the feed already
downloaded. The last position is kept in `localStorage`, overwritten in place
so no history accumulates, and erased when the feature is switched off. The
end-to-end test greps every Firestore collection for a distinctive test
position, so a regression that started sending positions fails the build.

**Push routing is by coarse area, not by device.** A device computes which
geohash cells cover its radius (`geo.js: subscriptionCells`) and asks
`subscribeDevice` to subscribe it to `cell_*` topics, plus an `org_*` topic
per followed masjid. The request is acted on and discarded, never stored or
logged. A notice publishes to the topics covering its own public location. The
backend therefore has no way to ask which devices are in an area.

**A notice is two documents.** The public one has an explicit key allowlist in
the rules, so a family phone number is rejected at write time rather than
hidden at read time. Anything private lives in `notices/{id}/private/details`,
staff-only.

The authorization model: platform administrators are rows in `/admins`, which
no client can write; organization staff are UIDs in `organizations/{id}.staffUids`;
publishing requires being staff of an organization whose `verificationStatus`
is `verified`, and only a platform administrator can set that field. An
organization cannot verify itself. None of this depends on which client is
talking.

There is, today, **no per-user server-side record of any kind**. Followed
masjids (`follows.js`), appearance (`prefs.js`), location settings and the
push token (`push.js`) all live in `localStorage`. The rules deny every
collection not explicitly matched, so a user collection cannot appear by
accident. This is the one place the mobile requirements and the current design
genuinely collide, and section 5 deals with it.

---

## 2. Recommended mobile framework

**React Native with Expo, using the prebuild workflow and a custom dev client,
with React Native Firebase for the native SDKs.** This matches the stated
preference and I found no technical reason to depart from it.

The specifics that matter, because "Expo" alone leaves the important question
open:

- **Expo with continuous native generation (`expo prebuild`) and a custom
  development client, not Expo Go.** Expo Go cannot load native Firebase
  modules. A dev client is a one-time build and then behaves like Expo Go for
  daily work.
- **`@react-native-firebase/app`, `/auth`, `/firestore`, `/messaging`, using
  the modular API.** The Firebase JS SDK also runs in React Native, but it has
  no FCM and no background message handling on Android, so it cannot deliver a
  notification to a locked phone. That is the whole reason this app exists as
  a native app, so the native SDKs are not optional. React Native Firebase
  ships Expo config plugins, so `google-services.json` is wired up by
  configuration rather than by editing Gradle files.
- **`@react-native-google-signin/google-signin`** for native Google
  authentication, which hands a credential to Firebase Auth rather than
  running an OAuth redirect in a browser. This sidesteps the redirect-URI
  problem that currently has Google sign-in flagged off on the web
  (`config.js: googleSignIn: false`); Android uses its own OAuth client keyed
  to the signing certificate.
- **`expo-router`** for navigation. File-based routing gives typed deep links
  and Android App Link handling with far less wiring than hand-rolled linking
  configuration, which matters because tapping a notification must land on the
  right notice.
- **`expo-location`** for permissions and position, foreground only.
- **`react-native-maps`** (Google Maps provider) for the optional map view.
- **`expo-notifications`** for locally scheduled reminders and channel setup,
  with React Native Firebase handling remote messages. These two must not both
  claim the same message; validating that on a real device is a Phase 5 task.
- **TanStack Query** over thin repository functions, rather than a global
  store. Pagination, caching, retry and stale state are most of the offline
  requirement, and this gets them honestly instead of by hand.
- **TypeScript**, and **EAS Build** for the signed `.aab`.

The one real cost is that the web app has no build step and the mobile app has
a large one. That asymmetry is unavoidable for a Play Store binary and does
not touch the web app.

---

## 3. Proposed repository structure

**Recommendation: do not restructure. Add `mobile/` alongside what exists.**

```
janazah-app/
  public/          web app, untouched
  functions/       Cloud Functions, one additive change (section 5)
  firestore.rules  one additive block (section 5)
  tests/           unchanged, still `npm test`
  docs/            this file
  mobile/          new: the Expo app, its own package.json and lockfile
    app/           expo-router routes
    src/
      shared/      thin re-exports of the pure modules in public/js
      ...
```

Moving `public/` to `web/` would touch `firebase.json` (`hosting.public`),
`vercel.json`, every script in `scripts/`, the test app builder, the demo
build, the screenshot tooling and most of `docs/`. It would buy nothing except
symmetry, on an application that is live and that must keep running. The risk
is entirely on the side of moving.

**Sharing the pure logic.** These modules have no imports at all and run
unchanged under Metro: `geo.js` (geohash, `distanceKm`, `formatDistance`,
`cellsCovering`, `subscriptionCells`, `directionsOptions`), `verification.js`,
`janazah-guide-content.js`, `regions.js`, `retention-policy.js`,
`takedown-policy.js`. `model.js` imports only `geo.js` and `config.js`, both
of which are plain data and arithmetic, so it comes along with a small config
shim.

They should stay where they are, in `public/js/`, and be reached from
`mobile/` through Metro `watchFolders` and a re-export layer under
`mobile/src/shared/`. Copying them would guarantee drift, and drift in
`geo.js` means the app's idea of "near me" quietly stops matching the
backend's idea of which topic a notice went to. Keeping one copy also keeps
`tests/geo.test.js` and `tests/public-surface.test.js` as the authority for
both clients.

---

## 4. Backend that is reused unchanged

Everything, with one exception in section 5.

- **Firebase Authentication.** Same project, same users, same UIDs. Adding an
  Android app in the Firebase console is a console action, not a code change,
  and does not affect the web app.
- **Firestore data model.** `organizations`, `notices`, `notices/*/private`,
  `admins`, `auditLog`, `reports`, `platformSettings`. The mobile app reads
  the same documents through the same queries. A notice published from the web
  console is a document; the mobile app reads that document. There is no
  synchronization mechanism to build, because there is only one database.
- **`firestore.rules`, unweakened.** Every query the mobile app issues has to
  satisfy the same clauses the web queries do, including the requirement that
  a public notice list carry `where('isPublic','==',true)`, because rules match
  a list request against its query rather than its results.
- **Organization verification.** Unchanged end to end. Mobile reads
  `verificationStatus === 'verified'` and shows the badge. An approval in the
  Admin Portal is a single field write that both clients read.
- **`subscribeDevice`.** Works as-is with an Android FCM token; the callable
  neither knows nor cares which platform issued it. Topic naming and
  validation in `functions/lib/topics.js` need no change.
- **`onNoticeWritten` fan-out topology.** Which topics a notice goes to, the
  at-most-once run marker, and the per-organization rate limit are all
  platform-independent.
- **Audit triggers and the retention pass.** Unchanged.
- **Storage rules.** Mobile touches nothing in Cloud Storage in version 1.

---

## 5. Backend changes that are genuinely required

Three, all additive. None weakens a rule, removes a field, or changes web
behaviour.

### 5a. A per-user document, for follows and synchronized preferences

This is the only one that is a design decision rather than plumbing, and it
should be your call, not mine, because it reverses something the handoff
records as deliberate: "Community members need no account... Follows live in
`localStorage`... The cost is no cross-device sync, which is the right trade
for a first release."

Requirement 5 in your brief ("User follows a Masjid on mobile → following
state appears on web when signed into same account") cannot be met without a
server-side record. There is no way to synchronize `localStorage` between a
phone and a browser.

Proposed shape, deliberately minimal:

```
/users/{uid}                       owner-only read and write, nobody else
    followedOrgIds: string[]       capped in the rules (200)
    prefs: {
      alertScope, followAlerts, radiusKm, theme, textSize
    }
    updatedAt
```

with a strict key allowlist in the rules exactly like the notice allowlist, so
a position or a name cannot physically be written here. No location field, no
attendance, no history, no read access for anyone but the account itself, and
it is deleted along with the account.

Anonymous browsing is unaffected. A signed-out reader on either client keeps
using local storage and never causes this document to exist. On sign-in, the
local list is merged into the account document once, and from then on the
account is the source of truth. This is what keeps the web app's anonymous
path working unchanged.

Two things follow from adding it: `public/js/views/privacy.js` has to say that
a signed-in account stores which masjids you follow, and the account deletion
path has to delete this document. Both are small, both are required, and
neither is optional if the claim on the privacy page is to stay true.

**If you would rather not create a user record at all, say so and I will build
mobile follows as device-local, matching the web exactly.** Requirement 5 then
does not hold, and everything else in the brief still does.

### 5b. Android notification payloads in `functions/lib/notify.js`

`buildMessage` currently returns a `webpush` block and a `data` block, and
nothing else. An Android device subscribed to the same topic receives that as
a data-only message: no notification is displayed unless the app happens to be
running. The fix is to add an `android` block (channel id, `tag` set to
`janazah-{noticeId}` so a follower who is also nearby sees one notification
rather than two, `collapseKey`, priority) and a top-level `notification` block
so the system tray can render it while the app is killed. The `webpush` block
stays exactly as it is, so web delivery is untouched, and
`functions/test/notify.test.js` gains cases for the new shape.

This is the change that makes cancellations reach a phone, which is the part
of the product that matters most.

### 5c. Android App Links, and one composite index

For a notification tap to open the app on the right notice, `taziyah.com` must
serve `/.well-known/assetlinks.json` carrying the app's package name and
signing-certificate fingerprint. Two obstacles were found in the current
hosting configuration and both need checking before this works:

- `firebase.json` has `"ignore": ["**/.*"]`, which excludes dot-directories,
  so a file under `public/.well-known/` would not be deployed.
- Both `firebase.json` and `vercel.json` rewrite everything to `index.html`.
  Static files are normally matched first, but this needs to be verified
  against whichever host is actually serving `taziyah.com`. The presence of
  both configurations means I cannot tell from the repository which one is
  live, and that is a question for you.

Separately, the Following feed wants `orgId in [...] and isPublic == true
ordered by janazahAt`, which needs a composite index that
`firestore.indexes.json` does not yet carry. Adding an index changes nothing
for existing queries.

---

## 6. Mobile screen and navigation architecture

Five bottom tabs, each with its own stack, and one detail screen reachable
from all of them.

**Home.** A one-line greeting, small. A search field that opens a full-screen
search. Then Upcoming, as compact rows rather than large cards: masjid name
with the verified mark, deceased name where the family made it public, time,
place, and distance when it is known. Near You below it, or a single
unobtrusive row offering to turn location on. Then recent notices from masjids
you follow. Someone who has just been told about a funeral should find the
time and the address without scrolling.

**Nearby.** Permission explanation and request, a radius control, a
List/Map segmented toggle, results ordered by distance. Map pins are the
public prayer locations, never the user. If permission is denied, plain
instructions for Android's app settings.

**Following.** Masjids you follow, and their upcoming notices. Follow and
unfollow from here, from an organization page, and from a notice.

**Alerts.** What arrived, and the controls for what should arrive: scope,
radius, followed-masjid alerts, and the Android notification permission state
with an honest explanation of what is device-specific.

**Profile.** Profile, notification preferences, nearby radius, followed
masjids, appearance, account settings including deletion, the Janazah Guide,
About, Privacy, Terms, sign out. A list, not a settings centre.

**Notice detail**, pushed from anywhere. Cancellation or correction status
first when there is one, then time, then prayer location with directions, then
burial location with directions, then parking and notes, then the masjid with
its verified badge, then share and reminder. Nothing decorative above the
time and the address.

Bottom sheets carry the choice of maps app (`geo.js: directionsOptions`
already returns Google Maps, Apple Maps and Waze), filters, radius and share.
A coordinator who signs in is recognised and pointed at the web console;
publishing is not duplicated into version 1.

---

## 7. Authentication strategy

Same Firebase project, same accounts, same UIDs, same roles. Nothing about
authorization moves to the client: the mobile app reads `/admins/{uid}` (its
own row only, which is all the rules permit) and `organizations` where
`staffUids` contains the UID, and every write it attempts is checked by the
same rules the web writes go through. A reverse-engineered build gains
nothing, because there is nothing on the client to defeat.

Providers for version 1: **email and password**, and **Google**. Phone
authentication is not implemented on the web today, so shipping it on mobile
would mean standing up a new production sign-in surface for a user base that
has never used it. It is out of scope for version 1.

Anonymous sign-in happens on first launch, exactly as on the web, so reading
needs no account while reports and `subscribeDevice` still have something to
attribute and rate-limit against. When someone signs in, the anonymous session
is linked where possible so a follow list built before signing in is not lost;
where linking fails because the account already exists, the app signs in
normally and merges the local list into the account document.

**One item needs verifying before Phase 1 is called done:** the web account
page enrols TOTP two-factor authentication through `multiFactor()`
(`public/js/views/account.js`). Any user who has enrolled must be able to
complete that challenge on Android. React Native Firebase's support for TOTP
multi-factor needs to be confirmed against the installed version on a real
device, not assumed. If it is missing, those accounts cannot sign in on mobile
and that is a release blocker rather than a rough edge.

---

## 8. Push notification strategy

Keep the existing topic architecture exactly. It is the reason the backend
cannot learn where anyone is, and it works identically for a native client.

The device computes its cells with the same `subscriptionCells` the web uses,
adds an `org_*` topic per followed masjid, and calls the same `subscribeDevice`
function, sending only the difference. The token and the topic list stay on the
device. The server change in 5b is what makes the resulting message display on
a locked Android phone.

Duplicates are prevented the way they already are, by the notification tag
being the notice id, so a follower who is also within range sees one
notification and a correction replaces the original rather than stacking on it.
The known gap that two notices for one funeral produce two notifications
(handoff, product gap 6) is inherited and not made worse.

The Android 13 and later `POST_NOTIFICATIONS` runtime permission is requested
after the person has done something that implies they want alerts, following a
masjid or turning on nearby alerts, with a screen explaining what will be sent.
Not on first launch.

Tapping a notification opens `/n/{noticeId}` in the app through App Links, or
through the notification's data payload when the app is already running.

Reminders are local notifications scheduled on the device, never server-side,
because a server-side reminder list would be a record of which funerals a
person intends to attend.

---

## 9. Location strategy

Unchanged in substance, which is the point.

Foreground location only, through `expo-location`. Background location is not
requested, because nearby matching does not need it and requesting it triggers
additional Play review and a much stronger disclosure obligation for no
benefit.

The position is read on demand, kept on the device, overwritten in place so no
history accumulates, and deleted when the feature is switched off. It is never
written to Firestore, never sent to a masjid, and never included in any
analytics or log. Matching happens in-process against the notices already
fetched, using the same `geo.js` the web uses.

The only thing that leaves the device is the set of coarse area topics the
device asks to be subscribed to, and those name areas several kilometres
across, not points, and are not stored anywhere after the subscription is made.

The end-to-end guard that greps Firestore for a test position should be
mirrored for mobile, so a regression that started sending positions fails a
build rather than being noticed later.

---

## 10. Web and mobile synchronization

There is one database and one set of users, so most of the test scenarios need
no mechanism at all.

| Scenario | How it works |
| --- | --- |
| 1. Publish on web, appears on mobile | Same `notices` collection, same query. Nothing to build. |
| 2. Edit on web, mobile reflects it | Same document; `version` advances. Mobile refetches or listens. |
| 3. Cancellation and its notification | Same document, plus the FCM payload change in 5b. |
| 4. Admin verifies a masjid | One field on `organizations`. Both clients read it. |
| 5. Follow on mobile, appears on web | **Needs 5a.** Not possible without a user document. |
| 6. Preferences | Needs 5a, and only the ones listed below. |
| 7. Same account and roles on both | Already true. Firebase Auth and the rules do it. |

**Synchronized through Firestore, for signed-in users only:** followed
masjids, alert scope, whether followed masjids may alert you, nearby radius,
and appearance if you want it. These are choices about the service.

**Device-specific, never synchronized, and the app should say so where a
person might expect otherwise:** the Android notification permission, the
location permission, the stored position, the FCM token and its topic
subscriptions, the map or list preference, recently-viewed notices held for
offline reading, and reduced-motion. These are properties of a phone, not of a
person. Turning notifications on for your phone must not turn them on for a
browser you have never used.

For a signed-out reader, nothing synchronizes and nothing is stored on the
server, exactly as today.

---

## 11. Google Play readiness

Nothing is published automatically. This prepares a build you can upload.

- **Package name** fixed before the first build, since it can never change
  afterwards. `com.taziyah.app` unless you prefer otherwise. It must match the
  Android app registered in the existing Firebase project.
- **Target API level 36 (Android 16)**, which is what Google Play requires for
  new apps and updates submitted from 31 August 2026 onward, the day after this
  was written.
- **Adaptive icon, monochrome icon and splash** generated from the existing
  `public/logo.svg`. `scripts/build-logo-icons.mjs` already exists and can be
  extended rather than replaced.
- **Signing and release**: EAS Build producing an `.aab`, with an explicit
  decision about who holds the upload keystore. Losing it is unrecoverable.
- **Versioning**: `versionCode` auto-incremented by EAS, `version` set by hand
  and kept in step with releases.
- **Privacy policy URL**: `https://taziyah.com/privacy`, which already exists
  and will need the sentence about follows from 5a.
- **Account deletion**: in the app, mirroring `deleteUser` on the web account
  page, and also reachable from a public web URL, which Play requires
  separately from the in-app path.
- **Data Safety**: location is accessed but neither transmitted nor shared, and
  the form has to say that precisely. This is a place where an inaccurate
  answer is worse than a conservative one, so it should be drafted against the
  code and reviewed rather than filled in from memory.
- **Permissions**: `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION`
  (foreground only), `POST_NOTIFICATIONS`, `INTERNET`. No background location.
- **App Links** for `/n/{id}` and `/o/{id}`, per 5c.
- **Sample data off.** `APP.sampleData` is currently `true` and there is a
  `platformSettings/sampleData` switch. A reviewer must never see fictional
  funeral notices, and the mobile app must honour the same switch.

---

## 12. Risks and conflicts

**Firebase Cloud Messaging has never been exercised in production.**
`config.js` still carries `vapidKey: 'REPLACE_ME_...'`, so web push has never
been switched on, and the handoff records that push delivery has never been
tested against real FCM. Android will be the first real test of the whole
pipeline, including `SITE_ORIGIN`, the Blaze plan requirement, and the rate
limiter. Budget real time for Phase 5 and expect to find things.

**TOTP two-factor on mobile.** As in section 7, this could block sign-in for
enrolled accounts. Verify early.

**Google sign-in is unproven on both platforms.** It is flag-disabled on the
web over an unregistered redirect URI for `taziyah.com`. Android needs its own
OAuth client with SHA-1 and SHA-256 fingerprints from both the EAS debug and
release keystores. Independent problem, same feature, so neither one being
green today should be read as the other being fine.

**The user document reverses a recorded decision.** Section 5a. It is small
and it is guarded, but it is the first per-person server-side record in this
project and it deserves a deliberate yes rather than being slipped in.

**Hosting ambiguity.** `vercel.json` and `firebase.json` both exist and I
cannot tell which serves `taziyah.com`. App Links depend on the answer.

**Following feed query limits.** Firestore's `in` operator caps at 30 values,
so a user following more than 30 masjids needs the query chunked. Worth
handling in Phase 4 rather than discovering in production.

**Node and tooling versions.** The repository pins Node 20, 22 or 24 because
Firebase tooling does not support newer. Expo and EAS have their own
expectations. The mobile project should carry its own `package.json` and
lockfile so the two toolchains cannot constrain each other.

**Test suite duration.** `npm test` must stay what it is. Mobile tests should
run under their own script and not be folded into the web run.

**iOS later.** The same codebase reaches iOS, but APNs, Apple's requirement to
offer Sign in with Apple alongside Google, and a separate review are real work.
Nothing in this plan forecloses it; none of it is version 1.

---

## Phased implementation plan

Each phase ends with the same gate: run `npm test` and confirm the web suites
are still green, build and exercise the app on an Android emulator and on a
real device where the phase needs one, verify the web app still behaves
normally, confirm `firestore.rules` has not been weakened, check for console
and runtime errors, and write a short summary of what changed.

**Phase 0, before any of them: your decisions.** Whether `/users/{uid}` may
exist (5a), the package name, which host serves `taziyah.com`, and who holds
the release keystore. Phase 1 can start on everything except 5a without them,
but 5a blocks Phase 4.

**Phase 1. Foundation.** `mobile/` created with Expo, TypeScript, prebuild and
a dev client. React Native Firebase wired to the existing project with a new
Android app and `google-services.json`. Emulator connection matching the web's
`?live=1` behaviour so development never touches production. The design system:
the existing dark green identity translated to native surfaces, type, spacing
and motion, not the website's stylesheet ported. Bottom tabs and empty screens.
Authentication: email and password, Google, anonymous, and the TOTP check from
section 7. The shared-module bridge to `public/js`.

**Phase 2. Reading notices.** The notice repository with pagination and no
unnecessary listeners. Home with greeting, search, upcoming and followed
sections. The notice detail screen, which should be the best screen in the app.
Search across public data only. Offline states and retry, with stale content
always labelled as stale.

**Phase 3. Nearby.** Permission flow with a real explanation, radius, distance,
list and map, directions through the existing `directionsOptions`. The
regression guard that no position reaches the backend.

**Phase 4. Following and account sync.** `/users/{uid}` and its rules, with
rules tests written first. The one-time merge from local storage on sign-in.
Follow and unfollow across both clients. The preference split from section 10.
The privacy page sentence and the deletion path. The composite index.

**Phase 5. Notifications and deep links.** The `notify.js` payload change and
its tests. Token and topic sync from the device. The contextual
`POST_NOTIFICATIONS` request. App Links and `assetlinks.json`. Local reminders.
Then the manual checklist from `docs/phase-4-notes.md` against real FCM,
including a cancellation reaching a locked phone, which is the single most
important thing this app does.

**Phase 6. Profile and guide.** Profile and settings. The Janazah Guide in a
native layout, with the Arabic set in a face that renders it properly and at a
size that can actually be read while standing. The religious content is copied
from `janazah-guide-content.js` and not edited, added to, or paraphrased.

**Phase 7. Release preparation.** Icons, splash, versioning, EAS release
profile, the signed `.aab`, the Data Safety draft, store listing copy,
screenshots, sample data confirmed off, and an internal testing track. Upload
stays yours.
