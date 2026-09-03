// External QA pass, 2026-09-03: mobile Janazah tabs invisible behind the
// bottom nav, the "Manage" tab label misleading, loading states with no
// visual weight, a sign-in flash before auth state resolves, missing share
// feedback, and empty support/privacy contact fields with nothing to show
// for it on the public pages.
//
// feed.js, nav.js and the admin views pull in firebase.js, which expects a
// browser, so (like takedown.test.js and sample-data.test.js) these check the
// source text for the specific things that must hold rather than executing
// the module. platform-settings.js has no such dependency and is exercised
// directly.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { normalizeSettings, SETTINGS_DEFAULTS } from '../public/js/platform-settings.js';

const feed = readFileSync('public/js/views/feed.js', 'utf8');
const nav = readFileSync('public/js/nav.js', 'utf8');
const siteBootstrap = readFileSync('public/js/feed.js', 'utf8');
const css = readFileSync('public/css/styles.css', 'utf8');
const adminCommon = readFileSync('public/js/views/admin/common.js', 'utf8');
const adminSettings = readFileSync('public/js/views/admin/settings.js', 'utf8');
const privacy = readFileSync('public/js/views/privacy.js', 'utf8');
const terms = readFileSync('public/js/views/terms.js', 'utf8');
const about = readFileSync('public/js/views/about.js', 'utf8');

describe('item 1: the mobile feed tabs no longer share the bottom nav\'s rectangle', () => {
  test('the feed\'s own tab row opts out of the bottom-dock treatment', () => {
    assert.match(feed, /const tabs = el\('div', \{ class: 'tabs tabs--plain' \}\);/,
      'the feed tabs should carry tabs--plain, the same escape hatch the admin ' +
      'portal already uses for its own section switcher');
  });

  test('.tabs--plain exists and stays out of the fixed bottom-dock position below 640px', () => {
    const block = css.slice(css.indexOf('.tabs.tabs--plain {'), css.indexOf('.tabs.tabs--plain {') + 400);
    assert.match(block, /position:\s*static/);
  });
});

describe('item 1: mobile visitors default to All notices', () => {
  test('the default-filter decision checks a mobile viewport before the follow count', () => {
    const decision = feed.slice(
      feed.indexOf("} else if (filter === null) {"),
      feed.indexOf("}", feed.indexOf("filter = isMobile")) + 1);
    assert.match(decision, /window\.matchMedia/);
    assert.match(decision, /max-width:\s*900px/,
      'should match the same 900px breakpoint .bottom-nav uses');
    assert.match(decision, /isMobile \? 'all'/,
      'a mobile visitor should always land on all notices');
    assert.match(decision, /followedOrgIds\(\)\.length \? 'following' : 'all'/,
      'desktop keeps the existing follows-based default');
  });
});

describe('item 6: the follow-management tab is labelled for what it does', () => {
  test('the tab that opens the follow manager no longer says the generic "Manage"', () => {
    assert.match(feed, /tab\('manage', 'users', 'Manage follows', \(\) => openFollowManager\(\)\)/);
  });
});

describe('item 5: admin loading states have visual weight', () => {
  test('the shared admin "loading" helper reuses the skeleton pattern, not bare text', () => {
    const fn = adminCommon.slice(adminCommon.indexOf('export function loading'));
    assert.match(fn, /skeleton\(/);
    assert.doesNotMatch(fn, /Loading…/,
      'the bare "Loading…" text this replaced should be gone');
  });

  test('skeleton is imported from the shared ui module, not reimplemented', () => {
    assert.match(adminCommon, /import \{ el, icon, friendlyError, skeleton \} from '\.\.\/\.\.\/ui\.js';/);
  });
});

describe('item 5: no sign-in flash before auth state resolves', () => {
  test('the account control renders neither signed-in nor signed-out controls until auth is ready', () => {
    const fn = nav.slice(
      nav.indexOf('function renderAccount'),
      nav.indexOf('const name = user.displayName'));
    assert.match(fn, /!authReady/);
    assert.match(fn, /account__placeholder/);
    // The placeholder must not itself be a clickable control someone could
    // catch mid-render: no button, no link, no href, inside that branch.
    const placeholderBranch = fn.slice(fn.indexOf('if (!authReady)'), fn.indexOf('if (!user)'));
    assert.doesNotMatch(placeholderBranch, /'a'|'button'|href/);
  });

  test('renderNav threads authReady down to the account control', () => {
    assert.match(nav, /export function renderNav\(nav, \{ path, user, isAdmin = false, authReady = true \}\)/);
    assert.match(nav, /renderAccount\(account, \{ user, path, authReady \}\)/);
  });

  test('the public site bootstrap passes its own authReady flag to the nav paint', () => {
    assert.match(siteBootstrap, /renderNav\(nav\(\), \{ path: location\.pathname, user, isAdmin, authReady \}\)/);
  });

  test('the placeholder reserves the same footprint as the real control, so nothing jumps', () => {
    assert.match(css, /\.account__placeholder\s*\{[^}]*width:\s*1\.8rem/);
    assert.match(css, /\.account__avatar\s*\{[^}]*width:\s*1\.8rem/);
  });
});

describe('item 7: sharing a notice confirms itself', () => {
  test('a successful native share shows a toast', () => {
    const fn = feed.slice(feed.indexOf('async function shareNotice'));
    const nativeBranch = fn.slice(fn.indexOf('if (navigator.share)'), fn.indexOf('try {\n    await navigator.clipboard'));
    assert.match(nativeBranch, /await navigator\.share\(\{ title, text, url \}\);\s*\n\s*toast\('Shared\.'\);/);
  });

  test('a cancelled share (AbortError) does not toast', () => {
    const fn = feed.slice(feed.indexOf('async function shareNotice'), feed.indexOf('async function shareNotice') + 1200);
    assert.match(fn, /err\?\.name === 'AbortError'\) return;/);
  });

  test('the clipboard fallback already confirms itself', () => {
    const fn = feed.slice(feed.indexOf('async function shareNotice'));
    assert.match(fn, /navigator\.clipboard\.writeText[\s\S]{0,80}toast\('Notice copied/);
  });
});

describe('item 8: missing support/privacy contact addresses degrade gracefully', () => {
  test('normalizeSettings defaults both contact addresses to empty, not a placeholder', () => {
    const settings = normalizeSettings({});
    assert.equal(settings.supportEmail, '');
    assert.equal(settings.privacyEmail, '');
    assert.equal(SETTINGS_DEFAULTS.supportEmail, '');
    assert.equal(SETTINGS_DEFAULTS.privacyEmail, '');
  });

  test('the admin settings screen marks an empty contact address distinctly, not as a plain blank field', () => {
    assert.match(adminSettings, /badge badge--warn field-group__badge/);
    assert.match(adminSettings, /'Not set'/);
  });

  test('the privacy page omits the direct-contact line rather than showing a broken one when unset', () => {
    const section = privacy.slice(privacy.indexOf("section('Getting in touch'"));
    assert.match(section, /platformSettings\(\)\.privacyEmail/);
    assert.match(section, /\? el\('p'/, 'should be conditional on the address being set');
    assert.doesNotMatch(privacy, /Before launch, replace this section/,
      'the old TODO placeholder copy should be gone');
  });

  test('the terms page omits its direct-contact line rather than showing a broken one when unset', () => {
    assert.match(terms, /platformSettings\(\)\.supportEmail/);
    assert.doesNotMatch(terms, /will be added here once one is confirmed/,
      'the old TODO placeholder copy should be gone');
  });

  test('the about page only shows a Support section once a support address is configured', () => {
    assert.match(about, /platformSettings\(\)\.supportEmail\s*\n\s*\? section\('Support'/);
  });

  test('the public site bootstrap actually loads platform settings, so these are not permanently stuck at defaults', () => {
    assert.match(siteBootstrap, /initPlatformSettings\(/);
  });
});
