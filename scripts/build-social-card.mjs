// Draws public/social-card.png, the image shown when a link to this site is
// shared.
//
//   node scripts/build-social-card.mjs
//
// Same approach as build-logo-icons.mjs: Playwright is already a dev
// dependency, so a real browser lays the card out and screenshots it rather
// than this repository taking on an image library to draw one picture.
//
// What is on it is deliberately plain. This image appears beside links to
// funeral notices in group chats, so it is the mark, the name, and one line
// saying what the site is. No photograph, no Janazah, nothing decorative.

import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

import { SITE } from '../public/js/site.js';

// The size every platform crops from: 1200x630 is the ratio Facebook,
// WhatsApp, LinkedIn and X all expect.
const WIDTH = 1200;
const HEIGHT = 630;
const OUT = 'public/social-card.png';

const svg = await readFile('public/logo.svg', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });

  // The site's own tokens, written out rather than imported: this renders in
  // a blank page with no stylesheet, and a card that silently fell back to
  // Times on a machine without the webfont would ship looking broken.
  await page.setContent(`
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,600&display=swap">
    <style>
      html, body { margin: 0; padding: 0; }
      body {
        width: ${WIDTH}px; height: ${HEIGHT}px;
        background: #faf7f2;
        color: #16201c;
        font-family: 'Inter', system-ui, sans-serif;
        display: flex; flex-direction: column; justify-content: center;
        padding: 0 88px;
        box-sizing: border-box;
        position: relative;
      }
      /* A single hairline in the accent, so the card is not a plain
         rectangle of cream in a dark chat window. */
      .rule { position: absolute; top: 0; left: 0; right: 0; height: 10px; background: #14503f; }
      .brand { display: flex; align-items: center; gap: 18px; margin-bottom: 40px; }
      .brand svg { width: 64px; height: 64px; display: block; }
      .brand span {
        font-family: 'Source Serif 4', Georgia, serif;
        font-weight: 600; font-size: 44px; letter-spacing: -0.02em;
      }
      h1 {
        font-family: 'Source Serif 4', Georgia, serif;
        font-weight: 600; font-size: 62px; line-height: 1.12;
        letter-spacing: -0.03em; margin: 0 0 26px; max-width: 900px;
      }
      p { margin: 0; font-size: 27px; line-height: 1.45; color: #40504a; max-width: 820px; }
    </style>
    <div class="rule"></div>
    <div class="brand">${svg}<span>${SITE.name}</span></div>
    <h1>Janazah notices from verified masjids</h1>
    <p>Published directly by the masjid or funeral coordinator, to people
       close enough to attend. No account needed to read them.</p>
  `);

  // Webfonts load over the network; screenshotting before they arrive gives
  // a card set in the fallback stack.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT });
  console.log(`Wrote ${OUT} (${WIDTH}x${HEIGHT})`);
} finally {
  await browser.close();
}
