// The public landing page.
//
// A new visitor's first stop, distinct from the feed at /janazahs. Its job is
// to explain what this is and get someone to the right next place — never to
// hold anyone up: every real action here reuses an existing page, nothing is
// re-implemented for the sake of the landing page.

import { el, icon } from '../ui.js';

export function renderHome(mount) {
  mount.replaceChildren(
    el('section', { class: 'hero' }, [
      el('p', { class: 'hero__eyebrow', text: 'Janazah notices you can trust' }),
      el('h1', { text: 'Reliable Janazah information, from masajid you can verify, to people close enough to attend.' }),
      el('p', { class: 'hero__lede' },
        'Janazah information is scattered across group chats, word of mouth and ' +
        'masjid announcements. Ta’ziyah is one place where verified masajid and ' +
        'funeral coordinators publish it directly, so nobody misses a funeral ' +
        'they would have attended.'),
      el('div', { class: 'hero__actions' }, [
        el('a', { class: 'btn btn--primary btn--lg', href: '/janazahs', text: 'View Janazahs' }),
        el('a', { class: 'btn btn--lg', href: '/near-me', text: 'Find Janazahs Near Me' }),
      ]),
      el('p', { class: 'hero__note' },
        'No account is needed to read notices. Location-based alerts are ' +
        'entirely optional, and off unless you turn them on.'),
    ]),

    el('section', { class: 'promise' }, [
      promiseCard('shield', 'Verified sources only',
        'Only masajid and funeral coordinators checked by a platform ' +
        'administrator can publish an official notice. Nothing here is ' +
        'user-submitted or crowd-sourced.'),
      promiseCard('pin', 'Nearby, if you want it',
        'Turn on location and hear about a Janazah close to where you are ' +
        'right now, not just your home address. Your position is used in ' +
        'your browser only and is never sent to us or to any masjid.'),
      promiseCard('bell', 'As much or as little as you choose',
        'Follow specific masajid, set an alert radius, or just check the feed ' +
        'when you want to. Notification volume is yours to control.'),
    ]),

    el('section', { class: 'cta-row' }, [
      el('div', { class: 'cta-card' }, [
        el('h2', { text: 'Community members' }),
        el('p', { class: 'muted' },
          'Browse notices with no account, or sign in for a personal dashboard ' +
          'with your followed masajid and alert settings in one place.'),
        el('div', { class: 'cta-card__actions' }, [
          el('a', { class: 'btn btn--primary', href: '/signin', text: 'Sign in' }),
          el('a', { class: 'btn', href: '/signin?mode=signup', text: 'Create account' }),
        ]),
      ]),
      el('div', { class: 'cta-card' }, [
        el('h2', { text: 'Masjid or funeral coordinator' }),
        el('p', { class: 'muted' },
          'Register your organization and publish once a platform ' +
          'administrator has verified it.'),
        el('div', { class: 'cta-card__actions' }, [
          el('a', { class: 'btn btn--primary', href: '/console', text: 'Masjid / Coordinator access' }),
        ]),
      ]),
    ]),

    el('section', { class: 'home-footnote' }, [
      el('p', { class: 'muted' }, [
        'Curious how this works, or what happens with your information? See ',
        el('a', { class: 'link', href: '/about', text: 'About' }),
        ' and ',
        el('a', { class: 'link', href: '/privacy', text: 'how your information is handled' }),
        '.',
      ]),
    ]),
  );
}

function promiseCard(iconName, title, body) {
  return el('div', { class: 'promise-card' }, [
    el('div', { class: 'promise-card__mark' }, [icon(iconName, { size: 22 })]),
    el('h3', { text: title }),
    el('p', { class: 'muted', text: body }),
  ]);
}
