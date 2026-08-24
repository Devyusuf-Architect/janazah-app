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

/** Static server for the test build. Firebase Hosting is not needed here. */
function serve(root, port) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(req.url.split('?')[0]));
    let file = join(root, path === '/' ? 'index.html' : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      // Single-page fallback, matching the hosting rewrite.
      try {
        const body = await readFile(join(root, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(body);
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
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.locator('#displayName').fill(name);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.locator('#nav').waitFor({ state: 'visible', timeout: 15000 });
}

async function signIn(page, { email, password }) {
  await page.goto(BASE);
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

  const newPage = async () => {
    const page = await (await browser.newContext()).newPage();
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

    // ---- cancellation ------------------------------------------------------
    await coord.getByRole('button', { name: 'Cancel notice' }).click();
    await coord.locator('#reason-input').fill('Prayer moved to another masjid.');
    await coord.getByRole('button', { name: 'Cancel notice', exact: true }).last().click();
    await coord.locator('.notice-card--cancelled').waitFor({ timeout: 15000 });
    log('notice cancelled');

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
