// One backend at a time.
//
// A development build points at the local emulator suite unless it is told
// otherwise, and the bug that made this file necessary was not the default:
// it was that the default applied to some services and not others. Auth and
// Firestore were redirected to 10.0.2.2 while Cloud Functions kept calling
// the deployed project, so a session that existed only on the developer's
// machine was handed to a real server, and nothing on screen said so.
//
// These check the two properties that keep that shut: every service that can
// be emulated is, and the ports the app dials are the ports the repository's
// firebase.json actually serves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const firebaseTs = readFileSync(resolve(root, 'src/lib/firebase.ts'), 'utf8');
const backendTs = readFileSync(resolve(root, 'src/lib/backend.ts'), 'utf8');

/** The emulators block of the repository's firebase.json. */
const emulators = JSON.parse(
  readFileSync(resolve(root, '../firebase.json'), 'utf8'),
).emulators as Record<string, { port: number }>;

/** The ports src/lib/backend.ts tells the app to dial. */
function declaredPorts(): Record<string, number> {
  const block = backendTs.match(/emulatorPorts = \{([^}]*)\}/)?.[1] ?? '';
  const out: Record<string, number> = {};
  for (const match of block.matchAll(/(\w+):\s*(\d+)/g)) {
    out[String(match[1])] = Number(match[2]);
  }
  return out;
}

test('every Firebase service the app can emulate is redirected together', () => {
  // Cloud Messaging is absent on purpose: there is no FCM emulator, so push
  // tokens always come from the real project. Everything else moves as one.
  for (const call of [
    'connectAuthEmulator(',
    'connectFirestoreEmulator(',
    'connectFunctionsEmulator(',
  ]) {
    assert.ok(
      firebaseTs.includes(call),
      `${call} is missing from connectEmulators, so that service would keep `
      + 'talking to the live project while the others went local.',
    );
  }
});

test('the ports the app dials are the ones firebase.json serves', () => {
  const declared = declaredPorts();
  assert.ok(Object.keys(declared).length >= 3, 'emulatorPorts did not parse');
  for (const [service, port] of Object.entries(declared)) {
    assert.equal(
      emulators[service]?.port, port,
      `The app dials ${service} on ${port}, which is not what firebase.json `
      + 'starts it on.',
    );
  }
});

test('nothing builds a second Cloud Functions instance', () => {
  // getFunctions(app, region) returns a fresh instance, and only the one
  // exported from src/lib/firebase.ts is ever redirected at an emulator. A
  // second one somewhere else is a call that silently stays live.
  const offenders = [...backendTs.matchAll(/getFunctions\s*\(/g)];
  assert.deepEqual(offenders.map((m) => m[0]), []);
  const inApp = readFileSync(resolve(root, 'src/lib/notifications.ts'), 'utf8');
  assert.equal(/getFunctions\s*\(/.test(inApp), false);
});

test('the live switch is read from the config as well as the environment', () => {
  // EXPO_PUBLIC_ values are inlined at transform time and the transform is
  // cached, so a stale bundle can carry the old answer. app.config.ts is
  // evaluated afresh for every manifest Metro serves, so it is the one that
  // cannot go stale, and either saying live means live.
  assert.match(backendTs, /Constants\.expoConfig\?\.extra\?\.backend/);
  assert.match(backendTs, /process\.env\.EXPO_PUBLIC_USE_LIVE === '1'/);
  assert.match(backendTs, /extra\.live === true \|\|/);

  const config = readFileSync(resolve(root, 'app.config.ts'), 'utf8');
  assert.match(config, /backend:\s*\{/);
  assert.match(config, /live: process\.env\.EXPO_PUBLIC_USE_LIVE === '1'/);
});

test('a release build can never reach an emulator', () => {
  // The check is on __DEV__ first, so no environment variable and no config
  // value can point a shipped app at somebody's laptop.
  assert.match(backendTs, /usingEmulator = __DEV__ && !askedForLive/);
});
