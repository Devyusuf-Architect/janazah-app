// Boots the app against local emulators, seeds a realistic set of notices, and
// captures each screen. Development tool: nothing here ships.
//
//   npm run screenshots

import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { buildTestApp } from '../tests/build-test-app.mjs';

const BASE = 'http://127.0.0.1:5000';
const PROJECT = 'demo-janazah';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const OUT = 'screenshots';
const ZONE = 'America/Toronto';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

function serve(root, port) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(req.url.split('?')[0]));
    const page = /^\/console(\/|$)/.test(path) ? 'console.html' : 'index.html';
    // Read before writing the head: otherwise a miss sends headers and then
    // the fallback tries to send them again.
    const send = async (file, type) => {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': type });
      res.end(body);
    };
    try {
      if (path === '/' || !extname(path)) throw new Error('route');
      await send(join(root, path), MIME[extname(path)] || 'application/octet-stream');
    } catch {
      try { await send(join(root, page), 'text/html'); }
      catch { res.writeHead(404).end('not found'); }
    }
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

/**
 * A datetime-local value at a real prayer-ish hour, `dayOffset` days from
 * today in the notice's own zone. Seeding relative to the clock produced
 * Janazahs at 12:50 in the morning, which is not what anyone would see.
 */
function localInput(dayOffset, time) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(Date.now() + dayOffset * 86_400_000))
    .reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${time}`;
}

async function uidFor(email) {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`,
    { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: '{}' });
  const { userInfo = [] } = await res.json();
  return userInfo.find((u) => u.email === email)?.localId;
}

async function grantAdmin(uid, email) {
  await fetch(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/admins/${uid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: { email: { stringValue: email } } }),
  });
}

const shots = [];
async function shot(page, name, { full = false } = {}) {
  const path = join(OUT, `${name}.png`);
  // Let any toast fade, so it does not sit on top of what is being captured.
  await page.locator('#toast.is-visible').waitFor({ state: 'hidden', timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path, fullPage: full });
  shots.push(path);
  console.log('  captured', path);
}

async function signUp(page, email, password, name) {
  await page.goto(`${BASE}/console`);
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.locator('#displayName').fill(name);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.locator('#nav').waitFor({ state: 'visible', timeout: 20000 });
}

async function registerOrg(page, org) {
  await page.getByRole('button', { name: 'Organizations' }).click();
  await page.getByRole('button', { name: 'Register an organization' }).first().click();
  await page.locator('#name').fill(org.name);
  await page.locator('#address').fill(org.address);
  await page.locator('#city').fill(org.city);
  await page.locator('#province').fill('ON');
  await page.locator('#postalCode').fill(org.postal);
  await page.locator('#lat').fill(String(org.lat));
  await page.locator('#lng').fill(String(org.lng));
  await page.locator('#contactEmail').fill(org.email);
  await page.getByRole('button', { name: 'Submit for verification' }).click();
  await page.getByText(org.name).first().waitFor({ timeout: 20000 });
}

async function publish(page, orgName, n, { screenshotPreview = false } = {}) {
  await page.getByRole('button', { name: 'Notices' }).click();
  await page.locator('#org-picker').selectOption({ label: orgName });
  await page.getByRole('button', { name: 'New notice' }).click();

  if (n.name) {
    await page.locator('#deceasedName').fill(n.name);
    await page.locator('input[name="showDeceasedName"]').check();
  }
  await page.locator('#janazahAt').fill(n.at);
  await page.locator('#timeZone').selectOption(ZONE);
  if (n.label) await page.locator('#timeLabel').fill(n.label);
  await page.locator('#prayerName').fill(n.prayerName);
  await page.locator('#prayerAddress').fill(n.prayerAddress);
  await page.locator('#prayerLat').fill(String(n.lat));
  await page.locator('#prayerLng').fill(String(n.lng));
  if (n.burialName) {
    await page.locator('#burialName').fill(n.burialName);
    await page.locator('#burialAddress').fill(n.burialAddress);
  }
  if (n.instructions) await page.locator('#instructions').fill(n.instructions);
  if (n.familyName) await page.locator('#familyContactName').fill(n.familyName);
  if (n.familyPhone) await page.locator('#familyContactPhone').fill(n.familyPhone);
  if (n.internal) await page.locator('#internalNotes').fill(n.internal);

  if (screenshotPreview) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, '06-console-composer', { full: true });
  }

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.locator('.modal .public-notice').waitFor({ timeout: 20000 });
  if (screenshotPreview) await shot(page, '07-console-publish-preview');
  await page.locator('#confirm-check').check();
  await page.getByRole('button', { name: 'Publish now' }).click();
  // The notices screen re-renders with the picker back on its first option, so
  // reselect before checking that the notice landed.
  await page.locator('#org-picker').waitFor({ timeout: 20000 });
  await page.locator('#org-picker').selectOption({ label: orgName });
  await page.locator('.notice-card--published').first().waitFor({ timeout: 20000 });
}

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const root = await buildTestApp();
  const server = await serve(root, 5000);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

  const context = (opts = {}) => browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    locale: 'en-CA',
    timezoneId: ZONE,
    ...opts,
  });

  try {
    const coord = await (await context()).newPage();
    const admin = await (await context()).newPage();

    console.log('seeding…');
    await signUp(coord, 'coordinator@example.com', 'demo-password-1', 'Bilal Haddad');
    await registerOrg(coord, {
      name: 'Masjid Al-Noor', address: '480 Danforth Avenue', city: 'Toronto',
      postal: 'M4K 1P6', lat: 43.6772, lng: -79.3480, email: 'office@alnoor.example',
    });
    await shot(coord, '05-console-organization-pending', { full: true });

    await registerOrg(coord, {
      name: 'Islamic Centre of Mississauga', address: '2550 Dundas Street West',
      city: 'Mississauga', postal: 'L5K 2L3', lat: 43.5601, lng: -79.6444,
      email: 'info@icm.example',
    });

    await signUp(admin, 'admin@example.com', 'demo-password-2', 'Platform Admin');
    await grantAdmin(await uidFor('admin@example.com'), 'admin@example.com');
    await admin.reload();
    await admin.getByRole('button', { name: 'Admin' }).click();
    await admin.locator('.card').first().waitFor({ timeout: 20000 });
    await shot(admin, '08-admin-verification-queue', { full: true });

    for (const _ of [0, 1]) {
      await admin.getByRole('button', { name: 'Verify' }).first().click();
      await admin.locator('#reason-input').fill('Confirmed by phone with the masjid office.');
      await admin.getByRole('button', { name: 'Verify', exact: true }).last().click();
      await admin.waitForTimeout(1200);
    }
    console.log('  organizations verified');

    await coord.reload();
    await publish(coord, 'Masjid Al-Noor', {
      name: 'Ahmad Ibrahim Al-Sayyid',
      at: localInput(1, '13:30'), label: 'After Dhuhr',
      prayerName: 'Masjid Al-Noor, main prayer hall',
      prayerAddress: '480 Danforth Avenue, Toronto',
      lat: 43.6772, lng: -79.3480,
      burialName: 'Meadowvale Cemetery',
      burialAddress: '7732 Mavis Road, Brampton',
      instructions: 'Please arrive ten minutes early. Parking is available behind the '
        + 'building and on the side street. The burial follows immediately after the prayer.',
      familyName: 'Yusuf Al-Sayyid', familyPhone: '416-555-0142',
      internal: 'Family has asked that no photographs be taken.',
    }, { screenshotPreview: true });

    await publish(coord, 'Masjid Al-Noor', {
      at: localInput(1, '18:15'),
      prayerName: 'Masjid Al-Noor, main prayer hall',
      prayerAddress: '480 Danforth Avenue, Toronto',
      lat: 43.6772, lng: -79.3480,
      instructions: 'The family has asked that the name not be shared publicly.',
    });

    await publish(coord, 'Islamic Centre of Mississauga', {
      name: 'Fatima Yusuf',
      at: localInput(2, '11:00'),
      prayerName: 'Islamic Centre of Mississauga',
      prayerAddress: '2550 Dundas Street West, Mississauga',
      lat: 43.5601, lng: -79.6444,
      burialName: 'Islamic Cemetery of Mississauga',
      burialAddress: '1201 Britannia Road West, Mississauga',
    });

    await coord.getByRole('button', { name: 'Notices' }).click();
    await coord.locator('.notice-card').first().waitFor({ timeout: 20000 });
    await shot(coord, '09-console-notices', { full: true });

    // --- the community side -------------------------------------------------
    console.log('capturing the feed…');
    const visitor = await (await context({
      permissions: ['geolocation', 'notifications'],
      geolocation: { latitude: 43.6602, longitude: -79.3820 },
    })).newPage();

    await visitor.goto(BASE);
    await visitor.locator('.notice-card').first().waitFor({ timeout: 20000 });
    await shot(visitor, '01-feed', { full: true });

    await visitor.getByRole('button', { name: 'Near me' }).click();
    await visitor.locator('.consent').waitFor({ timeout: 20000 });
    await shot(visitor, '02-nearby-consent', { full: true });

    await visitor.getByRole('button', { name: 'Use my location' }).click();
    await visitor.locator('.nearby-settings').waitFor({ timeout: 20000 });
    await shot(visitor, '03-nearby-results', { full: true });

    await visitor.getByRole('button', { name: 'All notices' }).click();
    await visitor.getByRole('link', { name: 'Open' }).first().click();
    await visitor.locator('.public-notice').first().waitFor({ timeout: 20000 });
    await shot(visitor, '04-single-notice', { full: true });

    await visitor.goto(`${BASE}/privacy`);
    await visitor.locator('.policy').waitFor({ timeout: 20000 });
    await shot(visitor, '11-privacy', { full: true });

    // --- audit trail --------------------------------------------------------
    await admin.getByRole('button', { name: 'Audit log' }).click();
    await admin.locator('.table').waitFor({ timeout: 20000 });
    await shot(admin, '10-admin-audit-log', { full: true });

    // --- phone ---------------------------------------------------------------
    const phone = await (await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
      isMobile: true, hasTouch: true, locale: 'en-CA', timezoneId: ZONE,
    })).newPage();
    await phone.goto(BASE);
    await phone.locator('.notice-card').first().waitFor({ timeout: 20000 });
    await shot(phone, '12-feed-phone', { full: true });

    console.log(`\n${shots.length} screenshots in ${OUT}/`);
  } finally {
    await browser.close();
    server.close();
  }
};

run().catch((err) => { console.error(err); process.exit(1); });
