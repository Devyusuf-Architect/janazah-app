// Everything that has to be true before this app is submitted to Google Play.
//
//   node scripts/release-check.mjs
//
// preflight.mjs answers "can this be built at all". This answers "should this
// be released", which is a different and longer list, and most of it is
// things that fail silently rather than loudly: an app that ships pointing at
// the wrong project, or with fictional funeral notices switched on, or
// missing the one file that makes notification taps open the app, all build
// and install perfectly well.
//
// Anything under BLOCKING must be fixed. Anything under CHECK is something a
// person has to confirm, usually because it cannot be read from the
// repository at all.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const repoRoot = resolve(root, '..');

const read = (path) => readFileSync(resolve(root, path), 'utf8');
const readRepo = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

const blocking = [];
const check = [];

/** Google Play's requirement for new apps and updates from 31 August 2026. */
const REQUIRED_TARGET_SDK = 36;

// ---- the project this build talks to -------------------------------------

const gsPath = resolve(root, 'google-services.json');
if (!existsSync(gsPath)) {
  blocking.push('google-services.json is missing. See scripts/preflight.mjs.');
} else {
  const gs = JSON.parse(readFileSync(gsPath, 'utf8'));
  if (gs.project_info?.project_id !== 'janaza-app-5baf2') {
    blocking.push(
      `google-services.json points at "${gs.project_info?.project_id}".\n`
      + '  A release against a different project would have its own users and\n'
      + '  its own notices, which is the one thing this app must never have.',
    );
  }
}

// ---- the target API level ------------------------------------------------

const config = read('app.config.ts');
const target = config.match(/targetSdkVersion:\s*(\d+)/);
if (!target || Number(target[1]) < REQUIRED_TARGET_SDK) {
  blocking.push(
    `targetSdkVersion is ${target?.[1] ?? 'unset'}; Play requires at least `
    + `${REQUIRED_TARGET_SDK} for new apps and updates.`,
  );
}

// ---- sample data ---------------------------------------------------------
//
// The worst thing this app could show a reviewer, or anyone else, is a
// fictional Janazah notice that reads as real.

const sample = read('src/lib/sample.ts');
if (!/^let enabled = false;$/m.test(sample)) {
  blocking.push(
    'src/lib/sample.ts no longer defaults sample mode to OFF. A release must\n'
    + '  never start by showing fictional funeral notices.',
  );
}
check.push(
  'platformSettings/sampleData in the LIVE project must be false, or absent.\n'
  + '  The app reads it at launch and will show the fictional notices if it is\n'
  + '  true. Check it in the admin portal at taziyah.com before submitting.',
);

// ---- the emulator cannot reach a release build ---------------------------

const firebase = read('src/lib/firebase.ts');
if (!/__DEV__ &&/.test(firebase)) {
  blocking.push(
    'src/lib/firebase.ts no longer gates the emulator connection on __DEV__.\n'
    + '  A released app silently talking to nothing is worse than one that\n'
    + '  fails to build.',
  );
}

// ---- Android App Links ---------------------------------------------------

const assetlinks = resolve(repoRoot, 'public/.well-known/assetlinks.json');
if (!existsSync(assetlinks)) {
  blocking.push(
    'public/.well-known/assetlinks.json does not exist, so a notification tap\n'
    + '  and every taziyah.com/n/ link open a browser rather than this app.\n'
    + '    npx eas credentials\n'
    + '    node scripts/build-assetlinks.mjs <SHA-256> <SHA-256>',
  );
} else {
  const statement = JSON.parse(readFileSync(assetlinks, 'utf8'));
  const entry = statement?.[0]?.target;
  if (entry?.package_name !== 'com.taziyah.app') {
    blocking.push(`assetlinks.json names "${entry?.package_name}", not com.taziyah.app.`);
  }
  const fingerprints = entry?.sha256_cert_fingerprints ?? [];
  if (!fingerprints.length) {
    blocking.push('assetlinks.json lists no certificate fingerprints.');
  } else if (fingerprints.length === 1) {
    check.push(
      'assetlinks.json lists one certificate fingerprint. With Play App\n'
      + '  Signing there are two, the upload key and Google’s own signing key\n'
      + '  (Play Console > Setup > App signing). Listing only one is the usual\n'
      + '  reason App Links work in an internal test and break on a wider track.',
    );
  }
  check.push(
    'assetlinks.json has to actually be served. After deploying:\n'
    + '    curl https://taziyah.com/.well-known/assetlinks.json\n'
    + '  firebase.json used to exclude every dot-directory, which silently\n'
    + '  dropped it. That is fixed; if Vercel serves taziyah.com, confirm the\n'
    + '  same thing there.',
  );
}

// ---- permissions this app asks for ---------------------------------------
//
// Every one has to be declared and defended in the Data Safety form, so one
// the app never exercises costs review time and tells users something untrue.

for (const forbidden of ['ACCESS_BACKGROUND_LOCATION', 'READ_EXTERNAL_STORAGE']) {
  if (!config.includes(forbidden)) {
    blocking.push(
      `${forbidden} is no longer blocked in app.config.ts. It arrives from a\n`
      + '  dependency and this app has no use for it.',
    );
  }
}
if (!/allowBackup:\s*false/.test(config)) {
  blocking.push(
    'allowBackup is no longer false. Android would copy the app’s private\n'
    + '  storage to the user’s Drive, and the reader’s last position is the\n'
    + '  one thing here that must not travel that way.',
  );
}

// ---- notifications, end to end -------------------------------------------

const notify = readRepo('functions/lib/notify.js');
if (!/notification: \{ title, body \}/.test(notify)) {
  blocking.push(
    'functions/lib/notify.js no longer sends a top-level notification block.\n'
    + '  An Android device would receive a data-only message and display\n'
    + '  nothing at all, which is the entire reason this app exists.',
  );
}
check.push(
  'The Cloud Functions must be deployed with the Android payload change:\n'
  + '    npm run deploy:functions\n'
  + '  Without it, a phone subscribed to a topic receives a silent message.',
);
check.push(
  'firestore.rules and the indexes must be deployed:\n'
  + '    npm run deploy:rules\n'
  + '  /users/{uid} and the Following index are both new.',
);

// ---- store requirements a repository cannot verify -----------------------

check.push(
  'Data Safety form: drafted in docs/play-store.md against what the code\n'
  + '  actually does. Read it rather than filling the form from memory.',
);
check.push(
  'Account deletion: the in-app path exists (app/delete-account.tsx). Play\n'
  + '  also requires a publicly reachable URL for requesting deletion without\n'
  + '  installing the app. Confirm taziyah.com covers that.',
);
check.push(
  'Privacy policy URL: https://taziyah.com/privacy must be reachable and must\n'
  + '  describe the Android app, not only the website. It is still missing the\n'
  + '  named accountable person and contact address PIPEDA requires (see\n'
  + '  docs/HANDOFF.md, section 8).',
);
check.push(
  'Firebase must be on the Blaze plan, or Cloud Functions do not run at all\n'
  + '  and no notification is ever sent.',
);
check.push(
  'Push delivery has never been tested against real FCM on any platform.\n'
  + '  Do that on a preview build before submitting: publish a notice, then\n'
  + '  cancel it, with the phone locked. See docs/play-store.md.',
);

// ---- report --------------------------------------------------------------

const say = (label, list) => {
  if (!list.length) return;
  console.log(`\n${label}\n`);
  for (const item of list) console.log(`  - ${item}\n`);
};

say('BLOCKING', blocking);
say('CHECK BY HAND', check);

if (!blocking.length) {
  console.log(`\nNothing blocking. ${check.length} things need a person.\n`);
}
process.exit(blocking.length ? 1 : 0);
