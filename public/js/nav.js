// The public site's navigation bar.
//
// A handful of links plus, once signed in, a route to the personal dashboard.
// Coordinator/administrator sign-in stays on /console, which has its own nav
// (app.js) built around the console's own routes — this is deliberately a
// separate, smaller nav for the read-anywhere public site.

import { el, toast, friendlyError } from './ui.js';
import { signOutUser } from './views/auth.js';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/janazahs', label: 'Janazahs' },
  { href: '/near-me', label: 'Near Me' },
  { href: '/masjids', label: 'Masjids' },
  { href: '/following', label: 'Following' },
  { href: '/janazah-guide', label: 'Prayer Guide' },
];

// Deeper pages are not in the nav but still belong to one of its sections, so
// the current place stays lit rather than the whole bar going dark the moment
// someone opens a masjid or a single notice.
const SECTION_OF = [
  [/^\/o\//, '/masjids'],
  [/^\/n\//, '/janazahs'],
  [/^\/register-masjid/, '/register-masjid'],
];

/** True for an exact match, for a nested path, or for a page in that section. */
function isActive(href, path) {
  const section = SECTION_OF.find(([pattern]) => pattern.test(path))?.[1];
  if (section) return href === section;
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

/**
 * @param {HTMLElement} nav
 * @param {object} state
 * @param {string} state.path
 * @param {import('firebase/auth').User | null} state.user
 * @param {boolean} [state.isAdmin] Whether to offer a route into the admin
 *   portal. Presentation only: what an administrator may actually do is
 *   decided by firestore.rules on every read and write, so hiding or showing
 *   this link changes nobody's permissions.
 */
export function renderNav(nav, { path, user, isAdmin = false }) {
  nav.replaceChildren();

  const links = el('div', { class: 'nav-links' },
    LINKS.map((link) => el('a', {
      class: `nav-item${isActive(link.href, path) ? ' nav-item--active' : ''}`,
      href: link.href,
      text: link.label,
    })));

  const account = el('div', { class: 'nav-links nav-links--end' });

  // A platform administrator reading the public feed had no way through to
  // the portal except by knowing the /console URL. The link is deliberately
  // distinct from the ordinary items: it leads somewhere most people signed
  // in here cannot go.
  if (isAdmin) {
    account.append(el('a', {
      class: 'nav-item nav-item--admin',
      href: '/console?tab=admin',
      text: 'Admin',
    }));
  }

  if (user) {
    account.append(
      el('a', {
        class: `nav-item${isActive('/dashboard', path) ? ' nav-item--active' : ''}`,
        href: '/dashboard',
        text: 'Dashboard',
      }),
      el('a', {
        class: `nav-item${isActive('/account', path) ? ' nav-item--active' : ''}`,
        href: '/account',
        text: 'Account',
      }),
      el('span', { class: 'nav-user', text: user.displayName || user.email || 'Signed in' }),
      el('button', {
        class: 'nav-item',
        type: 'button',
        onclick: async () => {
          try { await signOutUser(); } catch (err) { toast(friendlyError(err), 'error'); }
        },
      }, 'Sign out'),
    );
  } else {
    account.append(el('a', {
      class: `nav-item nav-item--cta${isActive('/signin', path) ? ' nav-item--active' : ''}`,
      href: '/signin',
      text: 'Sign in',
    }));
  }
  account.append(el('a', { class: 'nav-item nav-item--ghost', href: '/register-masjid', text: 'Masjid / Coordinator' }));

  nav.append(links, account);
}

/** Wires the mobile menu toggle once. Call this at bootstrap, not per-route. */
export function wireNavToggle(toggle, nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
}

/** Close the mobile menu, e.g. after an in-app navigation. */
export function closeNav(toggle, nav) {
  nav.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
}
