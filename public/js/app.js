// Bootstrap and routing.
//
// Phase 1 is the coordinator and administrator surface. The public community
// feed is Phase 2 and the notification pipeline is Phase 4; neither is wired
// up here, and nothing in this phase depends on them.

import { onAuthStateChanged } from 'firebase/auth';
import { auth, usingEmulator } from './firebase.js';
import { $, el, toast, friendlyError } from './ui.js';
import { isSampleMode } from './sample-mode.js';
import { revealIn } from './motion.js';
import * as store from './store.js';

import { renderAuth, signOutUser, completeRedirectSignIn } from './views/auth.js';
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
  // Set from ?start= on the way in from the public site's Masjid /
  // Coordinator cards, and consumed once by renderOrgs.
  startIntent: null,
  refresh: async () => { await loadContext(); route(); },
};

/**
 * What the person said they came to do, from ?start=register|join.
 *
 * Stripped from the URL immediately: it is a one-time instruction, and
 * leaving it there would re-open the same form on every reload, including
 * after the registration it just completed.
 */
function takeStartIntent() {
  const params = new URLSearchParams(location.search);
  const start = params.get('start');
  if (start !== 'register' && start !== 'join') return null;
  params.delete('start');
  const query = params.toString();
  history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''));
  return start;
}

/**
 * Which console tab to open, from ?tab=. Used by the public site's Admin
 * link, so an administrator lands in the portal rather than on whichever tab
 * happens to be the default for their account.
 *
 * Stripped from the URL like ?start=, for the same reason: it is a one-time
 * instruction, not a place. Honoured only if the tab exists and the person is
 * allowed there; route() re-checks adminOnly against the real admin record
 * regardless of what the URL asked for.
 */
function takeTabIntent() {
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  if (!tab) return null;
  params.delete('tab');
  const query = params.toString();
  history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''));
  return tab;
}

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
  revealIn(mount());
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
  // The console is a place you can leave. Without this the only way back to
  // the public site is the footer link or the browser's back button.
  nav.append(el('a', { class: 'nav-item nav-item--ghost', href: '/', text: 'Public site' }));
  nav.append(el('span', { class: 'nav-user', text: ctx.user.email || '' }));
  nav.append(el('button', {
    class: 'nav-item',
    onclick: async () => {
      try { await signOutUser(); } catch (err) { toast(friendlyError(err), 'error'); }
    },
  }, 'Sign out'));
}

async function loadContext() {
  ctx.orgsError = null;
  const [isAdmin, orgs] = await Promise.all([
    store.isPlatformAdmin(ctx.user.uid),
    store.myOrganizations(ctx.user.uid).catch((err) => {
      // Deliberately not a toast. This runs on every sign-in and every
      // refresh, before the person has done anything, and a red banner
      // accusing them of a permissions problem on arrival reads as "you are
      // not welcome here". The view that needs this data says so in place
      // instead, where it is attached to what is actually missing.
      console.error('myOrganizations', err);
      ctx.orgsError = err;
      return [];
    }),
  ]);
  ctx.isAdmin = isAdmin;
  ctx.orgs = orgs.sort((a, b) => a.name.localeCompare(b.name));
}

// Captured at load, before anything can navigate. Someone arriving from the
// public site may still have to sign in or create an account first, and the
// intent has to survive that round trip to be worth anything.
ctx.startIntent = takeStartIntent();
const tabIntent = takeTabIntent();

// See feed.js: the return leg of a Google redirect sign-in has to be claimed
// or it silently drops the person back on the sign-in form.
completeRedirectSignIn((message) => toast(message, 'error'));

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

  // Straight to whichever form they chose on the public site, rather than a
  // list of nothing with a button that repeats the choice they already made.
  if (ctx.startIntent) { ctx.route = 'organizations'; route(); return; }

  // An explicit destination from the public site's Admin link. A tab the
  // person is not entitled to is ignored rather than obeyed-then-bounced:
  // route() would send them to Notices, skipping the landing logic below that
  // knows a coordinator with nothing published belongs on Organizations. The
  // check here is UX only; route() enforces adminOnly regardless, and the
  // rules enforce it again on every read and write.
  const wanted = tabIntent && ROUTES[tabIntent];
  if (wanted && !(wanted.adminOnly && !ctx.isAdmin)) {
    ctx.route = tabIntent;
    route();
    return;
  }

  // A coordinator with nothing publishable has nothing to do on the notices
  // screen, so start them where the work is: registering, or reading why
  // their application is not approved yet. Rules are what actually stop them
  // publishing (isOrgVerified); this only decides where they land.
  const canPublish = ctx.orgs.some((o) => o.verificationStatus === 'verified');
  if (!canPublish && !ctx.isAdmin) ctx.route = 'organizations';
  else if (ctx.isAdmin && !ctx.orgs.length) ctx.route = 'admin';

  route();
});

// Fictional notices are on screen, so say so, on every page, without a
// dismiss control. See APP.sampleData in config.js.
if (isSampleMode()) $('#sample-banner')?.removeAttribute('hidden');

if (usingEmulator) {
  document.body.classList.add('is-emulator');
  $('#env-banner').hidden = false;
}
