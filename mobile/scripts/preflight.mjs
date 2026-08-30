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
    const hasWebClient = (gs.client ?? []).some((c) =>
      (c.oauth_client ?? []).some((o) => o.client_type === 3));
    if (!hasWebClient) {
      warnings.push(
        'No web OAuth client in google-services.json, so Continue with Google\n'
        + '  will not work. Add the SHA-1 and SHA-256 fingerprints of both the\n'
        + '  EAS debug and release keystores to the Android app in the Firebase\n'
        + '  console, then download the file again.',
      );
    }
  } catch {
    problems.push('google-services.json is not valid JSON.');
  }
}

// ---- Google sign-in client id -------------------------------------------
if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
  warnings.push(
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set, so Continue with Google is\n'
    + '  hidden in this build. Email and password sign-in is unaffected. The\n'
    + '  value is the client_id of the type 3 OAuth client in\n'
    + '  google-services.json. It is a public identifier, not a secret.',
  );
}

// ---- the shared modules --------------------------------------------------
for (const file of ['geo.js', 'model.js', 'verification.js', 'janazah-guide-content.js']) {
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
