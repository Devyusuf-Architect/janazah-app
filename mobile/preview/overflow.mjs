// Finds layout that does not survive a small phone.
//
// Renders the harness at three logical widths in both schemes and reports
// anything that runs past the right edge, or any single line of text being
// clipped by its own box.
//
// 320dp is the narrowest common Android width and it doubles as the large-text
// check: 130% text at 411dp occupies about the same space as 100% text at
// 316dp. Scaling the page with CSS zoom instead was tried and is useless,
// because every measurement comes back scaled and the whole document reports
// as overflowing.
//
// A CLIP line is not automatically a bug. A masjid name and a street on one
// line are deliberately truncated with an ellipsis; the full text is on the
// notice. What matters is that nothing reports OVER, and that no clipped line
// is one somebody has to read.
//
//   node preview/build.mjs && node preview/overflow.mjs

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

for (const width of [320, 360, 411]) {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width, height: 900 }, colorScheme: scheme,
    });
    const page = await context.newPage();
    await page.goto(`file://${resolve(here, 'out/index.html')}`);
    await page.waitForSelector('#root > *');
    await page.waitForTimeout(600);

    const found = await page.evaluate((w) => {
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        const box = el.getBoundingClientRect();
        if (box.width === 0) continue;
        const clipped = el.children.length === 0
          && el.scrollWidth > Math.ceil(box.width) + 1;
        const over = box.right > w + 1 || box.left < -1;
        if (!clipped && !over) continue;
        const text = (el.textContent || '').trim().slice(0, 46);
        if (text) out.push(`${over ? 'OVER' : 'CLIP'}  ${text}`);
      }
      return [...new Set(out)].slice(0, 15);
    }, width);

    console.log(`${width}dp ${scheme}: ${found.length ? `${found.length} flagged` : 'clean'}`);
    found.forEach((line) => console.log(`   ${line}`));
    await context.close();
  }
}

await browser.close();
