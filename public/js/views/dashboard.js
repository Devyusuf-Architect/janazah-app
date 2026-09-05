// The signed-in home screen.
//
// This is what "Home" in the sidebar (and the bottom tab bar on a phone)
// points to once someone is signed in — the personal counterpart to the
// public feed at "/", not a separate settings-style page. It answers, in
// order: what is coming up, what is near me, who do I follow, and where do
// I go next. Nothing here is re-implemented: the three shared sections are
// the same upcoming/near/followed panels home.js already renders for the
// public feed, so a change to any of those changes this page too rather than
// leaving it quietly out of step. Quick Actions is shared too, extended with
// one new optional parameter for the two staff-only actions below.
//
// Two things ARE dashboard-only, because they depend on who is signed in
// rather than on the public notice stream: knowing whether this account
// staffs a verified masjid (so Quick Actions can offer Post/Manage), and
// Recent Updates, a short list built from notices already on this page.

import { el, icon } from '../ui.js';
import * as store from '../store.js';
import * as follows from '../follows.js';
import { paintUpcoming, paintNear, paintFollowed, quickActions, sectionHead } from './home.js';

/** How many recent-activity lines to show before the rest waits for /janazahs. */
const RECENT_UPDATES_LIMIT = 5;
/** Anything older than this is not "recent" any more; it is just history. */
const RECENT_UPDATES_WINDOW_MS = 72 * 60 * 60 * 1000;

let unwatch = null;

export function teardownDashboard() {
  if (unwatch) unwatch();
  unwatch = null;
  document.getElementById('view')?.classList.remove('view--wide');
}

/**
 * @param {HTMLElement} mount
 * @param {{ user: import('firebase/auth').User }} ctx
 */
export function renderDashboard(mount, ctx) {
  teardownDashboard();
  // Same pattern as the admin portal (views/admin.js): a wider reading
  // column for a two-column layout, restored to the normal width by
  // teardownDashboard() the moment this route is left.
  mount.classList.add('view--wide');

  const state = {
    notices: [], orgs: [], query: '', loading: true,
    // null: not yet known. An array (possibly empty) once myOrganizations()
    // resolves. Quick Actions and Recent Updates both wait for this rather
    // than assuming "not staff" while it is still in flight, so a verified
    // coordinator never sees the staff actions flash in a beat late.
    staffOrgs: null,
  };

  const upcoming = el('section', { class: 'home-section dash-upcoming' });
  const near = el('section', { class: 'home-section' });
  const followed = el('section', { class: 'home-section' });
  const updates = el('section', { class: 'home-section', hidden: true });
  let qa = quickActions();

  const repaint = () => {
    paintUpcoming(upcoming, state);
    paintNear(near, state, repaint);
    paintFollowed(followed, state, repaint);
    paintRecentUpdates(updates, state);
    const freshQa = quickActions(staffContext(state));
    qa.replaceWith(freshQa);
    qa = freshQa;
  };

  const firstName = (ctx.user.displayName || '').trim().split(/\s+/)[0];

  mount.replaceChildren(
    el('header', { class: 'dash-head' }, [
      el('h1', { class: 'dash-head__title', text: firstName ? `Assalamu Alaikum, ${firstName}` : 'Assalamu Alaikum' }),
      el('p', { class: 'dash-head__sub muted' }, 'Here is what is happening around you.'),
    ]),
    upcoming,
    el('div', { class: 'dash-grid' }, [
      el('div', { class: 'dash-col' }, [near, followed]),
      el('div', { class: 'dash-col' }, [qa, updates]),
    ]),
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

  store.myOrganizations(ctx.user.uid)
    .then((orgs) => { state.staffOrgs = orgs; repaint(); })
    .catch((err) => {
      console.error('myOrganizations', err);
      // Staff status could not be confirmed; treat as "not staff" rather
      // than leaving Quick Actions waiting forever on a failed read.
      state.staffOrgs = [];
      repaint();
    });
}

/** Whether this account staffs a verified masjid, for Quick Actions. */
function staffContext(state) {
  if (!state.staffOrgs) return null;
  return { canPublish: state.staffOrgs.some((o) => o.verificationStatus === 'verified') };
}

// -------------------------------------------------------------- recent updates

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  return value instanceof Date ? value : null;
}

/**
 * What counts as a Recent Update, built entirely from the notice stream this
 * page already has: a cancellation, a correction, or a brand-new notice, on
 * any masjid this account follows or staffs, in the last three days.
 *
 * A fourth signal from the design brief — a masjid's own verification status
 * changing — is deliberately left out. There is no cheap read for it here:
 * organizations carry only their current verificationStatus, not a history of
 * it, so showing it would mean a new backend read (an audit trail this page
 * has no other reason to load) rather than reusing data already on screen.
 */
function recentUpdateItems(state) {
  const ids = new Set([...follows.followedOrgIds(), ...(state.staffOrgs || []).map((o) => o.id)]);
  if (!ids.size) return [];

  const now = Date.now();
  const items = [];
  for (const notice of state.notices) {
    if (!ids.has(notice.orgId)) continue;
    const orgName = notice.orgName || 'A masjid you follow';

    if (notice.status === 'cancelled') {
      const at = toDate(notice.cancelledAt) || toDate(notice.updatedAt);
      if (at && now - at.getTime() < RECENT_UPDATES_WINDOW_MS) {
        items.push({ at, icon: 'warning', href: `/n/${notice.id}`,
          text: `${orgName} cancelled a Janazah notice.` });
      }
      continue;
    }

    if (notice.correctionNote) {
      const at = toDate(notice.updatedAt);
      if (at && now - at.getTime() < RECENT_UPDATES_WINDOW_MS) {
        items.push({ at, icon: 'bell', href: `/n/${notice.id}`,
          text: `${orgName} updated a Janazah notice.` });
        continue;
      }
    }

    const publishedAt = toDate(notice.publishedAt);
    if (publishedAt && now - publishedAt.getTime() < RECENT_UPDATES_WINDOW_MS) {
      items.push({ at: publishedAt, icon: 'plus', href: `/n/${notice.id}`,
        text: `${orgName} published a new Janazah notice.` });
    }
  }

  items.sort((a, b) => b.at - a.at);
  return items.slice(0, RECENT_UPDATES_LIMIT);
}

/**
 * Hidden entirely when there is nothing to show — no empty-state placeholder,
 * per the same "do not proliferate empty states" instruction that shaped
 * Upcoming, Near You and Masjids You Follow above.
 */
function paintRecentUpdates(mount, state) {
  if (state.loading || !state.staffOrgs) { mount.hidden = true; mount.replaceChildren(); return; }

  const items = recentUpdateItems(state);
  if (!items.length) { mount.hidden = true; mount.replaceChildren(); return; }

  mount.hidden = false;
  mount.replaceChildren(
    sectionHead('Recent updates'),
    el('ul', { class: 'updates' }, items.map((item) => el('li', { class: 'update-row reveal' }, [
      el('a', { class: 'update-row__main', href: item.href }, [
        icon(item.icon, { size: 15 }),
        el('span', { text: item.text }),
      ]),
    ]))),
  );
}
