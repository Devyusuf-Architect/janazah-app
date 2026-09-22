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
import { initPlatformSettings } from './platform-settings.js';
import * as store from './store.js';
import { renderNav, wireNavToggle, closeNav } from './nav.js';
import { renderFooter } from './footer.js';
import {
  revealIn, autoReveal, pageEnter, ownScrollRestoration, rememberScroll,
  restoreScroll, watchScroll, watchScrollPosition,
} from './motion.js';
import { renderHome, teardownHome } from './views/home.js';
import { renderWelcome, teardownWelcome } from './views/welcome.js';
import { renderHowItWorks } from './views/how-it-works.js';
import { renderForMasjids } from './views/for-masjids.js';
import { renderFaq } from './views/faq.js';
import { renderContact } from './views/contact.js';
import { renderDeleteAccount } from './views/delete-account.js';
import { applyPageMeta } from './seo.js';
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
  renderNav(nav(), { path: location.pathname, user, isAdmin, authReady });
}

// Returned by renderRoute when it has changed the URL instead of rendering,
// so route() can run again against the new path rather than renderRoute
// calling route() from inside itself.
const REDIRECTED = Symbol('redirected');

/** Swap the address without adding a history entry, and render that instead. */
function redirect(to) {
  history.replaceState(history.state, '', to);
  return REDIRECTED;
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
    return redirect('/masjids');
  }

  const orgPage = path.match(/^\/o\/([A-Za-z0-9_-]+)\/?$/);
  if (orgPage) {
    renderOrgPage(mount(), orgPage[1]);
    return;
  }

  if (/^\/janazahs\/?$/.test(path)) {
    renderFeed(mount());
    return;
  }
  if (/^\/near-me\/?$/.test(path)) {
    renderFeed(mount(), { initialFilter: 'nearby' });
    return;
  }
  if (/^\/masjids\/?$/.test(path)) {
    renderMasjids(mount());
    return;
  }
  if (/^\/register-masjid\/?$/.test(path)) {
    renderRegisterMasjid(mount());
    return;
  }
  if (/^\/janazah-guide\/?$/.test(path)) {
    renderJanazahGuide(mount());
    return;
  }
  if (/^\/following\/?$/.test(path)) {
    renderFollowing(mount());
    return;
  }
  if (/^\/account\/?$/.test(path)) {
    if (!authReady) { mount().replaceChildren(el('p', { class: 'muted', text: 'Loading…' })); return; }
    if (!user) return redirect('/signin');
    renderAccount(mount(), { user });
    return;
  }
  // The first-run introduction keeps its own address. It is a different
  // thing from /how-it-works: four points and a closing, read once by
  // somebody who has just arrived, where /how-it-works is the full account
  // for a reader who wants it. Neither is the other written twice.
  //
  // It is marked noindex with a canonical pointing at /how-it-works
  // (js/site.js), so the two do not compete for the same search result while
  // both stay reachable.
  if (/^\/welcome\/?$/.test(path)) {
    renderWelcome(mount());
    return;
  }
  if (/^\/how-it-works\/?$/.test(path)) {
    renderHowItWorks(mount());
    return;
  }
  if (/^\/for-masjids\/?$/.test(path)) {
    renderForMasjids(mount());
    return;
  }
  if (/^\/faq\/?$/.test(path)) {
    renderFaq(mount());
    return;
  }
  if (/^\/contact\/?$/.test(path)) {
    renderContact(mount());
    return;
  }
  if (/^\/delete-account\/?$/.test(path)) {
    renderDeleteAccount(mount());
    return;
  }
  if (/^\/about\/?$/.test(path)) {
    renderAbout(mount());
    return;
  }
  if (/^\/privacy\/?$/.test(path)) {
    renderPrivacy(mount());
    return;
  }
  if (/^\/terms\/?$/.test(path)) {
    renderTerms(mount());
    return;
  }
  if (/^\/signin\/?$/.test(path)) {
    if (user) return redirect('/dashboard');
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
    if (!user) return redirect('/signin');
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
    history.replaceState(history.state, '', '/welcome');
    renderWelcome(mount());
    return;
  }
  renderHome(mount());
}


// Views render synchronously, but several then repaint from a live Firestore
// snapshot, so a single reveal pass would miss every card that matters.
// autoReveal keeps watching the mount for whatever arrives later.
let stopReveal = () => {};

/**
 * Render whatever the current address says, and settle the page around it.
 *
 * @param {object} [options]
 * @param {boolean} [options.back] This is a back or forward step, so the
 *   offset recorded on the history entry is restored rather than the top.
 * @param {boolean} [options.quiet] A repaint of the page already on screen,
 *   not a navigation: something loaded late and the view has to be rebuilt
 *   with it. Keeps the reader where they are and plays no entrance, because
 *   a page that re-animates and jumps to the top half a second after it
 *   settled reads as a bug, and used to be one.
 */
function route({ back = false, quiet = false } = {}) {
  stopReveal();
  renderedFor = user?.uid ?? null;

  // A route may decide the address should be different: an old link, or a
  // page that turns out to need signing in. It says so and this runs again,
  // with a bound because a pair of routes redirecting to each other would
  // otherwise hang the tab rather than showing anything.
  let guard = 0;
  while (renderRoute() === REDIRECTED && guard++ < 5) { /* the new path */ }

  // Title, description, canonical and the sharing tags, from the one
  // manifest the static pages were generated from (js/site.js). The markup
  // already carried the right values for the page that was served; this
  // keeps them right for every page reached without a reload afterwards.
  // Views for a single notice or masjid set their own title from the record
  // they loaded, after this runs.
  applyPageMeta(location.pathname);
  if (!quiet) {
    restoreScroll({ remembered: back });
    pageEnter(mount());
  }
  revealIn(mount());
  stopReveal = autoReveal(mount());
}

// Handle in-app links without reloading the document. Links to the console are
// left alone so they load that page properly.
document.addEventListener('click', (event) => {
  // Anything the browser is meant to handle itself, it handles itself. Each
  // of these was a way to break a link that people genuinely use: a
  // shift-click opens a window, an alt-click saves the target, and a
  // middle-click opens a tab, and intercepting any of them takes that away
  // and navigates in place instead.
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const link = event.target.closest('a[href^="/"]');
  if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
  const url = new URL(link.href);
  // The console is a separate entry point with its own bundle, so it has to
  // be a real page load rather than a route in this application.
  if (url.origin !== location.origin || url.pathname.startsWith('/console')) return;

  event.preventDefault();
  closeNav($('#nav-toggle'), nav());

  // Going where you already are is not a navigation. Pushing an entry for it
  // is what made the Back button look broken: every click on the nav item
  // for the current page stacked another identical entry, so Back returned
  // to the same address and appeared to do nothing. The nav items are on
  // every screen, so this happened constantly.
  const here = location.pathname + location.search;
  const there = url.pathname + url.search;
  if (there === here) {
    // Treat it as "take me to the top of this", which is what somebody
    // clicking the section they are already in usually means.
    window.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }

  // Record where they were before the entry stops being the current one, so
  // Back and Forward both return them to it.
  rememberScroll();
  history.pushState({}, '', there);
  route();
});

// Back and forward return to the remembered offset; a fresh navigation
// starts at the top.
window.addEventListener('popstate', () => route({ back: true }));

ownScrollRestoration();
watchScroll();
// Keeps the current history entry's offset roughly current, so returning to
// this page later lands where it was left.
watchScrollPosition();

renderFooter($('#footer'));

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
  route({ quiet: true });
}).catch((err) => console.error('initSampleMode', err));

// Same reasoning: the public pages that show a support or privacy contact
// address (see privacy.js, terms.js, about.js) read platformSettings(),
// which starts out at its built-in defaults (both addresses empty) until
// this resolves. Reading it here, rather than only inside the admin portal,
// is what lets those pages ever show a real address at all.
initPlatformSettings(() => route({ quiet: true }))
  .catch((err) => console.error('initPlatformSettings', err));

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
