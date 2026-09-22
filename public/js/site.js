// What every page of this site says about itself.
//
// One manifest, read by three things that must never disagree:
//
//   scripts/build-seo.mjs   writes a real HTML file per route, so a crawler
//                           and a link preview see the right title and
//                           description without running any JavaScript.
//   public/js/seo.js        updates the same tags when the router moves
//                           between pages inside the app.
//   the sitemap             lists exactly the pages marked indexable here.
//
// Plain data and no browser APIs, so Node can import it at build time and the
// browser can import it at run time.
//
// Writing rules for anything added here, which are the reason this file is
// prose and not keywords:
//
//   Say what the page is for, to somebody who has just been told a Janazah
//   is happening. Do not repeat another page's description. Do not claim
//   coverage, masjids or endorsement that does not exist yet: this site is
//   new, and a description promising "every masjid in your city" would be
//   false on the day it shipped and embarrassing afterwards.

/** The site itself. The origin is used for canonical URLs and the sitemap. */
export const SITE = {
  name: "Ta'ziyah",
  origin: 'https://taziyah.com',
  // Shown as the fallback link preview and in the Organization schema.
  image: '/social-card.png',
  imageAlt: "Ta'ziyah: Janazah notices from verified masjids",
  locale: 'en_CA',
  // A one-line description of the service, used where a page has none of its
  // own and in the Organization schema.
  tagline: 'Janazah notices published directly by verified masjids and '
    + 'funeral coordinators, to people close enough to attend.',
};

/**
 * Where Ta'ziyah is, off this site.
 *
 * The single place to change a social address. Anything empty is simply not
 * rendered, so adding a second network later means adding it here and
 * nowhere else.
 */
export const SOCIAL = [
  {
    key: 'instagram',
    label: 'Instagram',
    // The accessible name, which has to say what following it does rather
    // than repeating the icon.
    a11y: "Follow Ta'ziyah on Instagram",
    url: 'https://www.instagram.com/taziyahapp/',
  },
];

/**
 * The @handle in a social address, for the places that show it as text.
 *
 * Derived rather than stored beside the URL, so changing the address in one
 * place cannot leave a stale handle written out somewhere else on the site.
 */
export function socialHandle(entry) {
  const name = String(entry?.url || '').replace(/\/+$/, '').split('/').pop();
  return name ? `@${name}` : '';
}

/** Social entries that actually have an address set. */
export const socialLinks = () => SOCIAL.filter((entry) => entry.url);

/**
 * Every route this site answers on.
 *
 * `indexable: false` keeps a page out of the sitemap and puts a robots
 * noindex on it. That is for the surfaces that are somebody's own screen
 * rather than a page about the service: there is nothing on a signed-in
 * dashboard a search result could usefully lead to.
 *
 * `breadcrumb` names the section a page belongs under. Pages without one sit
 * directly under the home page.
 */
export const PAGES = [
  {
    path: '/',
    title: "Ta'ziyah: Janazah notices from verified masjids",
    description: 'Find current and upcoming Janazah notices published '
      + 'directly by verified masjids and funeral coordinators. No account '
      + 'needed to read notices.',
    indexable: true,
  },
  {
    path: '/how-it-works',
    title: 'How it works',
    description: 'How a Janazah notice reaches you: who is allowed to '
      + 'publish, how masjid verification works, following a masjid, '
      + 'notices near you, and what happens to your location.',
    indexable: true,
  },
  {
    path: '/janazahs',
    title: 'Current and upcoming Janazahs',
    description: 'Janazah prayer times, masjid locations and burial details, '
      + 'as published by the masjids and funeral coordinators themselves.',
    indexable: true,
    breadcrumb: 'Janazahs',
  },
  {
    path: '/near-me',
    title: 'Janazahs near you',
    description: 'See which Janazahs are close enough to reach. Your position '
      + 'is worked out in your own browser and is never sent to us or to any '
      + 'masjid.',
    indexable: true,
    breadcrumb: 'Near me',
  },
  {
    path: '/masjids',
    title: 'Masjid directory',
    description: 'The masjids and funeral coordinators publishing Janazah '
      + 'notices on Ta’ziyah. Follow one to see its notices first.',
    indexable: true,
    breadcrumb: 'Masjids',
  },
  {
    path: '/for-masjids',
    title: "For masjids and funeral coordinators",
    description: 'Publish Janazah notices your community can trust, correct a '
      + 'time or cancel in one place, and reach the people who follow you. '
      + 'Free to register.',
    indexable: true,
    breadcrumb: 'For masjids',
  },
  {
    path: '/register-masjid',
    title: 'Register a masjid',
    description: 'Register a masjid or funeral coordinator for verification, '
      + 'so it can publish Janazah notices on Ta’ziyah.',
    indexable: true,
    breadcrumb: 'Register a masjid',
  },
  {
    path: '/janazah-guide',
    title: 'How to pray Salat al-Janazah',
    description: 'A step by step guide to the Janazah prayer and the burial '
      + 'that follows, for somebody attending one for the first time.',
    indexable: true,
    breadcrumb: 'Janazah guide',
  },
  {
    path: '/faq',
    title: 'Questions and answers',
    description: 'Who can publish a notice, how verification works, what '
      + 'happens to your location, how corrections and cancellations reach '
      + 'you, and how a family can have a notice taken down.',
    indexable: true,
    breadcrumb: 'FAQ',
  },
  {
    path: '/about',
    title: 'About',
    description: 'Why Ta’ziyah exists, who runs it, and what it does and '
      + 'does not do with the information it holds.',
    indexable: true,
    breadcrumb: 'About',
  },
  {
    path: '/contact',
    title: 'Contact',
    description: 'How to reach Ta’ziyah about a notice that looks wrong, '
      + 'a masjid registration, a privacy question, or anything else.',
    indexable: true,
    breadcrumb: 'Contact',
  },
  {
    path: '/privacy',
    title: 'How your information is handled',
    description: 'What Ta’ziyah stores, what it does not, and why your '
      + 'location never leaves your device except as a general area for '
      + 'notifications.',
    indexable: true,
    breadcrumb: 'Privacy',
  },
  {
    path: '/terms',
    title: 'Terms of service',
    description: 'The terms for reading Janazah notices on Ta’ziyah and '
      + 'for publishing them as a verified organization.',
    indexable: true,
    breadcrumb: 'Terms',
  },
  {
    path: '/delete-account',
    title: 'Delete your account',
    description: 'How to delete a Ta’ziyah account and what happens to '
      + 'anything connected to it, including notices published by an '
      + 'organization.',
    indexable: true,
    breadcrumb: 'Delete account',
  },

  {
    // The first-run introduction. Public and reachable, but deliberately not
    // an index entry: it covers the same subject as /how-it-works in a
    // shorter form, and two pages competing for one search result serves
    // nobody. The canonical says which of the two is the page.
    path: '/welcome',
    title: 'Welcome',
    description: 'A short introduction to Ta\u2019ziyah: who publishes Janazah '
      + 'notices here, how to follow a masjid or see what is near you, and '
      + 'what happens to your location.',
    indexable: false,
    canonical: '/how-it-works',
  },

  // Somebody's own screen rather than a page about the service. Kept out of
  // the sitemap and marked noindex: a search result leading to an empty
  // signed-out dashboard helps nobody, and the follow list is private.
  { path: '/following', title: 'Masjids you follow', indexable: false },
  { path: '/dashboard', title: 'Your dashboard', indexable: false },
  { path: '/account', title: 'Account and settings', indexable: false },
  { path: '/signin', title: 'Sign in', indexable: false },
];

/** The manifest entry for a path, or undefined. */
export const pageFor = (path) => PAGES.find((page) => page.path === normalizePath(path));

/** Trailing slashes are the same page; the manifest stores the short form. */
export function normalizePath(path) {
  if (typeof path !== 'string' || !path) return '/';
  const trimmed = path.replace(/\/+$/, '');
  return trimmed || '/';
}

/**
 * The pages that belong in the sitemap.
 *
 * Deliberately not every URL that answers. A single Janazah notice is
 * public, but it is also somebody's funeral, often naming them, and a
 * permanent search result for a person's death is not something to switch
 * on quietly. See NOINDEX_PREFIXES in seo.js.
 */
export const indexablePages = () => PAGES.filter((page) => page.indexable);
