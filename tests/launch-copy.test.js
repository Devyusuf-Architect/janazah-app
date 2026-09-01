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
import { readFileSync, globSync } from 'node:fs';

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

// No em dashes in anything a person reads.
//
// Not a house-style quibble: the em dash is the one punctuation mark this
// codebase reaches for by habit in its own commentary, and copy written next
// to that commentary picks it up. It renders as a stray long rule in a page
// title, in a table cell standing in for a missing value, and in the middle
// of a sentence somebody is reading in a hurry at the worst moment of their
// week. A comma, a colon, a full stop or a plain hyphen all say the same
// thing and read as ordinary writing.
//
// Comments are exempt. They are not copy, this file's authorial voice uses
// the mark freely, and a guard that fails on a comment is one somebody turns
// off. So block comments and whole-line // comments are stripped first, and
// what is left is code: an em dash surviving that is in a string literal or
// in HTML text, which is to say on somebody's screen.
describe('no em dash reaches a reader', () => {
  const SOURCES = [
    ...globSync('public/js/**/*.js'),
    ...globSync('public/*.html'),
  ].sort();

  test('the sweep covers the whole front end, not a handful of files', () => {
    assert.ok(SOURCES.length >= 40,
      `only ${SOURCES.length} files scanned; the glob has stopped matching`);
    for (const expected of [
      'public/js/feed.js', 'public/js/views/account.js',
      'public/js/views/admin.js', 'public/js/views/admin/common.js',
      'public/console.html', 'public/index.html',
    ]) {
      assert.ok(SOURCES.includes(expected), `${expected} is not being scanned`);
    }
  });

  for (const file of SOURCES) {
    test(`${file} has no em dash outside its comments`, () => {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'));
      for (const [index, line] of code.entries()) {
        assert.ok(!line.includes('—'),
          `${file} line ${index + 1} has an em dash in copy: ${line.trim()}`);
      }
    });
  }
});
