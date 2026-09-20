// The public account deletion page.
//
// Google Play requires a URL where somebody can find out how to have their
// account and their data deleted WITHOUT installing the app, and without
// having to sign in to discover the answer. That is why this page is public,
// why it is a plain explanation rather than a form behind a login, and why it
// describes what deletion does and does not remove.
//
// The in-app path is the real one for anyone who still has the app: Profile,
// then Delete my account, which deletes immediately and needs no request.
// This page exists for everyone else, and for the Play listing to point at.
//
// Every claim here matches src/lib/account.ts in the app and the retention
// periods in retention-policy.js. If either changes, this page is wrong.

import { el } from '../ui.js';
import { RETENTION_DAYS } from '../retention-policy.js';
import { CONTACT, CONTACT_PENDING, isContactComplete } from '../contact.js';

export function renderDeleteAccount(mount) {
  mount.replaceChildren();

  const section = (heading, children) =>
    el('section', {}, [el('h2', { text: heading }), ...children]);

  const list = (items) => el('ul', {}, items.map((t) => el('li', { text: t })));

  mount.append(el('article', { class: 'policy' }, [
    el('a', { class: 'btn btn--link', href: '/janazahs' }, '← Back to notices'),
    el('h1', { text: 'Deleting your Ta’ziyah account' }),
    el('p', { class: 'muted' }, [
      el('a', { class: 'link', href: '/privacy' }, 'Privacy'),
      el('span', { text: ' explains what is held and for how long.' }),
    ]),

    el('p', { text: 'You can delete your account yourself, at any time, and ' +
                    'you do not have to ask anyone. Reading notices still ' +
                    'works afterwards: this website needs no account at all.' }),

    section('In the Android app', [
      el('ol', {}, [
        el('li', { text: 'Open Ta’ziyah and go to Profile.' }),
        el('li', { text: 'Choose “Delete my account”.' }),
        el('li', { text: 'Confirm. The account is deleted straight away.' }),
      ]),
    ]),

    section('On this website', [
      el('ol', {}, [
        el('li', { text: 'Sign in and open your account page.' }),
        el('li', { text: 'Choose “Delete my account”, then confirm.' }),
      ]),
    ]),

    section('If you cannot sign in', [
      el('p', { text: 'If you no longer have the app, or cannot get into your ' +
                      'account, you can ask us to delete it. Write from the ' +
                      'email address the account uses, if you still have it, ' +
                      'and say that you want the account deleted.' }),
      ...(isContactComplete()
        ? [el('p', {}, [
          el('span', { text: 'Send that to ' }),
          el('a', { class: 'link', href: `mailto:${CONTACT.privacyEmail}` }, CONTACT.privacyEmail),
          el('span', { text: `, or by post to ${CONTACT.postalAddress}.` }),
        ])]
        : [el('p', { class: 'hint hint--boxed' }, CONTACT_PENDING)]),
    ]),

    section('What deletion removes', [
      list([
        'Your sign-in account, including your email address and name.',
        'The masjids you follow and your alert settings.',
        'The notification registration for any device you turned alerts on for.',
      ]),
    ]),

    section('What it does not remove, and why', [
      el('p', { text: 'Two things stay, and neither is about you as a reader.' }),
      list([
        'Janazah notices published by a masjid. A notice is the public record '
          + 'of a funeral, and deleting one reader’s account does not withdraw '
          + 'an announcement a masjid made. Notices age out on their own: the '
          + `deceased’s name is removed from a notice ${RETENTION_DAYS.publicNameDays} `
          + 'days after the prayer.',
        'The record of who published, changed or cancelled a notice. It is '
          + 'what makes a fraudulent notice traceable, it refers to notices by '
          + 'id, and it does not hold the deceased’s name.',
      ]),
      el('p', { text: 'If you own a masjid’s registration, that has to be ' +
                      'transferred or the registration withdrawn before the ' +
                      'account can be deleted. The app says so and will not ' +
                      'let the deletion go ahead silently.' }),
      el('p', {}, [
        el('span', { text: 'A family asking for a notice about their own ' +
                           'relative to be taken down has a separate and ' +
                           'faster path: see ' }),
        el('a', { class: 'link', href: '/privacy' }, 'asking for a notice to come down'),
        el('span', { text: '.' }),
      ]),
    ]),
  ]));
}
