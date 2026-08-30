// What has to be in place before this app can be built for a device.
//
// Every item here needs something from outside the repository: the Firebase
// console, Google Cloud, or an EAS keystore. None of it can be checked in,
// and each one fails at a different and unhelpful moment during a build if it
// is missing, so they are all checked here first with a message that says
// what to do.
//
//   node scripts/preflight.mjs

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const problems = [];
const warnings = [];

// ---- google-services.json ------------------------------------------------
const gsPath = resolve(root, 'google-services.json');
if (!existsSync(gsPath)) {
  problems.push(
    'google-services.json is missing.\n'
    + '  Firebase console > Project settings > Your apps > Add app > Android.\n'
    + '  Use the package name com.taziyah.app, in the EXISTING project\n'
    + '  (janaza-app-5baf2). Do not create a second project: the whole point\n'
    + '  is that the phone and the web site share one set of users and one\n'
    + '  database. Download the file to mobile/google-services.json.',
  );
} else {
  try {
    const gs = JSON.parse(readFileSync(gsPath, 'utf8'));
    const projectId = gs.project_info?.project_id;
    if (projectId && projectId !== 'janaza-app-5baf2') {
      problems.push(
        `google-services.json is for the project "${projectId}", not\n`
        + '  janaza-app-5baf2. A build against a different project would have\n'
        + '  its own users and its own notices, which is the one thing this\n'
        + '  app must never have.',
      );
    }
    const packages = (gs.client ?? [])
      .map((c) => c.client_info?.android_client_info?.package_name);
    if (packages.length && !packages.includes('com.taziyah.app')) {
      problems.push(
        'google-services.json does not contain com.taziyah.app.\n'
        + `  It has: ${packages.join(', ') || '(none)'}.`,
      );
    }
    // An OAuth client of type 3 is the web client Firebase Auth needs to
    // accept a Google ID token, even on Android.
    // An OAuth client of type 3 is the web client Firebase Auth needs in
    // order to accept a Google ID token, even when the sign-in happened on
    // Android. app.config.ts reads it straight out of this file.
    const hasWebClient = (gs.client ?? []).some((c) =>
      (c.oauth_client ?? []).some((o) => o.client_type === 3));
    if (!hasWebClient) {
      warnings.push(
        'No web OAuth client in google-services.json, so Continue with Google\n'
        + '  is hidden in this build. Email and password sign-in is unaffected.\n'
        + '  Add the SHA-1 and SHA-256 fingerprints of both the EAS debug and\n'
        + '  release keystores to the Android app in the Firebase console, then\n'
        + '  download the file again.',
      );
    }

    // Present in the file, but only actually usable once the signing
    // certificate fingerprints are registered. Nothing in the file records
    // whether they are, so this cannot be checked here and is called out
    // instead: it is the single most common reason Continue with Google
    // fails on Android with nothing but a developer error.
    if (hasWebClient) {
      warnings.push(
        'Continue with Google is switched on in this build. It will still fail\n'
        + '  until the SHA-1 and SHA-256 fingerprints of the EAS debug AND\n'
        + '  release keystores are registered against com.taziyah.app in the\n'
        + '  Firebase console. `eas credentials` prints them.',
      );
    }
  } catch {
    problems.push('google-services.json is not valid JSON.');
  }
}

// ---- Google Maps ---------------------------------------------------------
if (!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) {
  warnings.push(
    'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set, so the map view in Nearby is\n'
    + '  hidden and Nearby works as a list. That is deliberate: without a key\n'
    + '  the map renders blank tiles, which reads as a broken app rather than\n'
    + '  a missing key.\n'
    + '  Google Cloud console > APIs & Services > Maps SDK for Android. Restrict\n'
    + '  the key to com.taziyah.app and the signing certificate fingerprint.\n'
    + '  Note this is billed separately from Firebase.',
  );
}

// ---- Android App Links ---------------------------------------------------
if (!existsSync(resolve(root, '../public/.well-known/assetlinks.json'))) {
  warnings.push(
    'public/.well-known/assetlinks.json does not exist, so a link to\n'
    + '  https://taziyah.com/n/{id} opens a browser rather than this app, and a\n'
    + '  notification tap goes to the website. It needs the SHA-256 fingerprint\n'
    + '  of every certificate that will sign a release, which with Play App\n'
    + '  Signing is at least two: the upload key and Google\u2019s own.\n'
    + '    npx eas credentials        (prints the upload key)\n'
    + '    node scripts/build-assetlinks.mjs <SHA-256> <SHA-256>',
  );
}

// ---- the shared modules --------------------------------------------------
for (const file of [
  'geo.js', 'model.js', 'verification.js', 'janazah-guide-content.js',
  'sample-data.js',
]) {
  if (!existsSync(resolve(root, '../public/js', file))) {
    problems.push(
      `../public/js/${file} is missing. src/shared re-exports it, and Metro\n`
      + '  reaches it through the watchFolders entry in metro.config.js.',
    );
  }
}

const say = (label, list) => {
  if (!list.length) return;
  console.log(`\n${label}\n`);
  for (const item of list) console.log(`- ${item}\n`);
};

say('Blocking:', problems);
say('Worth knowing:', warnings);

if (!problems.length && !warnings.length) {
  console.log('Ready to build for Android.');
}
process.exit(problems.length ? 1 : 0);
