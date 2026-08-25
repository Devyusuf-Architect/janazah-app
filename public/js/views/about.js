// The About page: what this is, in plain terms, for someone who has never
// seen it before and wants the short version before they trust it.

import { el } from '../ui.js';

export function renderAbout(mount) {
  const section = (heading, children) =>
    el('section', {}, [el('h2', { text: heading }), ...children]);

  mount.replaceChildren(el('article', { class: 'policy' }, [
    el('a', { class: 'btn btn--link', href: '/' }, '← Home'),
    el('h1', { text: 'About Ta’ziyah' }),

    el('p',
      { text: 'Janazah (Islamic funeral) information is scattered across ' +
              'group chats, masjid announcements and word of mouth. People ' +
              'miss funerals they would have attended, sometimes while ' +
              'standing a few streets away, because they never heard in ' +
              'time. Ta’ziyah is one place where verified masjids and ' +
              'funeral coordinators publish Janazah notices directly, and ' +
              'community members find out in time to attend.' }),

    section('How verification works', [
      el('p', { text: 'A masjid or funeral coordinator registers an ' +
                      'organization and submits it for review. A platform ' +
                      'administrator checks it before it can publish ' +
                      'anything. Nothing on this site is user-submitted or ' +
                      'crowd-sourced; every official notice traces back to ' +
                      'a checked organization.' }),
    ]),

    section('What Ta’ziyah is not', [
      el('p', { text: 'This is a notification layer, not a religious ' +
                      'authority. It does not verify the accuracy of a ' +
                      'notice’s contents beyond confirming who published ' +
                      'it. If something looks wrong, "Report a problem" on ' +
                      'the notice reaches a platform administrator, and a ' +
                      'family can ask for a notice to come down faster ' +
                      'than the standard retention period.' }),
    ]),

    section('Nearby alerts are optional', [
      el('p', { text: 'You can read every notice with no account and no ' +
                      'location. If you choose to turn location on, it is ' +
                      'used in your browser only, to measure distance to ' +
                      'notices already shown to you. It is never sent to ' +
                      'us or to any masjid, and you can turn it off at any ' +
                      'time.' }),
    ]),

    el('p', { class: 'muted' }, [
      'More detail: ',
      el('a', { class: 'link', href: '/privacy', text: 'how your information is handled' }),
      ' and ',
      el('a', { class: 'link', href: '/terms', text: 'terms of service' }),
      '.',
    ]),
  ]));
}
