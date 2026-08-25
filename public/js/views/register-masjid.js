// The public entry point for a masjid or funeral coordinator.
//
// The registration form itself lives in the console (views/org.js), because
// registering requires an account and the console already owns the
// signed-in surface. This page's job is to set expectations before anyone
// starts: that registering does not grant publishing, and that a platform
// administrator reviews every application first.

import { el, icon } from '../ui.js';

const STEPS = [
  ['Create an account', 'With Google or an email address and password. One account, whichever way you sign in.'],
  ['Enter your organization details', 'Name, type, address and the coordinates of the prayer location, plus a contact address a platform administrator can reach you at.'],
  ['Submit for verification', 'Your organization is saved with a status of pending. Nothing is published, and nobody outside the platform administrators can see it yet.'],
  ['A platform administrator reviews it', 'They check that the organization is real and that whoever registered it is entitled to speak for it.'],
  ['Approved, and you can publish', 'Your organization becomes verified, the coordinator dashboard unlocks, and your notices reach the community feed and nearby alerts.'],
];

export function renderRegisterMasjid(mount) {
  mount.replaceChildren(
    el('section', { class: 'hero hero--compact' }, [
      el('p', { class: 'hero__eyebrow', text: 'Masjid / Coordinator' }),
      el('h1', { text: 'Register your masjid or funeral home' }),
      el('p', { class: 'hero__lede' },
        'Publishing a Janazah notice on Ta’ziyah is limited to organizations a ' +
        'platform administrator has verified. That is the whole basis of the ' +
        'community trusting what it reads here, so there is no way to skip it ' +
        'and no way to approve yourself.'),
      el('div', { class: 'hero__actions' }, [
        // ?start= carries the choice through sign-in, so the form opens
        // directly instead of dropping someone on a list of nothing and
        // asking them to say again what they just said.
        el('a', {
          class: 'btn btn--primary btn--lg', href: '/console?start=register',
          text: 'Register a new masjid',
        }),
        el('a', {
          class: 'btn btn--lg', href: '/console?start=join',
          text: 'Join an existing masjid',
        }),
      ]),
      el('p', { class: 'hero__note' },
        'Register if your masjid is not on Ta’ziyah yet. Join if it already ' +
        'is and you need access to publish for it. Already registered? Sign ' +
        'in at the same place to check your verification status.'),
    ]),

    el('section', { class: 'steps' }, [
      el('h2', { text: 'What happens, in order' }),
      el('ol', { class: 'steps__list' }, STEPS.map(([title, body], i) =>
        el('li', { class: 'steps__item reveal' }, [
          el('span', { class: 'steps__num', 'aria-hidden': 'true', text: String(i + 1) }),
          el('div', {}, [
            el('h3', { text: title }),
            el('p', { class: 'muted', text: body }),
          ]),
        ]))),
    ]),

    el('section', { class: 'cta-row' }, [
      el('div', { class: 'cta-card' }, [
        el('div', { class: 'promise-card__mark' }, [icon('shield', { size: 22 })]),
        el('h2', { text: 'While you are pending' }),
        el('p', { class: 'muted' },
          'You can sign in and see your application’s status at any time. You ' +
          'cannot publish, and no draft of yours is visible to the community. ' +
          'If an application is declined, the reason the administrator gave is ' +
          'shown to you.'),
      ]),
      el('div', { class: 'cta-card' }, [
        el('div', { class: 'promise-card__mark' }, [icon('users', { size: 22 })]),
        el('h2', { text: 'Adding colleagues' }),
        el('p', { class: 'muted' },
          'Several people can be authorized to publish for one organization. ' +
          'Whoever registers it owns it and approves the others, so a masjid ' +
          'never needs a shared login.'),
      ]),
    ]),

    el('p', { class: 'muted' }, [
      'See ',
      el('a', { class: 'link', href: '/terms', text: 'terms of service' }),
      ' for what publishing commits you to, and ',
      el('a', { class: 'link', href: '/about', text: 'About' }),
      ' for what Ta’ziyah is and is not.',
    ]),
  );
}
