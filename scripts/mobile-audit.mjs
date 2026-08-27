// One-off mobile audit tool. Not shipped, not part of npm test. Boots the app
// against local emulators, seeds a little data, and screenshots the pages
// listed in the task at 375px (phone), 768px (tablet) and 1280px (desktop).
//
//   firebase emulators:exec --only auth,firestore,functions --project demo-janazah \
//     "node scripts/mobile-audit.mjs"

import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { buildTestApp } from '../tests/build-test-app.mjs';

const BASE = 'http://127.0.0.1:5000';
const PROJECT = 'demo-janazah';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const OUT = 'screenshots/mobile-audit';
const ZONE = 'America/Toronto';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

function serve(root, port) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(req.url.split('?')[0]));
    const page = /^\/console(\/|$)/.test(path) ? 'console.html' : 'index.html';
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

async function stubGeocoder(page) {
  await page.route('**/photon.komoot.io/api/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-79.3832, 43.6532] },
          properties: {
            housenumber: '480', street: 'Danforth Avenue', city: 'Toronto',
            state: 'ON', postcode: 'M4K 1P6', country: 'Canada',
          },
        }],
      }),
    });
  });
}

async function pickPlace(page, prefix, name, query) {
  await page.locator(`#${prefix}Name`).fill(name);
  await page.locator(`#${prefix}Search`).fill(query);
  await page.locator(`#${prefix}-results .address-result`).first().click({ timeout: 10000 });
  await page.locator(`#${prefix}-results`).waitFor({ state: 'hidden', timeout: 5000 });
}

let n = 0;
async function shot(page, name) {
  n += 1;
  const path = join(OUT, `${String(n).padStart(2, '0')}-${name}.png`);
  await page.locator('#toast.is-visible').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(350);
  await page.screenshot({ path });
  console.log('  captured', path);
}

async function signUp(page, email, password, name, opts = {}) {
  await page.goto(`${BASE}/console${opts.start ? `?start=${opts.start}` : ''}`);
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.locator('#displayName').fill(name);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.locator('#nav').waitFor({ state: 'visible', timeout: 20000 });
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/console`);
  await page.locator('#email').waitFor({ timeout: 15000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // Not state:'visible' — below the drawer breakpoint #nav is legitimately
  // off-canvas (visibility:hidden) until the hamburger opens it, so "signed
  // in" is "the nav exists with real items in it", not "is on screen".
  await page.locator('#nav .nav-item').first().waitFor({ state: 'attached', timeout: 15000 });
}

async function registerOrg(page, orgName) {
  await stubGeocoder(page);
  await page.getByRole('button', { name: 'Organizations' }).click();
  await page.getByRole('button', { name: 'Register an organization' }).first().click();
  await page.locator('#name').waitFor({ timeout: 10000 });
  await page.locator('#name').fill(orgName);
  await page.locator('#countryCode').selectOption('CA');
  await page.locator('#province').selectOption('Ontario');
  await page.locator('#addressSearch').fill('480 Danforth Avenue');
  await page.locator('.address-result').first().click();
  await page.locator('.address-chosen').waitFor({ timeout: 5000 });
  await page.locator('#phone').fill('+1 416 555 0100');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#applicantName').waitFor({ timeout: 5000 });
  await page.locator('#applicantName').fill('Bilal Haddad');
  await page.locator('#applicantRole').selectOption('imam');
  await page.locator('#workEmail').fill('imam@example.com');
  await page.locator('#roleExplanation').fill('I lead prayers and arrange Janazah here.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#authorized').waitFor({ timeout: 5000 });
  await page.locator('#m-work_email').check();
  await page.locator('#authorized').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('.review-summary').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Submit for verification' }).click();
  await page.locator('.verify-state').waitFor({ timeout: 15000 });
}

async function publish(page, orgName, nObj) {
  await page.getByRole('button', { name: 'Notices' }).click();
  await page.getByRole('button', { name: 'New notice' }).click();
  if (nObj.name) {
    await page.locator('#deceasedName').fill(nObj.name);
    await page.locator('input[name="showDeceasedName"]').check();
  }
  await page.locator('#janazahAt').fill(nObj.at);
  await stubGeocoder(page);
  await pickPlace(page, 'prayer', nObj.prayerName, nObj.prayerQuery);
  if (nObj.instructions) await page.locator('#instructions').fill(nObj.instructions);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.locator('.modal .public-notice').waitFor({ timeout: 20000 });
  await page.locator('#confirm-check').check();
  await page.getByRole('button', { name: 'Publish now' }).click();
  await page.locator('.notice-card--published').first().waitFor({ timeout: 20000 });
}

function localInput(dayOffset, time) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(Date.now() + dayOffset * 86_400_000))
    .reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${time}`;
}

const VIEWPORTS = process.env.AUDIT_VIEWPORTS === 'full'
  ? {
    phoneSmall: { width: 360, height: 740 },
    phone: { width: 390, height: 844 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1280, height: 900 },
  }
  : {
    phone: { width: 375, height: 812 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1280, height: 900 },
  };

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const root = await buildTestApp();
  const server = await serve(root, 5000);
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    ...(proxyUrl
      ? { proxy: { server: proxyUrl, bypass: '127.0.0.1,localhost' }, args: ['--ignore-certificate-errors'] }
      : {}),
  });

  const ctx = (vp, opts = {}) => browser.newContext({
    viewport: vp, deviceScaleFactor: 2, locale: 'en-CA', timezoneId: ZONE, ...opts,
  });

  try {
    // --- seed with a desktop-sized session ---
    const setup = await (await ctx(VIEWPORTS.desktop)).newPage();
    await signUp(setup, 'coordinator@example.com', 'demo-password-1', 'Bilal Haddad');
    await registerOrg(setup, 'Masjid Al-Noor of Greater Toronto Metropolitan Area');

    const setupAdmin = await (await ctx(VIEWPORTS.desktop)).newPage();
    await signUp(setupAdmin, 'admin@example.com', 'demo-password-2', 'Platform Admin');
    await grantAdmin(await uidFor('admin@example.com'), 'admin@example.com');
    await setupAdmin.reload();
    await setupAdmin.getByRole('button', { name: 'Admin' }).click();
    await setupAdmin.locator('.card, .table').first().waitFor({ timeout: 20000 });
    await setupAdmin.getByRole('button', { name: 'Approve' }).first().click();
    await setupAdmin.locator('#reason-input').fill('Confirmed by phone.');
    await setupAdmin.getByRole('button', { name: 'Approve', exact: true }).last().click();
    await setupAdmin.waitForTimeout(1200);

    await setup.reload();
    await publish(setup, 'Masjid Al-Noor', {
      name: 'Ahmad Ibrahim Al-Sayyid-Rahman-Abdullah-Muhammad',
      at: localInput(1, '13:30'),
      prayerName: 'Masjid Al-Noor, main prayer hall, second floor overflow area',
      prayerQuery: '480 Danforth Avenue',
      instructions: 'Please arrive ten minutes early. Parking is available behind the '
        + 'building and on the side street. The burial follows immediately after the prayer.',
    });
    console.log('seeded');

    for (const [tag, vp] of Object.entries(VIEWPORTS)) {
      console.log(`\n=== ${tag} (${vp.width}x${vp.height}) ===`);

      const visitor = await (await ctx(vp)).newPage();
      await visitor.goto(BASE);
      await visitor.locator('.notice-card, .jrow, .empty').first().waitFor({ timeout: 20000 });
      await shot(visitor, `${tag}-home`);

      if (vp.width < 900) {
        const toggle = visitor.locator('#nav-toggle');
        if (await toggle.count()) {
          await toggle.click();
          await visitor.locator('.sidenav.is-open').waitFor({ timeout: 5000 });
          await shot(visitor, `${tag}-nav-drawer`);
          // The drawer covers the toggle itself (same top-left corner, by
          // design); its own Close row is the reachable control.
          await visitor.locator('.sidenav__close').click();
          await visitor.waitForTimeout(300);
        }
      }

      await visitor.goto(`${BASE}/janazahs`);
      await visitor.locator('.notice-card, .empty').first().waitFor({ timeout: 20000 });
      await shot(visitor, `${tag}-janazahs`);

      await visitor.goto(`${BASE}/masjids`);
      await visitor.locator('.list-row, .empty').first().waitFor({ timeout: 20000 });
      await shot(visitor, `${tag}-masjids`);

      const masjidLink = visitor.getByRole('link', { name: /Masjid Al-Noor/ }).first();
      if (await masjidLink.count()) {
        await masjidLink.click();
        await visitor.locator('h1').first().waitFor({ timeout: 20000 });
        await shot(visitor, `${tag}-masjid-page`);
      }

      await visitor.goto(`${BASE}/near-me`);
      await visitor.locator('.consent, .nearby-settings').first().waitFor({ timeout: 20000 });
      await shot(visitor, `${tag}-near-me`);

      await visitor.goto(`${BASE}/following`);
      await visitor.waitForTimeout(600);
      await shot(visitor, `${tag}-following`);

      await visitor.goto(`${BASE}/janazah-guide`);
      await visitor.locator('.guide-head').first().waitFor({ timeout: 20000 });
      await shot(visitor, `${tag}-guide`);

      await visitor.goto(`${BASE}/signin`);
      await visitor.locator('form, .card--narrow').first().waitFor({ timeout: 20000 });
      await shot(visitor, `${tag}-signin`);

      await visitor.goto(`${BASE}/register-masjid`);
      await visitor.locator('.stepper, form, h1').first().waitFor({ timeout: 20000 });
      await shot(visitor, `${tag}-register-masjid`);

      await visitor.goto(`${BASE}/janazahs`);
      const notice = visitor.locator('a[href^="/n/"], .jrow__main').first();
      if (await notice.count()) {
        await notice.click();
        await visitor.locator('.public-notice').first().waitFor({ timeout: 20000 });
        await shot(visitor, `${tag}-notice-detail`);
      }
      await visitor.close();

      // Below the drawer breakpoint, console nav items are off-canvas until
      // the hamburger opens them: open it before clicking one, same as a
      // real visitor would have to.
      const openConsoleDrawer = async (page) => {
        if (vp.width >= 900) return;
        await page.locator('#console-nav-toggle').click();
        await page.locator('#nav.is-open').waitFor({ timeout: 5000 });
      };

      // signed-in coordinator console
      const coord = await (await ctx(vp)).newPage();
      await signIn(coord, 'coordinator@example.com', 'demo-password-1');
      await shot(coord, `${tag}-console-notices`);

      if (vp.width < 900) {
        await openConsoleDrawer(coord);
        await shot(coord, `${tag}-console-nav-open`);
        await coord.locator('#nav .sidenav__close').click();
        await coord.waitForTimeout(300);
      }

      await openConsoleDrawer(coord);
      await coord.getByRole('button', { name: 'Account' }).click();
      await coord.waitForTimeout(400);
      await shot(coord, `${tag}-console-account`);

      await openConsoleDrawer(coord);
      await coord.getByRole('button', { name: 'Organizations' }).click();
      await coord.waitForTimeout(400);
      await shot(coord, `${tag}-console-organizations`);
      await coord.close();

      // admin
      const admin = await (await ctx(vp)).newPage();
      await signIn(admin, 'admin@example.com', 'demo-password-2');
      if (vp.width < 900) {
        await admin.locator('#console-nav-toggle').click();
        await admin.locator('#nav.is-open').waitFor({ timeout: 5000 });
      }
      await admin.getByRole('button', { name: 'Admin' }).click();
      await admin.locator('.tabs').first().waitFor({ timeout: 20000 });
      await shot(admin, `${tag}-admin-portal`);

      // The seeded org was already approved, so the default queue tab is
      // empty; "Verified masjids" is where the real content is.
      await admin.getByRole('button', { name: 'Verified masjids' }).click();
      await admin.locator('.card, .empty').first().waitFor({ timeout: 20000 });
      await shot(admin, `${tag}-admin-verified`);

      await admin.getByRole('button', { name: 'Audit log' }).click();
      await admin.locator('.table, .empty').first().waitFor({ timeout: 20000 });
      await shot(admin, `${tag}-admin-audit-table`);
      await admin.close();
    }

    console.log(`\ndone, ${n} screenshots in ${OUT}/`);
  } finally {
    await browser.close();
    server.close();
  }
};

run().catch((err) => { console.error(err); process.exit(1); });
