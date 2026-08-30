# Build profiles

Three, and the difference between them is which backend they talk to and what
comes out.

| Profile | Talks to | Produces | For |
| --- | --- | --- | --- |
| `development` | the local Firebase emulators | a debug APK with the dev client | daily work |
| `preview` | the real project | a release-signed APK | testing on a real device before a release |
| `production` | the real project | an `.aab` | Play |

`development` is the only one that reaches the emulators, and it does so
because `EXPO_PUBLIC_USE_LIVE` is `0` there. That variable is only ever
consulted in a debug build: `src/lib/firebase.ts` gates the whole emulator
path on `__DEV__` first, so a release build cannot be pointed at a local
emulator however the environment is set. That belt and braces is deliberate.
An app in the Play Store silently talking to nothing is a worse failure than
one that will not build.

`preview` matters more than it looks. It is the first build that behaves
exactly like a shipped one: real Firebase, real FCM, release signing. Push
notifications, Google sign-in and Android App Links can only be tested here or
in production, because all three are keyed to the signing certificate.

## Versioning

`appVersionSource: remote` means EAS holds the `versionCode` and increments it
on every production build. Nothing in the repository has to be edited to
release, and two builds can never collide on the same code, which Play rejects.

`version` in `app.config.ts` is the human one and is set by hand. Bump it when
the release is worth naming.

## The keystore

EAS generates and holds it on the first production build unless one is
uploaded. Whichever way it goes, **losing it means never being able to update
this app again**: Play will not accept a bundle signed with anything else.

Turn on Play App Signing, which makes Google hold the real signing key and
leaves EAS holding only an upload key. An upload key can be reset if it is
lost. A signing key cannot.

That decision matters before the first production build, not after, and it
changes the fingerprints in `.well-known/assetlinks.json`: with Play App
Signing there are two certificates, and both have to be listed or App Links
work in an internal test and break the moment the app reaches a wider track.
See `scripts/build-assetlinks.mjs`.

## Commands

```bash
npm run preflight                    # what is missing before any of this works
npx eas build --profile development --platform android
npx eas build --profile preview --platform android
npx eas build --profile production --platform android
npx eas credentials                  # the fingerprints assetlinks.json needs
npm run release-check                # everything that must be true before submitting
```

Nothing here submits to Play. `eas.json` names the `internal` track for a
submission, so even a deliberate `eas submit` reaches testers rather than the
public, and the upload is a decision made in the Play Console.
