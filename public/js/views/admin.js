// The platform administration portal: a shell, a sidebar, and eleven
// sections that each know one thing.
//
// This file used to be the whole portal, and it was one screen: a strip of
// status tabs above a verification queue, with reports, the audit log and the
// sample-data switch bolted on beside them. That shape says the job is
// verification and everything else is an afterthought, which stopped being
// true some time ago.
//
// The sidebar is the same one the public site and the console already use
// (.nav-item, .sidenav), laid out for a portal rather than reinvented. Below
// 900px it collapses into the drawer pattern established elsewhere in the
// app: a fixed panel, a scrim, Escape to close. Not a horizontal strip. A row
// of eleven tabs on a phone is a scrollbar somebody has to discover.
//
// Two teardown functions, and the difference matters:
//   teardownAdmin        unsubscribes the Firestore watchers of whichever
//                        section is on screen. Runs on every section change,
//                        because a section left subscribed keeps paying for a
//                        query nobody is reading.
//   teardownAdminChrome  removes the portal's own chrome: the layout class on
//                        the view, the drawer's document-level listeners. Runs
//                        when the console leaves the portal altogether.

import { el, icon, $ } from '../ui.js';
import { renderDashboard } from './admin/dashboard.js';
import { renderJanazahs } from './admin/janazahs.js';
import { renderOrganizations } from './admin/organizations.js';
import { renderVerification } from './admin/verification.js';
import { renderUsers, renderStaff } from './admin/people.js';
import { renderReports } from './admin/reports.js';
import { renderNotifications } from './admin/notifications.js';
import { renderAudit } from './admin/audit.js';
import { renderSettings } from './admin/settings.js';
import { renderAdmins } from './admin/admins.js';

const SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid', render: renderDashboard },
  { key: 'janazahs', label: 'Janazahs', icon: 'clock', render: renderJanazahs },
  { key: 'organizations', label: 'Organizations', icon: 'building', render: renderOrganizations },
  { key: 'verification', label: 'Verification', icon: 'check', render: renderVerification },
  { key: 'users', label: 'Users', icon: 'users', render: renderUsers },
  { key: 'staff', label: 'Staff', icon: 'userCheck', render: renderStaff },
  { key: 'reports', label: 'Reports', icon: 'flag', render: renderReports },
  { key: 'notifications', label: 'Notifications', icon: 'bell', render: renderNotifications },
  { key: 'audit', label: 'Audit Log', icon: 'shield', render: renderAudit },
  { key: 'settings', label: 'Platform Settings', icon: 'sliders', render: renderSettings },
  { key: 'admins', label: 'Admin Management', icon: 'key', render: renderAdmins },
];

// Which of the eleven are the everyday ones. The rule below the divider is
// not decoration: an administrator who opens this portal is nearly always
// here for one of the first six, and the settings and membership screens are
// the ones that should take a deliberate second to reach.
const ROUTINE = 8;

let unwatchers = [];
let releaseChrome = null;
let active = 'dashboard';

/** Unsubscribe whatever the current section is watching. */
export function teardownAdmin() {
  for (const stop of unwatchers) {
    try { stop(); } catch (err) { console.error('teardownAdmin', err); }
  }
  unwatchers = [];
}

/** Separate from teardownAdmin, which runs on every section change. */
export function teardownAdminChrome() {
  releaseChrome?.();
  releaseChrome = null;
}

export function renderAdmin(mount, ctx) {
  teardownAdmin();
  teardownAdminChrome();
  mount.replaceChildren();

  // The portal needs the width. Every other console screen is a form or a
  // list and reads better narrow; a register with six columns does not.
  mount.classList.add('view--admin');

  const nav = el('nav', { class: 'admin-nav', 'aria-label': 'Administration sections' });
  const scrim = el('div', { class: 'admin-nav__scrim', hidden: true });
  const panel = el('div', { class: 'admin-panel' });

  const toggle = el('button', {
    class: 'admin-nav__toggle btn btn--small',
    type: 'button',
    'aria-expanded': 'false',
  }, [icon('grid', { size: 16 }), el('span', { text: 'Sections' })]);

  const setDrawer = (open) => {
    nav.classList.toggle('is-open', open);
    scrim.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('is-drawer-open', open);
  };
  const onKey = (event) => { if (event.key === 'Escape') setDrawer(false); };

  toggle.addEventListener('click', () => setDrawer(!nav.classList.contains('is-open')));
  scrim.addEventListener('click', () => setDrawer(false));
  document.addEventListener('keydown', onKey);

  releaseChrome = () => {
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('is-drawer-open');
    $('#view')?.classList.remove('view--admin');
  };

  const actx = {
    ...ctx,
    /** Register a watcher's unsubscribe with the section currently on screen. */
    watch: (stop) => { if (typeof stop === 'function') unwatchers.push(stop); },
    /** Move to another section from inside one, e.g. a dashboard tile. */
    go: (key) => { if (SECTIONS.some((s) => s.key === key)) { active = key; paint(); } },
    /** Repaint the current section after a write that is not live-watched. */
    refresh: () => paint(),
  };

  const paint = () => {
    setDrawer(false);
    nav.replaceChildren(
      // Only ever visible in the drawer, where the sidebar covers everything
      // it slid out over. The same close row the console's own drawer has.
      el('button', {
        class: 'sidenav__close',
        type: 'button',
        'aria-label': 'Close the section menu',
        onclick: () => setDrawer(false),
      }, [icon('x', { size: 18 }), el('span', { text: 'Close' })]),
      el('p', { class: 'admin-nav__title', text: 'Administration' }),
      el('div', { class: 'sidenav__group' }, SECTIONS.slice(0, ROUTINE).map(navItem)),
      el('div', { class: 'sidenav__rule', 'aria-hidden': 'true' }),
      el('div', { class: 'sidenav__group' }, SECTIONS.slice(ROUTINE).map(navItem)),
    );

    teardownAdmin();
    panel.replaceChildren();
    const section = SECTIONS.find((s) => s.key === active) || SECTIONS[0];
    toggle.querySelector('span').textContent = section.label;
    section.render(panel, actx, ctx);
  };

  const navItem = (section) => el('button', {
    class: `nav-item${section.key === active ? ' nav-item--active' : ''}`,
    type: 'button',
    'aria-current': section.key === active ? 'page' : null,
    onclick: () => { active = section.key; paint(); },
  }, [
    icon(section.icon, { size: 18 }),
    el('span', { class: 'nav-item__label', text: section.label }),
  ]);

  mount.append(el('div', { class: 'admin' }, [
    el('div', { class: 'admin-bar' }, [toggle]),
    nav,
    scrim,
    panel,
  ]));

  paint();
}
