// The privacy page.
//
// Written from what the code actually does, not from a template. Every claim
// here corresponds to something enforced in firestore.rules, in
// public/js/location.js, or in functions/lib/retention.js. If one of those
// changes, this page is wrong and has to change with it.

import { el } from '../ui.js';
import { RETENTION_DAYS } from '../retention-policy.js';
import { FAMILY_TAKEDOWN_TARGET } from '../takedown-policy.js';

const LAST_UPDATED = '25 August 2026';

export function renderPrivacy(mount) {
  mount.replaceChildren();

  const section = (heading, children) =>
    el('section', {}, [el('h2', { text: heading }), ...children]);

  const list = (items) => el('ul', {}, items.map((t) => el('li', { text: t })));

  mount.append(el('article', { class: 'policy' }, [
    el('a', { class: 'btn btn--link', href: '/' }, '← Back to notices'),
    el('h1', { text: 'Privacy' }),
    el('p', { class: 'muted' }, [
      el('a', { class: 'link', href: '/terms' }, 'Terms of service'),
      el('span', { text: ' covers who may publish and what happens when a notice is wrong.' }),
    ]),
    el('p', { class: 'policy__updated', text: `Last updated ${LAST_UPDATED}` }),

    el('p',
      { text: 'This service publishes Janazah notices from verified masajid ' +
              'and funeral coordinators. It is built to collect as little as ' +
              'possible, because it handles funeral information and, if you ' +
              'choose, your location.' }),

    section('Reading notices', [
      el('p', { text: 'You do not need an account to read notices, follow a ' +
                      'masjid, or open directions. No sign-up, no email, no name.' }),
      el('p', { text: 'The masajid you follow are stored in your own browser ' +
                      'on this device. They are never sent to us or to the ' +
                      'masajid, so nobody can see whose notices you watch.' }),
    ]),

    section('Your location', [
      el('p', { text: 'Location is off unless you turn it on, and you can turn ' +
                      'it off at any time.' }),
      list([
        'It is used inside your browser, to measure how far away a notice is.',
        'It is not sent to us, to any masjid, or to anyone else.',
        'Only your most recent position is kept, on this device, and each new ' +
          'reading replaces the last. No record of where you have been is created.',
        'Turning location off erases the stored position immediately.',
        'Nobody can see which Janazahs you looked at or attended.',
      ]),
      el('h3', { text: 'If you turn on alerts' }),
      el('p', { text: 'To reach your device when this page is closed, your ' +
                      'browser subscribes to notifications for a general area, ' +
                      'usually several kilometres across. Notices are then sent ' +
                      'to everyone subscribed to the area the notice is in. Your ' +
                      'position is still never sent, and there is no way for us ' +
                      'to ask which devices are in a given area.' }),
      el('p', { text: 'When your browser asks to be subscribed, the request ' +
                      'names those areas. It is acted on and discarded: it is ' +
                      'not stored and not written to our logs.' }),
    ]),

    section('What we do hold', [
      list([
        'Notices published by verified masajid, which are public by design.',
        'Accounts for masjid staff and administrators: an email address and, ' +
          'if they add one, a name.',
        'A record of who created, changed or cancelled each notice, and when.',
        'Reports of incorrect notices, tied to an anonymous session rather ' +
          'than to a person.',
      ]),
      el('p', { text: 'Family contact details and internal notes that a ' +
                      'coordinator adds are kept separately from the public ' +
                      'notice and can be read only by that masjid’s own staff ' +
                      'and a platform administrator. They cannot appear in a ' +
                      'public notice or a notification.' }),
    ]),

    section('How long it is kept', [
      list([
        `Family contact details and internal notes: deleted ${RETENTION_DAYS.privateDetailsDays} days after the prayer.`,
        `The deceased’s name and any instructions: removed from the public notice ${RETENTION_DAYS.publicNameDays} days after the prayer. The notice itself stays, so an old link explains what happened rather than breaking.`,
        `Notification delivery records, which hold counts and notice ids only: ${RETENTION_DAYS.notificationRunsDays} days.`,
        `Reports, once dealt with: ${RETENTION_DAYS.resolvedReportsDays} days.`,
        'The record of who changed a notice is kept, because it is what makes ' +
          'a fraudulent notice traceable. It refers to notices by id and does ' +
          'not hold the deceased’s name.',
      ]),
    ]),

    section('Where it is stored', [
      el('p', { text: 'On Google Firebase, in a Canadian region. This service ' +
                      'is intended to meet Canadian privacy expectations under ' +
                      'PIPEDA.' }),
    ]),

section('Asking for a notice to come down', [
      el('p', { text: 'The standard retention period is described above, but ' +
                      'a family should not have to wait weeks for a notice ' +
                      'about their own relative to be removed if they want it ' +
                      'removed sooner.' }),
      el('ol', {}, [
        el('li', { text: 'Open the notice.' }),
        el('li', { text: '“Report a problem”, then choose “I am family, ' +
                          'and I am asking for this to come down”.' }),
        el('li', { text: 'Say, if you can, how you are connected to the ' +
                          'family. This is not required, but it helps the ' +
                          'request move faster.' }),
      ]),
      el('p', { text: `A platform administrator aims to review these within ` +
                      `${FAMILY_TAKEDOWN_TARGET}. Reviewing means confirming ` +
                      `the request and taking the notice down or redacting ` +
                      `the name from it; it does not mean asking the family ` +
                      `to prove who they are before acting.` }),
      el('p', { class: 'muted', text: 'This request needs no account, the ' +
                      'same as reporting an incorrect notice.' }),
    ]),

    section('Your choices', [
      list([
        'Turn location and alerts off at any time from the “Near me” tab.',
        'Unfollow any masjid at any time.',
        'Clear your browser’s data for this site to remove everything stored ' +
          'on your device.',
        'Ask a masjid to correct or cancel a notice about your family, or ' +
          'report it through the “Report a problem” link on the notice.',
      ]),
    ]),

    section('Getting in touch', [
      el('p', { text: 'To ask about information held about you or your family, ' +
                      'or to ask for a notice to be corrected or removed, use ' +
                      'the “Report a problem” link on the notice, or contact the ' +
                      'masjid that published it.' }),
      el('p', { class: 'hint hint--boxed' },
        'Before launch, replace this section with a real contact address and a ' +
        'named person responsible for privacy. PIPEDA requires an accountable ' +
        'individual, and a policy without one is incomplete.'),
    ]),
  ]));
}
