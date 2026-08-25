// End-to-end smoke test of the Phase 1 console.
//
// Drives the real UI in a real browser against the Firebase emulators, along
// the path that matters: a coordinator registers an organization, a platform
// admin verifies it, the coordinator publishes a notice, and the notice is
// then publicly readable while its private details are not.
//
// Run: npm run test:e2e

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { buildTestApp } from './build-test-app.mjs';

const BASE = 'http://127.0.0.1:5000';
const PROJECT = 'demo-janazah';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';

const COORD = { email: 'coordinator@example.com', password: 'test-password-1' };
const ADMIN = { email: 'admin@example.com', password: 'test-password-2' };

const log = (msg) => console.log(`  ${msg}`);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.ico': 'image/x-icon',
};

/**
 * Static server for the test build, mirroring the rewrites in firebase.json:
 * /console and below serve the console page, everything else the feed.
 */
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
      if (path === '/' || !extname(path)) throw new Error('route to page');
      await send(join(root, path), MIME[extname(path)] || 'application/octet-stream');
    } catch {
      try {
        await send(join(root, page), 'text/html');
      } catch {
        res.writeHead(404).end('not found');
      }
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

async function uidFor(email) {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: '{}',
    });
  const { userInfo = [] } = await res.json();
  const user = userInfo.find((u) => u.email === email);
  assert.ok(user, `no emulator auth user for ${email}`);
  return user.localId;
}

/** Write straight to the emulator, bypassing rules, the way the console would. */
async function grantPlatformAdmin(uid, email) {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/admins/${uid}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ fields: { email: { stringValue: email } } }),
    });
  assert.equal(res.status, 200, `granting admin failed: ${await res.text()}`);
}

async function signUp(page, { email, password }, name) {
  await page.goto(`${BASE}/console`);
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.locator('#displayName').fill(name);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.locator('#nav').waitFor({ state: 'visible', timeout: 15000 });
}

async function signIn(page, { email, password }) {
  await page.goto(`${BASE}/console`);
  await page.locator('#email').waitFor({ timeout: 15000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#nav').waitFor({ state: 'visible', timeout: 15000 });
}

const run = async () => {
  const root = await buildTestApp();
  const server = await serve(root, 5000);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const failures = [];

  const newPage = async (contextOptions = {}) => {
    const page = await (await browser.newContext(contextOptions)).newPage();
    page.on('pageerror', (err) => failures.push(`page error: ${err.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon/i.test(m.text())) {
        failures.push(`console error: ${m.text()}`);
      }
    });
    return page;
  };

  try {
    // ---- coordinator registers an organization -----------------------------
    const coord = await newPage();
    await signUp(coord, COORD, 'Test Coordinator');
    log('coordinator account created');

    await coord.getByRole('button', { name: 'Register an organization' }).first().click();
    await coord.locator('#name').fill('Test Masjid');
    await coord.locator('#address').fill('100 Example Street');
    await coord.locator('#city').fill('Toronto');
    await coord.locator('#province').fill('ON');
    await coord.locator('#lat').fill('43.6532');
    await coord.locator('#lng').fill('-79.3832');
    await coord.locator('#contactEmail').fill('office@example.com');
    await coord.getByRole('button', { name: 'Submit for verification' }).click();
    await coord.getByText('pending', { exact: true }).first().waitFor({ timeout: 15000 });
    log('organization registered as pending');

    // ---- publishing is blocked while unverified ----------------------------
    await coord.getByRole('button', { name: 'Notices' }).click();
    const warning = await coord.locator('.notice-strip--warn').first().textContent();
    assert.match(warning, /verified yet/i, 'expected an unverified warning');
    log('publishing correctly blocked while unverified');

    // ---- platform admin verifies -------------------------------------------
    const admin = await newPage();
    await signUp(admin, ADMIN, 'Test Admin');
    await grantPlatformAdmin(await uidFor(ADMIN.email), ADMIN.email);
    await admin.reload();
    await admin.getByRole('button', { name: 'Admin' }).waitFor({ timeout: 15000 });
    await admin.getByRole('button', { name: 'Admin' }).click();
    log('platform admin console reachable');

    await admin.getByRole('button', { name: 'Verify' }).first().click();
    await admin.locator('#reason-input').fill('Confirmed by phone with the masjid office.');
    await admin.getByRole('button', { name: 'Verify', exact: true }).last().click();
    await admin.getByText('Test Masjid').first().waitFor({ state: 'hidden', timeout: 15000 });
    log('organization verified');

    // ---- coordinator publishes a notice ------------------------------------
    await coord.reload();
    await coord.getByRole('button', { name: 'Notices' }).click();
    await coord.getByRole('button', { name: 'New notice' }).click();

    await coord.locator('#deceasedName').fill('Test Name');
    await coord.locator('input[name="showDeceasedName"]').check();
    await coord.locator('#janazahAt').fill('2026-12-01T13:30');
    await coord.locator('#prayerName').fill('Main Prayer Hall');
    await coord.locator('#prayerAddress').fill('100 Example Street, Toronto');
    await coord.locator('#prayerLat').fill('43.6532');
    await coord.locator('#prayerLng').fill('-79.3832');
    await coord.locator('#burialName').fill('Example Cemetery');
    await coord.locator('#burialAddress').fill('500 Cemetery Road, Toronto');
    await coord.locator('#instructions').fill('Parking is available behind the building.');
    await coord.locator('#familyContactPhone').fill('555-0100');
    await coord.locator('#internalNotes').fill('Family prefers no visitors afterwards.');

    // The private fields must not appear in the public preview.
    await coord.getByRole('button', { name: 'Publish', exact: true }).click();
    const previewText = await coord.locator('.modal .public-notice').textContent();
    assert.ok(!previewText.includes('555-0100'), 'phone number leaked into the public preview');
    assert.ok(!previewText.includes('no visitors'), 'internal notes leaked into the public preview');
    assert.ok(previewText.includes('Test Name'), 'approved name missing from preview');
    log('public preview excludes private fields');

    await coord.locator('#confirm-check').check();
    await coord.getByRole('button', { name: 'Publish now' }).click();
    await coord.locator('.notice-card--published').waitFor({ timeout: 15000 });
    log('notice published');

    // ---- the public document really is free of private fields --------------
    const docs = await (await fetch(
      `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/notices`,
      { headers: { Authorization: 'Bearer owner' } })).json();
    const stored = JSON.stringify(docs);
    assert.ok(!stored.includes('555-0100'), 'phone number was written to the public notice');
    assert.ok(!stored.includes('no visitors'), 'internal notes were written to the public notice');
    assert.ok(stored.includes('Example Cemetery'), 'burial location missing from the notice');
    log('stored public document contains no private fields');

    // ---- the public feed, as a visitor with no account ---------------------
    const visitor = await newPage();
    await visitor.goto(BASE);
    await visitor.locator('.notice-card').first().waitFor({ timeout: 15000 });

    const feedText = await visitor.locator('#view').innerText();
    assert.ok(feedText.includes('Test Name'), 'approved name missing from the feed');
    assert.ok(feedText.includes('Main Prayer Hall'), 'prayer location missing from the feed');
    assert.ok(feedText.includes('Example Cemetery'), 'burial location missing from the feed');
    assert.ok(!feedText.includes('555-0100'), 'phone number leaked into the feed');
    assert.ok(!feedText.includes('no visitors'), 'internal notes leaked into the feed');
    log('feed shows the notice to a visitor with no account');

    // Directions links must point somewhere usable for both locations.
    const directions = await visitor.locator('.public-notice a.link').all();
    assert.equal(directions.length, 2, 'expected directions for prayer and burial');
    for (const link of directions) {
      assert.match(await link.getAttribute('href'), /^https:\/\/www\.google\.com\/maps\/dir/);
    }
    log('directions links present for prayer and burial');

    // Following is device-local: no write leaves the browser.
    await visitor.getByRole('button', { name: /^Follow Test Masjid$/ }).click();
    await visitor.getByRole('button', { name: /^Following Test Masjid$/ }).waitFor({ timeout: 5000 });
    const followState = await visitor.evaluate(() => localStorage.getItem('janazah.followedOrgs'));
    assert.ok(followState && JSON.parse(followState).length === 1,
      'follow was not stored on the device');

    await visitor.getByRole('button', { name: 'Masajid I follow (1)' }).click();
    await visitor.locator('.notice-card').first().waitFor({ timeout: 5000 });
    log('follow persisted on the device and filters the feed');

    // The shareable per-notice link.
    await visitor.getByRole('button', { name: 'All notices' }).click();
    await visitor.getByRole('link', { name: 'Open' }).first().click();
    await visitor.locator('.public-notice').first().waitFor({ timeout: 10000 });
    assert.match(visitor.url(), /\/n\/[A-Za-z0-9_-]+$/, 'expected a /n/{id} share URL');
    const singleText = await visitor.locator('#view').innerText();
    assert.ok(!singleText.includes('555-0100'), 'phone number leaked into the shared notice page');
    log('shared notice page loads at its own URL');

    // Reporting, over an anonymous session.
    await visitor.getByRole('button', { name: 'Report a problem' }).click();
    await visitor.locator('#report-reason').selectOption('incorrect_details');
    await visitor.locator('#report-detail').fill('The prayer time looks wrong.');
    await visitor.getByRole('button', { name: 'Send report' }).click();
    await visitor.locator('.modal-backdrop').waitFor({ state: 'detached', timeout: 15000 });

    const reports = await (await fetch(
      `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/reports`,
      { headers: { Authorization: 'Bearer owner' } })).json();
    assert.equal((reports.documents || []).length, 1, 'report was not stored');
    assert.equal(reports.documents[0].fields.status.stringValue, 'open');
    log('report filed over an anonymous session');

    // A notice not yet published must never appear on the feed.
    await coord.getByRole('button', { name: 'Notices' }).click();
    await coord.getByRole('button', { name: 'New notice' }).click();
    await coord.locator('#janazahAt').fill('2026-12-02T13:30');
    await coord.locator('#prayerName').fill('Draft Hall');
    await coord.locator('#prayerAddress').fill('9 Draft Street, Toronto');
    await coord.locator('#prayerLat').fill('43.66');
    await coord.locator('#prayerLng').fill('-79.39');
    await coord.getByRole('button', { name: 'Save as draft' }).click();
    await coord.locator('.notice-card--draft').waitFor({ timeout: 15000 });

    await visitor.goto(BASE);
    await visitor.locator('.notice-card').first().waitFor({ timeout: 15000 });
    assert.ok(!(await visitor.locator('#view').innerText()).includes('Draft Hall'),
      'an unpublished draft appeared on the public feed');
    log('drafts stay off the public feed');

    // ---- cancellation ------------------------------------------------------
    await coord.getByRole('button', { name: 'Cancel notice' }).first().click();
    await coord.locator('#reason-input').fill('Prayer moved to another masjid.');
    await coord.getByRole('button', { name: 'Cancel notice', exact: true }).last().click();
    await coord.locator('.notice-card--cancelled').waitFor({ timeout: 15000 });
    log('notice cancelled');

    // A cancelled notice stays visible and says so, rather than vanishing and
    // leaving anyone holding a shared link with a dead page.
    await visitor.reload();
    await visitor.locator('.public-notice--cancelled').first().waitFor({ timeout: 15000 });
    const cancelledText = await visitor.locator('#view').innerText();
    assert.ok(/Cancelled: Prayer moved to another masjid/.test(cancelledText),
      `expected the cancellation reason on the feed; got: ${cancelledText.slice(0, 300)}`);
    log('feed shows the cancellation with its reason');

    // ---- the audit trail recorded every step -------------------------------
    // The UI updates optimistically from its own snapshot listener, so the
    // audit write can still be in flight when the card re-renders. Poll rather
    // than read once.
    const expectedActions =
      ['org.registered', 'org.verified', 'notice.published', 'notice.cancelled'];
    let actions = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      const auditRes = await (await fetch(
        `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/auditLog`,
        { headers: { Authorization: 'Bearer owner' } })).json();
      actions = (auditRes.documents || [])
        .map((d) => d.fields?.action?.stringValue).filter(Boolean);
      if (expectedActions.every((a) => actions.includes(a))) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    for (const expected of expectedActions) {
      assert.ok(actions.includes(expected), `audit trail missing ${expected}; got ${actions}`);
    }
    log(`audit trail complete: ${actions.sort().join(', ')}`);

    // ---- nearby matching, on the device ------------------------------------
    // A second notice on the other side of the country, so radius filtering
    // has something real to exclude.
    await coord.getByRole('button', { name: 'New notice' }).click();
    await coord.locator('#janazahAt').fill('2026-12-03T13:30');
    await coord.locator('#timeZone').selectOption('America/Vancouver');
    await coord.locator('#prayerName').fill('Vancouver Prayer Hall');
    await coord.locator('#prayerAddress').fill('1 Pacific Street, Vancouver');
    await coord.locator('#prayerLat').fill('49.2827');
    await coord.locator('#prayerLng').fill('-123.1207');
    await coord.getByRole('button', { name: 'Publish', exact: true }).click();
    await coord.locator('#confirm-check').check();
    await coord.getByRole('button', { name: 'Publish now' }).click();
    await coord.locator('.notice-card--published').first().waitFor({ timeout: 15000 });
    log('second notice published, far away');

    // A visitor physically in Toronto.
    const local = await newPage({
      permissions: ['geolocation', 'notifications'],
      // Distinctive digits so the leak check below cannot collide with a
      // coordinate that legitimately belongs to a notice.
      geolocation: { latitude: 43.6591234, longitude: -79.3901234 },
      locale: 'en-CA',
    });
    await local.goto(BASE);
    await local.locator('.notice-card').first().waitFor({ timeout: 15000 });

    await local.getByRole('button', { name: 'Near me' }).click();
    await local.getByRole('button', { name: 'Use my location' }).waitFor({ timeout: 10000 });

    const consent = await local.locator('.consent').innerText();
    assert.match(consent, /never sent to us/i, 'consent copy must state where location goes');
    assert.match(consent, /overwritten/i, 'consent copy must state that no history is kept');

    await local.getByRole('button', { name: 'Use my location' }).click();
    await local.locator('.nearby-settings').waitFor({ timeout: 15000 });

    const nearbyText = await local.locator('#view').innerText();
    assert.ok(nearbyText.includes('Main Prayer Hall'),
      'the Toronto notice should be near a visitor in Toronto');
    assert.ok(!nearbyText.includes('Vancouver Prayer Hall'),
      'a notice 3000 km away must not appear within a 10 km radius');
    assert.match(nearbyText, /\d+(\.\d+)?\s?km|under 1 km/,
      'expected an approximate distance on the nearby card');
    log('nearby filters by radius and shows an approximate distance');

    // Widening the radius brings the far notice in, which proves the control
    // is actually driving the filter.
    await local.locator('#radius').selectOption('0');
    await local.locator('#view').getByText('Vancouver Prayer Hall').waitFor({ timeout: 10000 });
    log('widening the distance includes the far notice');

    // Nothing about the visitor's position may reach the backend.
    const positionStored = await local.evaluate(() =>
      JSON.parse(localStorage.getItem('janazah.location') || '{}'));
    assert.ok(positionStored.last?.lat, 'expected the position cached on the device');
    const allDocs = await (await fetch(
      `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/notices`,
      { headers: { Authorization: 'Bearer owner' } })).text();
    assert.ok(!allDocs.includes('6591234'), 'a visitor position reached the notices collection');
    const allOrgs = await (await fetch(
      `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/organizations`,
      { headers: { Authorization: 'Bearer owner' } })).text();
    assert.ok(!allOrgs.includes('6591234'), 'a visitor position reached the organizations collection');

    for (const path of ['reports', 'auditLog']) {
      const dump = await (await fetch(
        `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`,
        { headers: { Authorization: 'Bearer owner' } })).text();
      assert.ok(!dump.includes('6591234'), `a visitor position reached ${path}`);
    }
    log('visitor position never reaches the backend');

    // The alerts control must describe what it actually does. In this build
    // no Web Push certificate is configured, so it has to offer the
    // page-open-only fallback and say so rather than implying more.
    const alertsText = await local.locator('.alerts-panel').innerText();
    assert.match(alertsText, /not set up for this site yet|cannot receive notifications/i,
      `expected the panel to explain why push is unavailable; got: ${alertsText}`);
    assert.match(alertsText, /only works while a tab is open|will not reach a locked phone/i,
      `the fallback must state its limitation; got: ${alertsText}`);

    await local.locator('#alerts-toggle').check();
    await local.waitForFunction(() =>
      JSON.parse(localStorage.getItem('janazah.location') || '{}').alertsEnabled === true,
      null, { timeout: 10000 });
    log('alerts panel is honest about what it can deliver, and the fallback works');

    // Opting out must erase, not merely stop reading.
    await local.getByRole('button', { name: 'Turn off' }).click();
    await local.getByRole('button', { name: 'Use my location' }).waitFor({ timeout: 10000 });
    const afterOptOut = await local.evaluate(() =>
      JSON.parse(localStorage.getItem('janazah.location') || '{}'));
    assert.equal(afterOptOut.last, null, 'the stored position survived opting out');
    assert.equal(afterOptOut.enabled, false);
    log('opting out erases the stored position');

    if (failures.length) {
      throw new Error(`browser reported errors:\n  - ${failures.join('\n  - ')}`);
    }
    console.log('\nE2E smoke test passed.');
  } finally {
    await browser.close();
    server.close();
  }
};

run().catch((err) => {
  console.error('\nE2E smoke test FAILED\n', err);
  process.exit(1);
});
