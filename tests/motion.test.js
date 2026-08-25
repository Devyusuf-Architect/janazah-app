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
