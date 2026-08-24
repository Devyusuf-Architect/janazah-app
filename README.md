# Janazah Notification App

One trusted place where verified masajid and approved funeral coordinators
publish Janazah notices, so that people close enough to attend hear in time.

**Status: Phase 2 complete.** The public community feed and the coordinator
and administrator console are built and tested. Nearby matching (Phase 3) and
push notifications (Phase 4) are not built yet.

| Path            | What it is                                     |
| --------------- | ---------------------------------------------- |
| `/`             | Public feed of current and upcoming Janazahs   |
| `/n/{id}`       | A single notice, the shareable link            |
| `/console`      | Coordinator and platform administrator console |

## Getting started

See [`docs/phase-1-setup.md`](docs/phase-1-setup.md) for linking a Firebase
project and creating the first platform administrator.

To run against the local emulators without any Firebase project at all:

```bash
npm install
npm run serve        # http://127.0.0.1:5000
```

With no config in `public/js/config.js`, the app falls back to an
emulator-only `demo-` project, so nothing can reach a real backend.

## Tests

```bash
npm run test:rules   # 54 security rule tests
npm run test:e2e     # browser smoke test of the full coordinator path
npm test             # both
```

The end-to-end test needs a Chromium binary. If Playwright's own download is
unavailable, point it at an existing one:

```bash
CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

## What is built

### Phase 2, the public feed

- Current and upcoming Janazahs, grouped by date in each notice's own time
  zone, with no account and no location
- Follow specific masajid, stored on the device rather than in an account, so
  the platform never learns which masajid anyone cares about
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

No user location is stored anywhere. That stays true through Phase 3: nearby
matching is done on the device against the public notice list, so the backend
never learns where anyone is. See `docs/janazah-app-build-spec.md` and the
architecture notes below.

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
- **Client-side audit writes.** Rules make entries unforgeable, unalterable
  and undeletable, but a determined staff member could act and skip the audit
  write. Closing that needs server-side writes.
