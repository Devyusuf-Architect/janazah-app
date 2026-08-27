// The community dashboard: one place for a signed-in member's followed
// masjids, alert settings and account security.
//
// Every card here reuses an existing module rather than re-implementing it —
// follows.js, location.js, nearby.js's location/alert panels, and
// account.js's account-security screen are the same code the public feed and
// console already use. Nothing about a user's location, follows or reading
// activity is written to Firestore from this page; see location.js and
// follows.js for why.

import { el, friendlyError } from '../ui.js';
import { publicNoticeView } from '../notice-view.js';
import { consentPanel, settingsPanel } from './nearby.js';
import { accountSummary } from './account.js';
import { orgRow } from './masjids.js';
import * as store from '../store.js';
import * as follows from '../follows.js';
import * as loc from '../location.js';

let unwatch = null;

export function teardownDashboard() {
  if (unwatch) { unwatch(); unwatch = null; }
}

/**
 * @param {HTMLElement} mount
 * @param {{ user: import('firebase/auth').User }} ctx
 */
export function renderDashboard(mount, ctx) {
  teardownDashboard();
  mount.replaceChildren();

  mount.append(el('div', { class: 'page-head' }, [
    el('h1', { text: `Welcome${ctx.user.displayName ? `, ${ctx.user.displayName}` : ''}` }),
  ]));

  const grid = el('div', { class: 'dash-grid' });
  mount.append(grid);

  const upcoming = el('div', { class: 'card dash-card' }, [
    el('h2', { text: 'Upcoming Janazahs' }),
    el('p', { class: 'muted', text: 'Loading…' }),
  ]);
  const nearMe = el('div', { class: 'card dash-card' }, [
    el('h2', { text: 'Janazahs near me' }),
  ]);
  const followedCard = el('div', { class: 'card dash-card dash-card--wide' }, [
    el('h2', { text: 'Following' }),
    el('p', { class: 'muted', text: 'Loading…' }),
  ]);
  const alertsCard = el('div', { class: 'card dash-card dash-card--wide' }, [
    el('h2', { text: 'Notification settings' }),
  ]);
  const accountCard = el('div', { class: 'card dash-card dash-card--wide' });

  grid.append(upcoming, nearMe, followedCard, alertsCard, accountCard);

  // Upcoming Janazahs: a short preview, not a duplicate of the full feed.
  unwatch = store.watchPublicNotices((notices) => {
    const current = notices.filter((n) => n.status !== 'cancelled');
    upcoming.replaceChildren(
      el('h2', { text: 'Upcoming Janazahs' }),
      current.length
        ? el('p', { class: 'muted', text: `${current.length} current and upcoming.` })
        : el('p', { class: 'muted', text: 'None right now.' }),
      ...current.slice(0, 2).map((n) => publicNoticeView(n, { compact: true })),
      el('a', { class: 'btn btn--small', href: '/janazahs', text: 'View all' }),
    );
  }, 20);

  // Near me: the same consent/settings panels the public feed's "Near me"
  // tab uses, without re-rendering the notice list here too.
  const paintNearMe = () => {
    nearMe.replaceChildren(el('h2', { text: 'Janazahs near me' }));
    const settings = loc.settings();
    if (!settings.enabled) {
      nearMe.append(el('p', { class: 'muted' },
        'Off. Turn it on to see how far away a Janazah is.'));
      nearMe.append(el('a', { class: 'btn btn--small', href: '/near-me', text: 'Turn on location' }));
      return;
    }
    nearMe.append(el('p', { class: 'muted' },
      settings.last
        ? `On, within ${settings.radiusKm === 0 ? 'any distance' : `${settings.radiusKm} km`}.`
        : 'On, but no position yet for this device.'));
    nearMe.append(el('a', { class: 'btn btn--small', href: '/near-me', text: 'Open Near Me' }));
  };
  paintNearMe();

  // Followed masjids: same follows.js the feed and the masjids directory use.
  store.verifiedOrganizations()
    .then((orgs) => {
      const followedIds = new Set(follows.followedOrgIds());
      const followed = orgs.filter((o) => followedIds.has(o.id));
      followedCard.replaceChildren(el('h2', { text: 'Following' }));
      if (!followed.length) {
        followedCard.append(
          el('p', { class: 'muted' },
            'You are not following any masjids yet. Follow one and its ' +
            'notices gather here and on your feed, so you do not have to go ' +
            'looking each time.'),
          el('a', { class: 'btn btn--small', href: '/masjids', text: 'Browse masjids' }),
        );
        return;
      }
      followedCard.append(
        el('p', { class: 'muted' },
          `${followed.length} masjid${followed.length === 1 ? '' : 's'}. ` +
          'Kept on this device.'),
        el('ul', { class: 'list' },
          followed.map((org) => orgRow(org, () => renderDashboard(mount, ctx)))),
        el('a', { class: 'btn btn--small', href: '/masjids', text: 'Browse all masjids' }),
      );
    })
    .catch((err) => {
      followedCard.replaceChildren(
        el('h2', { text: 'Followed masjids' }),
        el('p', { class: 'form-error', text: friendlyError(err, 'orgList') }),
      );
    });

  // Notification settings, alert radius and location permission status, all
  // in one place: the location-off consent panel doubles as the "permission
  // status" card when it's off, and the settings panel (which includes the
  // alerts panel) covers radius and notification volume when it's on.
  alertsCard.append(loc.settings().enabled
    ? settingsPanel(loc.settings(), () => renderDashboard(mount, ctx))
    : consentPanel(() => renderDashboard(mount, ctx)));

  // A summary and a way through to Settings, not the settings page nested in
  // a dashboard tile.
  accountCard.append(accountSummary(ctx));
}
