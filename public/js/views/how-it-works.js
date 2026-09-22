// The full account of how a Janazah notice gets from a masjid to somebody's
// phone, for a reader who wants more than the introduction gives them.
//
// This is the same subject as the first-run introduction (views/welcome.js),
// and the two must not become the same page written twice. The split:
//
//   the introduction   four points and a closing, read in under a minute by
//                      somebody who has just arrived and has not decided
//                      whether to trust this yet.
//   this page          the mechanism, in order, including the parts an
//                      introduction has no room for: what verification
//                      actually checks, what a correction does to a notice
//                      somebody already saw, and where the privacy promise
//                      has an edge.
//
// It lives at /how-it-works, which is the address for this subject. The
// introduction's own /welcome redirects here (feed.js) so there is one page
// and one URL rather than two competing for the same search result.

import { el, icon } from '../ui.js';

const STAGES = [
  {
    icon: 'building',
    title: 'A masjid registers, and a person checks it',
    body: [
      'A masjid or funeral coordinator registers an organization, and a '
      + 'platform administrator reviews it before it can publish anything. '
      + 'The review confirms that the organization is real and that whoever '
      + 'registered it is authorized to publish in its name.',
      'This is the whole basis of the site: nothing here is user-submitted, '
      + 'and every notice traces back to an organization somebody checked. '
      + 'An unverified organization can sign in and prepare, and it cannot '
      + 'publish.',
    ],
  },
  {
    icon: 'clock',
    title: 'The masjid publishes the notice',
    body: [
      'A notice carries the Janazah date and prayer time, where the prayer '
      + 'is, the burial location once it has been arranged, and any '
      + 'instructions for those attending. The masjid sees exactly what the '
      + 'notice will look like before publishing it.',
      'The name of the person who died is included only when the family has '
      + 'approved it for public sharing. A notice without a name is still a '
      + 'complete notice: the time and the place are what somebody needs to '
      + 'be there.',
    ],
  },
  {
    icon: 'bookmark',
    title: 'You follow the masjids you pray at',
    body: [
      'Following a masjid puts its notices on your home screen. Your follow '
      + 'list is kept on your own device rather than in a profile, so it '
      + 'needs no account and no masjid can read who follows it.',
    ],
  },
  {
    icon: 'pin',
    title: 'Or you see what is near you',
    body: [
      'Turn location on, choose a distance, and the page shows Janazahs '
      + 'within it, including from masjids you do not follow. This is the '
      + 'case the site exists for: somebody a few streets away who would '
      + 'have come and never heard.',
      'The comparison is done by your own browser against notices it has '
      + 'already downloaded. Your position is not sent to us and not sent to '
      + 'any masjid.',
    ],
  },
  {
    icon: 'bell',
    title: 'And you are told when something changes',
    body: [
      'Notifications can tell you about a new Janazah near you or from a '
      + 'masjid you follow. They also follow up: if the masjid corrects the '
      + 'time or cancels, everybody who was told the original is told about '
      + 'the change, and the notice itself is marked so that somebody '
      + 'opening it later is not reading a time that no longer holds.',
    ],
  },
];

export function renderHowItWorks(mount) {
  mount.replaceChildren(el('article', { class: 'policy' }, [
    el('h1', { text: "How Ta’ziyah works" }),
    el('p', { class: 'lede' },
      'Janazah information moves through group chats, announcements after '
      + 'prayer, and phone calls, and people miss funerals they would have '
      + 'attended because it reached them too late or not at all. Ta’ziyah '
      + 'is one place where the masjid publishes the notice itself and the '
      + 'people who would have come can find it.'),

    ...STAGES.map((stage) => el('section', { class: 'stage' }, [
      el('h2', { class: 'stage__title' }, [
        el('span', { class: 'stage__mark' }, [icon(stage.icon, { size: 17 })]),
        el('span', { text: stage.title }),
      ]),
      ...stage.body.map((paragraph) => el('p', { text: paragraph })),
    ])),

    el('section', {}, [
      el('h2', { text: 'Where the privacy promise has an edge' }),
      el('p', {},
        'Everything above happens on your device, with one exception worth '
        + 'stating plainly rather than leaving in a policy page. To reach a '
        + 'phone that is locked and not on this site, something has to leave '
        + 'it: your browser subscribes itself to a general area, usually '
        + 'several kilometres across, and new notices are sent to everyone '
        + 'subscribed to the area the notice is in.'),
      el('p', {}, [
        'That subscription is acted on and discarded. There is no record of '
        + 'where you are and no way to ask which devices are near a place. An '
        + 'area several kilometres wide is coarser than the matching your own '
        + 'browser does, and that is the cost of a notification arriving at '
        + 'all. The full account is in ',
        el('a', { class: 'link', href: '/privacy' },
          'how your information is handled'),
        '.',
      ]),
    ]),

    el('section', {}, [
      el('h2', { text: 'What Ta’ziyah does not claim' }),
      el('p', {},
        'It does not list every Janazah, and it does not list every masjid. A '
        + 'Janazah is here only if the masjid or coordinator arranging it '
        + 'publishes it here, and masjids are joining gradually. Keep using '
        + 'the ways you already hear; this is one more, aimed at the people '
        + 'those ways miss.'),
    ]),

    el('section', { class: 'cta-band' }, [
      el('h2', { text: 'Where to go next' }),
      el('div', { class: 'cta-band__actions' }, [
        el('a', { class: 'btn btn--primary', href: '/janazahs' },
          'View current Janazahs'),
        el('a', { class: 'btn', href: '/masjids' }, 'Find a masjid to follow'),
      ]),
      el('p', { class: 'muted' }, [
        'Attending a Janazah for the first time? Read ',
        el('a', { class: 'link', href: '/janazah-guide' },
          'how to pray Salat al-Janazah'),
        '. Arranging one? See ',
        el('a', { class: 'link', href: '/for-masjids' },
          'the page for masjids and funeral coordinators'),
        '. Other questions are on ',
        el('a', { class: 'link', href: '/faq' }, 'the questions page'),
        '.',
      ]),
    ]),
  ]));
}
