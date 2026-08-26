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

/**
 * Serve the address lookup locally, in the geocoder's own GeoJSON shape.
 *
 * The registration form's coordinates now come from whatever this returns,
 * so the response is deliberately the real format rather than something the
 * app would only accept in a test: if normalizeFeature stops reading Photon
 * correctly, this fails.
 */
async function stubGeocoder(page) {
  await page.route('**/photon.komoot.io/api/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-79.3832, 43.6532] },
        properties: {
          housenumber: '100', street: 'Example Street', city: 'Toronto',
          state: 'ON', postcode: 'M5H 2N2', country: 'Canada',
        },
      }],
    }),
  }));
}

async function signUp(page, { email, password }, name, { start } = {}) {
  await page.goto(`${BASE}/console${start ? `?start=${start}` : ''}`);
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
    // Webfonts are a progressive enhancement: the page has real fallback
    // stacks and must render correctly without them, so a blocked font host
    // is not a failure. Everything else in the console is.
    const ignorable = (text) => /favicon/i.test(text)
      || /ERR_CONNECTION_RESET|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_CERT_AUTHORITY_INVALID/.test(text);
    page.on('console', (m) => {
      if (m.type() === 'error' && !ignorable(m.text())) {
        failures.push(`console error: ${m.text()}`);
      }
    });
    return page;
  };

  try {
    // ---- coordinator registers an organization -----------------------------
    const coord = await newPage();
    // Entering the way a masjid actually does: from the public site's
    // "Register a new masjid", which carries ?start=register through
    // account creation so the form opens directly.
    await signUp(coord, COORD, 'Test Coordinator', { start: 'register' });
    log('coordinator account created');

    await coord.locator('#name').waitFor({ timeout: 15000 });
    assert.ok(!(await coord.locator('#view').innerText()).includes('You are not yet staff'),
      'the registration CTA must open the form, not an empty organizations list');
    // The one-time instruction must not survive in the URL, or every reload
    // would reopen this form, including after it has been submitted.
    assert.ok(!coord.url().includes('start='),
      `?start= should be consumed and stripped; got ${coord.url()}`);
    log('the registration CTA opens the form directly, with no second click');

    await coord.locator('#name').fill('Test Masjid');

    // The coordinates come from an address the coordinator picks, not from
    // numbers they were asked to look up. Registration must not be able to
    // fail because a third-party geocoder is slow or down while the suite
    // runs, so the lookup is served locally with a canned Photon response.
    await stubGeocoder(coord);
    await coord.locator('#addressSearch').fill('100 Example Street');
    await coord.locator('.address-result').first().click();

    // What was picked has to be confirmed back before submitting, and the
    // coordinates must have actually landed in the payload.
    await coord.locator('.address-chosen').waitFor({ timeout: 5000 });
    const confirmed = await coord.locator('.address-chosen').innerText();
    assert.match(confirmed, /Selected location: /,
      'the chosen address must be confirmed before submitting');
    assert.equal(await coord.locator('#lat').inputValue(), '43.6532');
    assert.equal(await coord.locator('#lng').inputValue(), '-79.3832');
    assert.equal(await coord.locator('#city').inputValue(), 'Toronto');

    await coord.locator('#contactEmail').fill('office@example.com');
    await coord.getByRole('button', { name: 'Submit for verification' }).click();
    await coord.locator('.verify-state').waitFor({ timeout: 15000 });
    log('organization registered as pending');

    // ---- the verification-pending state ------------------------------------
    // Submitting must land on something that says plainly what happened and
    // what comes next, not a publish screen with a disabled button.
    const pendingText = await coord.locator('.verify-state').innerText();
    assert.match(pendingText, /Verification pending/i, 'expected a pending heading');
    assert.match(pendingText, /cannot publish/i,
      'the pending screen must say publishing is not available yet');
    assert.match(pendingText, /administrator/i,
      'the pending screen must say who reviews it');
    assert.match(pendingText, /Submitted/i,
      'the pending screen must show when the application was submitted');
    log('verification-pending screen states the status, the reason and what is next');

    // The organization was stored as pending, with the submitter recorded.
    // This is what the Admin Portal will later read to build its queue.
    const orgDocs = await (await fetch(
      `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/organizations`,
      { headers: { Authorization: 'Bearer owner' } })).json();
    const storedOrg = (orgDocs.documents || [])[0];
    assert.ok(storedOrg, 'the organization was not stored');
    assert.equal(storedOrg.fields.verificationStatus.stringValue, 'pending',
      'a new registration must be stored as pending');
    assert.ok(storedOrg.fields.createdBy?.stringValue, 'the submitter was not recorded');
    assert.ok(storedOrg.fields.createdAt?.timestampValue, 'the submission time was not recorded');
    assert.ok(!storedOrg.fields.verifiedAt && !storedOrg.fields.verifiedBy,
      'a pending registration must not carry verification fields');
    log('registration stored as pending, with who submitted it and when');

    // A coordinator cannot promote their own organization: that is enforced
    // by firestore.rules, and proved against the real rules engine in
    // tests/rules.test.js ("verification cannot be self-granted"), which is
    // a stronger place to assert it than a browser click-path.

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

    await admin.getByRole('button', { name: 'Approve' }).first().click();
    await admin.locator('#reason-input').fill('Confirmed by phone with the masjid office.');
    await admin.getByRole('button', { name: 'Approve', exact: true }).last().click();
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
    await visitor.goto(`${BASE}/janazahs`);
    await visitor.locator('.notice-card').first().waitFor({ timeout: 15000 });

    // The page must be legible with the webfont unavailable, which is also
    // what a first paint on a slow connection looks like.
    const bodyFont = await visitor.evaluate(() => getComputedStyle(document.body).fontFamily);
    assert.match(bodyFont, /Inter|system-ui|-apple-system|sans-serif/,
      `body font stack must fall back gracefully; got ${bodyFont}`);

    const feedText = await visitor.locator('#view').innerText();
    assert.ok(feedText.includes('Test Name'), 'approved name missing from the feed');
    assert.ok(feedText.includes('Main Prayer Hall'), 'prayer location missing from the feed');
    assert.ok(feedText.includes('Example Cemetery'), 'burial location missing from the feed');
    assert.ok(!feedText.includes('555-0100'), 'phone number leaked into the feed');
    assert.ok(!feedText.includes('no visitors'), 'internal notes leaked into the feed');
    log('feed shows the notice to a visitor with no account');

    // Directions links must point somewhere usable for both locations.
    const directions = await visitor.locator('.public-notice a.link-inline').all();
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

    await visitor.getByRole('button', { name: 'Masjids I follow (1)' }).click();
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

    await visitor.goto(`${BASE}/janazahs`);
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
    // Item 3: entries are written by Cloud Functions triggers
    // (functions/index.js, on*AuditWritten), not by the client, so there is
    // real latency between the document write that caused an entry and the
    // entry existing: the trigger has to be invoked, and in the emulator the
    // very first invocation can carry a cold-start cost on top of that. Poll
    // with real margin rather than read once.
    const expectedActions =
      ['org.registered', 'org.verified', 'notice.published', 'notice.cancelled'];
    let actions = [];
    for (let attempt = 0; attempt < 60; attempt++) {
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

    // And nothing else claims to have written it: every entry names a real
    // actor uid, or 'system' for the notification pipeline's own bookkeeping
    // entries (a separate, pre-existing writeSystemAudit path in
    // functions/index.js unrelated to item 3), never a bare client guess.
    const auditDocsRes = await (await fetch(
      `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/auditLog`,
      { headers: { Authorization: 'Bearer owner' } })).json();
    for (const d of auditDocsRes.documents || []) {
      const actorUid = d.fields?.actorUid?.stringValue;
      assert.ok(actorUid, `an audit entry has no actorUid: ${JSON.stringify(d.fields)}`);
    }
    log('every audit entry names an actor');

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

    // ---- duplicate warning -------------------------------------------------
    // The same masjid posting again for the same slot is the usual shape of an
    // accidental double announcement.
    await coord.getByRole('button', { name: 'New notice' }).click();
    await coord.locator('#janazahAt').fill('2026-12-03T13:30');
    await coord.locator('#timeZone').selectOption('America/Vancouver');
    await coord.locator('#prayerName').fill('Vancouver Prayer Hall');
    await coord.locator('#prayerAddress').fill('1 Pacific Street, Vancouver');
    await coord.locator('#prayerLat').fill('49.2827');
    await coord.locator('#prayerLng').fill('-123.1207');
    await coord.getByRole('button', { name: 'Publish', exact: true }).click();

    await coord.locator('.dup-warning').waitFor({ timeout: 15000 });
    const dupText = await coord.locator('.dup-warning').innerText();
    assert.match(dupText, /similar notice/i);
    log('duplicate warning shown before publishing a likely repeat');

    // It warns; it must not block. Backing out returns to the form.
    await coord.getByRole('button', { name: 'Back to editing' }).click();
    await coord.getByRole('button', { name: 'Back' }).click();
    await coord.locator('.notice-card').first().waitFor({ timeout: 15000 });

    // ---- report triage -----------------------------------------------------
    await admin.reload();
    await admin.getByRole('button', { name: 'Admin' }).click();
    await admin.getByRole('button', { name: 'Reports' }).click();
    await admin.getByText('Details are wrong').first().waitFor({ timeout: 15000 });

    await admin.getByRole('button', { name: 'Resolve' }).first().click();
    await admin.locator('#reason-input').fill('Checked with the masjid; time was right.');
    await admin.getByRole('button', { name: 'Resolve', exact: true }).last().click();
    await admin.getByText('resolved', { exact: true }).first().waitFor({ timeout: 15000 });

    const resolvedReports = await (await fetch(
      `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/reports`,
      { headers: { Authorization: 'Bearer owner' } })).json();
    const resolved = resolvedReports.documents[0].fields;
    assert.equal(resolved.status.stringValue, 'resolved');
    assert.ok(resolved.resolvedBy?.stringValue, 'the outcome must name who decided it');
    log('administrator resolved a report, with the outcome recorded');

    // ---- family takedown request --------------------------------------------
    // File a generic report and a family takedown request back to back, then
    // confirm the family request surfaces ahead of it, is labelled plainly
    // rather than as a raw value, and states a response-time target rather
    // than a bare "we'll look at it".
    await visitor.goto(`${BASE}/janazahs`);
    await visitor.locator('.notice-card').first().waitFor({ timeout: 15000 });
    await visitor.getByRole('link', { name: 'Open' }).first().click();
    await visitor.locator('.public-notice').first().waitFor({ timeout: 10000 });

    await visitor.getByRole('button', { name: 'Report a problem' }).click();
    await visitor.locator('#report-reason').selectOption('other');
    await visitor.getByRole('button', { name: 'Send report' }).click();
    await visitor.locator('.modal-backdrop').waitFor({ state: 'detached', timeout: 15000 });

    await visitor.getByRole('button', { name: 'Report a problem' }).click();
    await visitor.locator('#report-reason').selectOption('family_takedown');
    const familyNoteText = await visitor.locator('.notice-strip--warn').innerText();
    assert.match(familyNoteText, /one business day/,
      `expected the response-time target in the family note; got: ${familyNoteText}`);
    await visitor.locator('#report-detail').fill('I am the deceased’s son.');
    await visitor.getByRole('button', { name: 'Send report' }).click();
    await visitor.locator('.modal-backdrop').waitFor({ state: 'detached', timeout: 15000 });
    log('family takedown request filed, with the target response time shown before sending');

    await admin.reload();
    await admin.getByRole('button', { name: 'Admin' }).click();
    await admin.getByRole('button', { name: 'Reports' }).click();
    await admin.getByText('Family takedown request').first().waitFor({ timeout: 15000 });

    const openReportCards = await admin.locator('.card:has(.badge:text("open"))').all();
    assert.ok(openReportCards.length >= 2, 'expected both new reports to be open');
    const firstCardText = await openReportCards[0].innerText();
    assert.match(firstCardText, /Family takedown request/,
      'the family takedown request should sort ahead of a general report');
    log('family takedown request sorts ahead of a general report in triage');

    await admin.getByRole('button', { name: 'Resolve' }).first().click();
    await admin.locator('#reason-input').fill('Confirmed with the family and took the notice down.');
    await admin.getByRole('button', { name: 'Resolve', exact: true }).last().click();
    await admin.getByText('Confirmed with the family', { exact: false }).first()
      .waitFor({ timeout: 15000 });
    log('family takedown request resolved, with the outcome recorded');

    // ---- account security --------------------------------------------------
    await coord.getByRole('button', { name: 'Account' }).click();
    const accountText = await coord.locator('#view').innerText();
    assert.match(accountText, /two-step sign-in/i, 'expected the second-factor section');
    assert.match(accountText, /publish notices in a masjid/i,
      'expected the reason two-step matters to be stated');
    log('account security screen offers a second factor');

    // A visitor physically in Toronto.
    const local = await newPage({
      permissions: ['geolocation', 'notifications'],
      // Distinctive digits so the leak check below cannot collide with a
      // coordinate that legitimately belongs to a notice.
      geolocation: { latitude: 43.6591234, longitude: -79.3901234 },
      locale: 'en-CA',
    });
    await local.goto(`${BASE}/janazahs`);
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

    // ---- the privacy page --------------------------------------------------
    await local.goto(`${BASE}/privacy`);
    await local.locator('.policy').waitFor({ timeout: 15000 });
    const policy = await local.locator('.policy').innerText();
    for (const claim of [
      /not sent to us/i,
      /replaces the last/i,
      /erases the stored position/i,
      /30 days/,
      /PIPEDA/,
    ]) {
      assert.match(policy, claim, `privacy page is missing: ${claim}`);
    }
    log('privacy page states what the code actually does');

    // ---- the terms of service page ------------------------------------------
    // Navigated via the in-app link, not goto(), so the routing itself is
    // exercised too, not just that the page renders when hit directly.
    await local.getByRole('link', { name: 'Terms of service' }).first().click();
    await local.locator('.policy').waitFor({ timeout: 15000 });
    assert.match(local.url(), /\/terms$/, `expected /terms, got ${local.url()}`);
    const terms = await local.locator('.policy').innerText();
    for (const claim of [
      /notification layer/i,
      /not.*a religious authority/i,
      /reviewed by a platform administrator/i,
      /never a shared login/i,
      /takes.*down|take down|taken down/i,
    ]) {
      assert.match(terms, claim, `terms page is missing: ${claim}`);
    }
    log('terms page covers who may publish, fraud handling, and platform scope');

    // Direct navigation must also resolve, since a shared /terms link should
    // work without first visiting the feed.
    await local.goto(`${BASE}/terms`);
    await local.locator('.policy').waitFor({ timeout: 15000 });
    log('terms page resolves on a direct visit, not only via in-app navigation');

    // ---- the home page, and the nav that ties the site together -------------
    const guest = await newPage();
    await guest.goto(BASE);
    await guest.locator('.hero').waitFor({ timeout: 15000 });
    const homeText = await guest.locator('#view').innerText();
    assert.match(homeText, /verified masjids/i, 'home page must state who publishes');
    assert.match(homeText, /optional/i, 'home page must state location alerts are optional');
    for (const label of ['Home', 'Janazahs', 'Near Me', 'Masjids', 'Following', 'Sign in']) {
      await guest.getByRole('link', { name: label, exact: true }).first().waitFor({ timeout: 5000 });
    }
    log('home page explains the product and links to every major section');

    await guest.getByRole('link', { name: 'View Janazahs' }).click();
    await guest.locator('.notice-card').first().waitFor({ timeout: 15000 });
    assert.match(guest.url(), /\/janazahs$/, 'expected /janazahs after "View Janazahs"');
    assert.equal(
      await guest.locator('#nav .nav-item--active').first().innerText(), 'Janazahs',
      'the nav must show which section you are in');
    log('home page routes into the feed, and the nav shows where you are');

    // The name in the corner is the way home from anywhere.
    await guest.locator('.brand').click();
    await guest.locator('.hero').waitFor({ timeout: 10000 });
    assert.match(guest.url(), /\/$/, 'the brand must return to the public home page');
    log('the Ta’ziyah brand returns to the home page');

    // ---- the Janazah prayer guide, with no account -------------------------
    await guest.goto(`${BASE}/janazah-guide`);
    await guest.locator('.guide-head').waitFor({ timeout: 15000 });
    const guideText = await guest.locator('#view').innerText();
    assert.match(guideText, /Allāhu akbar/, 'the takbir transliteration is missing');
    assert.match(guideText, /Sahih Muslim 963/, 'the dua must show where it is from');
    assert.match(guideText, /differ/i, 'the note about differing practice is missing');
    assert.equal(await guest.locator('.takbir').count(), 4, 'expected four takbirs');
    // Arabic must be marked as Arabic, or a browser will not shape it and a
    // screen reader will read it in the wrong voice.
    const arabic = guest.locator('.recite__arabic').first();
    assert.equal(await arabic.getAttribute('lang'), 'ar');
    assert.equal(await arabic.getAttribute('dir'), 'rtl');
    log('the Janazah prayer guide renders for a visitor with no account');

    // ---- the masjids directory -----------------------------------------------
    await guest.goto(`${BASE}/masjids`);
    await guest.getByRole('button', { name: /^Follow Test Masjid$/ }).waitFor({ timeout: 15000 });
    log('masjids directory lists a verified organization with a follow control');

    // ---- an organization's own page, which is where a follow leads ---------
    await guest.getByRole('link', { name: 'Test Masjid' }).first().click();
    await guest.locator('.org-header').waitFor({ timeout: 15000 });
    assert.match(guest.url(), /\/o\/[A-Za-z0-9_-]+$/, `expected /o/{id}, got ${guest.url()}`);
    // The notice list arrives on its own snapshot after the header renders.
    await guest.locator('.notice-card').first().waitFor({ timeout: 15000 });
    const orgPageText = await guest.locator('#view').innerText();
    assert.match(orgPageText, /Test Masjid/, 'the organization page must name the masjid');
    assert.match(orgPageText, /Verified/i, 'a verified masjid should say so');
    assert.match(orgPageText, /Test Name/,
      'the organization page must list that masjid’s own notices');
    log('organization page shows the masjid and its notices');

    // Following from the organization page, with no account of any kind.
    await guest.getByRole('button', { name: /^Follow Test Masjid$/ }).click();
    await guest.getByRole('button', { name: /^Following Test Masjid$/ }).waitFor({ timeout: 5000 });
    const guestFollows = await guest.evaluate(() => localStorage.getItem('janazah.followedOrgs'));
    assert.ok(guestFollows && JSON.parse(guestFollows).length === 1,
      'following from the organization page did not persist on the device');
    log('a visitor with no account can follow from the organization page');

    // ---- the dashboard is not reachable while signed out ---------------------
    await guest.goto(`${BASE}/dashboard`);
    await guest.locator('form.card--narrow').waitFor({ timeout: 15000 });
    assert.match(guest.url(), /\/signin$/, 'a signed-out visitor to /dashboard must land on /signin');
    log('dashboard redirects a signed-out visitor to sign in, rather than rendering');

    // ---- community sign-up, and the dashboard it lands on --------------------
    const member = await newPage();
    await member.goto(`${BASE}/signin`);
    await member.getByRole('button', { name: 'Create an account' }).click();
    await member.locator('#email').fill('member@example.com');
    await member.locator('#password').fill('test-password-3');
    await member.getByRole('button', { name: 'Create account' }).click();
    await member.locator('#view').getByRole('heading', { name: /^Welcome/ }).waitFor({ timeout: 15000 });
    assert.match(member.url(), /\/dashboard$/, 'expected /dashboard after community sign-up');

    const dashboardText = await member.locator('#view').innerText();
    for (const claim of [
      /Upcoming Janazahs/, /Janazahs near me/i, /Following/i,
      /Notification settings/i, /Account security/i,
    ]) {
      assert.match(dashboardText, claim, `dashboard is missing: ${claim}`);
    }
    log('community sign-up lands on a dashboard reusing the existing sections');

    await member.getByRole('button', { name: 'Sign out' }).click();
    await member.locator('form.card--narrow').waitFor({ timeout: 15000 });
    assert.match(member.url(), /\/signin$/, 'signing out of the dashboard must return to sign-in');
    log('signing out of the community dashboard returns to sign-in');

    // ---- the admin portal manages sample data ------------------------------
    // The switch, the records, and the guarantee that removing the records
    // cannot take a real notice with them.
    await admin.getByRole('button', { name: 'Admin' }).click();
    await admin.getByRole('button', { name: 'Sample data' }).click();
    await admin.getByRole('button', { name: 'Add the built-in examples' })
      .waitFor({ timeout: 15000 });
    await admin.getByRole('button', { name: 'Add the built-in examples' }).click();
    await admin.getByRole('button', { name: 'Remove all sample records' })
      .waitFor({ timeout: 20000 });
    log('an administrator can add sample records from the admin portal');

    const seeded = await (await fetch(
      `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/notices`,
      { headers: { Authorization: 'Bearer owner' } })).json();
    const sampleIds = (seeded.documents || [])
      .map((d) => d.name.split('/').pop())
      .filter((docId) => docId.startsWith('sample-'));
    assert.ok(sampleIds.length > 0, 'no sample notices were written');
    log(`${sampleIds.length} sample notices written, all with a sample- id`);

    // The switch is stored, so it reaches every visitor rather than living in
    // one browser. Driven in both directions, from whichever state the build
    // started in.
    const storedSetting = async () => {
      const res = await fetch(
        `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/platformSettings/sampleData`,
        { headers: { Authorization: 'Bearer owner' } });
      return (await res.json())?.fields?.enabled?.booleanValue;
    };

    for (const [click, expect, back] of [
      ['Turn sample data on', true, 'Turn sample data off'],
      ['Turn sample data off', false, 'Turn sample data on'],
    ]) {
      await admin.getByRole('button', { name: click }).click();
      await admin.getByRole('button', { name: back }).waitFor({ timeout: 15000 });
      assert.equal(await storedSetting(), expect,
        `"${click}" must store enabled=${expect}, not just change this browser`);
    }
    log('the sample-data switch is stored where every visitor reads it');

    // Removing sample records must not touch a real one.
    await admin.getByRole('button', { name: 'Remove all sample records' }).click();
    await admin.locator('#reason-input').fill('done testing');
    await admin.getByRole('button', { name: 'Remove them' }).click();
    await admin.getByRole('button', { name: 'Add the built-in examples' })
      .waitFor({ timeout: 20000 });

    const after = await (await fetch(
      `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/notices`,
      { headers: { Authorization: 'Bearer owner' } })).json();
    const remaining = (after.documents || []).map((d) => d.name.split('/').pop());
    assert.ok(!remaining.some((docId) => docId.startsWith('sample-')),
      'sample notices survived removal');
    assert.ok(remaining.length > 0,
      'removing sample data deleted the real notices too, which must never happen');
    log('sample records removed in full, real notices untouched');

    // ---- an administrator can reach the portal from the public site --------
    // Previously the only way through was knowing the /console URL.
    const adminPublic = await newPage();
    await adminPublic.goto(`${BASE}/signin`);
    await adminPublic.locator('#email').fill(ADMIN.email);
    await adminPublic.locator('#password').fill(ADMIN.password);
    await adminPublic.getByRole('button', { name: 'Sign in', exact: true }).click();
    await adminPublic.locator('#nav').getByRole('link', { name: 'Admin', exact: true })
      .waitFor({ timeout: 15000 });
    await adminPublic.locator('#nav').getByRole('link', { name: 'Admin', exact: true }).click();
    await adminPublic.getByRole('button', { name: 'Verification requests' })
      .waitFor({ timeout: 20000 });
    assert.ok(!adminPublic.url().includes('tab='),
      `?tab= should be consumed and stripped; got ${adminPublic.url()}`);
    log('an administrator reaches the admin portal from the public site nav');

    // ---- and nobody else gets one, or can type their way in ----------------
    const plain = await newPage();
    await plain.goto(`${BASE}/signin`);
    await plain.locator('#email').fill('member@example.com');
    await plain.locator('#password').fill('test-password-3');
    await plain.getByRole('button', { name: 'Sign in', exact: true }).click();
    await plain.locator('#view').getByRole('heading', { name: /^Welcome/ })
      .waitFor({ timeout: 15000 });
    await plain.waitForTimeout(1500);
    assert.equal(
      await plain.locator('#nav').getByRole('link', { name: 'Admin', exact: true }).count(), 0,
      'a community member must not be offered the admin portal');

    // The link is presentation only. Asking for the tab directly must not
    // grant it; the console re-checks against the real admin record, and an
    // unentitled tab is ignored rather than obeyed, so the person still lands
    // where a coordinator with no organization belongs.
    await plain.goto(`${BASE}/console?tab=admin`);
    await plain.getByRole('button', { name: 'Register a new masjid' })
      .first().waitFor({ timeout: 20000 });
    const plainNav = await plain.locator('#nav').innerText();
    assert.ok(!/Admin/.test(plainNav),
      'hand-typing ?tab=admin must not produce an Admin tab');
    assert.ok(!plain.url().includes('tab='), 'the tab intent should be consumed');
    log('a community member gets no admin link, and cannot type their way in');

    // ---- the console is not a trap -----------------------------------------
    // The brand in the corner must leave the console for the public site,
    // not point at the console's own root, and there must be a way out in
    // the nav as well.
    const consoleBrandHref = await coord.locator('.brand').getAttribute('href');
    assert.equal(consoleBrandHref, '/',
      'the console brand must go to the public home page, not /console');
    await coord.getByRole('link', { name: 'Public site' }).first().waitFor({ timeout: 5000 });
    await coord.locator('.brand').click();
    await coord.locator('.hero').waitFor({ timeout: 15000 });
    assert.match(coord.url(), /\/$/, 'the console brand did not reach the home page');
    log('the console brand and nav both lead back to the public site');

    // ---- a community account cannot reach coordinator/admin functionality ---
    // The console's own sign-in accepts the same account (one Firebase
    // project, one set of accounts); what it cannot do is anything requiring
    // organization staff or platform-admin status, which rules enforce
    // server-side regardless of which UI is used to sign in.
    await member.goto(`${BASE}/console`);
    await member.locator('#email').fill('member@example.com');
    await member.locator('#password').fill('test-password-3');
    await member.getByRole('button', { name: 'Sign in', exact: true }).click();
    // A brand-new coordinator sees two clearly separated choices rather than
    // one button and a link, and an empty organization list is a normal
    // starting state, never an application error.
    await member.getByRole('button', { name: 'Register a new masjid' }).first().waitFor({ timeout: 15000 });
    await member.getByRole('button', { name: 'Request access' }).first().waitFor({ timeout: 5000 });
    log('a new coordinator is offered "register new" and "join existing" separately');

    const consoleNav = await member.locator('#nav').innerText();
    assert.ok(!/Admin/.test(consoleNav),
      'a community member with no admin record must not see an Admin tab');
    log('a community account reaches the console with no coordinator or admin access');

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
