// The site footer.
//
// Built here rather than written into index.html because it is now the same
// four groups on every page, and twenty generated HTML files each carrying
// their own copy of it is twenty places for a link to go stale.
//
// It is also the crawlable map of this site: every public page is reachable
// from every other public page through it, which is what stops a page like
// /for-masjids existing only at the end of one link on one screen.
//
// The two paragraphs above the links stay. They are the only place a reader
// who scrolled past everything else is told who publishes notices and what
// happens to their location.

import { el, icon } from './ui.js';
import { socialLinks } from './site.js';

const GROUPS = [
  {
    heading: "Ta'ziyah",
    links: [
      { href: '/about', label: 'About' },
      { href: '/how-it-works', label: 'How it works' },
      { href: '/janazahs', label: 'Janazahs' },
      { href: '/near-me', label: 'Near me' },
      { href: '/masjids', label: 'Masjids' },
    ],
  },
  {
    heading: 'For masjids',
    links: [
      { href: '/for-masjids', label: 'For masjids' },
      { href: '/register-masjid', label: 'Register a masjid' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { href: '/janazah-guide', label: 'Janazah guide' },
      { href: '/faq', label: 'Questions' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
      { href: '/delete-account', label: 'Delete account' },
    ],
  },
];

/** The Instagram glyph, inline so the footer needs no icon font or request. */
function instagramMark() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  svg.innerHTML =
    '<rect x="3" y="3" width="18" height="18" rx="5"/>'
    + '<circle cx="12" cy="12" r="4"/>'
    + '<circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/>';
  return svg;
}

const MARKS = { instagram: instagramMark };

export function renderFooter(mount) {
  if (!mount) return;
  const social = socialLinks();

  mount.replaceChildren(
    el('nav', { class: 'footer-nav', 'aria-label': 'Site' },
      GROUPS.map((group) => el('div', { class: 'footer-nav__group' }, [
        el('h2', { class: 'footer-nav__heading', text: group.heading }),
        el('ul', { class: 'footer-nav__list' }, group.links.map((link) =>
          el('li', {}, [
            el('a', { class: 'footer-nav__link', href: link.href, text: link.label }),
          ]))),
      ]))),

    social.length
      ? el('div', { class: 'footer-social' }, social.map((entry) => el('a', {
        class: 'footer-social__link',
        href: entry.url,
        // An external destination in a new tab, and rel set so the opened
        // page cannot reach back into this one through window.opener.
        target: '_blank',
        rel: 'noopener noreferrer',
        // The accessible name says what the link does. "Instagram" beside an
        // Instagram glyph tells a screen reader user nothing twice.
        'aria-label': entry.a11y,
      }, [
        (MARKS[entry.key] || (() => icon('share', { size: 18 })))(),
        el('span', { text: `Follow on ${entry.label}` }),
      ])))
      : null,

    el('div', { class: 'footer-note' }, [
      el('p', {},
        'Notices are published by masjids and funeral coordinators verified '
        + 'by a platform administrator. If something looks wrong, use "Report '
        + 'a problem" on the notice.'),
      el('p', { class: 'muted' },
        'Reading notices needs no account. Location is off unless you turn it '
        + 'on, and even then it is used in your browser and never sent to us '
        + 'or to any masjid. Masjids you follow are remembered on your own '
        + 'device.'),
    ]),
  );
}
