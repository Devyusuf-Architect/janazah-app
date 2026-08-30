// Android App Links: the file taziyah.com has to serve.
//
// Without it, a link to https://taziyah.com/n/{id} opens a browser rather
// than the app, and a notification tap on a device that has the app installed
// still goes to the website. Android verifies the link by fetching
// https://taziyah.com/.well-known/assetlinks.json and checking that it names
// this package and the certificate the installed app was signed with.
//
//   node mobile/scripts/build-assetlinks.mjs <SHA-256 fingerprint> [more...]
//
// The fingerprints come from `eas credentials` and there are usually two that
// matter: the upload key EAS signs with, and the key Google Play re-signs
// with once Play App Signing is on. BOTH must be listed. Listing only the
// upload key is the single most common reason App Links work in an internal
// test build and stop working the moment the app goes to a wider track.
//
// This script deliberately refuses to invent a fingerprint. A file with a
// placeholder in it would deploy, verify against nothing, and fail silently,
// which is worse than not having the file at all.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const out = resolve(repoRoot, 'public/.well-known/assetlinks.json');

const PACKAGE = 'com.taziyah.app';
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i;

const fingerprints = process.argv.slice(2).map((value) => value.trim().toUpperCase());

if (!fingerprints.length) {
  console.error(`
Usage: node mobile/scripts/build-assetlinks.mjs <SHA-256> [<SHA-256> ...]

A SHA-256 certificate fingerprint looks like:
  AB:CD:12:...:EF   (32 pairs of hex digits, colon separated)

Get them with:
  cd mobile && npx eas credentials     (Android > production > Keystore)

List every certificate that will ever sign a released build. With Play App
Signing on, that is at least two: the upload key and Google's own signing
key, which is shown in Play Console under Setup > App signing. Missing one
means App Links quietly stop working for anyone who installed from Play.
`.trim());
  process.exit(1);
}

const bad = fingerprints.filter((value) => !FINGERPRINT.test(value));
if (bad.length) {
  console.error(`Not a SHA-256 fingerprint: ${bad.join(', ')}`);
  console.error('Expected 32 colon-separated hex pairs. A SHA-1 is too short.');
  process.exit(1);
}

const statement = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: PACKAGE,
      sha256_cert_fingerprints: fingerprints,
    },
  },
];

await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(statement, null, 2)}\n`);

console.log(`Wrote public/.well-known/assetlinks.json for ${PACKAGE}`);
console.log(`  ${fingerprints.length} fingerprint(s)`);
console.log(`
Next:
  1. Commit it. It is a public statement, not a secret.
  2. Deploy the site, then confirm it is actually served:
       curl https://taziyah.com/.well-known/assetlinks.json
     Firebase Hosting used to drop this file: "ignore" contained "**/.*",
     which excludes every dot-directory. That is fixed in firebase.json, but
     if taziyah.com is served by Vercel instead, check the same thing there.
  3. Ask Google to re-verify:
       https://developers.google.com/digital-asset-links/tools/generator
  4. On a device: adb shell am start -a android.intent.action.VIEW \\
       -d "https://taziyah.com/n/some-id"
     It should open the app, not a browser.
`.trim());
