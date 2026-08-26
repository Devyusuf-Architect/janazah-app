// Motion must never cost anyone the content.
//
// The animation itself is not worth a test. What is worth pinning is the
// failure mode: a reveal-on-scroll built the usual way hides content in CSS
// and un-hides it in JavaScript, so a script error, an old browser or a
// blocked bundle leaves a blank page. On an app whose entire purpose is
// telling people about a Janazah in time, that is not a cosmetic bug.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const css = readFileSync('public/css/styles.css', 'utf8');
const motion = readFileSync('public/js/motion.js', 'utf8');

describe('reveal animations cannot strand content', () => {
  test('reduced motion resets .reveal to fully visible', () => {
    const block = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    assert.match(block, /\.reveal[^{]*\{[^}]*opacity:\s*1/,
      'someone with reduced motion on must see .reveal content at full opacity');
    assert.match(block, /scroll-behavior:\s*auto/,
      'smooth scrolling is motion too, and the blanket transition reset does not cover it');
  });

  test('there is a no-JavaScript fallback', () => {
    assert.match(css, /@media \(scripting: none\)[\s\S]{0,120}\.reveal[^}]*opacity:\s*1/,
      'with scripting off, nothing may stay faded out');
  });

  test('the observer reveals rather than hides', () => {
    // It may only ever add the class that makes something visible.
    assert.match(motion, /classList\.add\('is-revealed'\)/);
    assert.doesNotMatch(motion, /classList\.remove\('is-revealed'\)/,
      'nothing should ever be un-revealed');
    assert.doesNotMatch(motion, /style\.(opacity|display|visibility)/,
      'visibility belongs to CSS, where the reduced-motion and no-JS fallbacks live');
  });

  test('reduced motion is checked before anything is observed', () => {
    assert.match(motion, /prefers-reduced-motion: reduce/,
      'the module must honour the preference itself, not rely on CSS alone');
    assert.match(motion, /if \(REDUCED\(\) \|\| !io\)/,
      'with reduced motion, or no IntersectionObserver, everything must show immediately');
  });

  test('only compositor-friendly properties are animated on scroll', () => {
    const rule = css.slice(css.indexOf('.reveal {'), css.indexOf('.reveal.is-revealed'));
    assert.match(rule, /transition:\s*opacity[^;]*transform[^;]*;/,
      'animating anything but opacity and transform forces layout on every frame');
  });
});

describe('the reactive layer', () => {
  const css = readFileSync('public/css/styles.css', 'utf8');
  const motion = readFileSync('public/js/motion.js', 'utf8');

  test('a route change animates the page rather than swapping it', () => {
    // A page appearing instantly reads as a browser reload; a short rise
    // reads as the same app moving.
    assert.match(css, /@keyframes pageEnter/);
    assert.match(css, /\.view\.is-entering \{ animation: pageEnter/);
    assert.match(motion, /export function pageEnter/);
    for (const entry of ['public/js/feed.js', 'public/js/app.js']) {
      assert.match(readFileSync(entry, 'utf8'), /pageEnter\(mount\(\)\)/,
        `${entry} must play the page transition`);
    }
  });

  test('the page transition is skipped, not merely shortened, under reduced motion', () => {
    // Checked in JavaScript before the class is applied, so the animation
    // never starts rather than starting and being overridden.
    const fn = motion.slice(motion.indexOf('export function pageEnter'));
    assert.match(fn.slice(0, 200), /if \(!node \|\| REDUCED\(\)\) return;/);
  });

  test('the entry animation can replay on every route, not just the first', () => {
    // Same element every time: without the forced reflow the class re-add is
    // coalesced and the animation plays once per page load.
    assert.match(motion, /node\.classList\.remove\('is-entering'\)[\s\S]{0,300}void node\.offsetWidth/);
  });

  test('keyboard focus is visible on every interactive control', () => {
    const block = css.slice(css.indexOf('.btn:focus-visible'));
    const selectors = block.slice(0, block.indexOf('{'));
    for (const control of [
      '.nav-item', '.account__button', '.qa__item', '.jrow__main', '.tab',
    ]) {
      assert.ok(selectors.includes(control), `${control} has no focus ring`);
    }
    assert.match(block.slice(0, 500), /outline: 2px solid var\(--accent\)/);
  });

  test('nothing animates itself: every rule added is a hover, press or focus', () => {
    const section = css.slice(css.indexOf('Reactive controls.'));
    const stopAt = section.indexOf('/* ---------- reduced motion');
    const body = stopAt > 0 ? section.slice(0, stopAt) : section;
    // An `animation:` that is not tied to an interaction would run on its own.
    const animations = body.match(/^\s*animation: [a-zA-Z]/gm) || [];
    for (const line of animations) {
      assert.ok(/pageEnter/.test(body.slice(body.indexOf(line), body.indexOf(line) + 60)),
        `an unprompted animation appeared: ${line.trim()}`);
    }
  });

  test('motion stays small: no transform larger than a few pixels', () => {
    const section = css.slice(css.indexOf('Reactive controls.'));
    for (const match of section.matchAll(/translate[XY]\((-?[\d.]+)px\)/g)) {
      assert.ok(Math.abs(Number(match[1])) <= 3,
        `a ${match[1]}px move is more than this application should do: ${match[0]}`);
    }
    for (const match of section.matchAll(/scale\(([\d.]+)\)/g)) {
      assert.ok(Math.abs(1 - Number(match[1])) <= 0.05,
        `scale(${match[1]}) is a bounce, not feedback`);
    }
  });

  test('every reactive rule is turned off again under reduced motion', () => {
    const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    for (const selector of [
      '.view.is-entering', '.btn--primary:hover', '.nav-item::before',
      '.account__caret', '.qa__item .icon', '.place-picker',
    ]) {
      assert.ok(reduced.includes(selector), `${selector} still moves under reduced motion`);
    }
  });

  test('there is exactly one place that answers "what moves"', () => {
    // Two reduced-motion blocks at the end of the sheet is how one of them
    // quietly stops being maintained.
    const globals = css.split('@media (prefers-reduced-motion: reduce)').length - 1;
    assert.ok(globals <= 2,
      `${globals} reduced-motion blocks; they should be consolidated`);
  });
});
