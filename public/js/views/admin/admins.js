// Admin management: who holds platform administration, and why this screen
// cannot grant it.
//
// firestore.rules has `allow write: if false` on /admins, for every caller
// without exception. That is not an oversight this section works around; it
// is the point. Platform administration is the only role on Ta'ziyah that can
// verify an organization, take a notice down and change what the whole
// platform does, so the one thing that must never be reachable from a browser
// session is the ability to hand it out. If an administrator's account is
// taken over, the attacker gets that administrator's powers and stops there:
// they cannot mint a second administrator, and they cannot lock the real ones
// out by removing them.
//
// So this reads, and says plainly where the writing happens.

import { el, friendlyError } from '../../ui.js';
import * as store from '../../store.js';
import {
  sectionHead, emptyState, loading, errorState, dataTable, uidChip,
} from './common.js';

export function renderAdmins(panel, actx, ctx) {
  const head = () => sectionHead('Admin management',
    'Who currently holds platform administration.');

  const body = el('div', { class: 'admin-body' });
  panel.replaceChildren(head(), body);
  body.append(loading());

  const paint = (admins, error) => {
    body.replaceChildren(
      el('section', { class: 'admin-card' }, [
        el('div', { class: 'admin-card__head' }, [
          el('div', {}, [
            el('h2', { class: 'admin-card__title', text: 'Platform administrators' }),
            el('p', { class: 'admin-card__sub muted', text:
              'Everyone who can verify an organization, moderate a notice and '
              + 'change platform settings.' }),
          ]),
        ]),
        el('div', { class: 'admin-card__body' }, [
          error
            ? errorState(friendlyError(error, 'load'))
            : (admins.length
              ? dataTable(['Account', 'Email', ''], admins.map((admin) => el('tr', {}, [
                el('td', {}, uidChip(admin.uid)),
                el('td', { text: admin.email || 'not recorded' }),
                el('td', {
                  class: 'muted small',
                  text: admin.uid === ctx?.user?.uid ? 'you' : '',
                }),
              ])))
              : emptyState('No administrator records could be read.')),
        ]),
      ]),

      el('section', { class: 'admin-card' }, [
        el('div', { class: 'admin-card__head' }, [
          el('div', {}, [
            el('h2', { class: 'admin-card__title', text: 'Granting administration' }),
          ]),
        ]),
        el('div', { class: 'admin-card__body' }, [
          el('p', {},
            'Administration cannot be granted or revoked from this portal, and '
            + 'not because the buttons are missing. The security rules refuse '
            + 'every write to the administrator records, from every account, '
            + 'including yours.'),
          el('p', {},
            'That is deliberate. This is the role that verifies masjids and '
            + 'takes funeral notices down. If an administrator’s account is '
            + 'ever taken over, whoever has it gets that one account’s reach '
            + 'and no further: they cannot create a second administrator, and '
            + 'they cannot remove the real ones to keep control.'),
          el('h3', { text: 'How to add one' }),
          el('ol', { class: 'list' }, [
            el('li', {}, 'Ask the person to create an ordinary Ta’ziyah account and sign in once.'),
            el('li', {}, 'Find their user id in the Firebase console, under Authentication.'),
            el('li', {}, [
              'In Firestore, create a document in the ',
              el('span', { class: 'mono', text: 'admins' }),
              ' collection whose document id is that user id, with a single ',
              el('span', { class: 'mono', text: 'email' }),
              ' field naming them.',
            ]),
            el('li', {}, 'They see the portal the next time they load the console.'),
          ]),
          el('h3', { text: 'How to remove one' }),
          el('p', {},
            'Delete their document from the same collection. Their account is '
            + 'untouched; they simply stop being an administrator. Everything '
            + 'they did stays in the audit log under their name, which is '
            + 'append-only and cannot be edited by anybody.'),
        ]),
      ]),
    );
  };

  store.listPlatformAdmins()
    .then((admins) => paint(admins.sort((a, b) =>
      (a.email || a.uid).localeCompare(b.email || b.uid)), null))
    .catch((err) => paint([], err));

  actx.watch(() => {});
}
