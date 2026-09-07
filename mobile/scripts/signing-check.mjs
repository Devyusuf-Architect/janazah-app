// Does the certificate that signs local builds match what Firebase knows?
//
// Google matches a sign-in on the package name plus the signing certificate.
// When they disagree, Play services rejects the flow with DEVELOPER_ERROR
// (code 10) and says nothing else, and the four places the answer could be
// wrong all look identical from inside the app.
//
// So this compares them directly:
//
//   the debug certificate this project signs local builds with, which is
//   credentials/debug.keystore (see plugins/with-debug-keystore.js)
//
//   the certificates Firebase has registered, which appear in
//   google-services.json as oauth_client entries of type 1, one per
//   registered fingerprint
//
// It also reads the certificate off a built APK when there is one, because
// that is the only completely unarguable answer to "what actually signed the
// thing on the emulator".
//
//   node scripts/signing-check.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const KEYSTORE = resolve(root, 'credentials/debug.keystore');
const APK = resolve(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
const GOOGLE_SERVICES = resolve(root, 'google-services.json');

/** Firebase stores fingerprints lowercased with the colons removed. */
const normalise = (fingerprint) => fingerprint.replace(/:/g, '').toLowerCase();

function fingerprintsFrom(output) {
  const sha1 = output.match(/SHA1:\s*([A-F0-9:]+)/i)?.[1] ?? '';
  const sha256 = output.match(/SHA256:\s*([A-F0-9:]+)/i)?.[1] ?? '';
  return { sha1, sha256 };
}

function keytool(args) {
  try {
    return execFileSync('keytool', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return '';
  }
}

console.log('Signing certificates for com.taziyah.app\n');

// ---- the project's debug keystore ----------------------------------------
let projectDebug = null;
if (!existsSync(KEYSTORE)) {
  console.log('credentials/debug.keystore is MISSING.');
  console.log('  Local builds would fall back to the Expo template’s own');
  console.log('  keystore, whose certificate is not the one registered in');
  console.log('  Firebase, and Google sign-in would fail with DEVELOPER_ERROR.');
  console.log('  Restore it from git rather than generating a new one: a new');
  console.log('  keystore is a new certificate and a new fingerprint to');
  console.log('  register.\n');
} else {
  const out = keytool([
    '-list', '-v', '-keystore', KEYSTORE,
    '-storepass', 'android', '-alias', 'androiddebugkey',
  ]);
  if (!out) {
    console.log('credentials/debug.keystore could not be read. Is keytool on PATH?\n');
  } else {
    projectDebug = fingerprintsFrom(out);
    console.log('Debug keystore (credentials/debug.keystore)');
    console.log(`  SHA-1   ${projectDebug.sha1}`);
    console.log(`  SHA-256 ${projectDebug.sha256}\n`);
  }
}

// ---- what actually signed the built APK ----------------------------------
let apkCert = null;
if (existsSync(APK)) {
  const out = keytool(['-printcert', '-jarfile', APK]);
  if (out) {
    apkCert = fingerprintsFrom(out);
    console.log('The APK on disk (android/app/build/outputs/apk/debug)');
    console.log(`  SHA-1   ${apkCert.sha1}`);
    console.log(`  SHA-256 ${apkCert.sha256}`);
    if (projectDebug && normalise(apkCert.sha1) !== normalise(projectDebug.sha1)) {
      console.log('  MISMATCH: this APK was NOT signed by the project keystore.');
      console.log('  Run `npx expo prebuild --clean` so the plugin is applied,');
      console.log('  then build again.');
    }
    console.log('');
  }
} else {
  console.log('No debug APK built yet, so nothing to check it against.\n');
}

// ---- what Firebase has registered ----------------------------------------
if (!existsSync(GOOGLE_SERVICES)) {
  console.log('google-services.json is missing, so there is nothing to compare');
  console.log('against. Download it from the Firebase console.');
  process.exit(1);
}

const gs = JSON.parse(readFileSync(GOOGLE_SERVICES, 'utf8'));
const registered = (gs.client ?? []).flatMap((client) =>
  (client.oauth_client ?? [])
    .filter((o) => o.client_type === 1)
    .map((o) => o.android_info?.certificate_hash)
    .filter(Boolean));

console.log(`Registered in google-services.json: ${registered.length} certificate(s)`);
registered.forEach((hash) => console.log(`  ${hash}`));
console.log('');

if (registered.length === 0) {
  console.log('No Android OAuth client at all, which means no fingerprint is');
  console.log('registered against com.taziyah.app, or this file was downloaded');
  console.log('before one was added. Continue with Google will fail with');
  console.log('DEVELOPER_ERROR on every build until it is.');
  process.exit(1);
}

const wanted = apkCert ?? projectDebug;
if (!wanted) process.exit(0);

const which = apkCert ? 'The APK on disk' : 'The project debug keystore';
if (registered.includes(normalise(wanted.sha1))) {
  console.log(`${which} IS registered. Google sign-in should work for it.`);
  process.exit(0);
}

console.log(`${which} is NOT among them.`);
console.log('');
console.log('Add both of these in the Firebase console, under Project');
console.log('settings > Your apps > com.taziyah.app > Add fingerprint, then');
console.log('download google-services.json again:');
console.log(`  SHA-1   ${wanted.sha1}`);
console.log(`  SHA-256 ${wanted.sha256}`);
process.exit(1);
