// Builds a copy of public/ that serves the Firebase SDK locally instead of
// from the CDN, so the end-to-end test can run in a sandbox with no outbound
// network access. Production keeps the CDN import map in public/index.html.

import { mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

const OUT = '.test-serve';
const SERVICES = { app: 'firebase/app', auth: 'firebase/auth', firestore: 'firebase/firestore' };

export async function buildTestApp() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'vendor'), { recursive: true });
  cpSync('public', OUT, { recursive: true });

  // One esbuild run with splitting, so all three entry points share a single
  // copy of the Firebase app registry. Bundling them separately gives each its
  // own registry and auth then fails with "Component auth has not been
  // registered yet".
  const entryDir = join(OUT, '.entries');
  mkdirSync(entryDir, { recursive: true });
  const entryPoints = Object.entries(SERVICES).map(([svc, bare]) => {
    const file = join(entryDir, `firebase-${svc}.js`);
    writeFileSync(file, `export * from '${bare}';\n`);
    return file;
  });

  await build({
    entryPoints,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    outdir: join(OUT, 'vendor'),
    logLevel: 'error',
  });
  rmSync(entryDir, { recursive: true, force: true });

  const indexPath = join(OUT, 'index.html');
  const html = readFileSync(indexPath, 'utf8').replace(
    /<script type="importmap">[\s\S]*?<\/script>/,
    `<script type="importmap">
  {
    "imports": {
      "firebase/app": "/vendor/firebase-app.js",
      "firebase/auth": "/vendor/firebase-auth.js",
      "firebase/firestore": "/vendor/firebase-firestore.js"
    }
  }
  </script>`);
  writeFileSync(indexPath, html);
  return OUT;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildTestApp();
  console.log(`Built ${OUT}`);
}
