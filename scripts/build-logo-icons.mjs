// Rasterizes public/logo.svg to the PNG sizes the app actually references,
// so there is one drawn source for the mark rather than several hand-exported
// copies that can drift out of step with each other.
//
//   node scripts/build-logo-icons.mjs
//
// No image library needed: Playwright (already a dev dependency, for the
// tests) renders the SVG in a real browser and screenshots it, which is a
// correct, dependency-free rasterizer for a file this simple.

import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const SIZES = [
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },
  // The push-notification badge: same mark, just the smallest size in use.
  { file: 'public/badge.png', size: 96 },
];

const svg = await readFile('public/logo.svg', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

try {
  for (const { file, size } of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;padding:0}</style>` +
      `<div style="width:${size}px;height:${size}px">${svg}</div>`,
    );
    const element = await page.$('div');
    await element.screenshot({ path: file, omitBackground: true });
    await page.close();
    console.log(`wrote ${file} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
