// The masajid directory: every verified organization, so following one does
// not require first finding one of its notices.
//
// Reads the same `store.verifiedOrganizations()` and `follows.js` the feed's
// own follow manager uses (views/feed.js), and shares this file's row markup
// with it, so there is one place that draws "a masjid, with a follow button".

import { el, toast, friendlyError } from '../ui.js';
import * as store from '../store.js';
import * as follows from '../follows.js';
import * as push from '../push.js';

/**
 * One organization row with its follow toggle. Shared by the full directory
 * page and the feed's "Masajid I follow" modal.
 * @param {object} org
 * @param {() => void} onChange  Called after the follow state changes.
 */
export function orgRow(org, onChange = () => {}) {
  const button = el('button', { class: 'btn btn--small' });
  const paint = () => {
    const following = follows.isFollowing(org.id);
    button.replaceChildren(el('span', { text: following ? 'Following' : 'Follow' }));
    button.classList.toggle('btn--active', following);
    button.setAttribute('aria-label', following ? `Following ${org.name}` : `Follow ${org.name}`);
  };
  button.addEventListener('click', () => {
    if (!follows.storageAvailable()) {
      toast('Your browser is blocking local storage, so follows cannot be saved.', 'warn');
      return;
    }
    const following = follows.toggleFollow(org.id);
    paint();
    toast(following ? `Following ${org.name}.` : `Unfollowed ${org.name}.`);
    push.syncTopics().catch((err) => console.error('syncTopics', err));
    onChange();
  });
  paint();

  return el('li', { class: 'list-row' }, [
    el('div', {}, [
      el('strong', { text: org.name }),
      el('p', { class: 'muted', text: `${org.city}, ${org.province}` }),
    ]),
    button,
  ]);
}

export function renderMasajid(mount) {
  mount.replaceChildren(el('div', { class: 'skeletons', 'aria-hidden': 'true' }));

  store.verifiedOrganizations()
    .then((orgs) => paint(mount, orgs))
    .catch((err) => {
      mount.append(el('p', { class: 'form-error', text: friendlyError(err) }));
    });
}

function paint(mount, orgs) {
  const list = el('ul', { class: 'list' });
  mount.replaceChildren(
    el('div', { class: 'page-head' }, [el('h1', { text: 'Masajid' })]),
    el('p', { class: 'muted', style: 'margin-bottom:1.25rem' },
      'Every verified masjid and funeral coordinator on Ta’ziyah. Follow one ' +
      'and its notices gather on your feed and, if you turn alerts on, reach ' +
      'you even when this page is closed. Follows stay on this device; there ' +
      'is no account to create.'),
  );

  if (!orgs.length) {
    mount.append(el('div', { class: 'empty' }, [
      el('h2', { text: 'No verified masajid yet' }),
      el('p', { text: 'Once one is verified, it will appear here.' }),
    ]));
  } else {
    const repaint = () => list.replaceChildren(...orgs.map((org) => orgRow(org, () => {})));
    repaint();
    mount.append(list);
  }

  mount.append(el('div', { class: 'card card--flat', style: 'margin-top:1.5rem' }, [
    el('h2', { text: 'Represent a masjid or funeral home?' }),
    el('p', { class: 'muted' },
      'Register it, then a platform administrator verifies it before it can ' +
      'publish. This keeps every notice traceable to a real, checked organization.'),
    el('a', { class: 'btn btn--primary', href: '/console', text: 'Register your masjid' }),
  ]));
}
