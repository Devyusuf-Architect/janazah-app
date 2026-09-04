// Screenshots one region of the harness. Throwaway: used while working on a
// single section rather than as part of the checked-in shots.
import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
// Either a y/height in page pixels, or a section title to scroll to:
//   node preview/crop.mjs light 1200 900
//   node preview/crop.mjs light "The time panel" 700
const [scheme = 'light', where = '0', h = '900'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const c = await b.newContext({ viewport:{width:411,height:1400}, deviceScaleFactor:2, colorScheme: scheme });
const p = await c.newPage();
await p.goto(`file://${resolve(here,'out/index.html')}`);
await p.waitForSelector('#root > *');
await p.waitForTimeout(700);

let y = Number(where);
if (Number.isNaN(y)) {
  y = await p.evaluate((title) => {
    const label = [...document.querySelectorAll('*')]
      .find((el) => el.children.length === 0
        && el.textContent.trim() === title.toUpperCase());
    if (!label) throw new Error(`no section titled ${title}`);
    return Math.max(0, label.getBoundingClientRect().top + window.scrollY - 8);
  }, where);
}
// The clip is in page coordinates, so the shot has to be a full-page one.
await p.screenshot({ path:`/tmp/crop-${scheme}.png`, fullPage: true, clip:{x:0,y,width:411,height:Number(h)} });
await b.close();
console.log(`/tmp/crop-${scheme}.png`);
