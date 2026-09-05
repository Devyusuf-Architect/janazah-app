// Static checks for the mobile-QA pass: the Near Me progressive disclosure
// (item 3), the About page's link back to the welcome/introduction (item 5),
// and the bottom-nav auth-flash fix (item 4/6). Same source-text approach as
// tests/org-archive.test.js: these views pull in firebase.js and DOM APIs a
// plain Node test cannot provide, so the properties that matter are checked
// in the source rather than by rendering.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const nearby = readFileSync('public/js/views/nearby.js', 'utf8');
const about = readFileSync('public/js/views/about.js', 'utf8');
const nav = readFileSync('public/js/nav.js', 'utf8');
const css = readFileSync('public/css/styles.css', 'utf8');

describe('Near Me: a short privacy line up front, the full explanation one tap away', () => {
  test('the consent panel leads with a one-line promise and the "Use my location" action, not the full essay', () => {
    const fn = nearby.slice(
      nearby.indexOf('export function consentPanel'),
      nearby.indexOf('export function settingsPanel'),
    );
    const shortIdx = fn.indexOf('consent__short');
    const detailsIdx = fn.indexOf("el('details'");
    assert.notEqual(shortIdx, -1, 'a short summary paragraph must exist');
    assert.notEqual(detailsIdx, -1, 'the long explanation must live in a <details> disclosure');
    assert.ok(shortIdx < detailsIdx,
      'the short line must come before the collapsed long explanation, not after it');
  });

  test('the full explanation text is preserved in full inside the disclosure, not deleted', () => {
    const fn = nearby.slice(nearby.indexOf('export function consentPanel'));
    const details = fn.slice(fn.indexOf("el('details'"));
    for (const phrase of [
      'used in your browser only',
      'never sent to us, to any masjid',
      'Only your most recent position is kept',
      'Turning this off erases the stored position',
      'Nobody can see which Janazahs you looked at',
    ]) {
      assert.ok(details.includes(phrase), `expected the disclosure body to still include: "${phrase}"`);
    }
  });

  test('reuses the same <details>/<summary> pattern as "Past notices", not a new widget', () => {
    assert.match(nearby, /class: 'disclosure/);
    assert.match(css, /\.disclosure > summary/);
  });
});

describe('About: a permanent, discoverable way back to the welcome/introduction', () => {
  test('links to /welcome without touching the first-visit flag', () => {
    assert.match(about, /href:\s*'\/welcome'/);
    // A plain navigation, not a call that would clear or set the visited flag.
    assert.doesNotMatch(about, /markVisited|taziyah\.visited/);
  });
});

describe('bottom nav: no flash of the wrong signed-in state before auth resolves', () => {
  test('renderBottomNav takes authReady and holds at a neutral placeholder until it is true', () => {
    const fn = nav.slice(
      nav.indexOf('function renderBottomNav'),
      nav.indexOf('function renderBottomNav') + 1500,
    );
    assert.match(fn, /authReady/);
    assert.match(fn, /bottom-nav__avatar--placeholder/);
  });

  test('the placeholder style exists and is a neutral fill, not the signed-in accent', () => {
    const rule = css.slice(css.indexOf('.bottom-nav__avatar--placeholder'));
    assert.match(rule.slice(0, 200), /background:\s*var\(--bg-sunk\)/);
  });
});
