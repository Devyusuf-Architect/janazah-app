// The signed-in home screen.
//
// This is what "Home" in the sidebar (and the bottom tab bar on a phone)
// points to once someone is signed in — the personal counterpart to the
// public feed at "/", not a separate settings-style page. It answers, in
// order: what is coming up, what is near me, who do I follow, and where do
// I go next. Nothing here is re-implemented: the four sections are the same
// upcoming/near/followed panels and the same Janazah/masjid rows home.js
// already renders for the public feed, so a change to any of those changes
// this page too rather than leaving it quietly out of step.

import { el } from '../ui.js';
import * as store from '../store.js';
import { paintUpcoming, paintNear, paintFollowed, quickActions } from './home.js';

let unwatch = null;

export function teardownDashboard() {
  if (unwatch) unwatch();
  unwatch = null;
}

/**
 * @param {HTMLElement} mount
 * @param {{ user: import('firebase/auth').User }} ctx
 */
export function renderDashboard(mount, ctx) {
  teardownDashboard();

  const state = { notices: [], orgs: [], query: '', loading: true };

  const upcoming = el('section', { class: 'home-section' });
  const near = el('section', { class: 'home-section' });
  const followed = el('section', { class: 'home-section' });

  const repaint = () => {
    paintUpcoming(upcoming, state);
    paintNear(near, state, repaint);
    paintFollowed(followed, state, repaint);
  };

  const firstName = (ctx.user.displayName || '').trim().split(/\s+/)[0];

  mount.replaceChildren(
    el('header', { class: 'dash-head' }, [
      el('h1', { class: 'dash-head__title', text: firstName ? `Assalamu Alaikum, ${firstName}` : 'Assalamu Alaikum' }),
      el('p', { class: 'dash-head__sub muted' }, 'Here is what is coming up, and what you follow.'),
    ]),
    upcoming,
    near,
    followed,
    quickActions(),
  );

  repaint();

  unwatch = store.watchPublicNotices((incoming) => {
    state.notices = incoming;
    state.loading = false;
    repaint();
  });

  // As on the public feed, a masjid-list failure must not take the Janazah
  // list down with it.
  store.verifiedOrganizations()
    .then((orgs) => { state.orgs = orgs; repaint(); })
    .catch((err) => console.error('verifiedOrganizations', err));
}
