// The home page.
//
// What this pins is not styling; it is the decision that the first screen
// carries Janazah information rather than an explanation of the service.
// That is easy to lose one sentence at a time, and the person it costs is
// somebody who opened this after a phone call telling them a funeral is
// today.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const home = readFileSync('public/js/views/home.js', 'utf8');
const nav = readFileSync('public/js/nav.js', 'utf8');
const css = readFileSync('public/css/styles.css', 'utf8');
const index = readFileSync('public/index.html', 'utf8');

describe('the first screen is content, not a pitch', () => {
  test('the heading is short and practical', () => {
    assert.match(home, /text: 'Find a Janazah'/,
      'the home page leads with the thing people came to do');
    assert.ok(!/Reliable Janazah information, from masjids you can verify/.test(home),
      'the old full-screen headline is back');
  });

  test('no marketing sections survive', () => {
    // Three identical feature cards and a pair of sign-up boxes were the
    // whole middle of the old page. The interface makes the case now.
    for (const gone of ['promiseCard', 'cta-row', 'hero__lede', 'home-footnote']) {
      assert.ok(!home.includes(gone), `${gone} is back on the home page`);
    }
  });

  test('the title is capped so it cannot grow back into a hero', () => {
    const rule = css.slice(css.indexOf('.home-head__title'));
    const clamp = rule.slice(0, rule.indexOf('}')).match(/clamp\(([^)]+)\)/);
    assert.ok(clamp, 'the home title must be size-clamped');
    const max = Number(clamp[1].split(',')[2].trim().replace('rem', ''));
    assert.ok(max <= 2.2, `the home title tops out at ${max}rem, which is a hero again`);
  });

  test('every section a person came for is present', () => {
    for (const section of [
      'Upcoming Janazahs', 'Near you', 'Masjids you follow', 'Quick actions',
      'How to perform Janazah',
    ]) {
      assert.ok(home.includes(section), `the home page is missing: ${section}`);
    }
  });
});

describe('a Janazah row answers the questions in order', () => {
  test('masjid, verified, time, place, then directions', () => {
    const row = home.slice(home.indexOf('function janazahRow'));
    const body = row.slice(0, row.indexOf('\nfunction '));
    const order = ['jrow__org', 'chip--verified', 'jrow__time', 'jrow__where', 'jrow__go'];
    let at = -1;
    for (const part of order) {
      const next = body.indexOf(part);
      assert.ok(next > at, `${part} is out of order in a Janazah row`);
      at = next;
    }
  });

  test('directions open a real map link, not a placeholder', () => {
    // The single Google-only link was replaced by a small menu of map apps
    // (geo.test.js pins the URLs directionsOptions builds, ui.test.js pins
    // that directionsMenu links out with rel="noopener noreferrer"); here it
    // is enough to know the row wires a real location into that menu.
    assert.match(home, /directionsMenu\(place, \{ label: 'Directions'/);
  });

  test('a cancelled notice is marked rather than dropped', () => {
    // Somebody already on their way needs to see it was cancelled more than
    // they need a tidy list.
    assert.match(home, /jrow--cancelled/);
    assert.match(home, /text: 'Cancelled'/);
  });
});

describe('nothing on the home page is reimplemented', () => {
  test('it reads the same notice stream, follows and distances as everywhere else', () => {
    for (const shared of [
      'store.watchPublicNotices', 'follows.followedOrgIds', 'loc.noticeDistanceKm',
      'loc.nearbyNotices', 'formatJanazahTime', 'directionsMenu',
    ]) {
      assert.ok(home.includes(shared), `the home page should reuse ${shared}`);
    }
  });

  test('the live subscription is torn down when the route changes', () => {
    // Otherwise leaving the home page leaves a Firestore listener running,
    // and coming back starts a second one.
    assert.match(home, /export function teardownHome/);
    const feed = readFileSync('public/js/feed.js', 'utf8');
    assert.match(feed, /function teardownAll\(\) \{\s*teardownHome\(\);/);
  });
});

describe('search', () => {
  test('one box covers masjid, city and postal code', () => {
    assert.match(home, /placeholder: 'Masjid, city or postal code'/);
    assert.match(home, /orgHaystack/);
    assert.match(home, /noticeHaystack/);
  });

  test('a postal code typed with or without a space matches the same thing', () => {
    assert.match(home, /replace\(\/\\s\+\/g, ''\)/,
      'whitespace must be stripped before comparing');
  });
});

describe('location stays optional and stays on the device', () => {
  test('the prompt says so, and links to the full explanation', () => {
    assert.match(home, /never sent to us or to any masjid/);
    assert.match(home, /href: '\/near-me', text: 'What happens to it'/);
  });

  test('nothing is requested until the button is pressed', () => {
    const enable = home.slice(home.indexOf('async function enableLocation'));
    assert.match(enable.slice(0, 600), /loc\.update\(\{ enabled: true \}\)/);
    // The only call sites are click handlers: the finder's "Use my
    // location", the near-you prompt, and the zero-notices explore block's
    // "Enable nearby alerts", plus the function's own definition.
    const calls = home.match(/enableLocation\(/g) || [];
    assert.equal(calls.length, 4, 'enableLocation should be defined once and called on click only');
  });

  test('a refused permission turns the setting back off', () => {
    assert.match(home, /catch \(err\) \{[\s\S]{0,120}loc\.disable\(\)/);
  });
});

describe('the follow section works without an account', () => {
  test('it reads the device follow list, not a signed-in user', () => {
    const section = home.slice(home.indexOf('function paintFollowed'));
    assert.match(section.slice(0, 400), /follows\.followedOrgIds\(\)/);
    assert.ok(!/ctx\.user|auth\.currentUser/.test(section.slice(0, 800)),
      'follows live on the device; gating this on sign-in would hide '
      + 'somebody’s own list from them');
  });
});

describe('navigation', () => {
  test('the sidebar carries sections and nothing personal', () => {
    const links = nav.slice(nav.indexOf('const LINKS'), nav.indexOf('// Deeper pages'));
    for (const label of ['Home', 'Janazahs', 'Near Me', 'Masjids', 'Following', 'Janazah Guide']) {
      assert.ok(links.includes(`'${label}'`), `the sidebar is missing ${label}`);
    }
    for (const personal of ['Sign out', 'Account', 'Create account']) {
      assert.ok(!links.includes(`'${personal}'`),
        `${personal} belongs in the account menu, not among the sections`);
    }
  });

  test('the account menu holds the personal items, once each', () => {
    const menu = nav.slice(nav.indexOf("class: 'account__menu'"), nav.indexOf('const button'));
    // Not "Dashboard": Home in the sidebar already is the dashboard once
    // someone is signed in, so a second link to it here would be the same
    // clutter this menu exists to avoid.
    assert.ok(!/Dashboard/.test(menu),
      'Dashboard belongs to the sidebar\'s Home item, not a second link here');
    assert.match(menu, /Account and settings/);
    assert.match(menu, /Sign out/);
    // Two entries for one page is the clutter this replaced.
    assert.equal((menu.match(/href: '\/account'/g) || []).length, 1);
  });

  test('the logo always returns to the site root', () => {
    assert.match(index, /<a class="brand" href="\/">/);
    const console_ = readFileSync('public/console.html', 'utf8');
    assert.match(console_, /<a class="brand" href="\/">/,
      'even from the console, the name in the corner leads out to the public site');
  });

  test('initials never come out blank', () => {
    // A blank circle in the corner reads as a broken avatar.
    assert.match(nav, /if \(!source\) return '\?';/);
  });

  test('the dismiss handlers are registered once, not per render', () => {
    // renderNav runs on every route change; adding a document listener each
    // time would leave one behind on every navigation.
    const before = nav.indexOf('function renderAccount');
    assert.ok(nav.indexOf("document.addEventListener('click', dismissMenu)") < before,
      'the menu dismiss listener must live outside the per-render function');
  });
});

describe('responsive behaviour', () => {
  test('the sidebar becomes a drawer rather than a squeezed sidebar', () => {
    const mobile = css.slice(css.indexOf('@media (max-width: 900px)'));
    assert.match(mobile.slice(0, 1200), /\.sidenav \{[\s\S]{0,300}position: fixed/);
    assert.match(mobile.slice(0, 1400), /transform: translateX\(-102%\)/);
    assert.match(mobile.slice(0, 1600), /\.sidenav\.is-open \{ transform: translateX\(0\); visibility: visible; \}/);
  });

  test('the closed drawer is out of the tab order, not just off screen', () => {
    // A translated element is still focusable: a keyboard user would tab
    // into links they cannot see.
    const mobile = css.slice(css.indexOf('@media (max-width: 900px)'));
    assert.match(mobile.slice(0, 1400), /visibility: hidden;/);
  });

  test('there is a scrim to close it, and Escape closes it too', () => {
    assert.match(index, /id="nav-scrim"/);
    assert.match(nav, /scrim\?\.addEventListener\('click'/);
    assert.match(nav, /if \(event\.key === 'Escape'\) set\(false\)/);
  });

  test('a Janazah row stacks on a narrow screen instead of compressing', () => {
    const narrow = css.slice(css.indexOf('@media (max-width: 560px)'));
    assert.match(narrow.slice(0, 500), /\.jrow \{[^}]*flex-direction: column/);
  });
});

describe('motion', () => {
  test('reduced motion stops the drawer and the menu from travelling', () => {
    // The last of the reduced-motion blocks is the global one at the end of
    // the sheet; earlier ones scope single components.
    const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    const block = reduced.slice(0, reduced.indexOf('\n}\n'));
    for (const selector of ['.sidenav', '.account__menu', '.nav-item']) {
      assert.ok(block.includes(selector), `${selector} still animates under reduced motion`);
    }
  });

  test('the reveal animation still cannot hide content permanently', () => {
    // The home page is built from .reveal rows that arrive after the route
    // has rendered; motion.js watches for them, and content is visible by
    // default either way.
    const motion = readFileSync('public/js/motion.js', 'utf8');
    assert.match(motion, /export function autoReveal/);
    assert.match(css, /\.reveal, \.reveal\.is-revealed \{/);
  });
});
