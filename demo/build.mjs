// Builds the standalone preview: one HTML file, no network, no backend.
//
// The point of doing it this way rather than mocking up screens is that every
// view, every style and every piece of formatting logic is the real thing.
// Only the data layer and the three browser capabilities a sandboxed frame
// cannot provide are swapped out, so the preview cannot flatter the product.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const app = (p) => resolve(root, 'public/js', p);

const STUBS = new Map([
  [app('firebase.js'), resolve(here, 'fake-firebase.js')],
  [app('store.js'), resolve(here, 'fake-store.js')],
  [app('push.js'), resolve(here, 'fake-push.js')],
  [app('location.js'), resolve(here, 'fake-location.js')],
]);

/** Redirect the four swapped modules wherever they are imported from. */
const swapPlugin = {
  name: 'preview-stubs',
  setup(b) {
    b.onResolve({ filter: /^firebase\// }, () => ({
      path: resolve(here, 'fake-firebase.js'),
    }));
    b.onResolve({ filter: /^\.{1,2}\// }, (args) => {
      // A stub importing the real module it replaces must not be sent back to
      // itself.
      if (args.importer.startsWith(here)) return null;
      const target = resolve(args.resolveDir, args.path);
      const swapped = STUBS.get(target);
      return swapped ? { path: swapped } : null;
    });
  },
};

const { outputFiles } = await build({
  entryPoints: [resolve(here, 'entry.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  plugins: [swapPlugin],
  logLevel: 'error',
});

const script = outputFiles[0].text;
const css = readFileSync(resolve(root, 'public/css/styles.css'), 'utf8');
const shell = readFileSync(resolve(here, 'shell.html'), 'utf8');

/**
 * The app is served on its own, where the only dark signal is the operating
 * system. A host that stamps data-theme on the root element has a third
 * state, an explicit dark choice on a light system, which the media query
 * alone will not catch. Re-emit the same tokens for it rather than
 * maintaining a second copy by hand, which would drift.
 */
function darkThemeStamp(stylesheet) {
  const start = stylesheet.indexOf('@media (prefers-color-scheme: dark)');
  if (start === -1) throw new Error('no dark block found in the stylesheet');
  const open = stylesheet.indexOf('{', stylesheet.indexOf(':root:not', start));
  let depth = 1;
  let i = open + 1;
  while (depth > 0 && i < stylesheet.length) {
    if (stylesheet[i] === '{') depth++;
    if (stylesheet[i] === '}') depth--;
    i++;
  }
  const declarations = stylesheet.slice(open + 1, i - 1);
  if (!declarations.includes('--bg')) throw new Error('dark block did not contain tokens');
  return `\n:root[data-theme="dark"] {\n  color-scheme: dark;${declarations}}\n`;
}

const page = shell
  .replace('/* STYLES */', () => css + darkThemeStamp(css))
  .replace('// SCRIPT', () => script);

mkdirSync(resolve(root, 'build'), { recursive: true });
const out = resolve(root, 'build/preview.html');
writeFileSync(out, page);
console.log(`${out}  ${(page.length / 1024).toFixed(0)} KB`);
