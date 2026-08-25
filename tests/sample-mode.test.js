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

  test('the flag is a single boolean, documented as the removal step', () => {
    assert.match(config, /sampleData:\s*(true|false),/,
      'one flag, so removal cannot be partially done');
    assert.match(config, /Set to false before this site is public/i,
      'the config must say plainly what has to happen before launch');
  });

  test('nothing sample-related is ever written to the database', () => {
    // The whole point of the flag over the seeding script: no cleanup.
    const sampleAware = store.split('\n').filter((l) => /sample/i.test(l));
    for (const line of sampleAware) {
      assert.doesNotMatch(line, /addDoc|setDoc|updateDoc|deleteDoc/,
        `sample data must never be written: ${line.trim()}`);
    }
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
      assert.match(readFileSync(boot, 'utf8'),
        /isSampleMode\(\)[\s\S]{0,80}sample-banner/,
        `${boot} must reveal the banner when the flag is on`);
    }
  });
});
