// Bootstrap for the public site: home, the community feed, near me, the
// masjids directory, about, community sign-in and the personal dashboard.
//
// A separate entry point from the coordinator console (console.html / app.js):
// this surface needs no sign-in for its most important job, reading notices,
// so it must load and render before any auth state is known.

import { onAuthStateChanged } from 'firebase/auth';
import { auth, usingEmulator } from './firebase.js';
import { $, el, toast } from './ui.js';
import { isSampleMode, initSampleMode } from './sample-mode.js';
import * as store from './store.js';
import { renderNav, wireNavToggle, closeNav } from './nav.js';
import {
  revealIn, autoReveal, pageEnter,
  ownScrollRestoration, rememberScroll, restoreScroll, watchScroll,
} from './motion.js';
import { renderHome, teardownHome } from './views/home.js';
import { renderWelcome, teardownWelcome } from './views/welcome.js';
import { isFirstVisit, markVisited } from './visited.js';
import { renderFeed, renderSingleNotice, teardownFeed } from './views/feed.js';
import { renderMasjids } from './views/masjids.js';
import { renderOrgPage, teardownOrgPage } from './views/org-page.js';
import { renderFollowing } from './views/following.js';
import { renderAccount } from './views/account.js';
import { renderJanazahGuide } from './views/janazah-guide.js';
import { renderAbout } from './views/about.js';
import { renderRegisterMasjid } from './views/register-masjid.js';
import { renderPrivacy } from './views/privacy.js';
import { renderTerms } from './views/terms.js';
import { renderAuth, completeRedirectSignIn } from './views/auth.js';
import { renderDashboard, teardownDashboard } from './views/dashboard.js';

const mount = () => $('#view');
const nav = () => $('#nav');

let user = null;
let authReady = false;
// Which account the current render was built for: null for signed out.
// The first route() below renders the signed-out site, so it starts as null
// rather than undefined, and Firebase reporting "still signed out" a moment
// later is then recognised as no change.
let renderedFor = null;
// Resolved asynchronously after sign-in. False until then, so the nav simply
// has no Admin link for a moment rather than flickering one in and out.
let isAdmin = false;

function teardownAll() {
  teardownHome();
  teardownWelcome();
  teardownFeed();
  teardownDashboard();
  teardownOrgPage();
}

/** Redraws the nav for the current path and sign-in state. */
function paintNav() {
  renderNav(nav(), { path: location.pathname, user, isAdmin });
}

function renderRoute() {
  teardownAll();
  paintNav();

  const path = location.pathname;
  // Read before marking, so the first route of a session still knows it was
  // the first. Marking here rather than only on the home page means somebody
  // who arrived at /janazahs is not shown an introduction the next time they
  // tap the logo: they have already seen the real thing.
  const firstVisit = isFirstVisit();
  markVisited();
  const notice = path.match(/^\/n\/([A-Za-z0-9_-]+)\/?$/);
  if (notice) {
    renderSingleNotice(mount(), notice[1]);
    return;
  }

  // The directory was at /masajid before the terminology change. Anyone
  // holding that link keeps working rather than landing on the home page
  // wondering where it went.
  if (/^\/masajid\/?$/.test(path)) {
    history.replaceState(null, '', '/masjids');
    route();
    return;
  }

  const orgPage = path.match(/^\/o\/([A-Za-z0-9_-]+)\/?$/);
  if (orgPage) {
    renderOrgPage(mount(), orgPage[1]);
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
  if (/^\/masjids\/?$/.test(path)) {
    document.title = "Masjids — Ta'ziyah";
    renderMasjids(mount());
    return;
  }
  if (/^\/register-masjid\/?$/.test(path)) {
    document.title = "Register your masjid — Ta'ziyah";
    renderRegisterMasjid(mount());
    return;
  }
  if (/^\/janazah-guide\/?$/.test(path)) {
    document.title = "How to pray Salat al-Janazah — Ta'ziyah";
    renderJanazahGuide(mount());
    return;
  }
  if (/^\/following\/?$/.test(path)) {
    document.title = "Following — Ta'ziyah";
    renderFollowing(mount());
    return;
  }
  if (/^\/account\/?$/.test(path)) {
    if (!authReady) { mount().replaceChildren(el('p', { class: 'muted', text: 'Loading…' })); return; }
    if (!user) { history.replaceState(null, '', '/signin'); route(); return; }
    document.title = "Account — Ta'ziyah";
    renderAccount(mount(), { user });
    return;
  }
  if (/^\/welcome\/?$/.test(path)) {
    document.title = "Ta'ziyah — Janazah notices you can trust";
    renderWelcome(mount());
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

  // A first-time visitor gets the welcome; everybody else gets the index.
  // Only ever on "/", so a link straight to a notice or the guide is never
  // interrupted by an introduction — somebody who arrived at a real funeral
  // notice has already seen the thing an introduction would describe.
  //
  // Deliberately not conditioned on being signed out. Sign-in requires
  // visiting /signin, which marks the device as having been here, so a
  // signed-in account on a device with no history is a case that does not
  // really occur — and checking would mean waiting for auth to resolve, which
  // shows the index first and then replaces it.
  if (path === '/' && firstVisit) {
    history.replaceState(null, '', '/welcome');
    document.title = "Ta'ziyah — Janazah notices you can trust";
    renderWelcome(mount());
    return;
  }
  document.title = "Ta'ziyah";
  renderHome(mount());
}


// Views render synchronously, but several then repaint from a live Firestore
// snapshot, so a single reveal pass would miss every card that matters.
// autoReveal keeps watching the mount for whatever arrives later.
let stopReveal = () => {};

function route({ back = false } = {}) {
  stopReveal();
  renderedFor = user?.uid ?? null;
  renderRoute();
  restoreScroll(location.pathname + location.search, { remembered: back });
  pageEnter(mount());
  revealIn(mount());
  stopReveal = autoReveal(mount());
}

// Handle in-app links without reloading the document. Links to the console are
// left alone so they load that page properly.
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="/"]');
  if (!link || link.target === '_blank' || event.metaKey || event.ctrlKey) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/console')) return;
  event.preventDefault();
  // Where they were on the page they are leaving, so pressing back returns
  // them to it rather than to the top of a long feed.
  rememberScroll(location.pathname + location.search);
  history.pushState(null, '', url.pathname + url.search);
  closeNav($('#nav-toggle'), nav());
  route();
});

// Back and forward return to the remembered offset; a fresh navigation
// starts at the top.
window.addEventListener('popstate', () => route({ back: true }));

ownScrollRestoration();
watchScroll();

const navToggle = $('#nav-toggle');
if (navToggle) wireNavToggle(navToggle, nav());

/** Banner and page reflect whatever sample mode currently is. */
function paintSampleMode() {
  const banner = $('#sample-banner');
  if (banner) banner.hidden = !isSampleMode();
}

// Fictional notices are on screen, so say so, on every page, without a
// dismiss control. See APP.sampleData in config.js.
paintSampleMode();

// An administrator may have flipped this from the admin portal since the
// build. Reading it is deliberately not awaited: the feed must paint at once,
// and the stored setting agrees with the built-in default on the common path,
// so a repaint is only needed when it does not.
initSampleMode((enabled) => {
  console.info(`Sample data ${enabled ? 'on' : 'off'} by platform setting.`);
  paintSampleMode();
  route();
}).catch((err) => console.error('initSampleMode', err));

if (usingEmulator) $('#env-banner')?.removeAttribute('hidden');

// The feed itself needs no auth state, so the first route paints immediately;
// onAuthStateChanged only ever repaints the nav and, on /signin or
// /dashboard, decides where those two routes actually land.
route();

// If this load is the return leg of a Google redirect sign-in, claim the
// pending credential before anything else. Without this the browser comes
// back and simply shows the sign-in form again, with no explanation.
completeRedirectSignIn((message) => toast(message, 'error'));

onAuthStateChanged(auth, (nextUser) => {
  const nextId = nextUser?.uid ?? null;
  const changed = nextId !== renderedFor;
  const firstResolution = !authReady;
  user = nextUser;
  authReady = true;
  isAdmin = false;

  // Two different reasons to re-render, and conflating them breaks one of
  // them each way:
  //
  //   the account changed        somebody signed in or out.
  //   the route was waiting      /dashboard and /account render "Loading…"
  //                              until auth resolves, so they must re-render
  //                              on the first answer even when it is "still
  //                              signed out".
  //
  // /signin is deliberately not in the second group. It renders its form
  // immediately and only needs re-rendering if an account appears; treating
  // the first "signed out" answer as a reason to re-render would rebuild the
  // form and wipe an email someone had already begun typing, which is
  // precisely when they are most likely to be typing.
  const path = location.pathname;
  const onAuthRoute = /^\/(signin|dashboard|account)\/?$/.test(path);
  const wasWaiting = firstResolution && /^\/(dashboard|account)\/?$/.test(path);

  if (onAuthRoute && (changed || wasWaiting)) route();
  else paintNav();

  // Whether to offer the admin route. Not awaited, and never allowed to break
  // the page: the rules let a signed-in account read only its own /admins
  // document, so a denial here simply means "not an administrator".
  if (!nextUser) return;
  store.isPlatformAdmin(nextUser.uid)
    .then((admin) => {
      if (user !== nextUser || admin === isAdmin) return;
      isAdmin = admin;
      paintNav();
    })
    .catch((err) => console.error('isPlatformAdmin', err));
});
