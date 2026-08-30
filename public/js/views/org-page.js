// One organization's public page: who they are, and their current and
// upcoming Janazah notices.
//
// The point of following a masjid is being able to keep up with it. Without
// somewhere to land, "following" was only a filter on the main feed. This is
// where a follow leads.
//
// Nothing here needs an account, and nothing here grants anything. It reads
// the same public organization record the directory reads and filters the
// same public notice feed the front page already subscribes to, so it adds no
// query, no index and no rule.

import { el, icon, skeleton, toast, friendlyError } from '../ui.js';
import { publicNoticeView } from '../notice-view.js';
import * as store from '../store.js';
import * as follows from '../follows.js';
import * as push from '../push.js';

let unwatch = null;

export function teardownOrgPage() {
  if (unwatch) { unwatch(); unwatch = null; }
}

export async function renderOrgPage(mount, orgId) {
  teardownOrgPage();
  mount.replaceChildren(skeleton(2));

  let org;
  try {
    org = await store.getOrganization(orgId);
  } catch (err) {
    mount.replaceChildren(el('div', { class: 'empty' }, [
      el('p', { class: 'form-error', text: friendlyError(err, 'orgList') }),
      el('a', { class: 'btn', href: '/masjids' }, 'Back to all masjids'),
    ]));
    return;
  }

  // An unverified organization has no public page. Rules would refuse to
  // return it to a visitor anyway; this is the same answer, said plainly.
  if (!org || org.verificationStatus !== 'verified') {
    mount.replaceChildren(el('div', { class: 'empty' }, [
      el('h1', { text: 'Masjid not found' }),
      el('p', { class: 'muted' },
        'This masjid may not be verified yet, or the link may be incomplete.'),
      el('a', { class: 'btn', href: '/masjids' }, 'Browse verified masjids'),
    ]));
    return;
  }

  document.title = `${org.name} — Ta'ziyah`;

  const list = el('div', { class: 'stack' }, [skeleton(2)]);

  const followBtn = el('button', { class: 'btn' });
  const paintFollow = () => {
    const following = follows.isFollowing(org.id);
    followBtn.replaceChildren(
      icon('bookmark', { size: 16 }),
      el('span', { text: following ? 'Following' : 'Follow' }),
    );
    followBtn.classList.toggle('btn--active', following);
    followBtn.setAttribute('aria-pressed', String(following));
    followBtn.setAttribute('aria-label',
      following ? `Following ${org.name}` : `Follow ${org.name}`);
  };
  followBtn.addEventListener('click', () => {
    if (!follows.storageAvailable()) {
      toast('Your browser is blocking local storage, so follows cannot be saved.', 'warn');
      return;
    }
    const following = follows.toggleFollow(org.id);
    paintFollow();
    followBtn.classList.remove('btn--pulse');
    // Re-adding on the next frame restarts the animation, which is the only
    // acknowledgement this action gets: nothing loads and nothing navigates.
    requestAnimationFrame(() => followBtn.classList.add('btn--pulse'));
    toast(following ? `Following ${org.name}.` : `Unfollowed ${org.name}.`);
    push.syncTopics().catch((err) => console.error('syncTopics', err));
  });
  paintFollow();

  mount.replaceChildren(
    el('a', { class: 'btn btn--link', href: '/masjids' },
      [icon('arrowLeft', { size: 15 }), el('span', { text: 'All masjids' })]),

    el('div', { class: 'card org-header' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [
          el('h1', { text: org.name }),
          el('p', { class: 'muted', text: [org.address, org.city, org.province].filter(Boolean).join(', ') }),
        ]),
        el('span', { class: 'badge badge--ok', text: 'Verified Organization' }),
      ]),
      el('p', { class: 'hint' },
        'Verified by a platform administrator, which is what allows it to ' +
        'publish Janazah notices here.'),
      el('div', { class: 'card-actions' }, [
        followBtn,
        org.website
          ? el('a', {
              class: 'btn btn--small', href: org.website,
              target: '_blank', rel: 'noopener noreferrer',
            }, 'Website')
          : null,
        Number.isFinite(org.lat) && Number.isFinite(org.lng)
          ? el('a', {
              class: 'btn btn--small', target: '_blank', rel: 'noopener noreferrer',
              href: `https://www.google.com/maps/dir/?api=1&destination=${org.lat},${org.lng}`,
            }, 'Directions')
          : null,
      ]),
    ]),

    el('h2', { class: 'org-page__heading', text: 'Current and upcoming Janazahs' }),
    list,
  );

  // The same public feed the front page uses, narrowed to this organization.
  unwatch = store.watchPublicNotices((notices) => {
    const mine = notices.filter((n) => n.orgId === org.id);
    if (!mine.length) {
      list.replaceChildren(el('div', { class: 'empty' }, [
        icon('clock', { size: 28 }),
        el('h3', { text: 'Nothing scheduled right now' }),
        el('p', { class: 'muted' },
          follows.isFollowing(org.id)
            ? 'You are following this masjid, so its next notice will reach you.'
            : 'Follow this masjid and its notices will gather on your feed.'),
      ]));
      return;
    }
    list.replaceChildren(...mine.map((notice) => el('div', {
      class: `card notice-card notice-card--${notice.status} reveal`,
    }, [
      publicNoticeView(notice, { compact: true }),
      el('div', { class: 'card-actions' }, [
        el('a', { class: 'btn btn--small', href: `/n/${notice.id}` }, 'Open'),
      ]),
    ])));
  });
}
