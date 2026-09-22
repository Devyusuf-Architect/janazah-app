// The page for the other side of this service: a masjid or funeral
// coordinator deciding whether to publish here.
//
// Written for somebody who already has a way of announcing a Janazah, and is
// being asked to add another. So it answers the questions in the order that
// person asks them: what does it cost, what do I have to do, who is allowed
// to publish in my masjid's name, and what happens when a time changes at
// nine in the evening.
//
// Deliberately not a sales page. The people reading it arrange funerals, and
// a page about reach and engagement would read as somebody trying to sell
// them software during the hardest week of a family's life.

import { el, icon } from '../ui.js';
import { platformSettings } from '../platform-settings.js';

const STEPS = [
  {
    title: 'Register the organization',
    body: 'One form: the masjid’s name, where it is, and how a platform '
      + 'administrator can confirm you are connected to it. It takes a few '
      + 'minutes and costs nothing.',
  },
  {
    title: 'A platform administrator checks it',
    body: 'Verification is a person reading the registration and confirming '
      + 'the masjid is real and that you are authorized to publish for it. '
      + 'Nothing can be published until that is done.',
  },
  {
    title: 'Publish a notice',
    body: 'Janazah date and prayer time, where the prayer is, where the '
      + 'burial is when it has been arranged, and any instructions for the '
      + 'family. You see exactly what it will look like before it goes out.',
  },
  {
    title: 'Correct or cancel it in one place',
    body: 'A time changes and everybody who was told the old one is told the '
      + 'new one. The notice itself is marked as corrected or cancelled, so '
      + 'somebody arriving at it later is not reading a time that no longer '
      + 'holds.',
  },
];

const FACTS = [
  ['Free', 'There is no charge to register, to be verified, or to publish.'],
  ['Several staff, one masjid',
    'More than one person can be authorized to publish for the same '
    + 'organization, so a Janazah does not wait on one phone being answered.'],
  ['Your notice, your words',
    'Nothing is rewritten or summarised. The deceased’s name appears '
    + 'only if the family has approved it for public sharing.'],
  ['Nothing is crowd-sourced',
    'No member of the public can publish a notice, edit yours, or post in '
    + 'your masjid’s name.'],
];

export function renderForMasjids(mount) {
  const settings = platformSettings();

  mount.replaceChildren(el('article', { class: 'policy' }, [
    el('h1', { text: 'For masjids and funeral coordinators' }),

    el('p', { class: 'lede' },
      'Ta’ziyah is a place to publish a Janazah notice once and have it '
      + 'reach the people who would have come: those who follow your masjid, '
      + 'and those close enough to attend. It does not replace how you '
      + 'announce a Janazah today. It is one more way for the people who '
      + 'would otherwise hear too late.'),

    el('section', {}, [
      el('h2', { text: 'What it costs' }),
      el('p', {},
        'Nothing. Registration, verification and publishing are free, and '
        + 'there is no paid tier holding anything back. If that ever changes '
        + 'it will change for new notices and not by quietly switching off '
        + 'something a masjid already relies on.'),
    ]),

    el('section', {}, [
      el('h2', { text: 'Getting started' }),
      el('ol', { class: 'steps-list' }, STEPS.map((step) => el('li', {
        class: 'steps-list__item',
      }, [
        el('h3', { class: 'steps-list__title', text: step.title }),
        el('p', { class: 'steps-list__body', text: step.body }),
      ]))),
    ]),

    el('section', {}, [
      el('h2', { text: 'What you should know before registering' }),
      el('ul', { class: 'fact-list' }, FACTS.map(([title, body]) => el('li', {
        class: 'fact-list__item',
      }, [
        icon('check', { size: 15 }),
        el('div', {}, [
          el('strong', { text: title }),
          el('span', { text: body }),
        ]),
      ]))),
    ]),

    el('section', {}, [
      el('h2', { text: 'When a family asks for a notice to be removed' }),
      el('p', {},
        'A family can ask for a notice to be taken down, and that request '
        + 'reaches a platform administrator directly rather than going '
        + 'through the masjid that published it. You are told when it '
        + 'happens. Nobody has to argue with a grieving family about a '
        + 'notice on a website.'),
      el('p', {}, [
        'The same route handles a notice that is wrong: anybody reading one '
        + 'can report it. See ',
        el('a', { class: 'link', href: '/faq' }, 'the questions page'),
        ' for how a report is handled.',
      ]),
    ]),

    el('section', { class: 'cta-band' }, [
      el('h2', { text: 'Register your masjid' }),
      el('p', {},
        'Registration takes a few minutes. You can look at everything before '
        + 'anything is published.'),
      el('div', { class: 'cta-band__actions' }, [
        el('a', { class: 'btn btn--primary', href: '/register-masjid' },
          'Register a masjid'),
        el('a', { class: 'btn', href: '/how-it-works' },
          "How Ta'ziyah works"),
      ]),
    ]),

    el('p', { class: 'muted' }, [
      'Questions before you register? ',
      settings.supportEmail
        ? el('a', { class: 'link', href: `mailto:${settings.supportEmail}` },
          settings.supportEmail)
        : el('a', { class: 'link', href: '/contact' }, 'Get in touch'),
      '.',
    ]),
  ]));
}
