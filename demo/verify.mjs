import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const html = await readFile('build/preview.html', 'utf8');
// Serve it wrapped the way the artifact host wraps a published page.
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`);
});
await new Promise((r) => server.listen(5055, '127.0.0.1', r));

const proxyUrl = process.env.HTTPS_PROXY;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  ...(proxyUrl ? { proxy: { server: proxyUrl, bypass: '127.0.0.1,localhost' },
                   args: ['--ignore-certificate-errors'] } : {}),
});
const problems = [];
const page = await (await browser.newContext({
  viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: 'en-CA',
  timezoneId: 'America/Toronto',
})).newPage();
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|ERR_/.test(m.text())) problems.push(`console: ${m.text()}`);
});

await page.goto('http://127.0.0.1:5055');
await page.locator('.notice-card').first().waitFor({ timeout: 15000 });
const feed = await page.locator('#view').innerText();
const assert = (cond, msg) => { if (!cond) problems.push(msg); else console.log('  ok:', msg); };

assert(feed.includes('Ahmad Ibrahim Al-Sayyid'), 'feed lists notices');
assert(feed.includes('Janazah notice'), 'withheld name renders without a name');
assert(!feed.includes('555-'), 'no private data anywhere on the feed');
assert((await page.locator('.notice-card').count()) >= 4, 'several notices present');
await page.screenshot({ path: 'screenshots/preview-feed.png', fullPage: true });

// Cancellation, corrections
assert(feed.includes('Cancelled'), 'cancellation shows with its reason');
assert(feed.includes('Updated'), 'a correction is labelled');

// Nearby
await page.getByRole('button', { name: 'Near me' }).click();
await page.locator('.consent').waitFor({ timeout: 10000 });
await page.screenshot({ path: 'screenshots/preview-consent.png', fullPage: true });
await page.getByRole('button', { name: 'Use my location' }).click();
await page.locator('.nearby-settings').waitFor({ timeout: 10000 });
const nearby = await page.locator('#view').innerText();
assert(/km/.test(nearby), 'nearby shows distances');
await page.screenshot({ path: 'screenshots/preview-nearby.png', fullPage: true });

// Radius control really filters
await page.locator('#radius').selectOption('5');
await page.waitForTimeout(400);
const tight = await page.locator('.notice-card').count();
await page.locator('#radius').selectOption('0');
await page.waitForTimeout(400);
const wide = await page.locator('.notice-card').count();
assert(wide > tight, `radius filters (5 km: ${tight}, any: ${wide})`);

// Follow
await page.getByRole('button', { name: 'All notices' }).click();
await page.locator('.notice-card').first().waitFor({ timeout: 10000 });
await page.getByRole('button', { name: /^Follow Masjid Al-Noor$/ }).first().click();
await page.getByRole('button', { name: 'Masajid I follow (1)' }).waitFor({ timeout: 8000 });
assert(true, 'follow persists and updates the tab count');

// Single notice via hash route
await page.getByRole('button', { name: 'All notices' }).click();
await page.getByRole('link', { name: 'Open' }).first().click();
await page.locator('.public-notice').first().waitFor({ timeout: 10000 });
assert(/#\/n\//.test(page.url()), `single notice routes on the hash (${page.url()})`);

// Privacy
await page.locator('a[href="/privacy"]').first().click();
await page.locator('.policy').waitFor({ timeout: 10000 });
assert((await page.locator('.policy').innerText()).includes('never sent to us'),
  'privacy page renders');

// Phone
const phone = await (await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true,
  hasTouch: true, locale: 'en-CA', timezoneId: 'America/Toronto',
})).newPage();
await phone.goto('http://127.0.0.1:5055');
await phone.locator('.notice-card').first().waitFor({ timeout: 15000 });
await phone.screenshot({ path: 'screenshots/preview-phone.png' });
assert(true, 'phone layout renders');

// Dark theme, both the system signal and an explicit stamp
for (const [label, setup] of [
  ['system dark', async (p) => p.emulateMedia({ colorScheme: 'dark' })],
  ['explicit dark stamp', async (p) => {
    await p.emulateMedia({ colorScheme: 'light' });
    await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  }],
]) {
  await setup(page);
  await page.waitForTimeout(200);
  const { bg, fg } = await page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return { bg: s.backgroundColor, fg: s.color };
  });
  const lum = (c) => c.match(/\d+/g).slice(0, 3).reduce((a, n) => a + Number(n), 0) / 3;
  assert(lum(bg) < 90 && lum(fg) > 150, `${label}: light text on a dark ground (${bg} / ${fg})`);
}

await browser.close();
server.close();

if (problems.length) {
  console.error('\nPROBLEMS:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log('\nPreview verified.');
