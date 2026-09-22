// Deleting an account, explained before somebody is standing in front of the
// button.
//
// A public page rather than only a control inside Settings, for two reasons.
// Somebody deciding whether to sign up at all is entitled to read how they
// get out first, and an app store or a privacy review asks for a plain URL
// that explains it. Neither of those readers is signed in.
//
// Everything stated here matches what the delete actually does
// (views/account.js, confirmDelete). If that changes, this changes with it:
// a page that describes a deletion more thoroughly than the code performs
// one is worse than no page.

import { el } from '../ui.js';
import { platformSettings } from '../platform-settings.js';

export function renderDeleteAccount(mount) {
  const settings = platformSettings();
  const support = settings.privacyEmail || settings.supportEmail;

  mount.replaceChildren(el('article', { class: 'policy' }, [
    el('h1', { text: 'Deleting your account' }),

    el('p', { class: 'lede' },
      'You can delete your Ta’ziyah account yourself, at any time, from '
      + 'Account and settings. It is permanent and it is not reversible.'),

    el('section', {}, [
      el('h2', { text: 'How to do it' }),
      el('ol', {}, [
        el('li', {}, ['Sign in, then open ',
          el('a', { class: 'link', href: '/account' }, 'Account and settings'),
          '.']),
        el('li', { text: 'Under "This account", choose Delete account.' }),
        el('li', { text: 'Confirm. You are signed out and the account is gone.' }),
      ]),
    ]),

    el('section', {}, [
      el('h2', { text: 'What is deleted' }),
      el('p', {},
        'Your sign-in account: the email address and password or Google '
        + 'sign-in it was created with, and the profile record attached to '
        + 'it. Once it is gone you cannot sign in with it, and it cannot be '
        + 'restored.'),
    ]),

    el('section', {}, [
      el('h2', { text: 'What was never on the account to begin with' }),
      el('p', {},
        'The masjids you follow, your alert distance and your location '
        + 'settings are kept on your own device rather than in your account, '
        + 'so deleting the account does not remove them and never did hold '
        + 'them. Clear them from Settings on the device, or by clearing this '
        + 'site’s data in your browser.'),
      el('p', {},
        'There is no record of which notices you read, so there is nothing of '
        + 'that kind to delete.'),
    ]),

    el('section', {}, [
      el('h2', { text: 'If you publish for a masjid' }),
      el('p', {},
        'An account that owns a verified organization cannot be deleted while '
        + 'it still owns it. The organization record names an owner, the '
        + 'notices it has published are attributed to an author, and deleting '
        + 'the account would leave a verified masjid nobody can administer.'),
      el('p', {}, [
        'Transfer ownership to another member of staff first, or ',
        el('a', { class: 'link', href: '/contact' }, 'contact us'),
        ' and a platform administrator will help sort it out.',
      ]),
    ]),

    el('section', {}, [
      el('h2', { text: 'Janazah notices already published' }),
      el('p', {},
        'A notice belongs to the organization that published it, not to the '
        + 'staff account that typed it, so notices stay where they are when '
        + 'an individual account is deleted. A family who wants a notice '
        + 'about their relative removed should ask for a takedown instead: '
        + 'use "Report a problem" on the notice, which reaches a platform '
        + 'administrator directly.'),
    ]),

    el('section', {}, [
      el('h2', { text: 'Reading without an account' }),
      el('p', {}, [
        'Deleting your account does not cut you off from anything you came '
        + 'for. Every notice can be read signed out, masjids can be followed '
        + 'on the device, and nearby alerts work without an account. See ',
        el('a', { class: 'link', href: '/how-it-works' },
          "how Ta’ziyah works"),
        '.',
      ]),
    ]),

    support
      ? el('p', { class: 'muted' }, [
        'Questions about deletion or about what is held: ',
        el('a', { class: 'link', href: `mailto:${support}` }, support),
        '.',
      ])
      : null,
  ]));
}
