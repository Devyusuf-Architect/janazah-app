// Android launcher, notification and splash images, rasterized from the one
// drawn source: public/logo.svg.
//
// Same approach as scripts/build-logo-icons.mjs at the repository root, and
// for the same reason: Playwright is already a dev dependency there, it
// renders SVG correctly, and this avoids adding an image library for a job
// that happens a handful of times a year.
//
//   node mobile/scripts/build-android-icons.mjs
//
// The images are not one picture at several sizes:
//
//   icon-foreground   Adaptive icon foreground. Android masks this to
//                     whatever shape the launcher uses and animates it, so
//                     the mark sits inside the safe zone with the rest
//                     transparent. Anything outside gets clipped on a round
//                     launcher.
//   icon-monochrome   Themed icons (Android 13 and later). One colour on
//                     transparent; the system recolours it, so nothing about
//                     the green survives here, by design.
//   notification-icon Status bar. Android draws it as a silhouette: every
//                     non-transparent pixel becomes the accent colour, so a
//                     full-colour version would appear as a solid blob.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const out = resolve(here, '../assets');

const svg = await readFile(resolve(repoRoot, 'public/logo.svg'), 'utf8');

/**
 * The mark as a single-colour silhouette.
 *
 * A CSS filter cannot do this. The mark is a cream masjid on a filled green
 * disc, so flattening every visible pixel to one colour produces a solid
 * circle and loses the masjid entirely. The disc has to come off first, which
 * means editing the SVG rather than filtering the result.
 *
 * Android needs exactly this for two images: the themed (monochrome) icon
 * layer, which the system recolours, and the status bar icon, which the
 * system draws as a silhouette whatever colours it is given.
 */
const silhouette = (svg) => svg
  // Every green element goes, not only the background disc. The green is
  // only ever used for the ground behind the mark and for one detail line
  // drawn on top of the cream hand; in a silhouette that line has no cream
  // to sit against and would read as a stray stroke across the shape.
  .replace(/<(circle|path)\b[^>]*#14503f[^>]*\/>/g, '')
  .replace(/#faf7f2/g, '#ffffff');

const html = (svg, size, inset) => {
  const box = Math.round(size * (1 - inset * 2));
  return `<style>
      html,body{margin:0;padding:0;background:transparent}
      .frame{width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center}
      .mark{width:${box}px;height:${box}px}
      .mark svg{width:100%;height:100%}
    </style>
    <div class="frame"><div class="mark">${svg}</div></div>`;
};

const IMAGES = [
  // 432 is the standard authoring size for an adaptive icon layer, and 0.17
  // keeps the mark inside the safe zone every launcher shape respects.
  { file: 'icon-foreground.png', size: 432, inset: 0.17, flatten: false },
  { file: 'icon-monochrome.png', size: 432, inset: 0.17, flatten: true },
  { file: 'notification-icon.png', size: 96, inset: 0.1, flatten: true },
  { file: 'splash-icon.png', size: 320, inset: 0.1, flatten: false },
  { file: 'icon.png', size: 512, inset: 0.12, flatten: false },
];

await mkdir(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  for (const { file, size, inset, flatten } of IMAGES) {
    const tab = await browser.newPage({ viewport: { width: size, height: size } });
    await tab.setContent(html(flatten ? silhouette(svg) : svg, size, inset));
    await writeFile(resolve(out, file), await tab.screenshot({ omitBackground: true }));
    await tab.close();
    console.log(`${file}  ${size}x${size}`);
  }
} finally {
  await browser.close();
}
