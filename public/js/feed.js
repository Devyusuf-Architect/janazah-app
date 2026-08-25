// Bootstrap for the public site: home, the community feed, near me, the
// masajid directory, about, community sign-in and the personal dashboard.
//
// A separate entry point from the coordinator console (console.html / app.js):
// this surface needs no sign-in for its most important job, reading notices,
// so it must load and render before any auth state is known.

import { onAuthStateChanged } from 'firebase/auth';
import { auth, usingEmulator } from './firebase.js';
import { $, el } from './ui.js';
import { renderNav, wireNavToggle, closeNav } from './nav.js';
import { renderHome } from './views/home.js';
import { renderFeed, renderSingleNotice, teardownFeed } from './views/feed.js';
import { renderMasajid } from './views/masajid.js';
import { renderAbout } from './views/about.js';
import { renderPrivacy } from './views/privacy.js';
import { renderTerms } from './views/terms.js';
import { renderAuth } from './views/auth.js';
import { renderDashboard, teardownDashboard } from './views/dashboard.js';

const mount = () => $('#view');
const nav = () => $('#nav');

let user = null;
let authReady = false;

function teardownAll() {
  teardownFeed();
  teardownDashboard();
}

/** Redraws the nav for the current path and sign-in state. */
function paintNav() {
  renderNav(nav(), { path: location.pathname, user });
}

function route() {
  teardownAll();
  paintNav();

  const path = location.pathname;
  const notice = path.match(/^\/n\/([A-Za-z0-9_-]+)\/?$/);
  if (notice) {
    renderSingleNotice(mount(), notice[1]);
    return;
  }

  if (/^\/janazahs\/?$/.test(path)) {
    document.title = "Janazahs — Ta'ziyah";
    renderFeed(mount());
    return;
  }
  if (/^\/near-me\/?$/.test(path)) {
    document.title = "Near me — Ta'ziyah";
    renderFeed(mount(), { initialFilter: 'nearby' });
    return;
  }
  if (/^\/masajid\/?$/.test(path)) {
    document.title = "Masajid — Ta'ziyah";
    renderMasajid(mount());
    return;
  }
  if (/^\/about\/?$/.test(path)) {
    document.title = "About — Ta'ziyah";
    renderAbout(mount());
    return;
  }
  if (/^\/privacy\/?$/.test(path)) {
    document.title = "Privacy — Ta'ziyah";
    renderPrivacy(mount());
    return;
  }
  if (/^\/terms\/?$/.test(path)) {
    document.title = "Terms of service — Ta'ziyah";
    renderTerms(mount());
    return;
  }
  if (/^\/signin\/?$/.test(path)) {
    if (user) { history.replaceState(null, '', '/dashboard'); route(); return; }
    document.title = "Sign in — Ta'ziyah";
    const initialMode = new URLSearchParams(location.search).get('mode') === 'signup'
      ? 'signup' : 'signin';
    renderAuth(mount(), { variant: 'community', initialMode });
    return;
  }
  if (/^\/dashboard\/?$/.test(path)) {
    if (!authReady) {
      // Auth state resolves asynchronously on first load; don't bounce a
      // signed-in visitor to /signin just because it hasn't reported back yet.
      mount().replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
      return;
    }
    if (!user) { history.replaceState(null, '', '/signin'); route(); return; }
    document.title = "Dashboard — Ta'ziyah";
    renderDashboard(mount(), { user });
    return;
  }

  document.title = "Ta'ziyah";
  renderHome(mount());
}

// Handle in-app links without reloading the document. Links to the console are
// left alone so they load that page properly.
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="/"]');
  if (!link || link.target === '_blank' || event.metaKey || event.ctrlKey) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/console')) return;
  event.preventDefault();
  history.pushState(null, '', url.pathname + url.search);
  closeNav($('#nav-toggle'), nav());
  route();
});

window.addEventListener('popstate', route);

const navToggle = $('#nav-toggle');
if (navToggle) wireNavToggle(navToggle, nav());

if (usingEmulator) $('#env-banner')?.removeAttribute('hidden');

// The feed itself needs no auth state, so the first route paints immediately;
// onAuthStateChanged only ever repaints the nav and, on /signin or
// /dashboard, decides where those two routes actually land.
route();

onAuthStateChanged(auth, (nextUser) => {
  user = nextUser;
  authReady = true;
  if (/^\/(signin|dashboard)\/?$/.test(location.pathname)) route();
  else paintNav();
});
