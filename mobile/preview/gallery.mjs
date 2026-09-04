// Section-by-section screenshots of the harness, small enough to share.
//
// preview/shoot.mjs takes one full-page shot per scheme, which is the right
// artefact to keep in the repo and far too large to send anywhere. This takes
// one file per named section at a lower pixel ratio.

import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? '/tmp/gallery';
await mkdir(out, { recursive: true });

const SHOTS = [
  ['01-splash',        'light', 'Splash',                    560],
  ['02-welcome',       'light', 'Welcome panel',             600],
  ['03-home-header',   'light', 'Home header',               260],
  ['04-home-next',     'light', 'Home, the next Janazah',    430],
  ['05-janazahs',      'light', 'Janazahs, a grouped list',  620],
  ['06-guide-link',    'light', 'The guide link',            180],
  ['07-tab-bar',       'light', 'The tab bar',               160],
  ['08-skeleton',      'light', 'Loading skeleton',          330],
  ['09-rows',          'light', 'Notice rows',               620],
  ['10-nearby',        'light', 'Nearby, before location is on', 700],
  ['11-time-panel',    'light', 'The time panel',            400],
  ['12-notice',        'light', 'Notice detail',             1250],
  ['13-cancelled',     'light', 'Notice detail, cancelled',  900],
  ['14-guide',         'light', 'Janazah guide',             900],
  ['15-states',        'light', 'States',                    780],
  ['16-home-dark',     'dark',  'Home, the next Janazah',    430],
  ['17-janazahs-dark', 'dark',  'Janazahs, a grouped list',  620],
  ['18-notice-dark',   'dark',  'Notice detail',             1250],
  ['19-tab-bar-dark',  'dark',  'The tab bar',               160],
  ['20-states-dark',   'dark',  'States',                    780],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: 411, height: 1400 },
    // Half the retina ratio of shoot.mjs: still crisp, a quarter the bytes.
    deviceScaleFactor: 1,
    colorScheme: scheme,
  });
  const page = await context.newPage();
  await page.goto(`file://${resolve(here, 'out/index.html')}`);
  await page.waitForSelector('#root > *');
  await page.waitForTimeout(800);

  for (const [file, want, title, height] of SHOTS) {
    if (want !== scheme) continue;
    const y = await page.evaluate((wanted) => {
      const label = [...document.querySelectorAll('*')]
        .find((el) => el.children.length === 0
          && el.textContent.trim() === wanted.toUpperCase());
      if (!label) throw new Error(`no section titled ${wanted}`);
      return Math.max(0, label.getBoundingClientRect().top + window.scrollY - 4);
    }, title);
    await page.screenshot({
      path: resolve(out, `${file}.png`),
      fullPage: true,
      clip: { x: 0, y, width: 411, height },
    });
    console.log(`${out}/${file}.png`);
  }
  await context.close();
}
await browser.close();
