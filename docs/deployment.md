# Deployment, from nothing to live

Everything needed to take this repository to a working deployment. The phase
notes go deeper on the reasoning; this is the sequence.

Roughly 45 minutes, most of it waiting for Firebase.

---

## 0. What you need first

- **Node.js 20 or newer** and npm.
- **Java**, for the Firebase emulators, if you want to run the tests or the
  local demo. [adoptium.net](https://adoptium.net) is the easy source. Nothing
  else in the project uses Java, which makes it a surprising thing to be
  missing.
- **A Google account** for the Firebase console.
- **A credit card.** Push notifications and two-step sign-in both require the
  Blaze plan. Real usage sits inside the free allowance and the bill rounds to
  zero, but a card must be attached. Phases 1 to 3 work without it; see
  "Running without Blaze" at the end.

```bash
git clone https://github.com/Devyusuf-Architect/janazah-app.git
cd janazah-app
npm install
npm install -g firebase-tools
firebase login
```

---

## 1. Create the Firebase project

1. <https://console.firebase.google.com> → **Add project**.
2. Name it, for example `janazah-app`. Note the generated **project ID**; it
   usually differs from the name.
3. Turn Google Analytics **off**. It adds nothing here and adds a data flow you
   would have to explain in the privacy page.

## 2. Create Firestore, and choose the region carefully

**Build → Firestore Database → Create database.**

- **Production mode**, not test mode. Test mode leaves the database open for 30
  days, and this repository's rules replace the defaults anyway.
- **Location: `northamerica-northeast1` (Montreal)** or
  `northamerica-northeast2` (Toronto).

> This is the only irreversible choice in the whole process. Firestore's
> location is fixed at creation; changing it later means a new project and a
> data migration. PIPEDA does not strictly require Canadian residency, but it
> is the answer you want available when a masjid board asks where the data
> lives.

The Cloud Functions in this repository are pinned to
`northamerica-northeast1`. If you choose Toronto, change `setGlobalOptions` in
`functions/index.js` and the region argument in `getFunctions()` in
`public/js/push.js` to match, so notifications are not routed through another
region on their way out.

## 3. Upgrade to Blaze and set a budget alert

**⚙ → Usage and billing → Details and settings → Modify plan → Blaze.**

Then set a budget alert immediately: **Google Cloud console → Billing →
Budgets and alerts → Create budget**, a low monthly figure such as $10, alerts
at 50/90/100%. Google's budget alerts notify rather than hard-stop, so this is
a smoke detector, not a fuse.

## 4. Enable sign-in methods

**Build → Authentication → Get started.**

| Provider | Why |
| --- | --- |
| **Email/Password** | Masjid staff and platform administrators |
| **Anonymous** | Community reporting and alert subscription. No personal data is collected; it exists so a report is attributable enough to rate limit |

Leave passwordless sign-in off.

Then, for two-step sign-in: **Authentication → Sign-in method → Advanced →
upgrade to Identity Platform**, and enable **TOTP** as a second factor. Without
this, the Account screen says two-step is unavailable rather than failing
oddly.

## 5. Register the web app and copy its config

1. **Project overview → the `</>` (web) icon** → register. Nickname
   `janazah-web`. Do **not** tick "Also set up Firebase Hosting" in that
   dialog; this repository already has a hosting config.
2. Copy the `firebaseConfig` object shown.
3. Paste the values into `public/js/config.js`, replacing the `REPLACE_ME`
   placeholders.

These values are **not secrets**. They identify the project; they grant
nothing. Access is decided entirely by `firestore.rules`. Committing them is
normal. Never put a service account key in this repository.

## 6. Generate the Web Push certificate key

**⚙ Project settings → Cloud Messaging → Web configuration → Web Push
certificates → Generate key pair.**

Copy the key pair into `APP.vapidKey` in `public/js/config.js`. Also a public
identifier, not a secret: it lets a browser register for push and grants
nothing else.

Left as the placeholder, push stays switched off and the app says so, offering
the page-open fallback instead.

## 7. Link the local repository to the project

```bash
firebase use --add        # pick your project, alias it "default"
```

That writes `.firebaserc`, which is gitignored so it stays local to your
machine.

## 8. Tell the functions where the site lives

Create `functions/.env`:

```
SITE_ORIGIN=https://YOUR-PROJECT-ID.web.app
```

Every notification links back to this origin. There is deliberately no default,
so if you skip this the first deploy asks rather than silently sending the
whole community to the wrong address. Use your custom domain here if you have
one.

`functions/.env` is gitignored.

## 9. Run the tests before deploying anything

```bash
npm test
```

88 unit tests, 60 security rule tests, and a browser run through the whole
product path. The rule tests need Java for the Firestore emulator; the browser
test needs Chromium and takes `CHROMIUM_PATH=/path/to/chrome` if Playwright
cannot fetch its own.

If these do not pass, stop and find out why. In this app the rules are the
security model.

## 10. Deploy

```bash
cd functions && npm install && cd ..

# Rules first, so there is never a window with data and no rules.
firebase deploy --only firestore:rules,firestore:indexes

firebase deploy --only functions
firebase deploy --only hosting
```

Or all at once once you have done it the slow way at least once:

```bash
npm run deploy
```

Notes on the first run:

- Indexes take a minute or two to build. A "requires an index" error shortly
  after deploying is that, and it clears itself.
- Deploying `enforceRetention` may prompt to enable the **Cloud Scheduler API**.
  Accept. It runs daily at 04:17 America/Toronto.
- `subscribeDevice` is a callable function; the CLI sets its invoker
  permissions for you.

Your site is now at `https://YOUR-PROJECT-ID.web.app`, with the console at
`/console`.

## 11. Create the first platform administrator

There is no server code that grants administrator rights, and the rules
deliberately forbid any client from creating an admin record. That is the
point: nobody can promote themselves through the app. So the first one is made
by hand.

1. Go to `https://YOUR-PROJECT-ID.web.app/console` and **sign up** with your
   email.
2. **Authentication → Users**, copy your **User UID**.
3. **Firestore Database → Start collection**, collection ID `admins`.
4. Document ID: paste your UID. Add one field: `email`, type string, your
   address.
5. Reload the console. An **Admin** tab appears.

## 12. Turn on your own two-step sign-in

In the console, **Account → Set up two-step sign-in**. This account can publish
notices in a masjid's name; it is worth the extra step before anyone else has
access.

## 13. Walk the whole path once, on the real project

Before showing anyone:

- [ ] Register an organization, and confirm publishing is blocked while it is
      pending
- [ ] Verify it from the Admin tab, and confirm publishing unlocks
- [ ] Publish a notice with a family phone number in the private section, then
      confirm the number appears nowhere on the public feed
- [ ] Open the feed in a private window with no account and confirm the notice
      is there
- [ ] Open directions for prayer and burial
- [ ] Share the notice and check the link opens `/n/{id}`
- [ ] Turn on location and confirm a distance appears
- [ ] Correct the notice and confirm the change shows
- [ ] Cancel it and confirm the feed shows the cancellation with its reason
- [ ] Report a notice, then resolve the report from the Admin tab
- [ ] Check the audit trail lists every one of those actions

## 14. Test push on real devices

This is the one thing that cannot be tested locally: the emulator does not
emulate FCM sending. Do it before launch, not after.

- [ ] **Android Chrome**: enable alerts, lock the phone, publish a notice from
      another device, confirm it arrives
- [ ] Correct the notice; confirm the notification **replaces** the first
      rather than stacking
- [ ] Cancel it; confirm the cancellation arrives
- [ ] Follow the masjid **and** be within range; confirm you see **one**
      notification, not two
- [ ] **iPhone**: Share → **Add to Home Screen**, open it from there, enable
      alerts, confirm one arrives. Apple allows web push only for pages
      installed this way; the app detects this and shows the instruction, but
      expect a meaningful share of iPhone users never to complete it

## 15. Optional: a custom domain

**Hosting → Add custom domain**, follow the DNS instructions. Then update
`SITE_ORIGIN` in `functions/.env` and redeploy functions, or notification links
will keep pointing at the `web.app` address.

---

## Before you invite real families

Not deployment steps, but the deployment is not finished without them.

1. **Put a real name and contact address on the privacy page.**
   `public/js/views/privacy.js` currently says one is needed instead of
   inventing one. PIPEDA requires an accountable individual.
2. **Watch the first few retention runs.** Cloud Scheduler history, plus
   `notice.redacted` entries appearing in the audit log once notices are old
   enough.
3. **Have somebody else try to break it.** Publishing as an unverified masjid,
   reading another organization's private notes, forging an audit entry.
4. **Decide what happens when a family asks for a notice to come down** faster
   than the 30-day retention policy, and write it down.
5. **Recruit the pilot masajid before launch, not after.** Verification is a
   human process and it is the slowest part of this whole project.

---

## Running without Blaze

Phases 1 to 3 work on the free Spark plan: the console, the public feed, and
on-device nearby matching. Skip steps 3, 6, 8, and the functions deploy.

What you lose:

- **Push notifications.** Sending to FCM needs a service account credential
  that cannot live in a browser. With `vapidKey` left as the placeholder, the
  app offers alerts that work only while the page is open, and says exactly
  that.
- **Two-step sign-in**, which needs Identity Platform.
- **Automatic retention.** No scheduler means the deceased's name is never
  purged automatically. If you launch this way, someone has to do it by hand,
  and the privacy page must say so.

If you would rather not attach a card, the notification sending logic in
`functions/lib/` has no Firebase imports and would run on a small Netlify or
Cloudflare function against the same Firestore project. That is a port, not a
rewrite.

---

## Routine operations

```bash
npm run demo                  # the whole app locally, seeded, no project needed
npm test                      # before every deploy
npm run deploy:rules          # rules and indexes only
npm run deploy:functions      # functions only
npm run deploy                # everything
npm run serve                 # local emulators, nothing touches production
```

`npm run serve` runs the whole app against local emulators. With the config
placeholders still in place it falls back to an emulator-only `demo-` project,
so you can develop before any of the above is done.
