// Bootstrap for the public community feed.
//
// A separate entry point from the coordinator console: the community surface
// is the site root, because that is the URL people share, and it has to load
// and render without any sign-in.

import { usingEmulator } from './firebase.js';
import { $ } from './ui.js';
import { renderFeed, renderSingleNotice, teardownFeed } from './views/feed.js';

const mount = () => $('#view');

/** `/n/{id}` opens one notice; anything else is the feed. */
function route() {
  teardownFeed();
  const match = location.pathname.match(/^\/n\/([A-Za-z0-9_-]+)\/?$/);
  if (match) {
    renderSingleNotice(mount(), match[1]);
  } else {
    document.title = 'Janazah Notices';
    renderFeed(mount());
  }
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
