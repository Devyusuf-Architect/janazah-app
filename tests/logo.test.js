// Ta'ziyah's mark.
//
// The bug this exists to catch already happened once, in the course of
// building this file: an SVG loaded through an <img> tag is parsed as strict
// XML, and a literal double hyphen inside an XML comment breaks that parse.
// Chromium's failure mode for that is silent -- no console error, no failed
// network request, the file serves with a 200 and the correct content type
// -- it just decodes as a zero-size image, which is a see-nothing bug that
// found the same shape of failure earlier the same session in
// public/js/qr.js and public/js/views/auth.js. The fix is cheap only if
// something keeps re-checking it.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/logo.svg', 'utf8');
const index = readFileSync('public/index.html', 'utf8');
const consoleHtml = readFileSync('public/console.html', 'utf8');
const shell = readFileSync('demo/shell.html', 'utf8');
const firebase = readFileSync('public/js/firebase.js', 'utf8');
const css = readFileSync('public/css/styles.css', 'utf8');

/** PNG width/height straight from the IHDR chunk, no image library needed. */
function pngSize(path) {
  const buf = readFileSync(path);
  assert.equal(buf.toString('ascii', 12, 16), 'IHDR', `${path} has no IHDR chunk`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('the SVG itself', () => {
  test('every tag opened is a tag closed', () => {
    // No XML library in this project, so this is a small, honest proxy for
    // "well-formed enough for a strict parser": every element that opens
    // (and is not self-closing) has a matching close, in order. Loose, but
    // it is exactly the class of mistake a hand-edited path or group tag is
    // prone to, and it needs no dependency to check.
    // Strip comments first: this file's own header prose mentions markup
    // like "<img src>" in passing, which would otherwise be misread as a
    // real, unclosed tag.
    const withoutComments = svg.replace(/<!--[\s\S]*?-->/g, '');
    const stack = [];
    const tags = withoutComments.match(/<\/?[a-zA-Z][\w:-]*(?:[^>]*[^/])?>/g) || [];
    for (const tag of tags) {
      if (tag.endsWith('/>')) continue;
      const name = tag.match(/^<\/?([a-zA-Z][\w:-]*)/)[1];
      if (tag.startsWith('</')) {
        assert.equal(stack.pop(), name, `mismatched close for </${name}> in logo.svg`);
      } else {
        stack.push(name);
      }
    }
    assert.deepEqual(stack, [], `unclosed tag(s) in logo.svg: ${stack.join(', ')}`);
  });

  test('specifically: no comment contains a literal double hyphen', () => {
    // The actual bug that shipped: this is invalid inside an XML comment, an
    // <img src="..."> load parses the file as strict XML, and Chromium's
    // failure mode for that is silent -- no console error, a normal 200
    // response, just a decoded image with naturalWidth 0.

    // The one rule that bit us, checked directly so a future edit to the
    // artwork's own comments cannot reintroduce it by accident.
    for (const comment of svg.match(/<!--[\s\S]*?-->/g) || []) {
      const body = comment.slice(4, -3);
      assert.ok(!body.includes('--'), `a comment contains "--": ${comment.slice(0, 60)}...`);
    }
  });

  test('is a circular badge in the app’s own accent colours', () => {
    // Fixed, not theme-reactive: a badge-style logo stays the same in light
    // and dark mode, the way a real app icon would.
    assert.match(svg, /<circle cx="50" cy="50" r="50" fill="#14503f"\/>/);
    assert.match(svg, /fill="#faf7f2"/);
  });

  test('carries no external reference of its own', () => {
    // It has to keep working when inlined into the self-contained demo
    // preview (no network, per demo/build.mjs) and when served as a static
    // file from hosting; either way, nothing inside it may fetch anything.
    assert.ok(!/href="http|src="http|xlink:href/.test(svg));
  });
});

describe('every place the mark is supposed to appear', () => {
  test('nothing still uses the old diamond glyph', () => {
    for (const [name, source] of [
      ['index.html', index], ['console.html', consoleHtml],
      ['demo/shell.html', shell], ['firebase.js', firebase],
    ]) {
      assert.ok(!source.includes('◆'), `${name} still has the old ◆ mark`);
      assert.ok(!source.includes('&#9670;'), `${name} still has the old ◆ mark`);
    }
  });

  test('the masthead in both entry points references the real file', () => {
    for (const [name, source] of [['index.html', index], ['console.html', consoleHtml]]) {
      assert.match(source, /<img class="brand__mark" src="\/logo\.svg"/, `${name} masthead`);
    }
  });

  test('the favicon is the same file, with a PNG fallback for browsers that need one', () => {
    for (const [name, source] of [['index.html', index], ['console.html', consoleHtml]]) {
      assert.match(source, /<link rel="icon" type="image\/svg\+xml" href="\/logo\.svg">/, name);
      assert.match(source, /<link rel="icon" href="\/icon-192\.png">/, name);
    }
  });

  test('the self-contained demo preview inlines it rather than fetching it', () => {
    // demo/build.mjs's own stated point: "one HTML file, no network,
    // no backend." An <img src> here would be the one thing on the page
    // that quietly needs a server.
    assert.match(shell, /<svg class="brand__mark" viewBox="0 0 100 100"/);
    assert.ok(!/logo\.svg/.test(shell), 'the preview must not reference the file externally');
  });

  test('the unconfigured-Firebase screen uses it too', () => {
    // The one screen in the app that deliberately replaces the whole
    // document and cannot assume styles.css survived that -- it still
    // reaches for the same file rather than falling back to text.
    assert.match(firebase, /<img class="mark" src="\/logo\.svg"/);
  });

  test('.brand__mark no longer draws its own background', () => {
    // The mark is self-contained now: its circle and both colours are baked
    // into the file. A leftover background/color rule here would either do
    // nothing (harmless) or fight the image if a future edit makes the mark
    // partially transparent (not harmless), so it should simply be gone.
    const rule = css.slice(css.indexOf('.brand__mark {'), css.indexOf('}', css.indexOf('.brand__mark {')));
    assert.ok(!/background:/.test(rule), 'brand__mark should not draw its own background any more');
  });
});

describe('the rasters scripts/build-logo-icons.mjs produces', () => {
  test('are the exact sizes every consumer expects', () => {
    // firebase-messaging-sw.js and functions/lib/notify.js both hard-code
    // these paths; the notification icon and badge would silently be wrong
    // shapes without matching this.
    assert.deepEqual(pngSize('public/icon-192.png'), { width: 192, height: 192 });
    assert.deepEqual(pngSize('public/icon-512.png'), { width: 512, height: 512 });
    assert.deepEqual(pngSize('public/badge.png'), { width: 96, height: 96 });
  });
});
