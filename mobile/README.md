# Ta'ziyah Mobile

The Android application. A separate product from the web site, on the same
Firebase project, the same accounts, the same Firestore data and the same
security rules.

Architecture and the reasoning behind it: [`../docs/mobile-architecture.md`](../docs/mobile-architecture.md).

## What has to exist before this builds

Two things come from the Firebase console and cannot be committed:

1. **`google-services.json`** in this directory. Firebase console >
   Project settings > Your apps > Add app > Android, package name
   `com.taziyah.app`, in the **existing** project `janaza-app-5baf2`.
   Creating a second project would give the phone its own users and its own
   notices, which is the one thing this app must never have.
2. **`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`**, if Continue with Google is wanted.
   It is the `client_id` of the type 3 OAuth client inside that file, and it
   is a public identifier rather than a secret. Without it the button is
   hidden and email sign-in is unaffected.

`npm run preflight` checks both and says what to do about either.

Google sign-in also needs the SHA-1 and SHA-256 fingerprints of the EAS debug
**and** release keystores added to the Android app in the Firebase console.
Without them it fails with a developer error and nothing more useful.

## Running it

```bash
npm install
npm run preflight     # what is missing, and where to get it
npm run icons         # regenerate the Android images from public/logo.svg
npm run prebuild      # generate android/ (gitignored, regenerate freely)
npm run android       # build and install the dev client
npm start             # Metro, for a dev client already installed
npm test              # the bridge and config tests
npm run typecheck
```

The app talks to the **local Firebase emulators** in a development build,
which is the native counterpart of the web app's behaviour on localhost. Start
them from the repository root with `npm run demo`. Two environment variables
change that:

- `EXPO_PUBLIC_USE_LIVE=1` uses the real project instead, like the web app's
  `?live=1`.
- `EXPO_PUBLIC_EMULATOR_HOST` points at the machine running them. The default
  is `10.0.2.2`, which is the Android emulator's alias for the host's
  loopback; a physical device needs the machine's address on the network.

A release build never connects to an emulator regardless of either variable.

## Layout

```
app/                 expo-router routes; the file tree is the navigation
  (tabs)/            Home, Nearby, Following, Alerts, Profile
  n/[id].tsx         a notice. The deep-link and notification target.
src/
  theme/             the design system. Every colour and size lives here.
  lib/               Firebase, auth, MFA, Google sign-in, queries, types
  components/        the primitives: Text, Button, Row, Surface, Field...
  features/          screen-specific pieces
  shared/            re-exports of the pure modules in ../public/js
test/                bridge and configuration tests, run with node --test
scripts/             preflight, and the Android images
```

## Rules for working on this

- **`src/shared/` holds no logic.** Every file there re-exports something in
  `../public/js`. A change goes into the web module, both clients get it, and
  the repository root's test suite decides whether it was right. A second copy
  would drift, and drift in `geo.js` means this app's idea of what is near you
  stops matching the backend's idea of which notification topic a notice went
  to.
- **Never weaken `firestore.rules` for this app.** If a screen cannot read
  something, the screen is wrong. The rules are the security model for both
  clients and the mobile build is assumed to be readable by anyone.
- **No user positions, ever.** Nearby matching happens in this process against
  notices already fetched. Nothing about where anyone is may be written to
  Firestore, logged, or sent anywhere. If a change appears to need that, the
  design has drifted.
- **A public notice list query must carry `where('isPublic','==',true)`.**
  Firestore matches a list rule against the query rather than the results, so
  dropping it does not leak anything; it fails outright. `src/lib/collections.ts`
  is where every query shape lives so this is checkable in one place.
- **Do not add a coordinator or admin surface.** Publishing is a desk job and
  the web console does it better. This is a product decision, not a security
  one: the rules already stop a community member publishing, whatever buttons
  a client draws.
- The religious content in `src/shared/guide.ts` is a re-export. Nothing about
  it is edited, shortened, or added to here.
