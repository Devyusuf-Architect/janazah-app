// The sample-data switch, and what it must guarantee.
//
// Fictional Janazah notices are being shown on a live site to testers. Two
// things have to hold, and neither can rely on someone remembering:
//
//   While on   every sample record is unmistakably fake, and the page says so.
//   While off  not one of them can reach a reader, by any path.
//
// The second is the one worth a test. "Remove the sample data before launch"
// is a task that gets forgotten; "flipping one boolean removes all of it" is
// a property that can be checked.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const mode = readFileSync('public/js/sample-mode.js', 'utf8');
const store = readFileSync('public/js/store.js', 'utf8');
const config = readFileSync('public/js/config.js', 'utf8');

describe('turning the flag off removes everything', () => {
  test('every producer is gated on the flag', () => {
    // sampleOrgs and sampleNotices are the only two sources; everything else
    // in the module derives from them, so gating both closes every path.
    for (const fn of ['sampleOrgs', 'sampleNotices']) {
      const body = mode.slice(mode.indexOf(`export function ${fn}(`));
      assert.match(body.slice(0, 200), /if \(!isSampleMode\(\)\) return \[\];/,
        `${fn} must return nothing while the flag is off`);
    }
    assert.match(mode, /export function withSamples[\s\S]{0,120}if \(!isSampleMode\(\)\) return live;/,
      'withSamples must pass live data straight through while the flag is off');
  });

  test('the flag is a single boolean, off by default now the site is live', () => {
    assert.match(config, /sampleData:\s*(true|false),/,
      'one flag, so removal cannot be partially done');
    assert.match(config, /sampleData:\s*false,/,
      'the production default must be off now that the site is public');
    assert.match(config, /Off, because this site is public/i,
      'the config must say plainly why the default is off');
  });

  test('the displayed samples are never written to the database', () => {
    // Two separate things share the name "sample data", and only one of them
    // writes anything:
    //
    //   the flag        folds built-in examples into what is displayed.
    //                   Writes nothing, so turning it off needs no cleanup.
    //   the admin tab   writes real documents an administrator can then edit,
    //                   and removes them again on request.
    //
    // This pins the first. The producers in sample-mode.js must never write.
    assert.doesNotMatch(mode, /addDoc|setDoc|updateDoc|deleteDoc/,
      'the displayed samples must be display-only, so the flag alone removes them');
  });

  test('every write the admin tab makes is confined to a sample- id', () => {
    // The rules permit deleting a `sample-` notice or organization and
    // nothing else. If a write here ever landed on an unprefixed id, it would
    // create a record the admin portal offers to remove but cannot.
    const seed = store.slice(store.indexOf('export async function seedSampleData'),
      store.indexOf('async function samplePrefixed'));
    for (const call of seed.match(/doc\(db, '(?:notices|organizations)'[^)]*\)/g) || []) {
      assert.match(call, /sampleId\(/,
        `every seeded document needs a sample- id: ${call}`);
    }
    // And removal only ever deletes what that prefix search returned.
    const remove = store.slice(store.indexOf('export async function removeSampleData'));
    assert.match(remove.slice(0, 400), /samplePrefixed\(name\)/,
      'removal must delete only prefix-matched documents');
  });
});

describe('while it is on, samples cannot be mistaken for real notices', () => {
  test('sample records carry a prefixed id', () => {
    assert.match(mode, /const PREFIX = 'sample-'/,
      'a prefixed id is what keeps a sample distinguishable from a real record');
  });

  test('a banner is shown on both pages, with no way to dismiss it', () => {
    for (const page of ['public/index.html', 'public/console.html']) {
      const html = readFileSync(page, 'utf8');
      assert.match(html, /id="sample-banner"/, `${page} has no sample banner`);
      assert.match(html, /not real Janazah notices/i,
        `${page} must say plainly that the notices are not real`);
    }
    for (const boot of ['public/js/feed.js', 'public/js/app.js']) {
      const src = readFileSync(boot, 'utf8');
      assert.match(src, /isSampleMode/,
        `${boot} must decide the banner from sample mode`);
      assert.match(src, /sample-banner/,
        `${boot} must reveal the banner when sample mode is on`);
    }
  });
});
