// The public site's chrome: a left sidebar of sections, and an account menu
// in the top right.
//
// Two separate places on purpose. The sidebar answers "where in this site can
// I go", and every item there is a place with Janazah information in it. The
// account menu answers "what about me", and nothing in it is a section of the
// site. Before this split, somebody's name, Dashboard, Sign out and the
// coordinator link all sat in the same row as Janazahs and Near Me, which made
// six equally weighted things compete for the same attention.
//
// Coordinator sign-in still lives at /console, which has its own nav built
// around the console's own routes. One item leads there rather than three:
// each would be a full page load into a different entry point.

import { el, icon, toast, friendlyError } from './ui.js';
import { signOutUser } from './views/auth.js';

const LINKS = [
  { href: '/', label: 'Home', icon: 'grid' },
  { href: '/janazahs', label: 'Janazahs', icon: 'clock' },
  { href: '/near-me', label: 'Near Me', icon: 'pin' },
  { href: '/masjids', label: 'Masjids', icon: 'building' },
  { href: '/following', label: 'Following', icon: 'bookmark' },
  { href: '/janazah-guide', label: 'Janazah Guide', icon: 'shield' },
];

// Deeper pages are not in the nav but still belong to one of its sections, so
// the current place stays lit rather than the whole bar going dark the moment
// someone opens a masjid or a single notice.
const SECTION_OF = [
  [/^\/o\//, '/masjids'],
  [/^\/n\//, '/janazahs'],
  [/^\/register-masjid/, '/register-masjid'],
];

const COLLAPSE_KEY = 'taziyah.nav.collapsed';

// The account menu is rebuilt on every route paint, so its dismiss handlers
// are registered once here against whichever menu is currently open. Adding
// them inside the render would leave a listener behind on every navigation.
let closeOpenMenu = null;
// Set by wireNavToggle, so the drawer's own close button and the hamburger
// drive exactly the same state rather than two versions of it.
let setDrawer = () => {};
const dismissMenu = () => { closeOpenMenu?.(); };
document.addEventListener('click', dismissMenu);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') dismissMenu();
});

/** True for an exact match, for a nested path, or for a page in that section. */
function isActive(href, path) {
  const section = SECTION_OF.find(([pattern]) => pattern.test(path))?.[1];
  if (section) return href === section;
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

function collapsed() {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}

function setCollapsed(on) {
  document.body.classList.toggle('is-nav-collapsed', on);
  try { localStorage.setItem(COLLAPSE_KEY, on ? '1' : '0'); } catch { /* private mode */ }
}

/** One sidebar row. The label is kept in the DOM when collapsed, for screen readers. */
function navItem({ href, label, icon: iconName, path, modifier = '' }) {
  return el('a', {
    class: `nav-item${modifier}${isActive(href, path) ? ' nav-item--active' : ''}`,
    href,
    title: label,
  }, [
    icon(iconName, { size: 18 }),
    el('span', { class: 'nav-item__label', text: label }),
  ]);
}

/** The initials shown in place of an avatar. Two letters at most. */
export function initialsFor(user) {
  const source = (user?.displayName || user?.email || '').trim();
  if (!source) return '?';
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/**
 * The top-right account control: a menu when signed in, two links when not.
 *
 * Signed out this is deliberately not a single "Sign in" pill. Someone who has
 * never been here does not know whether they need an account, and "Create
 * account" sitting beside it answers that without a marketing sentence.
 */
function renderAccount(mount, { user, path }) {
  mount.replaceChildren();
  if (!user) {
    mount.append(
      el('a', {
        class: `nav-item nav-item--quiet${isActive('/signin', path) ? ' nav-item--active' : ''}`,
        href: '/signin',
      }, 'Sign in'),
      el('a', { class: 'btn btn--primary btn--small', href: '/signin?mode=signup' },
        'Create account'),
    );
    return;
  }

  const name = user.displayName || user.email || 'Signed in';
  const menu = el('div', { class: 'account__menu', hidden: true, role: 'menu' }, [
    el('p', { class: 'account__who' }, [
      el('span', { class: 'account__who-name', text: name }),
      user.displayName && user.email
        ? el('span', { class: 'account__who-mail', text: user.email })
        : null,
    ]),
    el('a', { class: 'account__item', href: '/dashboard', role: 'menuitem' }, 'Dashboard'),
    // One item, not "Account" and "Settings" pointing at the same page.
    el('a', { class: 'account__item', href: '/account', role: 'menuitem' },
      'Account and settings'),
    el('a', { class: 'account__item', href: '/register-masjid', role: 'menuitem' },
      'Masjid or coordinator'),
    el('button', {
      class: 'account__item account__item--danger',
      type: 'button',
      role: 'menuitem',
      onclick: async () => {
        try { await signOutUser(); } catch (err) { toast(friendlyError(err), 'error'); }
      },
    }, 'Sign out'),
  ]);

  const button = el('button', {
    class: 'account__button',
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  }, [
    el('span', { class: 'account__avatar', text: initialsFor(user) }),
    el('span', { class: 'account__name', text: name }),
    el('span', { class: 'account__caret', 'aria-hidden': 'true' }),
  ]);
  button.setAttribute('aria-label', `Account menu for ${name}`);

  // Clicking anywhere else, or pressing Escape, closes it. A dropdown that
  // can only be closed by clicking the same button traps people on a phone.
  const close = () => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    closeOpenMenu = null;
  };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    closeOpenMenu = open ? close : null;
  });
  menu.addEventListener('click', close);

  mount.append(el('div', { class: 'account__wrap' }, [button, menu]));
}

/**
 * Paint the whole site chrome for the current path and sign-in state.
 *
 * @param {HTMLElement} nav The sidebar element.
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
  document.body.classList.toggle('is-nav-collapsed', collapsed());

  // Only ever visible in the mobile drawer, where the sidebar covers the
  // masthead and the hamburger with it. The drawer takes the full height on
  // purpose: the masthead sits below one or two banners depending on the
  // deployment, so anything anchored to a guessed offset lands in the wrong
  // place on some of them.
  nav.append(el('button', {
    class: 'sidenav__close',
    type: 'button',
    'aria-label': 'Close the menu',
    onclick: () => setDrawer(false),
  }, [icon('x', { size: 18 }), el('span', { text: 'Close' })]));

  nav.append(el('div', { class: 'sidenav__group' },
    LINKS.map((link) => navItem({ ...link, path }))));

  const personal = [];
  if (user) {
    personal.push(navItem({
      href: '/dashboard', label: 'Dashboard', icon: 'users', path,
    }));
  }
  // A platform administrator reading the public feed had no way through to
  // the portal except by knowing the /console URL. The item is marked out
  // because it leads somewhere most people signed in here cannot go.
  if (isAdmin) {
    personal.push(navItem({
      href: '/console?tab=admin', label: 'Admin', icon: 'shield', path,
      modifier: ' nav-item--admin',
    }));
  }
  personal.push(navItem({
    href: '/register-masjid', label: 'Masjid access', icon: 'building', path,
    modifier: ' nav-item--quiet',
  }));

  nav.append(
    el('div', { class: 'sidenav__rule', 'aria-hidden': 'true' }),
    el('div', { class: 'sidenav__group' }, personal),
  );

  // Desktop only: the sidebar shrinks to icons. Hidden from the mobile drawer
  // by CSS, where an icons-only drawer would be a worse version of the thing
  // it is already showing.
  const collapse = el('button', {
    class: 'sidenav__collapse',
    type: 'button',
    onclick: () => {
      setCollapsed(!document.body.classList.contains('is-nav-collapsed'));
      collapse.setAttribute('aria-pressed',
        String(document.body.classList.contains('is-nav-collapsed')));
    },
  }, [
    icon('arrowLeft', { size: 16 }),
    el('span', { class: 'nav-item__label', text: 'Collapse' }),
  ]);
  collapse.setAttribute('aria-pressed', String(collapsed()));
  collapse.setAttribute('aria-label', 'Collapse the sidebar');
  nav.append(collapse);

  const account = document.getElementById('account');
  if (account) renderAccount(account, { user, path });
}

/** Wires the mobile menu toggle once. Call this at bootstrap, not per-route. */
export function wireNavToggle(toggle, nav) {
  const scrim = document.getElementById('nav-scrim');
  const set = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (scrim) scrim.hidden = !open;
    document.body.classList.toggle('is-drawer-open', open);
  };
  setDrawer = set;
  toggle.addEventListener('click', () => set(!nav.classList.contains('is-open')));
  scrim?.addEventListener('click', () => set(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') set(false);
  });
}

/** Close the mobile menu, e.g. after an in-app navigation. */
export function closeNav(toggle, nav) {
  nav.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('is-drawer-open');
  const scrim = document.getElementById('nav-scrim');
  if (scrim) scrim.hidden = true;
}
