// Screenshots the design harness at phone width, in both schemes, and at a
// large font size.
//
// The large-text pass is not decoration. This app's readers skew older, the
// system font size is often turned up, and a layout that only works at 100%
// is a layout that fails exactly the people it was built for.
//
//   node preview/build.mjs && node preview/shoot.mjs

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'shots');
await mkdir(out, { recursive: true });

const PASSES = [
  { name: 'light', scheme: 'light', fontScale: 1 },
  { name: 'dark', scheme: 'dark', fontScale: 1 },
  // 130%, which is two steps up in Android's display settings.
  { name: 'light-large-text', scheme: 'light', fontScale: 1.3 },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  for (const pass of PASSES) {
    const context = await browser.newContext({
      // A Pixel-ish viewport. The width is what matters: 411dp is the most
      // common Android logical width and the tightest common case for the
      // row layouts.
      viewport: { width: 411, height: 1400 },
      deviceScaleFactor: 2,
      colorScheme: pass.scheme,
    });
    const page = await context.newPage();
    if (pass.fontScale !== 1) {
      await page.addInitScript((scale) => {
        // react-native-web sizes in px, so scaling the root font size does
        // not move it. Zooming the whole page is the closest approximation of
        // Android's font scale that a browser offers.
        document.addEventListener('DOMContentLoaded', () => {
          document.body.style.zoom = String(scale);
        });
      }, pass.fontScale);
    }
    await page.goto(`file://${resolve(here, 'out/index.html')}`);
    await page.waitForSelector('#root > *');
    await page.waitForTimeout(400);
    await page.screenshot({
      path: resolve(out, `${pass.name}.png`),
      fullPage: true,
    });
    console.log(`preview/shots/${pass.name}.png`);
    await context.close();
  }
} finally {
  await browser.close();
}
