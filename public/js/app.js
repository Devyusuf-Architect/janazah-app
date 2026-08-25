// Bootstrap and routing.
//
// Phase 1 is the coordinator and administrator surface. The public community
// feed is Phase 2 and the notification pipeline is Phase 4; neither is wired
// up here, and nothing in this phase depends on them.

import { onAuthStateChanged } from 'firebase/auth';
import { auth, usingEmulator } from './firebase.js';
import { $, el, toast, friendlyError } from './ui.js';
import * as store from './store.js';

import { renderAuth, signOutUser } from './views/auth.js';
import { renderOrgs } from './views/org.js';
import { renderNotices, teardownNotices } from './views/notices.js';
import { renderAdmin, teardownAdmin } from './views/admin.js';
import { renderAccount } from './views/account.js';

const mount = () => $('#view');

const ctx = {
  user: null,
  isAdmin: false,
  orgs: [],
  route: 'notices',
  refresh: async () => { await loadContext(); route(); },
};

const ROUTES = {
  notices: { label: 'Notices', render: renderNotices },
  organizations: { label: 'Organizations', render: renderOrgs },
  admin: { label: 'Admin', render: renderAdmin, adminOnly: true },
  account: { label: 'Account', render: renderAccount },
};

function teardown() {
  teardownNotices();
  teardownAdmin();
}

function route() {
  teardown();
  const target = ROUTES[ctx.route] || ROUTES.notices;
  if (target.adminOnly && !ctx.isAdmin) {
    ctx.route = 'notices';
    return route();
  }
  renderNav();
  target.render(mount(), ctx);
}

function renderNav() {
  const nav = $('#nav');
  nav.replaceChildren();
  if (!ctx.user) { nav.hidden = true; return; }
  nav.hidden = false;

  for (const [key, def] of Object.entries(ROUTES)) {
    if (def.adminOnly && !ctx.isAdmin) continue;
    nav.append(el('button', {
      class: `nav-item${ctx.route === key ? ' nav-item--active' : ''}`,
      onclick: () => { ctx.route = key; route(); },
    }, def.label));
  }

  nav.append(el('div', { class: 'nav-spacer' }));
  nav.append(el('span', { class: 'nav-user', text: ctx.user.email || '' }));
  nav.append(el('button', {
    class: 'nav-item',
    onclick: async () => {
      try { await signOutUser(); } catch (err) { toast(friendlyError(err), 'error'); }
    },
  }, 'Sign out'));
}

async function loadContext() {
  const [isAdmin, orgs] = await Promise.all([
    store.isPlatformAdmin(ctx.user.uid),
    store.myOrganizations(ctx.user.uid).catch((err) => {
      console.error('myOrganizations', err);
      toast(friendlyError(err), 'error');
      return [];
    }),
  ]);
  ctx.isAdmin = isAdmin;
  ctx.orgs = orgs.sort((a, b) => a.name.localeCompare(b.name));
}

onAuthStateChanged(auth, async (user) => {
  teardown();
  ctx.user = user;

  if (!user) {
    ctx.isAdmin = false;
    ctx.orgs = [];
    renderNav();
    renderAuth(mount());
    return;
  }

  mount().replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
  await loadContext();

  // A coordinator with no organization yet has nothing to do on the notices
  // screen, so start them where the work is.
  if (!ctx.orgs.length && !ctx.isAdmin) ctx.route = 'organizations';
  else if (ctx.isAdmin && !ctx.orgs.length) ctx.route = 'admin';

  route();
});

if (usingEmulator) {
  document.body.classList.add('is-emulator');
  $('#env-banner').hidden = false;
}
