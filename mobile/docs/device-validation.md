# Getting Ta'ziyah onto a device, and proving it works

From a clean checkout to a working `preview` build with real authentication,
real location and real notifications. Nothing here publishes to Google Play.

Each step says **where** it happens and whether it is **once** or **every
release**. Work through them in order; several later steps depend on an
identifier produced by an earlier one.

An emulator on a Mac is enough for all of it. See section 0.

---

## 0. Emulator or phone

**Use the emulator.** Everything in this document works on one, including
Google sign-in and real FCM notifications, provided you pick the right system
image.

The one requirement: the virtual device must have **Google Play services**.
In Android Studio's Device Manager, the system image column must say
**"Google Play"** (best) or **"Google APIs"**. An image labelled plain
"Android" or "AOSP" has no Play services, and without them Google sign-in and
FCM both fail with errors that look like bugs in the app.

What an emulator cannot faithfully reproduce, and why one pass on a real phone
is still worth doing before a public release:

- **Doze and battery optimisation.** Android aggressively delays background
  work on a real device that has been idle for hours. High-priority FCM
  messages are meant to punch through this, and that claim is only really
  tested on hardware.
- **Manufacturer behaviour.** Samsung, Xiaomi, OnePlus and others kill
  background apps far more aggressively than stock Android. This is the
  commonest reason a notification arrives for a tester and not for a user.

Neither blocks what you are doing now. Do the whole checklist on the emulator,
then repeat sections 10 and 11 once on a real phone before anyone outside the
project relies on it.

---

## 1. One-time local setup — Terminal and Android Studio

**Once, per machine.**

1. Install Android Studio from `developer.android.com/studio`. You need it for
   the emulator and for `adb`, even though EAS does the actual building in the
   cloud.

2. In Android Studio: **More Actions → SDK Manager → SDK Tools**, tick
   **Android SDK Platform-Tools**, apply. That is what provides `adb`.

3. Put `adb` on your path. In Terminal:

   ```bash
   echo 'export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   adb version
   ```

4. Create the virtual device: **More Actions → Virtual Device Manager → Create
   device**. Pick **Pixel 7** or similar, then on the system image screen pick
   a recent API level (**36** matches what the app targets) with
   **"Google Play"** in the name. Finish, then start it with the play button.

5. Confirm the emulator is visible:

   ```bash
   adb devices
   ```

   You should see one entry like `emulator-5554   device`.

6. Install the Expo tooling and sign in. EAS builds in the cloud, so you need
   a free Expo account:

   ```bash
   cd mobile
   npm install
   npx eas login
   ```

---

## 2. Link the project to EAS — Terminal, one file edit

**Once, ever.**

```bash
cd mobile
npx eas init
```

This creates the project on Expo's servers and prints a **project ID** (a
UUID). Because this app uses a dynamic config (`app.config.ts`) rather than
`app.json`, EAS **cannot write that ID in for you**. It will say so and print
the ID.

Add it by hand to `app.config.ts`, inside the existing `extra` block:

```ts
  extra: {
    siteOrigin: `https://${SITE}`,
    androidPackage: ANDROID_PACKAGE,
    googleWebClientId: googleWebClientId(),
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    eas: { projectId: 'paste-the-uuid-here' },   // <- add this line
  },
```

Commit that. It is not a secret; it identifies the project on Expo's side.

Verify:

```bash
npx eas project:info
```

---

## 3. Signing credentials — Terminal

**Once, ever, and the single most important thing on this page to get right.**

```bash
cd mobile
npx eas credentials
```

Choose **Android**, then **production** (the same keystore is used for
`preview` and `production`; `development` is debug-signed and is a separate
thing, which is why this checklist uses `preview` throughout).

Choose **Keystore: Set up a new keystore** and let EAS generate one. Accept
the defaults.

**Why letting EAS generate and hold it is safe, and what "safe" means here:**
losing this keystore means you can never update this app again. Google Play
will not accept a bundle signed with a different key, and there is no appeal.
EAS holds it encrypted and it is recoverable through your Expo account.

Two things to do regardless:

1. **Download a backup.** In the same `eas credentials` menu, choose
   **Download existing keystore**. Put the `.jks` file and the passwords it
   prints somewhere you will still have them in five years, and not in this
   repository. A password manager entry is fine. Losing both the Expo account
   and this file ends the app.

2. **Turn on Play App Signing** when you eventually create the Play Console
   listing (section 13). It makes Google hold the real signing key and leaves
   the key above as an *upload* key only. An upload key can be reset if lost;
   a signing key cannot. This changes section 5, because there are then two
   certificates rather than one.

---

## 4. Get the fingerprints — Terminal

**Once now. Again if you ever change the keystore, and once more after Play
App Signing is enabled.**

```bash
cd mobile
npx eas credentials
```

Android → production → **Keystore: Manage everything needed to build your
project** → it prints a summary including:

```
SHA1 Fingerprint:    AB:CD:...:EF
SHA256 Fingerprint:  12:34:...:90
```

Copy both. Keep them somewhere you can paste from; the next three sections all
need one or the other.

**Which is which, because mixing them up is the usual failure:**

| Fingerprint | Used by | Section |
| --- | --- | --- |
| SHA-1 | Google sign-in, Maps API key restriction | 5, 7 |
| SHA-256 | Android App Links (`assetlinks.json`) | 6 |

Firebase wants both. Add both.

---

## 5. Register the fingerprints — Firebase Console

**Once now. Repeat after enabling Play App Signing, adding Google's signing
certificate as a second entry.**

1. Go to `console.firebase.google.com`, project **janaza-app-5baf2**.
2. **Project settings** (gear icon) → **General** → scroll to **Your apps** →
   the Android app **com.taziyah.app**.
3. **Add fingerprint** → paste the **SHA-1**. Add it.
4. **Add fingerprint** again → paste the **SHA-256**. Add it.
5. **Download `google-services.json`** from that same panel. It now contains
   an OAuth client that did not exist before.
6. Replace the file in the repository:

   ```bash
   # from wherever the browser saved it
   mv ~/Downloads/google-services.json /path/to/janazah-app/mobile/google-services.json
   cd /path/to/janazah-app/mobile
   npm run preflight
   ```

   Preflight should now report no blocking problems and confirm the web OAuth
   client is present.

**Do not skip step 5.** Adding a fingerprint in the console without
re-downloading the file leaves the app building against a config that does not
know about it, and Google sign-in fails with `DEVELOPER_ERROR`, which says
nothing useful.

---

## 6. Where `assetlinks.json` goes — you have to check this first

**Once, plus a redeploy of the site.**

### 6a. Find out who serves taziyah.com

I could not determine this from the repository: it contains both a
`firebase.json` and a `vercel.json`, and `docs/deployment.md` documents both as
supported. Run this on your Mac:

```bash
curl -sI https://taziyah.com | grep -i -E 'server|x-vercel|via|x-served-by'
```

Read the answer:

- A header containing **`x-vercel-id`** or `server: Vercel` → **Vercel**.
- `via: 1.1 google` or `server: Google Frontend` → **Firebase Hosting**.

If it is ambiguous, this is decisive:

```bash
dig +short taziyah.com
```

Firebase Hosting resolves to `199.36.158.100` or similar `199.36.15x.x`
addresses. Vercel resolves to `76.76.21.x` or a `cname.vercel-dns.com`.

### 6b. Generate the file

```bash
cd mobile
npm run assetlinks -- <SHA-256-FROM-SECTION-4>
```

Paste the SHA-256 exactly as EAS printed it, colons included. The script
refuses anything that is not 32 colon-separated hex pairs, and refuses to
invent one, because a placeholder in this file deploys, verifies against
nothing, and fails silently.

It writes `public/.well-known/assetlinks.json`. Commit it. It is a public
statement, not a secret.

**After Play App Signing is enabled**, run it again with both fingerprints:

```bash
npm run assetlinks -- <UPLOAD-KEY-SHA-256> <GOOGLE-SIGNING-KEY-SHA-256>
```

The second comes from **Play Console → Setup → App signing**. Listing only one
is the usual reason App Links work in an internal test and stop working the
moment the app reaches a wider track.

### 6c. Deploy it

**If Firebase Hosting** — Terminal, from the repository root:

```bash
firebase deploy --only hosting
```

The file lives at `public/.well-known/assetlinks.json` and needs nothing
further. `firebase.json` used to exclude every dot-directory, which would have
silently dropped it; that is already fixed on this branch.

**If Vercel** — the file still lives at `public/.well-known/assetlinks.json` in
this repository, and Vercel deploys on push. Two things to check in the
**Vercel dashboard**, under the project's **Settings → General**:

- **Output Directory** must be `public`, or Vercel is serving a different
  directory and the file is not where you think.
- Nothing in **Settings → Rewrites** should be catching `/.well-known/*`.
  `vercel.json` rewrites `/(.*)` to `/index.html`, but Vercel matches static
  files before rewrites, so the file wins. Verify rather than assume.

### 6d. Confirm it is actually served

Whichever host, this must return JSON and not HTML:

```bash
curl https://taziyah.com/.well-known/assetlinks.json
```

If you get the app's HTML back, the rewrite is catching it and App Links will
never verify.

---

## 7. Google Maps API key — Google Cloud Console

**Once. Optional: without it the map view is hidden and Nearby works as a
list.**

1. Go to `console.cloud.google.com`, and select the project
   **janaza-app-5baf2** in the picker at the top. A Firebase project is a
   Google Cloud project; this is the same one.
2. **APIs & Services → Library** → search **Maps SDK for Android** → **Enable**.
   This requires a billing account on the Cloud project. Maps has a monthly
   free allowance well above what this app will use, but the card has to be on
   file.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Click the new key → **Restrict key**:
   - **Application restrictions**: Android apps → **Add** → package name
     `com.taziyah.app`, SHA-1 fingerprint from section 4.
   - **API restrictions**: Restrict key → tick **Maps SDK for Android** only.
   - Save.
5. Copy the key.

Then make the build see it. **Terminal**, edit `mobile/eas.json` and add it to
the `preview` and `production` profiles:

```json
"preview": {
  "distribution": "internal",
  "android": { "buildType": "apk" },
  "env": {
    "EXPO_PUBLIC_USE_LIVE": "1",
    "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY": "AIza..."
  }
}
```

The key is restricted to this package and this certificate, so committing it is
the same class of thing as committing the Firebase config: it identifies, it
does not grant. If you would rather not, use `npx eas env:create` (older CLI:
`eas secret:create`) instead and leave `eas.json` alone.

---

## 8. Build and install — Terminal

**Every time you want to test a change that is not pure JavaScript.**

```bash
cd mobile
npm run preflight        # nothing blocking?
npx eas build --profile preview --platform android
```

The first run asks a few questions and then queues a cloud build. It takes
roughly ten to twenty minutes. When it finishes it prints a URL.

To install on the emulator:

```bash
# download the .apk the build page offers, then:
adb install -r ~/Downloads/build-xxxxx.apk
```

`-r` reinstalls over an existing copy and keeps its data.

To install on a real phone instead: the build page shows a QR code; scan it
with the phone's camera and follow the install prompt. You will need to allow
installation from that browser once.

**A `preview` build has the JavaScript baked in.** Changing a component means
another build. If you want to iterate quickly on JavaScript, build the
`development` profile once and run `npm start` against it — but note that the
development build is debug-signed with a different certificate, so Google
sign-in will fail in it unless you also register that fingerprint. For
validation work, stay on `preview`.

---

## 9. Before testing: deploy the backend — Terminal

**Once now. Repeat whenever rules, indexes or functions change.**

The app talks to the live project, and three things on this branch have not
been deployed to it yet.

```bash
cd /path/to/janazah-app
npm run deploy:rules       # /users/{uid} and the Following index
npm run deploy:functions   # the Android notification payload
```

`deploy:functions` requires the Firebase project to be on the **Blaze** plan.
On the free plan Cloud Functions do not run at all and no notification is ever
sent. Upgrade at **Firebase Console → top-left gear → Usage and billing**.

Without the functions deploy, a phone subscribed to a topic receives a
data-only message and displays nothing, which looks exactly like notifications
being broken.

---

## 10. The tests, in order — emulator

Do these in this sequence. Later ones depend on earlier ones having worked.

### 10a. It starts, and it is talking to the real project

Open the app. You should see the Home screen with real notices from
taziyah.com, or an empty state if none are current. Not a crash, and not the
sample data.

```bash
adb logcat -s ReactNativeJS:V   # leave this running in another Terminal tab
```

### 10b. Sample data is not visible

**Firebase Console → Firestore → `platformSettings` → `sampleData`.** If the
document exists, `enabled` must be `false`. If it does not exist, that is also
fine: the app defaults to off.

In the app, you must not see any notice for "Fulan ibn Fulan" or any masjid
named "Sample …", and there must be no gold "Sample data" banner. If you do,
turn the flag off in the admin portal at `taziyah.com/console` and relaunch.

### 10c. Email sign-in

Profile → Sign in. Use an account that already exists on taziyah.com. It
should sign in and Profile should show the email.

If that account has an authenticator app enrolled, you should be asked for a
six-digit code and it should work. **This path has never been exercised
against a real enrolled account.** If it fails, stop and tell me: it means
every user who took the security advice on the website is locked out of the
app, and it is a release blocker.

### 10d. Google sign-in

Sign out, then **Continue with Google**.

- Button missing → `google-services.json` has no web OAuth client. Redo
  section 5, including the re-download.
- `DEVELOPER_ERROR` → the SHA-1 is not registered, or the config file was not
  re-downloaded after registering it. Redo section 5.
- Works → also confirm Profile shows the right account afterwards.

### 10e. Location and Nearby

Set a position the emulator will report:

1. Click the **…** (Extended controls) beside the emulator window.
2. **Location** → enter a latitude and longitude near a masjid that has a
   published notice. Toronto downtown is `43.6532`, `-79.3832`.
3. **Set location**.

In the app: **Nearby → Use my location**. Grant the permission when Android
asks.

Confirm:

- Distances appear on the rows, and they are plausible for the coordinates you
  set.
- Changing the radius changes what is listed.
- **Turn off location**, then reopen Nearby: it should be back to the
  explanation screen, not still showing distances.
- Deny the permission twice (uninstall and reinstall to get the prompt back),
  and confirm you get the **Android Settings instructions** rather than a
  button that does nothing.
- If you set a Maps key, the **List | Map** toggle appears and the map shows
  pins. Without the key the toggle is correctly absent.

### 10f. Follow a masjid, and check it reaches the web

Follow a masjid in the app while signed in. Then open `taziyah.com` in a
browser, signed into the same account, and confirm it is there. Then follow a
different one on the web and reopen the app.

---

## 11. Notifications — the part that has never run

**This whole pipeline has never delivered a message on any platform.** The
web app's push key was never configured, so this is the first real test of it.
Budget an hour and expect to find something.

You need two things open: the emulator, and `taziyah.com/console` in a browser
signed in as a coordinator for a verified masjid.

### 11a. Turn alerts on

App → **Alerts → Turn on alerts**. Android asks for notification permission on
API 33 and above; grant it.

Confirm the screen then says the phone is subscribed to some number of areas
or masjids. If it says zero, follow a masjid or turn on "Janazahs near me"
first, because a phone subscribed to nothing will never receive anything.

### 11b. App open (foreground)

With the app on screen, publish a notice from the console for a masjid you
follow.

Expected: a notification appears. Tapping it opens that notice.

### 11c. App backgrounded

Press the emulator's home button. Publish another notice.

Expected: a system notification, on the "Janazah notices" channel, with the
Ta'ziyah mark in the status bar rather than a grey square. Tapping it opens
that notice.

### 11d. App killed, phone locked

This is the one that matters and the one most often broken.

```bash
adb shell am force-stop com.taziyah.app
adb shell input keyevent 26          # lock the screen
```

Publish another notice.

Expected: the notification arrives on the lock screen. Unlock, tap it, and the
app should **cold start directly onto that notice**, not onto Home.

If it opens Home, the cold-start path is broken. That is
`getInitialNotification` in `src/features/alerts/useNotificationRouting.ts`.

### 11e. A cancellation replaces, rather than stacks

Cancel one of the notices from the console.

Expected: a second notification saying it is cancelled, which **replaces** the
earlier one about the same notice rather than sitting beneath it. Two
notifications for one funeral is a bug.

### 11f. Off means off

Alerts → **Turn off alerts**. Publish again. Nothing should arrive.

### If nothing arrives at all

In this order:

1. Is the project on the **Blaze** plan? Free plan, no functions, no
   notifications.
2. Were the functions deployed after the payload change? Section 9.
3. **Firebase Console → Functions → Logs.** Look for `onNoticeWritten`. It
   logs `Notice notification sent` with a topic count, or an error naming what
   failed. An entry saying `Notice has no routable topics` means the notice's
   prayer location has no geohash cell.
4. Does the emulator image have Play services? Section 0.

---

## 12. Deep links — Terminal

```bash
adb shell am start -a android.intent.action.VIEW -d "https://taziyah.com/n/SOME-REAL-NOTICE-ID"
```

Expected: the app opens on that notice.

If a browser opens instead, `assetlinks.json` is not verifying. Check section
6d first, then force Android to re-verify:

```bash
adb shell pm verify-app-links --re-verify com.taziyah.app
adb shell pm get-app-links com.taziyah.app
```

The second prints the verification state per domain. You want `verified`.

---

## 13. Privacy policy and Play requirements — Firebase, your site, Play Console

**Once, and this is the one part that is not a technical task.**

Three separate obligations:

1. **A named accountable person and a contact address on the privacy page.**
   PIPEDA requires this, and `public/js/views/privacy.js` currently says so
   rather than inventing one. It is a real name and a real way to reach them.
   Give me the name, role and contact address and I will make the edit; I will
   not invent one.

2. **A public account-deletion page.** Play requires a URL where somebody can
   request deletion **without installing the app**. The in-app path exists
   (Profile → Delete my account). The web equivalent needs to exist at a
   stable URL and be linked from the listing. Confirm whether
   `taziyah.com/privacy` already covers this; if not, it is a small addition.

3. **The Data Safety form.** Drafted against the actual code in
   `docs/play-store.md` section 1. Read section 1b before filling it in: one
   answer, whether a coarse area subscription counts as collecting location,
   is a judgement about Google's definition rather than a fact about the code.
   My recommendation is to declare it, because over-declaring costs nothing
   and under-declaring is a policy violation. That decision should be yours
   or your privacy reviewer's, not mine.

None of these block the emulator testing above. All three block a public
release.

---

## 14. Green release check — Terminal

**Every release.**

```bash
cd mobile
npm run release-check
```

It exits non-zero while anything is blocking. Currently the only blocker is
`assetlinks.json`, which section 6 resolves. Everything else it prints is a
list for a person, not a failure.

When it says "Nothing blocking", read the CHECK BY HAND list once more and
confirm each line honestly. Several of them, particularly the sample-data flag
and the functions deploy, are things that pass silently while being wrong.

---

## What is once and what repeats

| Step | Frequency |
| --- | --- |
| 1 Android Studio, emulator, adb | Once per machine |
| 2 `eas init` and the project ID | Once, ever |
| 3 Keystore and its backup | Once, ever |
| 4 Fingerprints | Once; again after Play App Signing |
| 5 Firebase fingerprints + re-download | Once; again after Play App Signing |
| 6 `assetlinks.json` | Once; again after Play App Signing |
| 7 Maps key | Once |
| 8 `eas build --profile preview` | Every native change |
| 9 `deploy:rules` / `deploy:functions` | Whenever those change |
| 10–12 The tests | Every release |
| 13 Privacy and Play paperwork | Once, then when policy changes |
| 14 `release-check` | Every release |

---

## The shortest path, if you want to start now

Sections 1, 2, 3, 4, 5, 8, 9, then test 10a to 10f and all of 11. That gets
you real authentication, real location and real notifications on the emulator.
Sections 6, 7, 12 and 13 can follow.
