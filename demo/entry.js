// Entry point for the standalone preview.
//
// Mirrors public/js/feed.js, except that routing runs on the hash: a preview
// is served from one fixed path, so pushState would produce links that break
// on reload.

import { $, el } from '../public/js/ui.js';
import { renderFeed, renderSingleNotice, teardownFeed } from '../public/js/views/feed.js';
import { renderPrivacy } from '../public/js/views/privacy.js';

const mount = () => $('#view');

function route() {
  teardownFeed();
  const path = location.hash.replace(/^#/, '') || '/';

  const notice = path.match(/^\/n\/([A-Za-z0-9_-]+)$/);
  if (notice) {
    renderSingleNotice(mount(), notice[1]);
    return;
  }
  if (path === '/privacy') {
    renderPrivacy(mount());
    return;
  }
  renderFeed(mount());
  window.scrollTo({ top: 0 });
}

// The views build ordinary "/n/{id}" links. Translate them to hash routes so
// the same view code works unchanged inside a single hosted page.
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="/"]');
  if (!link || link.target === '_blank' || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  const next = new URL(link.href).pathname;
  if (location.hash.replace(/^#/, '') === next) route();
  else location.hash = next;
});

window.addEventListener('hashchange', route);
route();
