// The masjids this device follows.
//
// No sign-in required, deliberately: follows live in localStorage
// (follows.js), so this works for someone who has never made an account,
// which is most of the community. Signing in does not change what is shown
// here, and this page says so rather than implying a sync that does not
// happen.

import { el, icon, skeleton, friendlyError } from '../ui.js';
import { orgRow } from './masjids.js';
import * as store from '../store.js';
import * as follows from '../follows.js';

export function renderFollowing(mount) {
  mount.replaceChildren(
    el('div', { class: 'page-head' }, [el('h1', { text: 'Following' })]),
    el('div', { class: 'skeletons', 'aria-hidden': 'true' }, [skeleton(2)]),
  );

  const followedIds = follows.followedOrgIds();

  if (!followedIds.length) {
    paintEmpty(mount);
    return;
  }

  store.verifiedOrganizations()
    .then((orgs) => paint(mount, orgs.filter((o) => followedIds.includes(o.id))))
    .catch((err) => {
      mount.replaceChildren(
        el('div', { class: 'page-head' }, [el('h1', { text: 'Following' })]),
        el('p', { class: 'form-error', text: friendlyError(err, 'orgList') }),
      );
    });
}

function head() {
  return el('div', { class: 'page-head' }, [el('h1', { text: 'Following' })]);
}

function paintEmpty(mount) {
  mount.replaceChildren(head(), el('div', { class: 'empty' }, [
    icon('bookmark', { size: 30 }),
    el('h2', { text: 'You are not following any masjids yet' }),
    el('p', { class: 'muted' },
      'Follow one and its notices gather here and on your feed, so you do not ' +
      'have to go looking each time.'),
    el('a', { class: 'btn btn--primary', href: '/masjids' }, 'Browse masjids'),
  ]));
}

function paint(mount, followed) {
  if (!followed.length) {
    // Followed ids exist but none resolve to a verified organization: the
    // masjid was suspended, or this device followed something that has since
    // stopped being public. Say that rather than showing a bare empty list.
    mount.replaceChildren(head(), el('div', { class: 'empty' }, [
      el('h2', { text: 'Nothing to show' }),
      el('p', { class: 'muted' },
        'The masjids this device follows are not currently available. They may ' +
        'be under review.'),
      el('a', { class: 'btn', href: '/masjids' }, 'Browse masjids'),
    ]));
    return;
  }

  mount.replaceChildren(
    head(),
    el('p', { class: 'muted', style: 'margin-bottom:1.25rem' },
      `${followed.length} masjid${followed.length === 1 ? '' : 's'}. Kept on ` +
      'this device only, never sent to us or to the masjid, so nobody can see ' +
      'whose notices you watch.'),
    el('ul', { class: 'list' }, followed.map((org) => orgRow(org, () => renderFollowing(mount)))),
    el('a', { class: 'btn btn--small', href: '/masjids' }, 'Browse all masjids'),
  );
}
