// The home page.
//
// Not a landing page. Someone arriving here has usually just been told, by
// text message or in a phone call, that a Janazah is happening — often today.
// The page has one job at that moment: what is happening, where, and how do I
// get there. Everything explaining what Ta'ziyah is lives on /about.
//
// Nothing here re-implements a feature. The notice stream, the follow list,
// the distance maths and the location settings are the same modules the rest
// of the site uses, so a change to any of them changes this page too rather
// than leaving it quietly stale.

import { el, icon, toast, skeleton, directionsMenu, renderGuard } from '../ui.js';
import { formatJanazahTime } from '../model.js';
import { formatDistance } from '../geo.js';
import * as store from '../store.js';
import * as loc from '../location.js';
import * as follows from '../follows.js';
import * as push from '../push.js';

/** How many rows each section shows before deferring to its own page. */
const UPCOMING_LIMIT = 4;
const NEAR_LIMIT = 3;
const FOLLOWED_LIMIT = 6;

let unwatch = null;

export function teardownHome() {
  if (unwatch) unwatch();
  unwatch = null;
}

export function renderHome(mount) {
  // A read that lands after the reader has moved on must not paint over
  // the page they moved to (see renderGuard in ui.js).
  const current = renderGuard(mount);
  teardownHome();

  const state = { notices: [], orgs: [], query: '', loading: true };

  const results = el('div', { class: 'home-results' });
  const upcoming = el('section', { class: 'home-section' });
  const near = el('section', { class: 'home-section' });
  const followed = el('section', { class: 'home-section' });
  const explore = el('section', { class: 'home-section', hidden: true });

  const repaint = () => {
    paintResults(results, state);
    paintUpcoming(upcoming, state);
    paintNear(near, state, repaint);
    paintFollowed(followed, state, repaint);
    paintExplore(explore, state);
  };

  // One column, four sections, in the order somebody actually needs them:
  // search, what is coming up, what is near, who you follow.
  //
  // What used to be here as well: a six-tile Quick Actions grid, a guide
  // strip, and a four-tile "get started" block. Every one of those was a
  // second or third link to a place already in the nav, which is what made
  // the page read as congested: nine sections of equal weight, none of them
  // obviously the point. They are gone rather than restyled. The two-column
  // layout went with them, because two columns of a shorter page is a lot of
  // empty space beside a little content.
  mount.replaceChildren(
    finder(state, repaint),
    results,
    upcoming,
    near,
    followed,
    explore,
  );

  repaint();

  unwatch = store.watchPublicNotices((incoming) => {
    state.notices = incoming;
    state.loading = false;
    repaint();
  });

  // The masjid list is only needed for search and the follow section, so a
  // failure here must not take the Janazah list down with it.
  store.verifiedOrganizations()
    .then((orgs) => { if (!current()) return; state.orgs = orgs; repaint(); })
    .catch((err) => console.error('verifiedOrganizations', err));
}

// ------------------------------------------------------------------- search

/**
 * One box over both masjids and notices.
 *
 * Deliberately not three separate fields for masjid, city and postal code.
 * Somebody who has been told "the Janazah is at Al-Noor" and somebody who
 * knows only their own postal code are both typing one thing they are sure
 * of, and asking them which kind of thing it is first is a question with no
 * purpose.
 */
function finder(state, repaint) {
  const input = el('input', {
    class: 'finder__input',
    type: 'search',
    id: 'home-search',
    placeholder: 'Masjid, city or postal code',
    autocomplete: 'off',
  });
  input.setAttribute('aria-label', 'Search by masjid, city or postal code');
  input.addEventListener('input', () => {
    state.query = input.value;
    repaint();
  });

  const locate = el('button', { class: 'btn btn--small finder__locate', type: 'button' },
    [icon('pin', { size: 16 }), el('span', { text: 'Use my location' })]);
  locate.addEventListener('click', () => enableLocation(locate, repaint));

  const form = el('form', { class: 'finder', role: 'search' }, [
    el('div', { class: 'finder__field' }, [icon('search', { size: 17 }), input]),
    locate,
  ]);
  form.addEventListener('submit', (event) => event.preventDefault());

  return el('section', { class: 'home-head' }, [
    el('h1', { class: 'home-head__title', text: 'Find a Janazah' }),
    el('p', { class: 'home-head__sub' },
      'Published directly by verified masjids and funeral coordinators. '
      + 'No account needed.'),
    form,
  ]);
}

/** Postal codes get typed with and without the space; compare without it. */
const normalize = (value) => String(value || '').toLowerCase().replace(/\s+/g, '');

function noticeHaystack(notice) {
  return normalize([
    notice.orgName, notice.prayerLocation?.name, notice.prayerLocation?.address,
    notice.burialLocation?.name, notice.burialLocation?.address,
    // Same gate the display uses (notice-view.js): a name search can only
    // ever surface a name the family already agreed to show publicly.
    notice.showDeceasedName ? notice.deceasedName : null,
  ].filter(Boolean).join(' '));
}

const orgHaystack = (org) => normalize(
  [org.name, org.city, org.province, org.postalCode, org.address].filter(Boolean).join(' '));

function paintResults(mount, state) {
  const query = normalize(state.query);
  mount.replaceChildren();
  if (query.length < 2) {
    mount.hidden = true;
    return;
  }
  mount.hidden = false;

  const notices = state.notices.filter((n) => noticeHaystack(n).includes(query));
  const orgs = state.orgs.filter((o) => orgHaystack(o).includes(query));

  if (!notices.length && !orgs.length) {
    mount.append(el('div', { class: 'home-empty' }, [
      el('p', { text: 'No Janazahs match your search.' }),
      el('p', { class: 'muted' },
        'Only current and upcoming Janazahs are listed here. A masjid that '
        + 'has not registered yet will not appear.'),
    ]));
    return;
  }

  if (notices.length) {
    mount.append(
      sectionHead(`${notices.length} Janazah${notices.length === 1 ? '' : 's'}`),
      el('ul', { class: 'jlist' }, notices.map((n) => janazahRow(n))),
    );
  }
  if (orgs.length) {
    mount.append(
      sectionHead(`${orgs.length} masjid${orgs.length === 1 ? '' : 's'}`),
      el('ul', { class: 'mlist' }, orgs.slice(0, 8).map((o) => masjidRow(o, state))),
    );
  }
}

// ---------------------------------------------------------------- the lists

export function sectionHead(title, link = null) {
  return el('div', { class: 'section-head' }, [
    el('h2', { class: 'section-head__title', text: title }),
    link ? el('a', { class: 'section-head__link', href: link.href, text: link.label }) : null,
  ]);
}

/**
 * One Janazah, as a scannable row rather than a card.
 *
 * The order is the order the questions get asked out loud: which masjid, when,
 * where, how far, how do I get there. Everything else about the notice is one
 * tap away on its own page and does not belong in a list somebody is reading
 * quickly.
 */
export function janazahRow(notice, distanceLabel = null) {
  const place = notice.prayerLocation;
  const cancelled = notice.status === 'cancelled';

  return el('li', { class: `jrow${cancelled ? ' jrow--cancelled' : ''} reveal` }, [
    el('a', { class: 'jrow__main', href: `/n/${notice.id}` }, [
      el('div', { class: 'jrow__top' }, [
        el('span', { class: 'jrow__org', text: notice.orgName || 'Janazah notice' }),
        el('span', { class: 'chip chip--verified' },
          [icon('check', { size: 12 }), el('span', { text: 'Verified Masjid' })]),
        distanceLabel ? el('span', { class: 'chip', text: distanceLabel }) : null,
        cancelled ? el('span', { class: 'chip chip--danger', text: 'Cancelled' }) : null,
      ]),
      el('p', { class: 'jrow__time' }, [
        icon('clock', { size: 15 }),
        el('span', { text: formatJanazahTime(notice) }),
      ]),
      place
        ? el('p', { class: 'jrow__where' }, [
          icon('pin', { size: 15 }),
          el('span', {}, [
            el('span', { class: 'jrow__place', text: place.name || '' }),
            place.address ? el('span', { class: 'jrow__addr', text: place.address }) : null,
          ]),
        ])
        : null,
      notice.burialLocation
        ? el('p', { class: 'jrow__burial', text: `Burial: ${notice.burialLocation.name}` })
        : null,
    ]),
    place
      ? directionsMenu(place, { label: 'Directions', triggerClass: 'btn btn--small jrow__go' })
      : null,
  ]);
}

function upcomingNoticesFor(orgId, notices) {
  return notices.filter((n) => n.orgId === orgId && n.status !== 'cancelled');
}

/**
 * A masjid, as a scannable row. Shows the next Janazah it has coming up and,
 * when there is more than one, how many are waiting behind it — a follower
 * scanning a short list of masjids can tell which ones are actually active
 * without opening each one.
 */
export function masjidRow(org, state) {
  const upcoming = upcomingNoticesFor(org.id, state.notices);
  const next = upcoming[0] || null;
  // The masjid's name gets its own line. Sitting the badge beside it means a
  // long name wraps and the badge lands underneath on some cards and not
  // others, which makes a grid of them look accidental.
  return el('li', { class: 'mrow reveal' }, [
    el('a', { class: 'mrow__main', href: `/o/${org.id}` }, [
      el('span', { class: 'mrow__name', text: org.name }),
      el('p', { class: 'mrow__meta' }, [
        el('span', { class: 'chip chip--verified' },
          [icon('check', { size: 12 }), el('span', { text: 'Verified Masjid' })]),
        el('span', { text: [org.city, org.province].filter(Boolean).join(', ') }),
      ]),
      el('p', { class: `mrow__next${next ? '' : ' mrow__next--none'}` }, next
        ? [
          el('span', { text: formatJanazahTime(next) }),
          upcoming.length > 1
            ? el('span', { class: 'chip mrow__count', text: `+${upcoming.length - 1} more` })
            : null,
        ]
        : 'No upcoming Janazah'),
    ]),
  ]);
}

export function paintUpcoming(mount, state) {
  mount.replaceChildren(sectionHead('Upcoming Janazahs',
    { href: '/janazahs', label: 'View all' }));

  if (state.loading) {
    mount.append(skeleton(2));
    return;
  }

  const settings = loc.settings();
  const from = settings.enabled ? settings.last : null;
  const visible = state.notices.slice(0, UPCOMING_LIMIT);

  if (!visible.length) {
    // One line of fact, one line of what will change it, one action. The
    // second link that used to sit beside this ("Register a Masjid") made a
    // reader choose between two unrelated things at the moment the page had
    // nothing to show them; it lives in the nav and the footer instead.
    mount.append(el('div', { class: 'home-empty home-empty--compact' }, [
      el('p', { class: 'home-empty__title', text: 'No upcoming Janazahs yet' }),
      el('p', { class: 'muted' },
        'Verified Masjids will appear here as they begin publishing.'),
      el('div', { class: 'home-empty__actions' }, [
        el('a', { class: 'btn btn--small btn--primary', href: '/masjids' }, 'Find a Masjid'),
      ]),
    ]));
    return;
  }

  mount.append(el('ul', { class: 'jlist' }, visible.map((n) => {
    const km = loc.noticeDistanceKm(n, from);
    return janazahRow(n, km === null ? null : formatDistance(km));
  })));

  if (state.notices.length > visible.length) {
    mount.append(el('a', { class: 'home-more', href: '/janazahs' },
      `${state.notices.length - visible.length} more`));
  }
}

// ------------------------------------------------------------------- nearby

/**
 * Turn location on from here.
 *
 * The full explanation of what happens to a position lives on /near-me, and
 * this links to it rather than repeating a shortened version: somebody is
 * being asked for their location by an app about funerals, and a one-line
 * reassurance next to a button is not consent. The one line that is here is
 * the operative fact, and it is true — the position never leaves the browser
 * (location.js).
 */
async function enableLocation(button, repaint) {
  if (!loc.canUseLocation()) {
    toast(window.isSecureContext
      ? 'This browser does not offer location access.'
      : 'Browsers only allow location over a secure (https) connection.', 'warn');
    return;
  }
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Finding your location…';
  try {
    loc.update({ enabled: true });
    await loc.requestPosition();
    push.syncTopics().catch((err) => console.error('syncTopics', err));
    repaint();
  } catch (err) {
    loc.disable();
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

export function paintNear(mount, state, repaint) {
  const settings = loc.settings();
  mount.replaceChildren(sectionHead('Near you',
    settings.enabled ? { href: '/near-me', label: 'Distance settings' } : null));

  if (!settings.enabled || !settings.last) {
    const enable = el('button', { class: 'btn btn--small', type: 'button' },
      [icon('pin', { size: 15 }), el('span', { text: 'Enable location' })]);
    enable.addEventListener('click', () => enableLocation(enable, repaint));

    mount.append(el('div', { class: 'prompt' }, [
      el('div', { class: 'prompt__body' }, [
        el('p', { class: 'prompt__lede', text: 'See Janazahs happening near your current location.' }),
        el('p', { class: 'prompt__note' }, [
          'Optional, and off until you turn it on. Your position is used in '
          + 'your browser only and is never sent to us or to any masjid. ',
          el('a', { class: 'link', href: '/near-me', text: 'What happens to it' }),
          '.',
        ]),
      ]),
      enable,
    ]));
    return;
  }

  const matches = loc.nearbyNotices(state.notices, settings.last, settings.radiusKm);

  const stale = loc.isStale(settings.last);
  const note = el('p', { class: 'home-note' }, [el('span', { text: 'Using your last known location.' })]);
  if (stale) {
    const update = el('button', { class: 'btn btn--link home-note__update', type: 'button' }, 'Update location');
    update.addEventListener('click', () => enableLocation(update, repaint));
    note.append(' ', update);
  }
  mount.append(note);

  if (!matches.length) {
    mount.append(el('div', { class: 'home-empty' }, [
      el('p', {
        text: settings.radiusKm === 0
          ? 'No current or upcoming Janazahs anywhere.'
          : `No Janazahs within ${settings.radiusKm} km.`,
      }),
      el('a', { class: 'link', href: '/near-me', text: 'Increase distance' }),
    ]));
    return;
  }

  mount.append(el('ul', { class: 'jlist' },
    matches.slice(0, NEAR_LIMIT).map(({ notice, km }) =>
      janazahRow(notice, formatDistance(km)))));

  if (matches.length > NEAR_LIMIT) {
    mount.append(el('a', { class: 'home-more', href: '/near-me' },
      `${matches.length - NEAR_LIMIT} more nearby`));
  }
}

// ---------------------------------------------------------------- following

/**
 * Follows live on the device, not in an account (follows.js), so this section
 * appears whether or not somebody is signed in. Gating it behind sign-in would
 * hide a list they already have from the person who made it.
 */
export function paintFollowed(mount, state, repaint) {
  const ids = follows.followedOrgIds();
  mount.replaceChildren(sectionHead('Masjids you follow',
    ids.length ? { href: '/following', label: 'Manage' } : null));

  if (!ids.length) {
    mount.append(el('div', { class: 'prompt' }, [
      el('div', { class: 'prompt__body' }, [
        el('p', { class: 'prompt__lede', text: 'Follow Masjids to see their Janazah notices here.' }),
        el('p', { class: 'prompt__note', text: 'Your follows remain private.' }),
      ]),
      el('a', { class: 'btn btn--small', href: '/masjids' }, 'Find Masjids'),
    ]));
    return;
  }

  const followedOrgs = state.orgs.filter((o) => ids.includes(o.id));
  if (!followedOrgs.length) {
    mount.append(el('div', { class: 'home-empty' }, [
      el('p', { text: 'The masjids this device follows are not currently available.' }),
      el('a', { class: 'link', href: '/following', text: 'Review who you follow' }),
    ]));
    return;
  }

  mount.append(el('ul', { class: 'mgrid' },
    followedOrgs.slice(0, FOLLOWED_LIMIT).map((o) => masjidRow(o, state))));
  if (followedOrgs.length > FOLLOWED_LIMIT) {
    mount.append(el('a', { class: 'home-more', href: '/following' },
      `${followedOrgs.length - FOLLOWED_LIMIT} more`));
  }
}

// ------------------------------------------------------------------ explore

/**
 * Shown only while there is nothing real yet to fill the page.
 *
 * It replaces a section that held a bordered registration card and a grid of
 * four tiles, all of which led to places already in the navigation. What is
 * left is the one thing this page cannot say anywhere else: the site is new,
 * that is why it is empty, and here is the single action that changes it.
 *
 * It disappears on its own once the first notice is published, so it must
 * stay small enough that nobody minds having seen it.
 */
function paintExplore(mount, state) {
  if (state.loading || state.notices.length) {
    mount.hidden = true;
    mount.replaceChildren();
    return;
  }
  mount.hidden = false;

  mount.replaceChildren(el('div', { class: 'note-strip reveal' }, [
    el('div', { class: 'note-strip__body' }, [
      el('h2', { class: 'note-strip__title', text: 'Ta’ziyah is growing' }),
      el('p', { class: 'note-strip__sub' },
        'We are onboarding Masjids across Ontario. As organizations join, '
        + 'verified Janazah notices will appear here.'),
    ]),
    el('a', { class: 'btn btn--small', href: '/for-masjids' }, 'Register a Masjid'),
  ]));
}

// ------------------------------------------------------------ the last bits
