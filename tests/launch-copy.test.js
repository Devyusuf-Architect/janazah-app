// The copy shown while the live site is genuinely new: zero real notices,
// zero verified masjids. sample data is off (config.js), so these are the
// only things a visitor to the real production site sees in that gap, and
// they must read as an early, honest platform rather than a broken or
// abandoned one.
//
// These are source-text assertions, the same approach tests/error-copy.test.js
// and tests/takedown.test.js use, because exercising the true zero-notice,
// zero-org state end-to-end would require a database with nothing seeded in
// it, which the e2e suite's fixtures do not leave it in.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('public/js/views/home.js', 'utf8');
const masjids = readFileSync('public/js/views/masjids.js', 'utf8');
const nearby = readFileSync('public/js/views/nearby.js', 'utf8');
const config = readFileSync('public/js/config.js', 'utf8');

const FORBIDDEN_WORDS = /\b(beta|test|demo|prototype)\b/i;

describe('sample data defaults to off', () => {
  test('the production flag is false', () => {
    assert.match(config, /sampleData:\s*false,/,
      'sample data must be off by default now the site is public');
  });
});

describe('the homepage when there are zero real notices', () => {
  test('the upcoming section explains the site is new, not broken', () => {
    assert.match(home, /No Janazah notices have been published yet\./);
    assert.match(home, /currently welcoming Masjids and funeral coordinators/);
  });

  test('it offers a way forward for both a visitor and a masjid', () => {
    assert.match(home, /'Find a Masjid'/);
    assert.match(home, /'Register a Masjid'/);
  });

  test('a search with no matches says so in the required wording', () => {
    assert.match(home, /No Janazahs match your search\./);
  });

  test('the zero-notices explore block is conditional, not permanent', () => {
    const fn = home.slice(home.indexOf('function paintExplore'));
    assert.match(fn.slice(0, 300), /if \(state\.loading \|\| state\.notices\.length\)/,
      'the explore block must hide itself once real notices exist');
  });

  test('the masjid-registration call to action is present and prominent', () => {
    assert.match(home, /Bring Your Masjid to Ta.ziyah/);
    assert.match(home, /Register your Masjid to publish verified Janazah notices/);
    assert.match(home, /'Register Organization'/);
  });

  test('the growing note exists and never claims a fake number', () => {
    assert.match(home, /Ta.ziyah is growing/);
    assert.match(home, /onboarding Masjids across Ontario/);
    assert.doesNotMatch(home, /\b\d[\d,]*\+?\s+(Masjids|masjids|Janazahs|janazahs|users|organizations)\b/,
      'the launch copy must never state a fabricated count');
  });
});

describe('the masjid directory when there are zero verified orgs', () => {
  test('it explains the gap and offers registration', () => {
    assert.match(masjids, /Verified Masjids will appear here as they join Ta.ziyah\./);
    assert.match(masjids, /'Register Your Masjid'/);
  });
});

describe('near-me when location is on and nothing is nearby', () => {
  test('the true zero-notice case has its own wording', () => {
    assert.match(nearby, /There are currently no published Janazahs near you\./);
  });
});

describe('none of this copy uses words that describe an unfinished product', () => {
  for (const [name, text] of [['home.js', home], ['masjids.js', masjids], ['nearby.js', nearby]]) {
    test(`${name} avoids beta/test/demo/prototype in its strings`, () => {
      // Pull out only quoted string literals and template literals, so a code
      // comment mentioning "test" (as in unit test) is not a false failure —
      // the constraint is on user-facing copy, which lives in these literals.
      const literals = text.match(/'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g) || [];
      for (const literal of literals) {
        assert.doesNotMatch(literal, FORBIDDEN_WORDS,
          `${name} contains a forbidden word in: ${literal}`);
      }
    });
  }
});
