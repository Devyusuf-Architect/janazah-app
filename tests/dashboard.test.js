// The redesigned signed-in dashboard (views/dashboard.js).
//
// dashboard.js pulls in store.js, which expects a browser (firebase.js), so
// this is a source-text test like tests/launch-copy.test.js and
// tests/org-archive.test.js: it checks the specific things the design calls
// for, not the rendered DOM.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync('public/js/views/dashboard.js', 'utf8');
const home = readFileSync('public/js/views/home.js', 'utf8');
const css = readFileSync('public/css/styles.css', 'utf8');

describe('nothing on the dashboard is reimplemented', () => {
  test('it reuses the shared upcoming/near/followed/quick-actions functions', () => {
    for (const shared of ['paintUpcoming', 'paintNear', 'paintFollowed', 'quickActions']) {
      assert.match(dashboard, new RegExp(`\\b${shared}\\(`), `dashboard.js should call the shared ${shared}`);
    }
    assert.match(dashboard, /import \{ paintUpcoming, paintNear, paintFollowed, quickActions, sectionHead \} from '\.\/home\.js'/);
  });

  test('the live subscription is torn down when the route changes', () => {
    assert.match(dashboard, /export function teardownDashboard/);
    const feed = readFileSync('public/js/feed.js', 'utf8');
    assert.match(feed, /function teardownAll\(\) \{[\s\S]*teardownDashboard\(\);/);
  });
});

describe('the greeting', () => {
  test('leads with the supporting line the redesign asked for', () => {
    assert.match(dashboard, /Here is what is happening around you\./);
    assert.ok(!dashboard.includes('Here is what is coming up, and what you follow.'),
      'the old supporting line should be gone');
  });
});

describe('staff context', () => {
  test('is looked up from myOrganizations(), not invented', () => {
    assert.match(dashboard, /store\.myOrganizations\(ctx\.user\.uid\)/);
  });

  test('canPublish matches the console\'s own definition of it', () => {
    // app.js computes canPublish the same way; dashboard.js must not invent a
    // second notion of what "verified staff" means.
    const app = readFileSync('public/js/app.js', 'utf8');
    assert.match(app, /ctx\.orgs\.some\(\(o\) => o\.verificationStatus === 'verified'\)/);
    assert.match(dashboard, /state\.staffOrgs\.some\(\(o\) => o\.verificationStatus === 'verified'\)/);
  });

  test('a failed lookup resolves to "not staff" rather than hanging Quick Actions', () => {
    const fn = dashboard.slice(dashboard.indexOf('store.myOrganizations(ctx.user.uid)'), dashboard.indexOf('store.myOrganizations(ctx.user.uid)') + 400);
    assert.match(fn, /\.catch\(\(err\) => \{/);
    assert.match(fn, /state\.staffOrgs = \[\];/);
  });

  test('quickActions() is called with the staff context so it can add the staff-only actions', () => {
    assert.match(dashboard, /quickActions\(staffContext\(state\)\)/);
    assert.match(home, /export function quickActions\(staff = null\)/);
    assert.match(home, /staff\?\.canPublish/);
    assert.match(home, /'Post Janazah'/);
    assert.match(home, /'Manage Janazahs'/);
  });

  test('both staff actions point at the console\'s Notices tab, the one real entry point traced', () => {
    const staffBlock = home.slice(home.indexOf('const STAFF_ACTIONS'), home.indexOf('const STAFF_ACTIONS') + 400);
    const hrefs = staffBlock.match(/href: '([^']+)'/g) || [];
    assert.equal(hrefs.length, 2);
    for (const href of hrefs) {
      assert.match(href, /\/console\?tab=notices/,
        'Post Janazah and Manage Janazahs should both open the Notices tab, since there is no separate composer route');
    }
  });
});

describe('recent updates', () => {
  test('hides itself entirely rather than showing an empty state', () => {
    const fn = dashboard.slice(dashboard.indexOf('function paintRecentUpdates'));
    const body = fn.slice(0, fn.indexOf('\nfunction ') === -1 ? undefined : fn.indexOf('\nfunction '));
    assert.match(body, /mount\.hidden = true; mount\.replaceChildren\(\); return;/);
  });

  test('is built from notices already on the page, filtered to followed and staffed orgs', () => {
    const fn = dashboard.slice(dashboard.indexOf('function recentUpdateItems'));
    const body = fn.slice(0, fn.indexOf('\nfunction '));
    assert.match(body, /follows\.followedOrgIds\(\)/);
    assert.match(body, /state\.staffOrgs/);
    assert.match(body, /notice\.status === 'cancelled'/);
    assert.match(body, /notice\.correctionNote/);
    assert.match(body, /notice\.publishedAt/);
  });

  test('verification-status-change is documented as left out, not silently dropped', () => {
    assert.match(dashboard, /verification status.*changing.*deliberately left out/s);
  });
});

describe('layout', () => {
  test('the two-column grid is added on render and removed on teardown, like the admin portal\'s own wide view', () => {
    assert.match(dashboard, /mount\.classList\.add\('view--wide'\)/);
    assert.match(dashboard, /classList\.remove\('view--wide'\)/);
  });

  test('the next Janazah gets its own visual weight', () => {
    assert.match(dashboard, /dash-upcoming/);
    assert.match(css, /\.dash-upcoming \{/);
  });

  test('a compact desktop two-column layout exists, collapsing to one column by default (mobile-first)', () => {
    assert.match(css, /\.dash-grid \{[^}]*grid-template-columns: 1fr;/);
    assert.match(css, /@media \(min-width: 780px\) \{\s*\.dash-grid \{ grid-template-columns: 1\.35fr 1fr;/);
  });
});

describe('the upcoming empty state is compact', () => {
  test('one fact, one primary action, one smaller secondary link -- not two buttons and two paragraphs', () => {
    const fn = home.slice(home.indexOf('export function paintUpcoming'));
    const body = fn.slice(0, fn.indexOf('\n// ---'));
    assert.match(body, /'No upcoming Janazahs yet'/);
    assert.match(body, /class: 'home-empty home-empty--compact'/);
    assert.match(body, /btn--primary.*href: '\/masjids'/);
    assert.match(body, /class: 'link home-empty__secondary', href: '\/register-masjid'/);
  });
});
