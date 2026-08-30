// The graphics Google Play asks for.
//
//   node scripts/store-graphics.mjs
//
// Produces:
//   store/feature-graphic.png   1024x500, required for every listing
//   store/screenshot-*.png      1080x1920 drafts
//
// The screenshots are rendered from the real components, in a browser, at
// phone dimensions. They are DRAFTS. Replace them with captures from a real
// device before submitting: these have no system status bar and no tab bar,
// and a reviewer comparing a screenshot to the installed app should see the
// same thing. They exist so the listing can be laid out and reviewed now
// rather than blocked on a device.
//
// Everything shown is the fictional sample data from public/js/sample-data.js,
// which tests/sample-data.test.js pins as visibly fictional. A screenshot of a
// funeral app must not show a real funeral.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'store');
await mkdir(out, { recursive: true });

const logo = await import('node:fs/promises')
  .then((fs) => fs.readFile(resolve(root, '../public/logo.svg'), 'utf8'));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

try {
  // ---- feature graphic ----------------------------------------------------
  //
  // 1024x500, shown at the top of the listing and cropped on some surfaces,
  // so nothing important goes near an edge. Deliberately plain: the mark, the
  // name, and one line. A feature graphic crowded with screenshots of itself
  // is the commonest way a listing looks cheap.
  const page = await browser.newPage({
    viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1,
  });
  await page.setContent(`
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,600&family=Inter:wght@400&display=swap');
      html, body { margin: 0; height: 100%; }
      body {
        background: #14503f;
        display: flex; align-items: center; justify-content: center;
        gap: 40px;
        font-family: Inter, system-ui, sans-serif;
      }
      .mark { width: 132px; height: 132px; }
      .mark svg { width: 100%; height: 100%; }
      .name {
        font-family: 'Source Serif 4', Georgia, serif;
        font-weight: 600; font-size: 82px; line-height: 1;
        color: #faf7f2; letter-spacing: -0.01em;
      }
      .line { font-size: 25px; color: #b9d3c8; margin-top: 14px; }
    </style>
    <div class="mark">${logo}</div>
    <div>
      <div class="name">Ta&rsquo;ziyah</div>
      <div class="line">Janazah notices from verified masjids</div>
    </div>
  `);
  // The web font has to have arrived before the screenshot, or the wordmark
  // is captured in a fallback face.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await writeFile(resolve(out, 'feature-graphic.png'), await page.screenshot());
  await page.close();
  console.log('store/feature-graphic.png  1024x500');

  // ---- screenshots --------------------------------------------------------
  //
  // Anchored on the harness's own sections, so these stay correct as the
  // components change rather than becoming a picture of an older app.
  const SHOTS = [
    { file: 'screenshot-1-notices.png', anchor: 'NOTICE ROWS' },
    { file: 'screenshot-2-notice.png', anchor: 'NOTICE DETAIL' },
    { file: 'screenshot-3-nearby.png', anchor: 'NEARBY, BEFORE LOCATION IS ON' },
    { file: 'screenshot-4-guide.png', anchor: 'JANAZAH GUIDE' },
  ];

  const harness = resolve(root, 'preview/out/index.html');
  for (const shot of SHOTS) {
    // 1080x1920 at scale 3 is a 360dp logical width, the narrow end of common
    // Android phones, which is the honest width to show a listing at.
    const context = await browser.newContext({
      viewport: { width: 360, height: 640 }, deviceScaleFactor: 3,
    });
    const tab = await context.newPage();
    await tab.goto(`file://${harness}`);
    await tab.waitForSelector('#root > *', { timeout: 20000 });
    await tab.waitForTimeout(500);
    await tab.locator(`text=${shot.anchor}`).first().scrollIntoViewIfNeeded();
    await tab.waitForTimeout(300);
    await writeFile(resolve(out, shot.file), await tab.screenshot());
    await context.close();
    console.log(`store/${shot.file}  1080x1920`);
  }
} finally {
  await browser.close();
}

console.log(`
These screenshots are DRAFTS rendered in a browser. Replace them with captures
from a real device before submitting; they have no status bar and no tab bar.
Build the harness first if it is stale: node preview/build.mjs
`.trim());
