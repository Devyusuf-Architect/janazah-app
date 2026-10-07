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
  test('it reuses the shared upcoming/near/followed painters', () => {
    for (const shared of ['paintUpcoming', 'paintNear', 'paintFollowed']) {
      assert.match(dashboard, new RegExp(`\\b${shared}\\(`), `dashboard.js should call the shared ${shared}`);
    }
    assert.match(dashboard, /import \{ paintUpcoming, paintNear, paintFollowed, sectionHead \} from '\.\/home\.js'/);
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

  test('"verified staff" means the same thing everywhere it is decided', () => {
    // Three places answer this question and none may invent its own notion:
    // the console, the dashboard's Recent Updates, and the sidebar deciding
    // between "Manage Masjid" and the page explaining publishing.
    const app = readFileSync('public/js/app.js', 'utf8');
    const site = readFileSync('public/js/feed.js', 'utf8');
    assert.match(app, /ctx\.orgs\.some\(\(o\) => o\.verificationStatus === 'verified'\)/);
    assert.match(site, /orgs\.some\(\(org\) => org\.verificationStatus === 'verified'\)/);
  });

  test('a failed lookup resolves to "not staff" rather than hanging', () => {
    const fn = dashboard.slice(dashboard.indexOf('store.myOrganizations(ctx.user.uid)'), dashboard.indexOf('store.myOrganizations(ctx.user.uid)') + 400);
    assert.match(fn, /\.catch\(\(err\) => \{/);
    assert.match(fn, /state\.staffOrgs = \[\];/);
  });

  test('the staff shortcuts live in the sidebar, not on the dashboard', () => {
    // They used to be a Quick Actions block in the dashboard's second column.
    // For a community member every tile in it was a row in the sidebar on the
    // same screen; for a coordinator the two that were not are now the
    // sidebar's own "Manage Masjid", which is where somebody looks for the
    // masjid they run.
    const nav = readFileSync('public/js/nav.js', 'utf8');
    assert.match(nav, /label: 'Manage Masjid'/);
    assert.match(nav, /\/console\?tab=notices/);
    assert.ok(!/quickActions/.test(dashboard), 'Quick Actions is back on the dashboard');
    const home = readFileSync('public/js/views/home.js', 'utf8');
    assert.ok(!/quickActions/.test(home), 'the Quick Actions block is back');
  });
});

describe('layout', () => {
  test('one column: three sections read in order, not split across two', () => {
    // The second column held Quick Actions and Recent Updates. Quick Actions
    // is gone and Recent Updates hides itself when empty, so a second column
    // would usually be empty space beside three short sections.
    assert.ok(!/view--wide/.test(dashboard.slice(dashboard.indexOf('mount.replaceChildren'))),
      'the dashboard is back to the wide two-column width');
    assert.ok(!/dash-grid/.test(dashboard), 'the two-column grid is back');
  });

  test('the next Janazah gets its own visual weight', () => {
    assert.match(dashboard, /dash-upcoming/);
    assert.match(css, /\.dash-upcoming \{/);
  });

  test('the sections come in the order the questions get asked', () => {
    const render = dashboard.slice(dashboard.indexOf('mount.replaceChildren('));
    let at = -1;
    for (const section of ['dash-head', 'upcoming', 'near', 'followed']) {
      const next = render.indexOf(section);
      assert.ok(next > at, `${section} is out of order on the dashboard`);
      at = next;
    }
  });
});

describe('the upcoming empty state is compact', () => {
  test('one fact, one line of what changes it, and one action', () => {
    const fn = home.slice(home.indexOf('export function paintUpcoming'));
    const body = fn.slice(0, fn.indexOf('\n// ---'));
    assert.match(body, /'No upcoming Janazahs yet'/);
    assert.match(body, /class: 'home-empty home-empty--compact'/);
    assert.match(body, /btn--primary.*href: '\/masjids'/);
    // One action, not two. The second link asked a reader to choose between
    // finding a masjid and registering one at the moment the page had
    // nothing to show them; registration lives in the navigation instead.
    assert.ok(!/home-empty__secondary/.test(body),
      'the empty state is back to two competing actions');
  });
});
