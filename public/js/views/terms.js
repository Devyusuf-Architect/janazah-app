// Terms of service.
//
// Like privacy.js, this is written to match what the code actually does and
// what the platform actually is, not aspirational copy. Three things it has
// to say plainly, because they are the questions a masjid board or a family
// will actually ask: who is allowed to publish, what happens when a notice is
// wrong, and what this platform is not.

import { el } from '../ui.js';

const LAST_UPDATED = '25 August 2026';

export function renderTerms(mount) {
  mount.replaceChildren();

  const section = (heading, children) =>
    el('section', {}, [el('h2', { text: heading }), ...children]);

  const list = (items) => el('ul', {}, items.map((t) => el('li', { text: t })));

  mount.append(el('article', { class: 'policy' }, [
    el('a', { class: 'btn btn--link', href: '/janazahs' }, '← Back to notices'),
    el('h1', { text: 'Terms of service' }),
    el('p', { class: 'policy__updated', text: `Last updated ${LAST_UPDATED}` }),

    el('p', {
      text: 'This service exists to get reliable Janazah information from ' +
            'trusted sources to people close enough to attend, in time. ' +
            'These terms explain what that trust rests on.',
    }),

    section('What this platform is, and is not', [
      el('p', {
        text: 'This platform is a notification layer. It confirms that an ' +
              'organization registering to publish is a real masjid, funeral ' +
              'home, or Muslim organization, and that the people publishing ' +
              'under its name are authorized by it to do so.',
      }),
      el('p', {
        text: 'It is not a religious authority, and it does not verify the ' +
              'accuracy of any individual notice: the date, the time, the ' +
              'deceased’s identity, or any other detail. That ' +
              'responsibility belongs to the organization publishing it, the ' +
              'same as an announcement made from a minbar or posted on a ' +
              'masjid’s own noticeboard. Verifying an organization is not ' +
              'the same as verifying a fact.',
      }),
    ]),

    section('Who may register and publish', [
      el('p', {
        text: 'A masjid, funeral home, or Muslim organization may register. ' +
              'Registration is reviewed by a platform administrator before ' +
              'the organization can publish anything, and an organization can ' +
              'be suspended if it publishes fraudulent or repeatedly ' +
              'incorrect notices.',
      }),
      el('p', {
        text: 'Only individually authorized staff may publish or change a ' +
              'notice on an organization’s behalf, never a shared login. ' +
              'An organization’s owner controls who is authorized, and ' +
              'every publish, correction and cancellation is recorded against ' +
              'the individual who made it.',
      }),
    ]),

    section('If a notice is wrong or fraudulent', [
      el('p', {
        text: 'Anyone can report a notice directly from it, without an ' +
              'account. A platform administrator reviews every report and can ' +
              'correct, cancel, or take down a notice. A family member asking ' +
              'for a notice about their own relative to come down has a ' +
              'faster path than a general report: see “Asking for a ' +
              'notice to come down” on the privacy page.',
      }),
      el('p', {
        text: 'A notice that is later found to be false or fraudulent is ' +
              'taken down, the organization that published it is reviewed, ' +
              'and repeated or deliberate misuse can end an organization’s ' +
              'ability to publish. None of this substitutes for exercising ' +
              'ordinary judgment about a notice: this platform reduces how ' +
              'information about a Janazah is scattered and delayed, it does ' +
              'not certify that any given notice is accurate.',
      }),
    ]),

    section('Community members', [
      list([
        'Reading notices, following an organization, and opting into nearby ' +
          'alerts need no account.',
        'Location, where you choose to share it, is used on your device and ' +
          'is never sent to this platform or to any organization. See the ' +
          'privacy page for exactly how.',
        'Reporting a notice uses an anonymous session so a report can be ' +
          'acted on and so the report system cannot be flooded, without ' +
          'collecting who you are.',
      ]),
    ]),

    section('Changes', [
      el('p', {
        text: 'These terms may change as the service does. Material changes ' +
              'will be reflected here with an updated date above.',
      }),
    ]),

    el('p', { class: 'hint hint--boxed' },
      'Questions about these terms, or about a specific notice, go through ' +
      '“Report a problem” on the notice, or the takedown request ' +
      'described on the privacy page. A direct contact address will be added ' +
      'here once one is confirmed.'),
  ]));
}
