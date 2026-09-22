// The browser's own back button.
//
// This application paints its own pages, so every rule the browser would
// normally enforce about navigation is one this code has to keep. Three of
// them were broken at once, and the symptom people reported was the vaguest
// possible: "back does not reliably take me to the previous page".
//
// What it actually was:
//
//   a duplicate entry per click   every click pushed an entry, including a
//                                 click on the nav item for the page already
//                                 open. Back then returned to the same
//                                 address and looked like it had done
//                                 nothing. The nav is on every screen, so
//                                 this happened constantly.
//   a lost position               the offset lived in a Map in one module,
//                                 so Forward and reload both returned to the
//                                 top, and the single synchronous restore
//                                 ran before the live snapshot had painted,
//                                 against a document still one screen tall.
//   hijacked modifier clicks      only ctrl and cmd were let through, so a
//                                 shift-click navigated in place instead of
//                                 opening a window.
//
// The end-to-end suite drives a real browser over this. These are the
// invariants that must hold in the source for that to keep being true.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const feed = readFileSync('public/js/feed.js', 'utf8');
const motion = readFileSync('public/js/motion.js', 'utf8');

/** The delegated link handler, which is the whole of in-app navigation. */
const clickHandler = feed.slice(
  feed.indexOf("document.addEventListener('click'"),
  feed.indexOf("window.addEventListener('popstate'"));

describe('navigating within the site', () => {
  test('going where you already are adds no history entry', () => {
    // The bug: the nav item for the current page pushed another identical
    // entry on every click, so Back stepped between two copies of the same
    // address and appeared broken.
    assert.match(clickHandler, /if \(there === here\)/,
      'the handler must compare the destination with the current address');
    // Up to the branch's own return, rather than to the first closing brace:
    // the body contains an object literal, whose brace comes first.
    const branch = clickHandler.slice(clickHandler.indexOf('if (there === here)'));
    const body = branch.slice(0, branch.indexOf('return;') + 7);
    assert.ok(!/pushState/.test(body),
      'the same-address branch must not push an entry');
    assert.ok(/return;/.test(body), 'it must stop before navigating');
  });

  test('a real navigation pushes exactly one entry', () => {
    assert.equal((clickHandler.match(/history\.pushState/g) || []).length, 1);
  });

  test('the browser keeps the clicks it is meant to keep', () => {
    // Each of these is a link people genuinely use: a new window, a saved
    // target, a new tab. Intercepting any of them navigates in place and
    // takes the behaviour away.
    for (const [what, pattern] of [
      ['a shift-click', /event\.shiftKey/],
      ['an alt-click', /event\.altKey/],
      ['a ctrl-click', /event\.ctrlKey/],
      ['a cmd-click', /event\.metaKey/],
      ['a middle-click', /event\.button !== 0/],
      ['a download link', /hasAttribute\('download'\)/],
      ['a new-tab target', /link\.target === '_blank'/],
      ['a handled event', /event\.defaultPrevented/],
    ]) {
      assert.match(clickHandler, pattern, `${what} is hijacked`);
    }
  });

  test('links off this site and into the console are left alone', () => {
    assert.match(clickHandler, /url\.origin !== location\.origin/);
    assert.match(clickHandler, /url\.pathname\.startsWith\('\/console'\)/);
  });

  test('back and forward both re-render from the address', () => {
    assert.match(feed, /window\.addEventListener\('popstate', \(\) => route\(\{ back: true \}\)\)/);
  });
});

describe('where the page was left', () => {
  test('the offset is stored on the history entry, not in memory', () => {
    // A Map only answers for the entry you came from, in the tab you are
    // still in: Forward returned to the top, and so did reloading and then
    // pressing Back.
    assert.match(motion, /history\.replaceState\(\{ \.\.\.history\.state, scrollY \}/);
    assert.match(motion, /Number\(history\.state\?\.scrollY\)/);
    assert.ok(!/const positions = new Map\(\)/.test(motion),
      'the in-memory position map is back');
  });

  test('restoring survives the page painting twice', () => {
    // Views paint synchronously and again when the live snapshot arrives.
    // Scrolling to an offset against the first paint does nothing, because
    // the document is still one screen tall and the browser clamps it.
    const fn = motion.slice(motion.indexOf('export function restoreScroll'));
    assert.match(fn.slice(0, 1400), /requestAnimationFrame\(settle\)/,
      'a single synchronous attempt loses the position');
    assert.match(fn.slice(0, 1400), /frames\+\+ > \d+/, 'the retry must be bounded');
  });

  test('the reader scrolling cancels the restore', () => {
    const fn = motion.slice(motion.indexOf('export function restoreScroll'));
    assert.match(fn.slice(0, 1600), /'wheel', 'touchstart', 'keydown'/,
      'fighting somebody who has taken over scrolling is worse than missing');
  });

  test('writing the offset while scrolling is throttled', () => {
    // Safari rate-limits history writes and starts throwing past the
    // ceiling, so a scroll handler must not write on every frame.
    assert.match(motion, /SAVE_EVERY_MS = \d{3}/);
    assert.match(motion, /MOVED_ENOUGH = \d+/);
    const fn = motion.slice(motion.indexOf('export function rememberScroll'));
    assert.match(fn.slice(0, 400), /catch/, 'a refused history write must not break the page');
  });

  test('it is saved before the page is left, including on a phone', () => {
    assert.match(motion, /window\.addEventListener\('pagehide', rememberScroll\)/);
    assert.ok(clickHandler.indexOf('rememberScroll()') < clickHandler.indexOf('pushState'),
      'the offset must be recorded before the entry stops being the current one');
  });
});

describe('a repaint is not a navigation', () => {
  test('something loading late does not move the reader or replay the entrance', () => {
    // Platform settings and the sample-data flag resolve a few hundred
    // milliseconds after load and rebuild the view. Treated as navigations,
    // they scrolled the page to the top and played the entry animation
    // again, which is most of what "back does not restore my place" was.
    for (const late of ['initSampleMode(', 'initPlatformSettings(']) {
      // The call, not the import of the same name at the top of the file.
      const at = feed.lastIndexOf(late);
      assert.match(feed.slice(at, at + 400), /route\(\{ quiet: true \}\)/,
        `${late} must repaint quietly`);
    }
    const fn = feed.slice(feed.indexOf('function route({'));
    assert.match(fn.slice(0, 1600), /if \(!quiet\) \{[\s\S]{0,160}restoreScroll/,
      'a quiet repaint must not touch the scroll position');
  });
});

describe('a route that changes the address', () => {
  test('it replaces rather than pushing, so Back skips the redirect', () => {
    // An entry for a page that immediately sends you somewhere else is an
    // entry Back lands on and bounces off, which is the other way a back
    // button stops working.
    const fn = feed.slice(feed.indexOf('function redirect'));
    assert.match(fn.slice(0, 220), /history\.replaceState\(history\.state, '', to\)/);
  });

  test('redirecting does not call route from inside itself', () => {
    // It used to, and the nested call installed a MutationObserver that the
    // outer call then replaced without disconnecting: one leaked observer
    // per redirect, each holding a whole detached view.
    const renderRoute = feed.slice(feed.indexOf('function renderRoute'),
      feed.indexOf('function route({'));
    assert.ok(!/\n\s*route\(\);/.test(renderRoute),
      'renderRoute must return REDIRECTED rather than re-entering route()');
    assert.match(feed, /while \(renderRoute\(\) === REDIRECTED && guard\+\+ < \d+\)/,
      'the retry must be bounded, or two routes pointing at each other hang the tab');
  });
});
