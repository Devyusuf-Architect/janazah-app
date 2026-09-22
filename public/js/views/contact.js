// How to reach a person.
//
// Routed rather than listed: the fastest answer for most of what brings
// somebody here is not an email address at all. A wrong time on a Janazah
// happening this afternoon is fixed by the masjid in a minute and by us in
// however long it takes to read an inbox, so that route is first and the
// address is below it.
//
// The addresses come from platform settings, which an administrator sets in
// the portal. Where one is not set the page says so instead of printing a
// mailto link to nowhere.

import { el } from '../ui.js';
import { platformSettings } from '../platform-settings.js';
import { socialLinks, socialHandle } from '../site.js';

export function renderContact(mount) {
  const settings = platformSettings();
  const support = settings.supportEmail;
  const privacy = settings.privacyEmail || support;
  const instagram = socialLinks().find((entry) => entry.key === 'instagram');

  const mail = (address, label) => el('a', {
    class: 'link', href: `mailto:${address}`, text: label || address,
  });

  mount.replaceChildren(el('article', { class: 'policy' }, [
    el('h1', { text: 'Contact Ta’ziyah' }),
    el('p', { class: 'lede' },
      'For anything about a Janazah happening today, contact the masjid '
      + 'holding it first. They can correct their own notice immediately, and '
      + 'everybody who was told the original is told about the change.'),

    el('section', {}, [
      el('h2', { text: 'A notice is wrong, or should not be there' }),
      el('p', {}, [
        'Use "Report a problem" on the notice itself. That reaches a platform '
        + 'administrator, who can correct or hide it. A family asking for a '
        + 'notice about their relative to be taken down should use the same '
        + 'route and say so: the request goes to an administrator rather than '
        + 'back through the masjid that published it.',
      ]),
    ]),

    el('section', {}, [
      el('h2', { text: 'Registering a masjid' }),
      el('p', {}, [
        'Registration is open and free: ',
        el('a', { class: 'link', href: '/register-masjid' },
          'register a masjid or funeral coordinator'),
        '. What happens next, and what verification checks, is on ',
        el('a', { class: 'link', href: '/for-masjids' },
          'the page for masjids'),
        '.',
      ]),
    ]),

    el('section', {}, [
      el('h2', { text: 'Everything else' }),
      support
        ? el('p', {}, ['Email ', mail(support), '.'])
        : el('p', { class: 'muted' },
          'A support address has not been published yet. Until it is, use '
          + '"Report a problem" on any notice, which reaches a platform '
          + 'administrator.'),
      privacy && privacy !== support
        ? el('p', {}, ['For questions about your information or a request to '
          + 'delete it, email ', mail(privacy), '.'])
        : null,
      el('p', { class: 'muted' }, [
        'Before emailing, ',
        el('a', { class: 'link', href: '/faq' }, 'the questions page'),
        ' answers most of what we are asked, including what happens to your '
        + 'location and how verification works.',
      ]),
    ]),

    instagram
      ? el('section', {}, [
        el('h2', { text: 'Elsewhere' }),
        el('p', {}, [
          'Ta’ziyah is on Instagram as ',
          el('a', {
            class: 'link',
            href: instagram.url,
            target: '_blank',
            rel: 'noopener noreferrer',
            'aria-label': instagram.a11y,
          }, socialHandle(instagram)),
          '. It is where new masjids joining are announced. Please do not '
          + 'send a Janazah notice or a takedown request by direct message: '
          + 'those need the routes above so they reach somebody who can act '
          + 'on them.',
        ]),
      ])
      : null,
  ]));
}
