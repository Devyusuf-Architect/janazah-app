// The shared bridge is only worth having if it cannot drift.
//
// These tests read public/js directly and assert that what src/shared claims
// about it is still true. They run under `node --test` with no bundler and no
// device, so they are cheap enough to run on every change.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const webJs = (name: string) => resolve(here, '../../public/js', name);
const read = (name: string) => readFileSync(webJs(name), 'utf8');

test('the pure modules this app shares have no imports of their own', async (t) => {
  // If one of these grows an import of a browser API, it stops being safely
  // shareable and this test is where that gets noticed.
  for (const name of ['geo.js', 'verification.js', 'janazah-guide-content.js']) {
    await t.test(name, () => {
      const source = read(name);
      assert.equal(
        /^\s*import\s/m.test(source), false,
        `${name} has grown an import; check it still runs outside a browser`,
      );
    });
  }
});

test('model.js imports only modules that are safe on a device', () => {
  const imports = [...read('model.js').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  for (const specifier of imports) {
    assert.ok(
      ['./geo.js', './config.js'].includes(specifier!),
      `model.js now imports ${specifier}, which src/shared/model.ts does not account for`,
    );
  }
});

test('constants restated in src/shared/config.ts still match the web app', async () => {
  const web = read('config.js');
  const number = (key: string) => {
    const match = web.match(new RegExp(`${key}:\\s*(\\d+)`));
    assert.ok(match, `${key} not found in public/js/config.js`);
    return Number(match![1]);
  };
  const shared = await import('../src/shared/config.ts');

  assert.equal(number('cellPrecision'), shared.CELL_PRECISION);
  assert.equal(number('currentWindowHours'), shared.CURRENT_WINDOW_HOURS);
  assert.match(web, new RegExp(`defaultTimeZone:\\s*'${shared.DEFAULT_TIME_ZONE}'`));
});

test('geo.js behaves the same when imported from here as the web tests expect', async () => {
  const geo = await import('../../public/js/geo.js');

  // Values pinned by tests/geo.test.js in the repository root. Repeated here
  // so a break shows up as "the bridge is wrong" rather than only as a web
  // test failure.
  assert.equal(geo.geohash(43.6532, -79.3832, 5), 'dpz83');
  assert.ok(Math.abs(geo.distanceKm(
    { lat: 43.6532, lng: -79.3832 },
    { lat: 43.7615, lng: -79.4111 },
  ) - 12.1) < 0.5);

  const { cells, precision } = geo.subscriptionCells(43.6532, -79.3832, 10);
  assert.ok(cells.length > 0 && cells.length <= 40);
  assert.ok(precision >= 2 && precision <= 5);
  assert.ok(cells.every((c: string) => /^[0-9bcdefghjkmnpqrstuvwxyz]+$/.test(c)));
});

test('the notice public key list is the one the rules enforce', async () => {
  const model = await import('../../public/js/model.js');
  const rules = readFileSync(resolve(here, '../../firestore.rules'), 'utf8');
  const block = rules.match(/function noticePublicKeys\(\)\s*\{[\s\S]*?\}/);
  assert.ok(block, 'noticePublicKeys() not found in firestore.rules');

  for (const key of model.NOTICE_PUBLIC_KEYS) {
    assert.ok(
      block![0].includes(`'${key}'`),
      `${key} is a public key on the client but not in firestore.rules`,
    );
  }
});
