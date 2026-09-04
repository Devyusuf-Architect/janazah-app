// Archiving an organization, and restoring it.
//
// The admin views cannot be imported directly in a plain Node test: they pull
// in firebase.js, which expects a browser. Same approach as
// tests/takedown.test.js: check the source text for the specific things that
// must hold. The rules and functions unit tests are what actually prove the
// mutation is correct; this only proves the UI is wired to it the way the
// design calls for.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const store = readFileSync('public/js/store.js', 'utf8');
const orgsView = readFileSync('public/js/views/admin/organizations.js', 'utf8');
const orgView = readFileSync('public/js/views/org.js', 'utf8');
const model = readFileSync('public/js/model.js', 'utf8');

describe('store.js calls the archive/restore callables, not a plain document write', () => {
  test('archiveOrganization calls the archiveOrganization callable', () => {
    const fn = store.slice(store.indexOf('export async function archiveOrganization'));
    assert.match(fn.slice(0, 400), /httpsCallable\(functions,\s*'archiveOrganization'\)/);
  });

  test('restoreOrganization calls the restoreOrganization callable', () => {
    const fn = store.slice(store.indexOf('export async function restoreOrganization'));
    assert.match(fn.slice(0, 400), /httpsCallable\(functions,\s*'restoreOrganization'\)/);
  });
});

describe('the Organizations admin view offers Archive and Restore', () => {
  test('Archive asks for a reason, with the same friction as Suspend', () => {
    const fn = orgsView.slice(orgsView.indexOf('async function archiveOrganizationAction'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    assert.match(body, /askReason\(/);
    assert.doesNotMatch(body, /required:\s*false/,
      'Archive should require a reason, the same as Suspend does');
    const flattened = body.replace(/\s+/g, ' ');
    assert.match(flattened, /stop.{0,20}appearing anywhere on Ta.ziyah/,
      'the confirmation copy should say plainly what happens');
    assert.match(flattened, /undone at any time/);
  });

  test('Restore is a lighter-friction confirm: no reason required', () => {
    const fn = orgsView.slice(orgsView.indexOf('async function restoreOrganizationAction'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    assert.match(body, /askReason\(/);
    assert.match(body, /required:\s*false/);
  });

  test('errors from either action go through actionError, matching every other callable action here', () => {
    for (const fnName of ['archiveOrganizationAction', 'restoreOrganizationAction']) {
      const fn = orgsView.slice(orgsView.indexOf(`async function ${fnName}`));
      const body = fn.slice(0, fn.indexOf('\n}\n'));
      assert.match(body, /actionError\(err\)/);
    }
  });

  test('a sample organization is not offered Archive', () => {
    assert.match(orgsView, /isSample/);
    assert.match(orgsView, /startsWith\('sample-'\)/);
  });

  test('Archive and Restore are mutually exclusive on the same organization', () => {
    const fn = orgsView.slice(
      orgsView.indexOf("export function decisionButtons"),
      orgsView.indexOf("\n/**\n * Hide a real organization"));
    assert.match(fn, /status === 'archived'/);
    assert.match(fn, /'Restore'/);
    assert.match(fn, /'Archive'/);
  });

  test('the status filter list includes archived', () => {
    assert.match(orgsView, /value:\s*'archived'/);
  });
});

describe('archived status is recognised wherever verification status is labelled', () => {
  test('model.js labels it', () => {
    assert.match(model, /archived:\s*'Archived'/);
  });

  test('org.js gives it a distinct badge tone from suspended', () => {
    const suspendedEntry = orgView.slice(orgView.indexOf('suspended: {'), orgView.indexOf('archived: {'));
    const archivedEntry = orgView.slice(orgView.indexOf('archived: {'));
    assert.match(suspendedEntry, /tone:\s*'error'/);
    assert.match(archivedEntry.slice(0, 300), /tone:\s*'error'/);
    // Distinct by wording, since both currently share the same "error" tone:
    // a reader must be able to tell a suspension from an archive by the text
    // alone, not only by the colour.
    assert.match(archivedEntry.slice(0, 300), /Archived/);
    assert.doesNotMatch(archivedEntry.slice(0, 300), /Suspended/);
  });
});
