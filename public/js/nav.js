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
  { href: '/about', label: 'About' },
];

/** True for an exact match, or for any path nested under a non-root link. */
function isActive(href, path) {
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

/**
 * @param {HTMLElement} nav
 * @param {{ path: string, user: import('firebase/auth').User | null }} state
 */
export function renderNav(nav, { path, user }) {
  nav.replaceChildren();

  const links = el('div', { class: 'nav-links' },
    LINKS.map((link) => el('a', {
      class: `nav-item${isActive(link.href, path) ? ' nav-item--active' : ''}`,
      href: link.href,
      text: link.label,
    })));

  const account = el('div', { class: 'nav-links nav-links--end' });
  if (user) {
    account.append(
      el('a', {
        class: `nav-item${isActive('/dashboard', path) ? ' nav-item--active' : ''}`,
        href: '/dashboard',
        text: 'Dashboard',
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
