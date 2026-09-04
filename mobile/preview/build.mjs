// Builds the design harness. See preview/entry.tsx for why it exists.
//
// esbuild rather than Metro, because this is a browser page and not the app:
// esbuild is already a dependency at the repository root, it aliases
// react-native to react-native-web in one line, and it finishes in under a
// second, which is what makes looking at a change worth doing.

import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'out');
await mkdir(out, { recursive: true });

await build({
  entryPoints: [resolve(here, 'entry.tsx')],
  bundle: true,
  outfile: resolve(out, 'bundle.js'),
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  loader: { '.js': 'jsx', '.png': 'dataurl', '.svg': 'dataurl' },
  define: { __DEV__: 'true', 'process.env.NODE_ENV': '"development"' },
  // Modules read process.env for build-time switches (the emulator toggle,
  // the Google client id). A browser has no process, and the harness has no
  // environment to read, so it gets an empty one rather than a crash.
  banner: { js: 'globalThis.process = globalThis.process || { env: {} };' },
  alias: {
    'react-native': 'react-native-web',
    // AsyncStorage is native-only. The harness has no preferences to store,
    // so it gets a stub rather than a polyfill.
    '@react-native-async-storage/async-storage': resolve(here, 'stubs/async-storage.js'),
    // The real package's web build still imports React Native's native
    // codegen internals, which esbuild cannot resolve. The harness gets a
    // three-primitive stub that renders browser SVG instead; the app uses
    // the real library.
    'react-native-svg': resolve(here, 'stubs/svg.js'),
    // The harness renders components, not a working app. The native Firebase
    // and Expo modules cannot be bundled for a browser, and nothing on this
    // page needs them to do anything: see stubs/firebase.js.
    '@react-native-firebase/app': resolve(here, 'stubs/firebase.js'),
    '@react-native-firebase/auth': resolve(here, 'stubs/firebase.js'),
    '@react-native-firebase/firestore': resolve(here, 'stubs/firebase.js'),
    '@react-native-firebase/messaging': resolve(here, 'stubs/firebase.js'),
    '@react-native-firebase/functions': resolve(here, 'stubs/firebase.js'),
    '@react-native-google-signin/google-signin': resolve(here, 'stubs/firebase.js'),
    'expo-constants': resolve(here, 'stubs/expo.js'),
    'expo-location': resolve(here, 'stubs/expo.js'),
    'expo-secure-store': resolve(here, 'stubs/expo.js'),
    'expo-notifications': resolve(here, 'stubs/expo.js'),
    'expo-router': resolve(here, 'stubs/expo.js'),
    'expo-status-bar': resolve(here, 'stubs/expo.js'),
    'expo-haptics': resolve(here, 'stubs/expo.js'),
    'react-native-reanimated': resolve(here, 'stubs/reanimated.js'),
    // Same problem as react-native-svg: the web build reaches into React
    // Native's codegen internals. A browser page has no notch either way.
    'react-native-safe-area-context': resolve(here, 'stubs/safe-area.js'),
  },
  logLevel: 'info',
});

await writeFile(resolve(out, 'index.html'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ta'ziyah design harness</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
  <style>
    /* The harness approximates the phone, it does not emulate it. Android
       renders the system sans and serif; Inter and Source Serif 4 are the
       closest widely available stand-ins and are what the web app uses. */
    html, body, #root { height: 100%; margin: 0; }
    body { font-family: Inter, system-ui, sans-serif; }
    [data-serif="true"], .serif { font-family: 'Source Serif 4', Georgia, serif; }
  </style>
</head>
<body><div id="root"></div><script src="./bundle.js"></script></body>
</html>
`);

console.log('preview/out/index.html');
