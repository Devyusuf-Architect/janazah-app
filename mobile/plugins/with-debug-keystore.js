// Give local Android builds a debug certificate that never changes.
//
// The problem this exists for. Google matches a sign-in request on the
// package name plus the signing certificate, so every certificate that will
// ever sign this app has to be registered against com.taziyah.app in the
// Firebase console. Get it wrong and Play services rejects the flow with
// DEVELOPER_ERROR (code 10) and nothing more useful.
//
// A local build from `expo run:android` is signed with the DEBUG certificate,
// not the EAS release one. Where that certificate comes from is the whole
// question, and there are three candidates, which is exactly why this is
// confusing:
//
//   android/app/debug.keystore   what the Expo bare template ships, and what
//                                the generated build.gradle points at. It is
//                                the AOSP debug certificate, SHA-1
//                                5E:8F:16:...:F6:25, identical for every
//                                developer and every Expo app in the world.
//   ~/.android/debug.keystore    what the Android SDK generates per machine,
//                                what most guides tell you to print, and NOT
//                                what signs this app.
//   this one                     ours.
//
// Registering the template's certificate would work, and it is stable across
// `expo prebuild --clean` because it is a fixed binary in the npm tarball.
// Two reasons not to rely on that. It is stable only for a given template
// version, so an SDK upgrade could change it silently, and the failure would
// look like a fresh bug months later. And it is the most widely known
// certificate in Android: every app built from the template shares it.
//
// So the project owns one instead. credentials/debug.keystore is committed,
// lives outside the generated android/ directory, and survives every prebuild
// because nothing regenerates it. One pair of fingerprints goes into Firebase
// once and keeps working, for every developer and for CI.
//
// A debug keystore is not a secret. The password is the conventional
// "android" and the file is in the repository on purpose: it signs nothing
// that is distributed. The release keystore is a different thing entirely,
// lives only in EAS, and this plugin does not touch it. The release build
// type is left exactly as the template wrote it.

const { withAppBuildGradle } = require('@expo/config-plugins');
const path = require('node:path');

/** Relative to android/app/, which is where build.gradle resolves file(). */
const KEYSTORE = '../../credentials/debug.keystore';

module.exports = function withDebugKeystore(config) {
  return withAppBuildGradle(config, (mod) => {
    const gradle = mod.modResults.contents;

    // The template's block, matched on the store file rather than on the
    // whole block, so a formatting change upstream does not silently make
    // this a no-op.
    const original = "storeFile file('debug.keystore')";
    if (!gradle.includes(original)) {
      // Either the template changed or this has already run. Both are worth
      // knowing about rather than passing over in silence: a plugin that
      // quietly stops applying is how the certificate changes underneath
      // somebody and Google sign-in breaks again.
      if (!gradle.includes(KEYSTORE)) {
        throw new Error(
          'with-debug-keystore: the debug signingConfig in the Android '
          + 'template no longer matches what this plugin rewrites. Local '
          + 'builds would be signed with a certificate that is not '
          + 'registered in Firebase, and Google sign-in would fail with '
          + 'DEVELOPER_ERROR. Check android/app/build.gradle.',
        );
      }
      return mod;
    }

    mod.modResults.contents = gradle.replace(
      original,
      `storeFile file('${KEYSTORE}')`,
    );
    return mod;
  });
};

/** Where the keystore should be, for scripts/preflight.mjs to check. */
module.exports.keystorePath = (projectRoot) =>
  path.resolve(projectRoot, 'credentials/debug.keystore');
