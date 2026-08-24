# Phase 1 setup: linking a Firebase project to this repo

Do the console steps yourself (they need your Google account). Everything else
is already in the repo.

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and click **Add project**.
2. Name it something like `janazah-app`. Note the generated **project ID**;
   you need it in step 4.
3. Google Analytics is not needed. Turn it off.

## 2. Create Firestore, and pick the region carefully

1. In the console, **Build > Firestore Database > Create database**.
2. Start in **production mode**. Do not pick test mode; the rules in this repo
   replace the defaults and test mode leaves the database world-writable in the
   meantime.
3. **Location: `northamerica-northeast1` (Montreal)** or
   `northamerica-northeast2` (Toronto).

   This cannot be changed later. Moving regions after launch means creating a
   new project and migrating. Canadian residency is not strictly required by
   PIPEDA, but it is the answer you want to be able to give a masjid board.

## 3. Enable email/password sign-in

**Build > Authentication > Get started > Email/Password > Enable.** Leave
passwordless sign-in off.

Multi-factor authentication is not available on Spark. It needs the Identity
Platform upgrade, which is a Blaze-tier switch. Phase 1 works without it; see
"What Phase 1 does not include" below.

## 4. Register a web app and copy the config

1. Project overview > the `</>` (web) icon > register the app. Nickname
   `janazah-admin`. Do not enable Firebase Hosting in that dialog; the repo
   already has a hosting config.
2. Copy the `firebaseConfig` object it shows you.
3. Paste the values into `public/js/config.js`, replacing the placeholders.

That file is committed on purpose. Firebase web config values are not secrets:
they identify the project, they do not grant access. Access is controlled by
`firestore.rules`. Do not put a service account key in this repo.

## 5. Link the local repo

Requires Node.js.

```bash
npm install -g firebase-tools
firebase login
cp .firebaserc.example .firebaserc     # then edit it, or:
firebase use --add                      # pick your project, alias it "default"
```

## 6. Deploy the rules and indexes

The rules are the only thing enforcing privacy in Phase 1, so deploy them
before you put any real data in.

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## 7. Make yourself the platform admin

Platform admins are rows in an `/admins/{uid}` collection. There is no server
code in Phase 1 to write them, and the rules deliberately forbid clients from
creating them, so the first one is created by hand in the console.

1. Run the app (step 8) and sign up. This creates your auth user.
2. **Authentication > Users**, copy your **User UID**.
3. **Firestore Database > Start collection**, collection ID `admins`.
4. Document ID: paste your UID. Add one field: `email` (string), your email.
5. Reload the app. The Admin tab appears.

## 8. Run it

Locally, against the live project:

```bash
firebase serve --only hosting     # http://localhost:5000
```

Or fully offline against the emulators, which is the better way to test rule
changes:

```bash
npm run serve
```

The app auto-detects the emulator on localhost ports 8080/9099 and connects to
it instead of production. The emulator starts empty, so you will need to
re-create the admin document there (Firestore emulator UI, same steps as 7).

If `public/js/config.js` still holds the placeholders, the app falls back to an
emulator-only `demo-janazah` project when served from localhost, so you can
run everything before step 1 is done. A `demo-` project id can never reach a
real backend.

## 9. Run the tests

```bash
npm test
```

`npm run test:rules` exercises `firestore.rules` directly: who may publish,
what a public notice may contain, that an organization cannot verify itself,
and that the audit trail cannot be rewritten. `npm run test:e2e` drives the
real UI in a browser through registration, verification, publication and
cancellation, and asserts that the private fields never reach the public
document. Both need Java for the emulator; the browser test also needs
Chromium, which you can point at with `CHROMIUM_PATH` if Playwright cannot
download its own.

## 10. Deploy

```bash
firebase deploy --only hosting
```

Your console is then live at `https://<project-id>.web.app`.

## What Phase 1 does not include, and why

Deferred to Phase 4, when the compute decision is made:

- **Push notifications.** Sending to FCM needs a service account credential,
  which cannot live in browser JavaScript. This needs Cloud Functions (Blaze)
  or a small external endpoint. Nothing in Phase 1 depends on it.
- **Multi-factor auth for coordinators.** Needs the Identity Platform upgrade.
- **Scheduled retention purges.** No scheduler without Cloud Functions. Expired
  notices are filtered out of queries by time; actual deletion is manual until
  Phase 5.

Known limitation of a client-only audit trail: rules make `/auditLog` strictly
append-only and force `actorUid` to match the authenticated caller, so an entry
cannot be forged under someone else's name, altered, or deleted. But because
the write comes from the browser, a determined staff member could write a
notice and skip the audit entry. Closing that gap needs server-side writes.
It is recorded here rather than left implied.
