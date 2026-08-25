// Bootstrap for the public community feed.
//
// A separate entry point from the coordinator console: the community surface
// is the site root, because that is the URL people share, and it has to load
// and render without any sign-in.

import { usingEmulator } from './firebase.js';
import { $ } from './ui.js';
import { renderFeed, renderSingleNotice, teardownFeed } from './views/feed.js';
import { renderPrivacy } from './views/privacy.js';
import { renderTerms } from './views/terms.js';

const mount = () => $('#view');

/** `/n/{id}` opens one notice, `/privacy` the policy, anything else the feed. */
function route() {
  teardownFeed();
  const notice = location.pathname.match(/^\/n\/([A-Za-z0-9_-]+)\/?$/);
  if (notice) {
    renderSingleNotice(mount(), notice[1]);
    return;
  }
  if (/^\/privacy\/?$/.test(location.pathname)) {
    document.title = "Privacy — Ta'ziyah";
    renderPrivacy(mount());
    return;
  }
  if (/^\/terms\/?$/.test(location.pathname)) {
    document.title = "Terms of service — Ta'ziyah";
    renderTerms(mount());
    return;
  }
  document.title = "Ta'ziyah";
  renderFeed(mount());
}

// Handle in-app links without reloading the document. Links to the console are
// left alone so they load that page properly.
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="/"]');
  if (!link || link.target === '_blank' || event.metaKey || event.ctrlKey) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/console')) return;
  event.preventDefault();
  history.pushState(null, '', url.pathname);
  route();
});

window.addEventListener('popstate', route);

if (usingEmulator) $('#env-banner')?.removeAttribute('hidden');

route();
