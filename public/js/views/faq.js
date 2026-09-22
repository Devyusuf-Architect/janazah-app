// The questions people actually ask, answered in the words they ask them in.
//
// Every answer here is checked against what the application really does
// rather than what would be reassuring to say. Where the honest answer has a
// caveat, the caveat is in the answer: a privacy page that is subtly
// optimistic is worse than one that is plain, because somebody makes a
// decision about their own location based on it.
//
// The questions are grouped, and the groups are the order somebody meets
// them: what is this, can I trust it, what about my privacy, and then the
// two things that bring people here in distress, a wrong notice and a family
// that wants one taken down.

import { el } from '../ui.js';
import { platformSettings } from '../platform-settings.js';

/**
 * Every answer is an array of nodes or strings, so an answer can carry a
 * link without the question list needing to know about markup.
 */
const GROUPS = [
  {
    heading: 'Using Ta’ziyah',
    questions: [
      {
        q: 'Do I need an account to see Janazah notices?',
        a: () => ['No. Every notice on this site can be read without signing '
          + 'in, on any device, and that is deliberate: somebody who has just '
          + 'been told about a Janazah should not have to create an account '
          + 'before they can find out when it is. An account adds a dashboard '
          + 'and keeps settings in one place, and nothing else.'],
      },
      {
        q: 'What does a notice tell me?',
        a: () => ['The Janazah date and prayer time, which masjid or location '
          + 'the prayer is at, and the burial location once it has been '
          + 'arranged, along with any instructions the masjid added. The name '
          + 'of the person who died appears only when the family has approved '
          + 'it for public sharing.'],
      },
      {
        q: 'How do I follow a masjid?',
        a: () => ['Open the masjid from ',
          el('a', { class: 'link', href: '/masjids' }, 'the masjid directory'),
          ' and follow it. Its notices then appear on your home screen. Who '
          + 'you follow is stored on your own device, not in a profile, so it '
          + 'works whether or not you have an account.'],
      },
      {
        q: 'How do Janazahs near me work?',
        a: () => ['You turn location on and choose a distance. Your browser '
          + 'compares your position against notices it has already '
          + 'downloaded and shows the ones within that distance, including '
          + 'from masjids you do not follow. The comparison happens on your '
          + 'device. See ',
          el('a', { class: 'link', href: '/near-me' }, 'Janazahs near you'),
          '.'],
      },
    ],
  },
  {
    heading: 'Trust and verification',
    questions: [
      {
        q: 'Who is allowed to publish a notice?',
        a: () => ['Only a masjid or funeral coordinator that a platform '
          + 'administrator has verified. Verification is a person confirming '
          + 'the organization is real and that whoever registered it is '
          + 'authorized to publish for it. No member of the public can post a '
          + 'notice, and nothing here is crowd-sourced.'],
      },
      {
        q: 'Does Ta’ziyah list every Janazah, or every masjid?',
        a: () => ['No. A Janazah appears here only if the masjid or '
          + 'coordinator arranging it publishes it here, and masjids are '
          + 'joining gradually. Treat this as one source among the ones you '
          + 'already use, not as a complete record. If a masjid you pray at '
          + 'is not here, ',
          el('a', { class: 'link', href: '/for-masjids' },
            'it can register'),
          '.'],
      },
      {
        q: 'Does a masjid appearing here mean it endorses Ta’ziyah?',
        a: () => ['It means that masjid registered and was verified so it '
          + 'could publish its own notices. It is not an endorsement of this '
          + 'service by that masjid, and this site does not speak for any '
          + 'masjid listed on it.'],
      },
      {
        q: 'A notice looks wrong. What do I do?',
        a: () => ['Use "Report a problem" on the notice itself. That reaches a '
          + 'platform administrator, who can correct or hide a notice '
          + 'directly. If it is urgent, contact the masjid as well: they can '
          + 'correct their own notice immediately, and everybody who was told '
          + 'the original is told about the change.'],
      },
    ],
  },
  {
    heading: 'Privacy and location',
    questions: [
      {
        q: 'Where does my location go?',
        a: () => ['Nearby matching happens in your own browser, against '
          + 'notices the page has already downloaded. Your position is not '
          + 'sent to us and not sent to any masjid, and no history of where '
          + 'you have been is kept: only your latest position, on your '
          + 'device, overwritten each time.'],
      },
      {
        q: 'Then how can notifications reach my phone when the site is closed?',
        a: () => ['This is the one part that needs a server, and it is worth '
          + 'being exact about. Your browser subscribes itself to a general '
          + 'area, usually several kilometres across, and a new notice is '
          + 'sent to everyone subscribed to the area that notice is in. The '
          + 'subscription is acted on and discarded, so there is still no way '
          + 'to ask where you are or which devices are near a given place. '
          + 'An area several kilometres wide is coarser than the matching '
          + 'done on your device, and that is the price of reaching a locked '
          + 'phone at all. Full detail on ',
          el('a', { class: 'link', href: '/privacy' },
            'how your information is handled'),
          '.'],
      },
      {
        q: 'Can a masjid see who is following it or who read a notice?',
        a: () => ['No. Follows live on your device rather than in a list a '
          + 'masjid can read, and which notices you looked at is not recorded '
          + 'anywhere.'],
      },
      {
        q: 'What am I notified about?',
        a: () => ['A new Janazah near you or from a masjid you follow, and '
          + 'then any correction or cancellation to a notice you were already '
          + 'told about. Being told a Janazah is at four and never told it '
          + 'moved to two would be worse than not being told at all, so '
          + 'updates follow the original.'],
      },
    ],
  },
  {
    heading: 'For masjids and families',
    questions: [
      {
        q: 'How does a masjid start publishing?',
        a: () => ['It registers, a platform administrator verifies it, and it '
          + 'can publish. It is free. See ',
          el('a', { class: 'link', href: '/for-masjids' },
            'the page for masjids and funeral coordinators'),
          '.'],
      },
      {
        q: 'The family wants a notice taken down. How?',
        a: () => ['A family can request a takedown, and it goes to a platform '
          + 'administrator rather than through the masjid, so nobody has to '
          + 'negotiate with the organization that published it. Use "Report a '
          + 'problem" on the notice and say that you are the family, or '
          + 'contact us directly.'],
      },
      {
        q: 'Can I delete my account?',
        a: () => ['Yes, from Account and settings, and there is a page '
          + 'explaining what happens to anything connected to it: ',
          el('a', { class: 'link', href: '/delete-account' },
            'deleting your account'),
          '.'],
      },
    ],
  },
];

export function renderFaq(mount) {
  const settings = platformSettings();

  mount.replaceChildren(el('article', { class: 'policy' }, [
    el('h1', { text: 'Questions about Ta’ziyah' }),
    el('p', { class: 'lede' },
      'If something here does not answer your question, ask us directly. A '
      + 'question about a specific Janazah is almost always better asked of '
      + 'the masjid holding it.'),

    ...GROUPS.map((group) => el('section', {}, [
      el('h2', { text: group.heading }),
      el('div', { class: 'faq' }, group.questions.map((item) => el('details', {
        class: 'faq__item',
      }, [
        el('summary', { class: 'faq__q' }, [
          el('h3', { class: 'faq__q-text', text: item.q }),
        ]),
        el('div', { class: 'faq__a' }, [el('p', {}, item.a())]),
      ]))),
    ])),

    el('section', {}, [
      el('h2', { text: 'Still stuck' }),
      el('p', {}, [
        settings.supportEmail
          ? el('a', { class: 'link', href: `mailto:${settings.supportEmail}` },
            settings.supportEmail)
          : el('a', { class: 'link', href: '/contact' }, 'Contact us'),
        ' and somebody will read it. For anything about a Janazah happening '
        + 'today, contact the masjid directly: they will always know more '
        + 'than we do.',
      ]),
    ]),
  ]));
}
