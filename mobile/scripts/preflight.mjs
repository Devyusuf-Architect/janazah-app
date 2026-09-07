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
    // An OAuth client of type 3 is the web client Firebase Auth needs in
    // order to accept a Google ID token, even when the sign-in happened on
    // Android. app.config.ts reads it straight out of this file.
    const hasWebClient = (gs.client ?? []).some((c) =>
      (c.oauth_client ?? []).some((o) => o.client_type === 3));
    if (!hasWebClient) {
      warnings.push(
        'No web OAuth client in google-services.json, so Continue with Google\n'
        + '  is hidden in this build. Email and password sign-in is unaffected.',
      );
    }

    // An OAuth client of type 1 is an ANDROID client, and Firebase adds one
    // for each signing certificate fingerprint registered against the app.
    // Their absence is the single most common reason Continue with Google
    // fails on Android with DEVELOPER_ERROR and nothing more useful, and it
    // is visible right here: no type 1 entry means no fingerprint is
    // registered, or the file was downloaded before one was added.
    const androidClients = (gs.client ?? []).flatMap((c) =>
      (c.oauth_client ?? []).filter((o) => o.client_type === 1));
    if (hasWebClient && androidClients.length === 0) {
      problems.push(
        'google-services.json has no Android OAuth client, so Continue with\n'
        + '  Google will fail with DEVELOPER_ERROR (code 10) on every build.\n'
        + '  Firebase adds one per signing certificate fingerprint, so this\n'
        + '  means none is registered against com.taziyah.app yet, or the file\n'
        + '  was downloaded before one was added.\n'
        + '  A build from `expo run:android` is signed with the DEBUG keystore,\n'
        + '  not the EAS release one, so BOTH have to be registered:\n'
        + '    debug   keytool -printcert -jarfile \\\n'
        + '              android/app/build/outputs/apk/debug/app-debug.apk\n'
        + '    release eas credentials\n'
        + '  Add each SHA-1 and SHA-256 in Firebase console > Project settings\n'
        + '  > Your apps > com.taziyah.app, then download the file again.',
      );
    } else if (androidClients.length) {
      const hashes = androidClients
        .map((o) => o.android_info?.certificate_hash)
        .filter(Boolean);
      warnings.push(
        `google-services.json carries ${hashes.length} registered signing\n`
        + '  certificate(s) for Continue with Google:\n'
        + hashes.map((h) => `    ${h}`).join('\n') + '\n'
        + '  Sign-in works only for a build signed by one of these. Compare\n'
        + '  against the build you are installing with:\n'
        + '    keytool -printcert -jarfile \\\n'
        + '      android/app/build/outputs/apk/debug/app-debug.apk\n'
        + '  (the SHA-1 there, lowercased with the colons removed, is what\n'
        + '  appears above).',
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
