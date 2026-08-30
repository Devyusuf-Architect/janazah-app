// Metro configuration.
//
// The one thing that is not default here is watchFolders. The pure logic
// modules this app shares with the web site live in ../public/js and are
// imported from src/shared/*. Metro will not resolve a file outside the
// project root unless it is watching the folder it lives in, so the
// repository root is added.
//
// Copying those modules into mobile/ instead would guarantee drift, and drift
// in geo.js means this app's idea of "near me" quietly stops matching the
// backend's idea of which topic a notice was published to.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [repoRoot];

// Resolve packages from this project's node_modules first.
//
// The repository root has its own node_modules for the web test suite
// (Playwright, firebase-tools, and the Firebase *web* SDK). None of it should
// end up in a native bundle, and in particular the web `firebase` package is
// a different thing from @react-native-firebase and must never be picked up
// in its place. Nothing here imports it, so pinning the search order is
// enough; test/metro.test.ts checks that the resolver still prefers this
// project and that the shared modules stay reachable.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
