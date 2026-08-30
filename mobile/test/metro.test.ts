// The Metro configuration is load-bearing, so it gets a test.
//
// Two things have to stay true, and both would fail quietly rather than
// loudly if they broke: a bundle that silently picks up the web Firebase SDK
// would compile and then fail on a device, and a shared module that stopped
// resolving would take the geo maths with it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const repoRoot = resolve(projectRoot, '..');

test('Metro watches the repository root, so src/shared can reach public/js', async () => {
  const require = createRequire(resolve(projectRoot, 'metro.config.js'));
  const config = require('./metro.config.js');
  assert.ok(
    config.watchFolders?.includes(repoRoot),
    'metro.config.js must watch the repository root or the shared modules will not resolve',
  );
});

test('packages resolve from this project, not from the repository root', async () => {
  const require = createRequire(resolve(projectRoot, 'metro.config.js'));
  const config = require('./metro.config.js');
  assert.deepEqual(
    config.resolver.nodeModulesPaths,
    [resolve(projectRoot, 'node_modules')],
  );
});

test('the web Firebase SDK is not a dependency of the mobile app', async () => {
  const require = createRequire(resolve(projectRoot, 'package.json'));
  const pkg = require('./package.json');
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  // The web SDK and @react-native-firebase are different libraries with
  // overlapping names. Having both installed here is how a build ends up
  // importing the one that cannot deliver a push notification.
  assert.equal(deps.firebase, undefined,
    'the web `firebase` package must not be a dependency of the native app');
  assert.ok(deps['@react-native-firebase/app'], 'the native Firebase SDK is required');
});

test('every shared module src/shared re-exports actually exists', () => {
  for (const file of ['geo.js', 'model.js', 'verification.js', 'janazah-guide-content.js']) {
    assert.ok(
      existsSync(resolve(repoRoot, 'public/js', file)),
      `public/js/${file} is missing`,
    );
  }
});
