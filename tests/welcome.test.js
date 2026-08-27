// The first thing a new visitor sees.
//
// Two things are being protected here. The first is that this page is shown
// once and then gets out of the way: a welcome screen standing between
// somebody and a funeral notice on their second visit is an obstacle, not a
// welcome. The second is that it stays a page about a real service — it shows
// notices that actually exist rather than an invented one, and it does not
// perform at somebody who has just been bereaved.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const welcome = readFileSync('public/js/views/welcome.js', 'utf8');
const feed = readFileSync('public/js/feed.js', 'utf8');
const visited = readFileSync('public/js/visited.js', 'utf8');
const css = readFileSync('public/css/styles.css', 'utf8');

/** The welcome section of the stylesheet, not everything after it. */
const welcomeCss = (() => {
  const from = css.indexOf('The welcome page.');
  const rest = css.slice(from);
  const next = rest.indexOf('/* ------------------------------------', 10);
  return next > 0 ? rest.slice(0, next) : rest;
})();

describe('it is shown once', () => {
  test('only a first visit to the site root is redirected', () => {
    assert.match(feed, /if \(path === '\/' && firstVisit\) \{/);
    // Read before marking, so the first route of a session still knows it was.
    assert.match(feed, /const firstVisit = isFirstVisit\(\);\s*\n\s*markVisited\(\);/);
    assert.match(feed, /history\.replaceState\(null, '', '\/welcome'\)/);
  });

  test('a link straight to a notice is never interrupted', () => {
    // Somebody who arrived at a real funeral notice has already seen the
    // thing an introduction would describe.
    const branch = feed.slice(feed.indexOf("if (path === '/' && firstVisit)"));
    assert.match(branch.slice(0, 400), /renderWelcome\(mount\(\)\)/);
    // The notice route returns long before this branch is reached.
    assert.ok(feed.indexOf('renderSingleNotice(mount()') <
      feed.indexOf("if (path === '/' && firstVisit)"));
  });

  test('replaceState, so back does not land on the welcome again', () => {
    assert.ok(!/pushState\(null, '', '\/welcome'\)/.test(feed));
  });

  test('the page stays reachable at its own address afterwards', () => {
    assert.match(feed, /if \(\/\^\\\/welcome\\\/\?\$\/\.test\(path\)\)/);
  });

  test('blocked storage means "already visited", not "welcome every time"', () => {
    // Showing an introduction in a private window on every single visit puts
    // it between somebody and a funeral notice, repeatedly.
    const fn = visited.slice(visited.indexOf('export function isFirstVisit'));
    assert.match(fn.slice(0, 400), /catch \{\s*\n?\s*return false;/);
  });

  test('the console counts as having been here', () => {
    // A coordinator clicking through to the public site should see their
    // notices, not an introduction to the service they publish on.
    assert.match(readFileSync('public/js/app.js', 'utf8'), /markVisited\(\);/);
  });

  test('nothing about the visit is stored anywhere but the device', () => {
    assert.match(visited, /localStorage\.setItem\(KEY, '1'\)/);
    assert.ok(!/document\.cookie/.test(visited), 'no cookie');
    assert.ok(!/setDoc|addDoc|fetch\(/.test(visited), 'nothing written server-side');
  });
});

describe('what it says', () => {
  test('it answers what this is, who publishes, and what happens to my data', () => {
    for (const claim of [
      'verified masjids', 'platform administrator', 'never sent to a masjid',
      'No account needed',
    ]) {
      assert.ok(welcome.includes(claim), `the welcome page is missing: ${claim}`);
    }
  });

  test('the proof section shows real notices, not an invented one', () => {
    // A mock-up of a fictional funeral on a page about real funerals is the
    // wrong thing to put in front of somebody who has just been bereaved.
    assert.match(welcome, /store\.watchPublicNotices/);
    assert.match(welcome, /import \{ janazahRow \} from '\.\/home\.js'/);
    assert.ok(!/deceasedName: '|Example Janazah|Sample notice/.test(welcome),
      'no invented notice may appear here');
  });

  test('an empty feed reads as calm, not as an error', () => {
    assert.match(welcome, /No Janazah notices are current at the moment/);
    assert.ok(!/form-error/.test(welcome),
      'a read failure must not show an error to somebody four seconds in');
  });

  test('it does not force an account', () => {
    assert.match(welcome, /No account needed to read notices/);
    const end = welcome.slice(welcome.indexOf("class: 'wel-end reveal'"));
    // Sign-in is offered last, as a footnote, after two ways in without one.
    assert.ok(end.indexOf("href: '/janazahs'") < end.indexOf("href: '/signin'"));
  });

  test('the live subscription is torn down with the route', () => {
    assert.match(welcome, /export function teardownWelcome/);
    assert.match(feed, /function teardownAll\(\) \{\s*\n\s*teardownHome\(\);\s*\n\s*teardownWelcome\(\);/);
  });
});

describe('its motion', () => {
  test('the scroll effects need no scroll listener', () => {
    // Nothing running on the main thread while a long page moves.
    assert.match(welcomeCss, /@supports \(animation-timeline: scroll\(\)\)/);
    assert.match(welcomeCss, /@supports \(animation-timeline: view\(\)\)/);
    assert.ok(!/addEventListener\('scroll'/.test(welcome));
  });

  test('scroll-driven effects are absent, not broken, where unsupported', () => {
    // The progress rule keeps its static appearance outside the @supports
    // block, so a browser without scroll timelines simply never fills it.
    assert.match(welcomeCss, /\.wel-progress \{[\s\S]{0,400}transform: scaleX\(0\)/);
  });

  test('only opacity and transform are animated', () => {
    // Braces counted rather than matched with a regex: some of these
    // keyframes are written on one line, and a lazy `\n}` runs straight past
    // them into the next rule.
    for (const match of welcomeCss.matchAll(/@keyframes wel[A-Za-z]+ /g)) {
      let at = welcomeCss.indexOf('{', match.index);
      const from = at;
      let depth = 0;
      do {
        if (welcomeCss[at] === '{') depth += 1;
        else if (welcomeCss[at] === '}') depth -= 1;
        at += 1;
      } while (depth > 0 && at < welcomeCss.length);

      const body = welcomeCss.slice(from, at);
      const properties = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const property of properties) {
        assert.ok(['opacity', 'transform'].includes(property),
          `${property} is animated in ${match[0].trim()}; only opacity and `
          + 'transform are composited');
      }
    }
  });

  test('the entrance plays once; only the scroll cue repeats', () => {
    const infinite = [...welcomeCss.matchAll(/animation:[^;]*infinite[^;]*;/g)];
    assert.equal(infinite.length, 1, 'one repeating animation, and it is the scroll cue');
    assert.match(welcomeCss, /\.wel-scroll__line \{ animation: welTrickle[^}]*infinite/);
  });

  test('every bit of it is off under reduced motion', () => {
    // Guarded at the source rather than overridden later: the rules are only
    // ever written inside a no-preference query, so there is nothing to undo.
    const guards = [...welcomeCss.matchAll(/@media \(prefers-reduced-motion: no-preference\)/g)];
    assert.ok(guards.length >= 4, `expected each animation guarded, found ${guards.length}`);
    for (const block of welcomeCss.matchAll(/^\s*animation: (wel[A-Za-z]+)/gm)) {
      const at = welcomeCss.indexOf(block[0]);
      const before = welcomeCss.slice(0, at);
      assert.ok(before.lastIndexOf('no-preference') > before.lastIndexOf('\n}\n\n'),
        `${block[1]} is applied outside a reduced-motion guard`);
    }
  });

  test('the headline is bigger than the app but not a screen-filler', () => {
    const rule = welcomeCss.slice(welcomeCss.indexOf('.wel-hero__title'));
    const clamp = rule.slice(0, rule.indexOf('}')).match(/clamp\(([^)]+)\)/);
    const max = Number(clamp[1].split(',')[2].trim().replace('rem', ''));
    assert.ok(max > 2.2 && max <= 3.4,
      `${max}rem: this is the one page allowed to be larger, within reason`);
  });
});

describe('the Arabic on it', () => {
  test('it lives in the one file religious content lives in', async () => {
    // So that the whole of what an imam has to review is one file, rather
    // than Qur'anic text appearing in a view nobody thought to check.
    const { ISTIRJA } = await import('../public/js/janazah-guide-content.js');
    assert.match(welcome, /import \{ ISTIRJA \} from '\.\.\/janazah-guide-content\.js'/);
    assert.ok(!/[؀-ۿ]/.test(welcome),
      'no Arabic may be written directly into a view');
    assert.ok(ISTIRJA.arabic && ISTIRJA.transliteration && ISTIRJA.english);
  });

  test('it is attributed, like every other recitation', async () => {
    const { ISTIRJA } = await import('../public/js/janazah-guide-content.js');
    assert.match(ISTIRJA.source, /Qur'an, Surah al-Baqarah \(2:156\)/);
    assert.match(welcome, /text: ISTIRJA\.source/,
      'the source must be shown, not only recorded');
  });

  test('the Arabic is the standard text of the ayah', async () => {
    // Verified against the ayah rather than transcribed from memory. The
    // spelling of lillāhi in particular: لِلَّهِ, not the dagger-alef form.
    const { ISTIRJA } = await import('../public/js/janazah-guide-content.js');
    assert.equal(ISTIRJA.arabic, 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ');
    assert.ok(!ISTIRJA.arabic.includes('ٰ'),
      'the superscript alef form is not the standard rendering here');
  });

  test('it is marked up as Arabic, so it is read and shaped correctly', () => {
    assert.match(welcome, /lang: 'ar', dir: 'rtl'/);
  });
});
