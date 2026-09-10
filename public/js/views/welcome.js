// The first thing a new visitor sees.
//
// Deliberately not the home page. Home is an index — search, upcoming
// Janazahs, near you — and that is the right screen for somebody who already
// knows what this is. Somebody arriving for the first time has been sent a
// link and does not yet know whether to trust it, so this page answers three
// questions in order: what is this, who publishes it, and what happens to my
// information. Then it gets out of the way.
//
// Shown once. After the first visit, "/" is the index and this lives behind a
// link, because a welcome screen between somebody and a funeral notice on
// their second visit is an obstacle, not a welcome.
//
// The proof section shows real notices rather than a mock-up of one. A
// screenshot of an invented Janazah on a page about real funerals would be the
// wrong thing to put in front of somebody who has just been bereaved.

import { el, icon } from '../ui.js';
import { janazahRow } from './home.js';
import * as store from '../store.js';
import { ISTIRJA } from '../janazah-guide-content.js';

let unwatch = null;

export function teardownWelcome() {
  if (unwatch) unwatch();
  unwatch = null;
}

// Four points, not a feature list. Each one is a thing somebody can do or
// rely on, in the order the questions get asked: who is telling me this, how
// do I hear about the masjids I pray at, how do I hear about the ones I do
// not, and what happens when a time changes. Short enough that the whole of
// it fits on one screen of a phone below the opening.
const POINTS = [
  {
    icon: 'check',
    title: 'Verified masjids publish it',
    body: 'A masjid or funeral coordinator is checked by a platform '
        + 'administrator before it can publish anything. Nothing here is '
        + 'user-submitted.',
  },
  {
    icon: 'bookmark',
    title: 'Follow the masjids you pray at',
    body: 'Their Janazah notices are waiting for you when you open the page. '
        + 'Who you follow stays on your device.',
  },
  {
    icon: 'pin',
    title: 'Find a Janazah near you',
    body: 'See which Janazahs are close enough to reach, at whatever distance '
        + 'you choose, even from masjids you do not follow.',
  },
  {
    icon: 'bell',
    title: 'Hear when something changes',
    body: 'Notifications can tell you about a new Janazah, and tell you again '
        + 'if the time is corrected or the Janazah is cancelled.',
  },
];

export function renderWelcome(mount) {
  teardownWelcome();

  const proof = el('div', { class: 'wel-proof__list' }, [
    el('p', { class: 'muted', text: 'Loading current notices…' }),
  ]);

  mount.replaceChildren(
    el('div', { class: 'welcome' }, [
      // A scroll-linked rule across the top. Pure CSS where the browser
      // supports scroll-driven animation, and simply absent where it does not.
      el('div', { class: 'wel-progress', 'aria-hidden': 'true' }),

      el('header', { class: 'wel-hero' }, [
        el('p', { class: 'wel-hero__eyebrow', text: 'Ta’ziyah' }),
        el('h1', { class: 'wel-hero__title' }, [
          el('span', { class: 'wel-hero__line', text: 'Nobody should miss a' }),
          el('span', { class: 'wel-hero__line', text: 'Janazah they would' }),
          el('span', { class: 'wel-hero__line', text: 'have attended.' }),
        ]),
        el('p', { class: 'wel-hero__lede' },
          'Janazah notices published directly by verified masjids, to people '
          + 'close enough to be there.'),
        el('div', { class: 'wel-hero__actions' }, [
          el('a', { class: 'btn btn--primary', href: '/janazahs' }, 'View Janazahs'),
          el('a', { class: 'btn', href: '#how' }, 'How it works'),
        ]),
        el('p', { class: 'wel-hero__note', text: 'No account needed to read notices.' }),
        el('a', { class: 'wel-scroll', href: '#how', 'aria-label': 'Read on' }, [
          el('span', { class: 'wel-scroll__line', 'aria-hidden': 'true' }),
        ]),
      ]),

      el('section', { class: 'wel-proof reveal' }, [
        el('h2', { class: 'wel-eyebrow', text: 'Published right now' }),
        proof,
      ]),

      el('section', { class: 'wel-how', id: 'how' }, [
        el('h2', { class: 'wel-section__title reveal', text: 'How it works' }),
        el('ul', { class: 'wel-points' }, POINTS.map((point) => el('li', {
          class: 'wel-point reveal',
        }, [
          el('span', { class: 'wel-point__mark' }, [icon(point.icon, { size: 17 })]),
          el('div', { class: 'wel-point__text' }, [
            el('h3', { class: 'wel-point__title', text: point.title }),
            el('p', { class: 'wel-point__body', text: point.body }),
          ]),
        ]))),
      ]),

      // The genuine difference between this and a group chat, so it gets its
      // own moment rather than a bullet among five.
      el('section', { class: 'wel-privacy reveal' }, [
        el('h2', { class: 'wel-section__title', text: 'Your location never leaves your phone' }),
        el('p', { class: 'wel-privacy__body' },
          'Nearby alerts are worked out in your own browser, against notices '
          + 'this page has already downloaded. Your position is never sent to '
          + 'us, never sent to a masjid, and no history of where you have been '
          + 'is kept: only your latest position, on your device, overwritten '
          + 'each time.'),
        // Named rather than glossed over. Reaching a phone that is locked and
        // not on this page means something has to leave it, and a privacy
        // claim with a quiet exception behind it is worth less than an
        // honest one. The full account is on /privacy, linked below.
        el('p', { class: 'wel-privacy__body' },
          'Notifications are the one part that needs a server. Your browser '
          + 'subscribes itself to a general area, usually several kilometres '
          + 'across, and notices are sent to everyone subscribed to that '
          + 'area. It is acted on and discarded, so there is still no way to '
          + 'ask where you are.'),
        el('ul', { class: 'wel-facts' }, [
          ['No account needed', 'Read every notice, follow masjids, use nearby alerts.'],
          ['Nothing about you is stored', 'Follows and settings live on your device, not in a profile.'],
          ['Nobody can see what you read', 'Which Janazahs you looked at is not recorded anywhere.'],
        ].map(([title, body]) => el('li', { class: 'wel-fact' }, [
          icon('check', { size: 15 }),
          el('div', {}, [
            el('strong', { text: title }),
            el('span', { text: body }),
          ]),
        ]))),
        el('a', { class: 'link', href: '/privacy' }, 'How your information is handled'),
      ]),

      el('section', { class: 'wel-org reveal' }, [
        el('div', {}, [
          el('h2', { class: 'wel-section__title', text: 'Do you run a masjid?' }),
          el('p', { class: 'wel-org__body' },
            'Register it, and once a platform administrator has verified it '
            + 'you can publish a Janazah notice in minutes. Families following '
            + 'you hear immediately.'),
        ]),
        el('a', { class: 'btn', href: '/register-masjid' }, 'Register a masjid'),
      ]),

      // The Arabic comes from janazah-guide-content.js, which is where every
      // piece of religious text in this application lives so that one file is
      // the whole of what an imam has to review.
      el('section', { class: 'wel-end reveal' }, [
        el('h2', {
          class: 'wel-end__title', lang: 'ar', dir: 'rtl', text: ISTIRJA.arabic,
        }),
        el('p', { class: 'wel-end__translit', text: ISTIRJA.transliteration }),
        el('p', { class: 'wel-end__meaning', text: ISTIRJA.english }),
        el('p', { class: 'wel-end__source', text: ISTIRJA.source }),
        el('div', { class: 'wel-end__actions' }, [
          el('a', { class: 'btn btn--primary', href: '/janazahs' }, 'View Janazahs'),
          el('a', { class: 'btn', href: '/janazah-guide' }, 'How to pray Janazah'),
        ]),
        el('p', { class: 'wel-end__note' }, [
          'Signing in adds a dashboard and keeps your settings in one place. ',
          el('a', { class: 'link', href: '/signin' }, 'Sign in'),
          ' or ',
          el('a', { class: 'link', href: '/signin?mode=signup' }, 'create an account'),
          '.',
        ]),
      ]),
    ]),
  );

  // Real notices, live. If the read fails, the section says nothing rather
  // than showing an error to somebody who has been here for four seconds.
  unwatch = store.watchPublicNotices((notices) => {
    const visible = notices.filter((n) => n.status !== 'cancelled').slice(0, 2);
    proof.replaceChildren();
    if (!visible.length) {
      proof.append(el('p', { class: 'muted' },
        'No Janazah notices are current at the moment. This page fills as '
        + 'verified masjids publish.'));
      return;
    }
    proof.append(el('ul', { class: 'jlist' }, visible.map((n) => janazahRow(n))));
    proof.append(el('a', { class: 'home-more', href: '/janazahs' }, 'See all notices'));
  });
}
