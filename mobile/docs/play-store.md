# Google Play preparation

Everything needed to submit Ta'ziyah, and the reasoning behind the answers
that are not obvious. Nothing here submits anything: `eas.json` names the
`internal` track, and the upload is a decision made in the Play Console.

Run `npm run release-check` first. It fails on anything that can be read from
the repository and lists what a person still has to confirm.

---

## 1. Data Safety

This is the section worth reading slowly. Most of it is straightforward and one
part is genuinely arguable.

### The straightforward answers

| Data type | Collected | Shared | Why, and where in the code |
| --- | --- | --- | --- |
| Email address | Yes | No | Firebase Auth, only if somebody signs in. `src/lib/auth.tsx`. |
| Name | Yes, optional | No | The display name on an account, if given. Same file. |
| App activity: other | Yes | No | Which masjids somebody follows, in `/users/{uid}`, only while signed in. `src/lib/follows.ts`. |
| Device or other IDs | Yes | No | The FCM messaging token. See section 1b. |
| Location | **See section 1b** | No | Never transmitted. `src/lib/location.ts`. |
| Photos, files, contacts, calendar, health, financial, messages | No | No | The app has no permission for any of them. |
| Crash logs, diagnostics, analytics | No | No | No Crashlytics, no Analytics, no third-party SDK of any kind. Check `package.json` before answering otherwise. |

For everything marked collected:

- **Purpose:** App functionality, and account management for the email and
  name. Nothing is used for advertising, personalisation or analytics, because
  none of those exist here.
- **Is it required?** No. Reading notices, following a masjid and receiving
  alerts all work with no account at all. That is worth stating in the form's
  optional explanation, because it is unusual and it is true.
- **Encrypted in transit?** Yes, everything is HTTPS through the Firebase SDKs.
- **Can users request deletion?** Yes. In the app at Profile > Delete my
  account (`app/delete-account.tsx`), and Play also requires a web URL for
  requesting it without installing the app.

### 1b. Location, and the FCM token: the arguable part

**This should be reviewed by whoever is accountable for the privacy policy
before the form is submitted. It is a judgement about how Play's definition of
"collected" applies to an unusual design, not a fact that can be read off the
code.**

What the code actually does, which is not in dispute:

- A position is read on the device, kept encrypted on the device, overwritten
  in place, and erased when location is turned off. It is never written to
  Firestore, never sent to a masjid, and never logged. `test/location.test.ts`
  fails the build if any module on that path gains the ability to write.
- What does leave the device is a set of **topic names**, each identifying a
  geohash cell several kilometres across, sent to a Cloud Function that
  subscribes the device and discards the request. The backend has no way to
  ask which devices are in an area. `src/lib/topics.ts`, `functions/index.js`.
- The **FCM token** is sent with that request.

The question is whether a coarse area topic derived from a position counts as
collecting location.

**The case for answering "no location collected":** the position itself never
leaves. A cell name is an area, not a point, and at the precisions used it
covers a large part of a city. The request is acted on and thrown away; nothing
in this project stores it or logs it.

**The case for answering "yes, approximate location":** Play treats data as
collected when it is transferred off the device, and the ephemeral-processing
exception covers data not stored beyond servicing the request. The
subscription itself does persist inside Firebase Cloud Messaging in order to
route future messages, even though this project never sees it. On that reading
the exception does not cleanly apply.

**Recommendation: answer yes, approximate location, collected for app
functionality, not shared, and use the form's explanation to say that the
precise position never leaves the device.** Over-declaring costs nothing.
Under-declaring is a policy violation, and the difference here is a reading of
Google's definition rather than a fact about the code.

The same reasoning applies to the FCM token under "Device or other IDs", where
the answer is more clearly yes: it is transferred, and FCM retains it.

---

## 2. Store listing

Draft copy. Every claim below is checkable against the app; nothing describes
a feature that does not exist. Do not add testimonials, user counts, or
partner names.

**App name:** Ta'ziyah

**Short description** (80 characters max):

> Janazah notices from verified masjids, and alerts when one is near you.

**Full description:**

> Janazah information is scattered across group chats, masjid announcements
> and word of mouth. People miss funerals they would have attended, sometimes
> while standing a few streets away, because they never heard in time.
>
> Ta'ziyah is one place where masjids and funeral coordinators publish Janazah
> notices, and where you find out in time to attend.
>
> Find a Janazah
> See current and upcoming notices, with the time, the prayer location, the
> burial location and directions to both.
>
> Near you
> Turn on location and see which Janazahs are closest. This happens on your
> phone. Your location is never sent to us, to any masjid, or to anyone else,
> and nothing records where you have been.
>
> Follow a masjid
> Follow the masjids that matter to you and see their notices first. Sign in
> and the same list reaches your other devices and taziyah.com.
>
> Be told in time
> Get a notification when a masjid you follow publishes a notice, when one is
> announced near you, and when a time changes or a Janazah is cancelled.
>
> Verified organizations
> Every organization is checked by a Ta'ziyah administrator before it can
> publish anything.
>
> How to pray Salat al-Janazah
> A guide for anyone who has not prayed one before, with each text's source
> given so it can be checked, and both practices shown where the schools of
> law differ. Ta'ziyah is a notification service, not a religious authority.
> Follow your local imam.
>
> Reading notices needs no account.

**Category:** Lifestyle. (Books & Reference is the alternative; Lifestyle fits
better, since the app's job is finding an event rather than reading.)

**Content rating questionnaire:** no violence, no sexual content, no profanity,
no gambling, no user-to-user communication, no user-generated content visible
to others. The one thing to answer carefully is that the app does share the
user's location **with other users**: it does not. Expect "Everyone".

**Contact details:** needs a real address. See the open item in
`docs/HANDOFF.md` section 8 about the privacy page still lacking a named
accountable person; the same gap applies here.

---

## 3. Graphics

| Asset | Size | Where |
| --- | --- | --- |
| App icon | 512x512 PNG | `assets/icon.png`, generated by `npm run icons` |
| Feature graphic | 1024x500 PNG | `npm run store-graphics` |
| Phone screenshots | 2 to 8, 9:16 | `npm run store-graphics` produces drafts |

The screenshots that script produces are rendered from the real components in
a browser at phone dimensions. **They are drafts.** Replace them with captures
from a real device before submitting: they have no system status bar, no tab
bar, and no real data in them, and a reviewer comparing a screenshot to the
installed app should see the same thing.

---

## 4. Release testing

In this order, on a `preview` build, on a real device. An emulator cannot
test the three things that matter most here, because all three are keyed to
the signing certificate.

**Notifications.** The whole pipeline has never run against real FCM on any
platform, so budget real time for this and expect to find something.

1. Turn alerts on. Confirm the system prompt appears once.
2. Follow a masjid. Publish a notice for it from the web console.
3. **Lock the phone.** The notification must arrive, on the Janazah channel,
   with the Ta'ziyah mark in the status bar rather than a grey square.
4. Tap it with the app killed. It must open that notice, not the home screen.
   This is the case most often broken and the one that never shows up while
   testing with the app open.
5. Cancel the notice from the web console. A second notification must arrive
   and **replace** the first rather than stacking beneath it.
6. Turn alerts off. Publish again. Nothing should arrive.

**Google sign-in.** Only works once the SHA-1 and SHA-256 fingerprints of
this build's certificate are registered against `com.taziyah.app` in the
Firebase console. A `DEVELOPER_ERROR` means they are not.

**App Links.**

```
adb shell am start -a android.intent.action.VIEW -d "https://taziyah.com/n/some-id"
```

must open the app rather than a browser. If it does not, check that
`assetlinks.json` is actually being served.

**Two-factor sign-in.** Sign in with an account that has TOTP enrolled from
the web account page. This is implemented (`src/lib/mfa.ts`) but has never been
exercised against a real enrolled account, and if it fails, every user who
took the security advice on the website is locked out of the app.

**Sync.** Follow a masjid on the phone, then open taziyah.com signed into the
same account: it should be there. Then the reverse.

**The rest.** Large font size (Android's display settings, two steps up), dark
mode, aeroplane mode with cached notices, and location denied permanently
rather than merely dismissed.

---

## 5. What is still open

Not oversights. Each one is a real task, and the first three block a public
release rather than an internal test.

1. **Push has never been delivered.** Section 4.
2. **The privacy policy needs a named accountable person and a contact
   address.** PIPEDA requires one; `public/js/views/privacy.js` says so rather
   than inventing it, and Play needs the same for the listing.
3. **Data Safety needs the judgement in section 1b confirmed** by whoever is
   accountable for the policy.
4. The keystore decision, and Play App Signing, before the first production
   build. **Play App Signing has a consequence that is easy to miss:** Google
   re-signs the bundle with its own key, which is not the EAS upload key, and
   Google matches a sign-in on the package name plus the signing certificate.
   That certificate's SHA-1 and SHA-256 have to be added in Firebase against
   `com.taziyah.app`, and `google-services.json` downloaded again, or Continue
   with Google fails with DEVELOPER_ERROR for everyone who installs from the
   store while working perfectly on the internal build that was tested. The
   same SHA-256 belongs in `assetlinks.json`, or App Links break the same way.
5. Nobody outside the author has tried to break any of this.

---

## 6. The Play Console checklist

Everything below has to be done by a person, outside this repository. The
order is the order Play asks for it.

**Before the first upload**

- [ ] Create the app in Play Console. Name `Ta'ziyah`, package
      `com.taziyah.app`, category Lifestyle, free.
- [ ] Turn on Play App Signing, then copy the **app signing key** SHA-1 and
      SHA-256 from Setup > App signing.
- [ ] Add both to Firebase console > Project settings > Your apps >
      `com.taziyah.app` > Add fingerprint. Download `google-services.json`
      again into `mobile/`. Without this Google sign-in fails from the store.
- [ ] Rebuild `assetlinks.json` with every SHA-256 that will sign a release,
      the upload key and Google's own, and deploy it:
      `node mobile/scripts/build-assetlinks.mjs <SHA-256> <SHA-256>`
      then confirm `curl https://taziyah.com/.well-known/assetlinks.json`.
- [ ] Confirm Firebase is on the Blaze plan. Cloud Functions do not run
      otherwise and no notification is ever sent.
- [ ] Deploy the backend: `npm run deploy:rules` and
      `npm run deploy:functions` from the repository root.
- [ ] Confirm `platformSettings/sampleData` is false or absent in the live
      project, so no fictional notice can appear.

**Store listing**

- [ ] Copy the name, short description and full description from section 2.
- [ ] Upload the icon and the feature graphic.
- [ ] Replace `mobile/store/screenshot-*.png` with captures from a real
      device. The ones in the repository are browser renders with no status
      bar and no tab bar, which Play will accept and which look wrong.
- [ ] Privacy policy URL: `https://taziyah.com/privacy`. It must be reachable
      and must describe the Android app, not only the website, and it still
      needs the named accountable person and contact address in item 2 above.
- [ ] Account deletion URL. Play requires a page somebody can reach without
      installing the app, saying how to have an account and its data deleted.
      The in-app path exists (`app/delete-account.tsx`) and the web console
      has one for a signed-in user; confirm a public page documents the
      process for somebody who cannot sign in.
- [ ] Support contact: a real email address and a postal address. The same
      gap as the privacy policy applies.

**Forms**

- [ ] Data Safety, from section 1. Read it rather than answering from memory,
      particularly 1b on location and the FCM token.
- [ ] Content rating questionnaire, from section 2.
- [ ] Target audience, ads declaration (there are none), and the news and
      government app declarations (neither applies).

**Testing, before production**

- [ ] Internal testing track first, with the production profile, so the build
      is signed exactly the way the public one will be.
- [ ] Push delivery end to end on that build: publish a notice, then cancel
      it, with the phone locked. Section 4.
- [ ] Google sign-in on that build, which is what proves the Play App Signing
      fingerprint was registered.
- [ ] A notification tap and a `https://taziyah.com/n/{id}` link, which is
      what proves App Links verified.
- [ ] Read the pre-launch report, including the 16 KB page size finding.
