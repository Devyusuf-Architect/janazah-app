# Ta'ziyah

One trusted place where verified masjids and approved funeral coordinators
publish Janazah notices, so that people close enough to attend hear in time.

**Status: Phase 5 complete. Feature-complete for the MVP scope.** The public
feed, on-device nearby matching, push notifications, the coordinator and
administrator console, and the launch hardening around retention, abuse and
account security are all built and tested.

Before a real launch, `docs/phase-5-notes.md` lists what is still outstanding:
a named privacy contact, delivery tested against real FCM, the retention job
watched on real data, and somebody other than the author trying to break it.

Push requires the Blaze plan, because sending to Firebase Cloud Messaging needs
a service account credential that cannot live in a browser. Usage sits inside
the free allowance; a card still has to be attached. Everything else in the app
runs without it, and with push unconfigured the UI says so plainly rather than
failing oddly. See [`docs/phase-4-notes.md`](docs/phase-4-notes.md).

| Path            | What it is                                     |
| --------------- | ---------------------------------------------- |
| `/`             | Home: what Ta'ziyah is, and where to go        |
| `/janazahs`     | Public feed of current and upcoming Janazahs   |
| `/near-me`      | The feed, opened to the nearby-matching tab    |
| `/masjids`      | Directory of verified masjids, with follow     |
| `/register-masjid` | What registering as a masjid/coordinator involves |
| `/about`        | What Ta'ziyah is, in plain terms               |
| `/n/{id}`       | A single notice, the shareable link            |
| `/signin`       | Community sign-in, for a personal dashboard    |
| `/dashboard`    | A signed-in member's followed masjids, alerts and account |
| `/console`      | Coordinator and platform administrator console |

## Handing this to someone else, or to Claude

[`docs/HANDOFF.md`](docs/HANDOFF.md) is a single brief covering what the app
does, how it is built, which decisions were deliberate and why, and what is
still open. Paste it into a new conversation, or give it to a developer joining
the project.

## Seeing it without installing anything

`npm run preview` builds `build/preview.html`: one self-contained file with the
whole community side of the app in it, no backend and no network. Open it in a
browser, or host it anywhere, to show someone the product without a Firebase
project.

It is the real thing rather than a mockup. Every view, style and piece of
formatting logic is the application's own code; `demo/` swaps out only the data
layer and the three browser capabilities a sandboxed frame cannot provide.
`npm run preview:verify` drives it in a browser and checks that it does.

The coordinator console and the administrator screens are not in it, because
they need sign-in.

## Getting started

**Deploying for the first time: [`docs/deployment.md`](docs/deployment.md)** is
the full sequence from an empty machine to a live site.

To see the whole thing running locally, with no Firebase project and no
credit card:

```bash
npm install
npm run demo
```

That starts the emulators, seeds two verified masjids and a set of notices,
and prints sign-in details. The feed is at `http://127.0.0.1:5000` and the
coordinator console at `/console`. Ctrl+C stops it and wipes the data.

Needs **Node 20, 22 or 24** (the Firebase tooling does not support newer
releases yet) and **Java**, because the Firebase emulators are Java programs
even though nothing else here uses one. `npm run preflight` checks both and
tells you what to do; it runs automatically before `npm run demo` and
`npm test`.

`npm run serve` does the same without the seed data.

## Sample data for testers

**Currently ON.** `APP.sampleData` in `public/js/config.js` is `true`, so the
deployed site shows fictional notices and masjids alongside anything real,
and a banner on every page says they are examples.

**To remove it before going public, set that one flag to `false`.** That is
the entire process: nothing is written to the database, so there is nothing
to clean up. `tests/sample-mode.test.js` pins that turning it off leaves no
path by which a sample record can reach a reader.

The data is `public/js/sample-data.js`, which `tests/sample-data.test.js`
pins as unmistakably fake: every organization is named "Sample ...", every
published name contains "Fulan" (the Arabic equivalent of John Doe), and
every address is an example street. A demo of a funeral app must never look
like a real funeral. It is the same data the local demo and the standalone
preview use, so there is one copy and it is the checked one.

It works with no Firebase credentials and before the security rules are
deployed, which is what makes it useful right now: if the database is
unreachable, the samples still render rather than leaving an empty site.

There is also a seeding script, for writing the same data as real documents
to a real project:

```bash
npm run sample:add      # write them
npm run sample:remove   # take every one of them back out
```

Every document goes in at a `sample-` prefixed id, so removal is exact and
touches nothing else. It needs real credentials
(`gcloud auth application-default login`) and refuses to run against a
`demo-` project id. Prefer the config flag unless you specifically need the
records to exist server-side.

## Tests

```bash
npm run test:unit    # 88 tests of the distance, cell, notification and policy logic
npm run test:rules   # 60 security rule tests
npm run test:e2e     # browser run through the whole product path
npm test             # all three
```

Delivery of an actual push cannot be tested against the emulator, which does
not emulate FCM sending. `docs/phase-4-notes.md` lists what to check by hand on
a real device before launch.

The end-to-end test needs a Chromium binary. If Playwright's own download is
unavailable, point it at an existing one:

```bash
CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

## What is built

### Phase 5, launch hardening

- A retention policy that is enforced, not merely stated: family contacts
  deleted a week after the prayer, the deceased's name removed from the public
  notice after thirty days, with the notice itself left in place so an old link
  explains rather than breaks
- A per-organization notification rate limit that suppresses a burst and raises
  a report, while never blocking a notice, because a false positive that
  silenced a real Janazah would be far worse
- An alert scope so a reader in a busy city can narrow to masjids they follow,
  controlling volume at subscription time rather than by hiding messages
- A duplicate warning before publishing, which warns and never blocks
- Two-step sign-in for coordinators, using time-based codes rather than SMS
- Report triage with recorded outcomes, and rules that stop an administrator
  rewriting what was reported
- A privacy page written from what the code does, and a test that pins the
  exact set of fields the world can read

See [`docs/phase-5-notes.md`](docs/phase-5-notes.md).

### Phase 4, push notifications

- Alerts that arrive when the page is closed, for Janazahs in your area and
  from masjids you follow
- The device subscribes itself to coarse area topics; a notice is published to
  the topics covering its own location, so the backend receives no position and
  has no way to ask which devices are in a given area
- One notification per notice even when both a follow and an area match, and a
  correction replaces the original rather than stacking
- Cancellations reach exactly the people the original reached, without keeping
  any record of who that was
- iPhone install instructions, since Apple allows web push only for pages added
  to the Home Screen

### Phase 3, nearby Janazahs

- Opt-in location, with a consent panel that explains where the position goes
  before the browser prompt appears
- Distance choice of 5, 10, 20, 50 km or any distance, with an approximate
  distance shown on every notice
- Matching done entirely in the browser against notices the feed already has,
  so no position is ever sent to the backend
- Only the most recent position is kept, on the device, overwritten in place;
  turning the feature off erases it
- Optional alerts for newly published nearby notices while the page is open

See [`docs/phase-3-notes.md`](docs/phase-3-notes.md).

### Phase 2, the public feed

- Current and upcoming Janazahs, grouped by date in each notice's own time
  zone, with no account and no location
- Follow specific masjids, stored on the device rather than in an account, so
  the platform never learns which masjid anyone cares about
- Directions to the prayer and burial locations
- Share a notice, through the native share sheet where available and the
  clipboard otherwise
- A shareable per-notice URL that shows a cancellation rather than going dead
- Report an incorrect or fraudulent notice, over an anonymous session

See [`docs/phase-2-notes.md`](docs/phase-2-notes.md), which includes the one
Firebase console step reporting needs.

### Phase 1, the console

- Email/password sign-in for coordinators and platform administrators
- Organization registration, held as `pending` until a platform administrator
  verifies it
- Verification, rejection, suspension and reinstatement, each with a recorded
  reason
- Multiple authorized staff per organization, with a join-request flow the
  owner approves
- Notice composition with a mandatory public preview and explicit confirmation
  before anything is published
- Correction and cancellation of published notices, with an optimistic-lock
  version counter so a concurrent edit fails loudly instead of silently
  overwriting a colleague
- Administrator takedown of a fraudulent or incorrect notice
- An append-only audit trail of every one of the above

## How privacy is enforced

There is no server code in this phase, so `firestore.rules` is the entire
security model, and `tests/rules.test.js` is what proves it holds.

A notice is two documents. The public one has an explicit field allowlist in
the rules, so a family phone number or an internal note is rejected at write
time rather than merely hidden at read time. Everything private lives in
`/notices/{id}/private/`, readable only by staff of the publishing
organization and platform administrators.

Verification status is writable only by a platform administrator, so an
organization cannot verify itself, and only a verified organization can
publish. The audit collection forbids update and delete for every caller
including administrators, forces the actor to the authenticated session, and
forces the timestamp to server time.

No user location is stored anywhere. Nearby matching runs on the device
against the public notice list, so the backend never learns where anyone is.
There is no collection for user positions, and the rules deny any collection
not explicitly matched, so one cannot appear by accident. The end-to-end test
sets a distinctive browser position and then greps every Firestore collection
for it, so a regression that started sending positions would fail the build.

## Architecture notes and deliberate departures from the original spec

The build spec proposed keeping each opted-in user's current geohash on their
user document and querying that collection at publish time. That means
operating a live index of where thousands of people currently are. This
implementation goes the other way: notice locations are public and few, user
locations are private and many, so the match belongs on the device. Notices
carry a coarse `cell` (geohash precision 5, roughly 5 km) which Phase 3 uses
for on-device filtering and Phase 4 for notification routing.

The spec also proposed a `notifiedUids` array on the notice so that
cancellations reach the right people. That is a list of who was physically
near a particular funeral, which the requirements forbid. Cancellation instead
targets the same cells the original publish did, so no recipient list exists.

The spec's `editHistory` array on the notice document was replaced by the
separate append-only `/auditLog` collection, because an audit trail stored on
the record it audits, writable by the party being audited, is not an audit
trail.

`organizations` rather than `masajid`, with a `type` field, because the
requirements ask whether funeral homes should also publish after verification.

## Known limitations of this phase

- **No push notifications.** Sending to FCM needs a service account
  credential, which cannot live in browser JavaScript. This requires Cloud
  Functions (Blaze) or a small external endpoint, decided before Phase 4.
- **No multi-factor authentication.** It needs the Identity Platform upgrade.
- **No scheduled retention purge.** Expired notices are filtered out of
  queries by time; deletion is manual until there is server-side scheduling.
- ~~Client-side audit writes~~ **Resolved.** Every notice, organization, staff
  request and report change is now audited by a Cloud Functions trigger
  (functions/index.js, functions/lib/audit-log.js), through the Admin SDK,
  which bypasses rules entirely. `/auditLog` is closed to every client write,
  of any role, so an entry cannot be skipped by whichever action should have
  produced it.
