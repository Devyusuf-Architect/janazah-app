// The public community feed. No account, no location, no tracking.
//
// Phase 2 scope: see current and upcoming Janazahs, follow specific masjids,
// open directions, share a notice, and report one that looks wrong. Nearby
// matching is Phase 3 and notifications are Phase 4; nothing here depends on
// either, and no user location is read or stored.

import { applyPageMeta } from '../seo.js';
import { el, icon, skeleton, toast, friendlyError, showModal } from '../ui.js';
import { formatJanazahTime } from '../model.js';
import { formatDistance } from '../geo.js';
import { publicNoticeView } from '../notice-view.js';
import { FAMILY_TAKEDOWN_TARGET } from '../takedown-policy.js';
import * as follows from '../follows.js';
import * as loc from '../location.js';
import * as alerts from '../alerts.js';
import * as push from '../push.js';
import * as store from '../store.js';

const REPORT_REASONS = [
  // Listed first: a family asking for their own relative's notice to come
  // down is the most time-sensitive reason on this list, and should be the
  // first thing a distressed person sees rather than something they have to
  // find at the bottom of a dropdown.
  { value: 'family_takedown', label: 'I am family, and I am asking for this to come down' },
  { value: 'incorrect_details', label: 'The details are wrong' },
  { value: 'already_cancelled', label: 'This Janazah was cancelled' },
  { value: 'duplicate', label: 'Duplicate of another notice' },
  { value: 'privacy', label: 'Shares something the family did not approve' },
  { value: 'fraudulent', label: 'I believe this notice is fake' },
  { value: 'other', label: 'Something else' },
];

let unwatch = null;
let notices = [];
// What was typed into the filter, kept across a trip into a notice and back
// so returning does not mean retyping it.
let query = '';

export function teardownFeed() {
  if (unwatch) { unwatch(); unwatch = null; }
}

// ---------------------------------------------------------------- date groups

/** Calendar date in the notice's own zone, so an evening prayer does not
 *  slide into the wrong day for a reader in another province. */
function dateKey(notice) {
  const date = notice.janazahAt?.toDate ? notice.janazahAt.toDate() : notice.janazahAt;
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      timeZone: notice.timeZone,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function dateHeading(notice) {
  const date = notice.janazahAt?.toDate ? notice.janazahAt.toDate() : notice.janazahAt;
  const zone = notice.timeZone;
  const label = (() => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: zone,
      }).format(date);
    } catch {
      return date.toDateString();
    }
  })();

  const todayKey = (() => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone,
      }).format(new Date());
    } catch {
      return '';
    }
  })();

  if (dateKey(notice) === todayKey) return `Today, ${label}`;
  return label;
}

function groupByDate(list) {
  const groups = new Map();
  for (const notice of list) {
    const key = dateKey(notice);
    if (!groups.has(key)) groups.set(key, { heading: dateHeading(notice), items: [] });
    groups.get(key).items.push(notice);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);
}

// ---------------------------------------------------------------------- render

/**
 * Current and upcoming Janazah notices, and nothing else.
 *
 * This page used to carry its own bar of four tabs: All notices, Near me,
 * Masjids I follow, and Manage follows. Three of those already had their own
 * address and their own row in the sidebar, and "Near me" was the same
 * component this one is, rendered through a filter instead of a route. So a
 * reader had two navigation systems for the same ideas and no way to tell
 * whether the sidebar's "Near Me" and the tab called "Near me" were different
 * things. They were not.
 *
 * What is left is one job: browse what is coming up, and narrow it by typing.
 * Nearby is /near-me, the masjids you follow are /following, and following
 * one is a button on a masjid wherever a masjid appears.
 */
export function renderFeed(mount) {
  teardownFeed();
  mount.replaceChildren();

  mount.append(el('div', { class: 'feed-intro' }, [
    el('h1', { text: 'Current and upcoming Janazahs' }),
    el('p', { class: 'muted' },
      'Published by verified masjids and funeral coordinators. No account ' +
      'needed.'),
  ]));

  // The filter that replaced four tabs. It survives a trip to a notice and
  // back, because retyping what you were looking for after reading one notice
  // is the sort of small loss that makes a site feel like it is resisting you.
  const search = el('input', {
    class: 'field feed-search__input',
    type: 'search',
    id: 'feed-search',
    placeholder: 'Masjid, city or postal code',
    autocomplete: 'off',
    value: query,
  });
  search.setAttribute('aria-label', 'Filter Janazahs by masjid, city or postal code');
  search.addEventListener('input', () => { query = search.value; paint(); });

  const list = el('div', { class: 'stack' });
  mount.append(
    el('div', { class: 'feed-search' }, [icon('search', { size: 17 }), search]),
    list,
  );

  const paint = () => {
    list.replaceChildren();
    const visible = matching(notices, query);

    if (!visible.length) {
      list.append(el('div', { class: 'empty' }, notices.length
        ? [
          el('h2', { text: 'Nothing matches that' }),
          el('p', { text: 'Try a masjid name, a city, or a postal code.' }),
        ]
        : [
          el('h2', { text: 'No current or upcoming Janazahs' }),
          el('p', { text: 'New notices appear here when verified masjids publish them.' }),
        ]));
      return;
    }

    // When location is on, each notice shows how far away it is. The distance
    // is computed here in the browser and never sent anywhere.
    const settings = loc.settings();
    const from = settings.enabled ? settings.last : null;

    for (const group of groupByDate(visible)) {
      list.append(el('h2', { class: 'date-heading', text: group.heading }));
      for (const notice of group.items) {
        const km = loc.noticeDistanceKm(notice, from);
        list.append(feedCard(notice, onFollowChange,
          km === null ? null : formatDistance(km)));
      }
    }
  };

  // Following a masjid from a card changes which topics this device receives.
  // It no longer changes what is on this page, so there is nothing to repaint.
  const onFollowChange = () => {
    push.syncTopics().catch((err) => console.error('syncTopics', err));
  };

  unwatch = store.watchPublicNotices((incoming) => {
    const first = notices.length === 0;
    notices = incoming;
    // Exposed for the alert toggle, so switching alerts on can mark what is
    // already on screen as seen instead of firing for all of it at once.
    window.__janazahNotices = incoming;

    const settings = loc.settings();
    if (settings.enabled && settings.last) {
      if (first && !settings.alertsEnabled) {
        alerts.primeSeen(incoming);
      } else if (settings.alertsEnabled) {
        const raised = alerts.alertOnNew(incoming, settings.last, settings.radiusKm);
        if (raised.length) {
          toast(`${raised.length} new Janazah${raised.length > 1 ? 's' : ''} near you.`);
        }
      }
    }
    paint();
  });

  list.append(skeleton(3));
}

/** Postal codes get typed with and without the space; compare without it. */
const normalize = (value) => String(value || '').toLowerCase().replace(/\s+/g, '');

/** The same fields the home page's finder searches, so both agree. */
function matching(all, text) {
  const needle = normalize(text);
  if (needle.length < 2) return all;
  return all.filter((notice) => normalize([
    notice.orgName, notice.prayerLocation?.name, notice.prayerLocation?.address,
    notice.burialLocation?.name, notice.burialLocation?.address,
    // Same gate the display uses: a name search can only ever surface a name
    // the family already agreed to show publicly.
    notice.showDeceasedName ? notice.deceasedName : null,
  ].filter(Boolean).join(' ')).includes(needle));
}

/**
 * The follow control. Its visible label stays short so a phone card is not a
 * wall of text, while the accessible name keeps the masjid in it so screen
 * reader users know which one they are following.
 */
function followButton(notice, onFollowChange) {
  const paint = (button, following) => {
    button.replaceChildren(
      icon('bookmark', { size: 15 }),
      el('span', { text: following ? 'Following' : 'Follow' }));
    button.setAttribute('aria-label',
      following ? `Following ${notice.orgName}` : `Follow ${notice.orgName}`);
    button.classList.toggle('btn--active', following);
  };

  const button = el('button', {
    class: 'btn btn--small',
    onclick: () => {
      if (!follows.storageAvailable()) {
        toast('Your browser is blocking local storage, so follows cannot be saved.', 'warn');
        return;
      }
      const following = follows.toggleFollow(notice.orgId);
      paint(button, following);
      toast(following ? `Following ${notice.orgName}.` : `Unfollowed ${notice.orgName}.`);
      onFollowChange();
    },
  });
  paint(button, follows.isFollowing(notice.orgId));
  return button;
}

export function feedCard(notice, onFollowChange = () => {}, distanceLabel = null) {
  const started = (() => {
    const at = notice.janazahAt?.toDate ? notice.janazahAt.toDate() : notice.janazahAt;
    return at && at.getTime() < Date.now();
  })();

  const card = el('div', { class: `card notice-card notice-card--${notice.status} reveal` }, [
    started && notice.status !== 'cancelled'
      ? el('p', { class: 'notice-strip notice-strip--muted', text: 'This prayer time has passed.' })
      : null,
    publicNoticeView(notice, { compact: true, distanceLabel }),
    el('div', { class: 'card-actions' }, [
      followButton(notice, onFollowChange),
      el('button', { class: 'btn btn--small', onclick: () => shareNotice(notice) },
        [icon('share', { size: 15 }), el('span', { text: 'Share' })]),
      el('a', { class: 'btn btn--small', href: `/n/${notice.id}` },
        [icon('eye', { size: 15 }), el('span', { text: 'Open' })]),
      el('button', {
        class: 'btn btn--small btn--quiet',
        onclick: () => openReport(notice),
      }, [icon('flag', { size: 15 }), el('span', { text: 'Report a problem' })]),
    ]),
  ]);
  return card;
}

// ------------------------------------------------------------- single notice

export async function renderSingleNotice(mount, noticeId) {
  teardownFeed();
  mount.replaceChildren(skeleton(1));

  let notice;
  try {
    notice = await store.getNotice(noticeId);
  } catch (err) {
    mount.replaceChildren(el('div', { class: 'empty' }, [
      el('p', { class: 'form-error', text: friendlyError(err) }),
      el('a', { class: 'btn', href: '/janazahs' }, 'Back to all notices'),
    ]));
    return;
  }

  if (!notice) {
    mount.replaceChildren(el('div', { class: 'empty' }, [
      el('h1', { text: 'Notice not found' }),
      el('p', { class: 'muted' },
        'This notice may have been removed, or the link may be incomplete.'),
      el('a', { class: 'btn', href: '/janazahs' }, 'See current Janazahs'),
    ]));
    return;
  }

  // Titled for the person reading it, and kept out of search results: a
  // notice is public because the community needs it today, which is not the
  // same as wanting a permanent search result for somebody's death. The
  // noindex comes from NOINDEX_PREFIXES in seo.js.
  applyPageMeta(location.pathname, {
    title: notice.showDeceasedName && notice.deceasedName
      ? `Janazah for ${notice.deceasedName}`
      : `Janazah notice from ${notice.orgName}`,
    description: `Janazah notice published by ${notice.orgName}.`,
  });

  const following = follows.isFollowing(notice.orgId);
  mount.replaceChildren(
    el('a', { class: 'btn btn--link', href: '/janazahs' },
      [icon('arrowLeft', { size: 15 }), el('span', { text: 'All notices' })]),
    el('div', { class: 'card' }, [
      publicNoticeView(notice),
      el('div', { class: 'card-actions' }, [
        el('button', {
          class: `btn${following ? ' btn--active' : ''}`,
          onclick: (event) => {
            const now = follows.toggleFollow(notice.orgId);
            event.target.textContent = now
              ? `Following ${notice.orgName}`
              : `Follow ${notice.orgName}`;
            event.target.classList.toggle('btn--active', now);
          },
        }, following ? `Following ${notice.orgName}` : `Follow ${notice.orgName}`),
        el('button', { class: 'btn', onclick: () => shareNotice(notice) }, 'Share'),
        el('button', {
          class: 'btn btn--quiet',
          onclick: () => openReport(notice),
        }, 'Report a problem'),
      ]),
    ]),
  );
}

// -------------------------------------------------------------------- sharing

async function shareNotice(notice) {
  const url = `${location.origin}/n/${notice.id}`;
  const title = notice.showDeceasedName && notice.deceasedName
    ? `Janazah for ${notice.deceasedName}`
    : 'Janazah notice';
  const text = [
    title,
    `${notice.orgName}`,
    formatJanazahTime(notice),
    notice.prayerLocation?.address,
  ].filter(Boolean).join('\n');

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      toast('Shared.');
      return;
    } catch (err) {
      // A user cancelling the share sheet is not a failure, and not
      // something worth a toast either: they changed their mind, they did
      // not hit an error.
      if (err?.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Notice copied. Paste it wherever you like.');
  } catch {
    showModal('Share this notice', el('div', {}, [
      el('p', { class: 'muted', text: 'Copy the text below.' }),
      el('textarea', { class: 'field', rows: 6, readonly: true }, `${text}\n${url}`),
    ]));
  }
}

// ------------------------------------------------------------------ reporting

function openReport(notice) {
  const error = el('p', { class: 'form-error', hidden: true });
  const select = el('select', { class: 'field', id: 'report-reason' },
    REPORT_REASONS.map((r) => el('option', { value: r.value, text: r.label })));
  const detail = el('textarea', {
    class: 'field', rows: 3, id: 'report-detail', maxlength: 1000,
    placeholder: 'What is wrong? Anything specific helps the administrator check quickly.',
  });

  // A family takedown request is the one reason on this list where the
  // person submitting is often not in a state to fill out a careful form, and
  // where a generic "we'll look at it" is not reassuring. Swap the copy
  // around it, rather than a separate flow, so this stays one small form
  // rather than two.
  const familyNote = el('p', {
    class: 'notice-strip notice-strip--warn',
    hidden: true,
  }, `A platform administrator aims to review family takedown requests within ` +
     `${FAMILY_TAKEDOWN_TARGET}. If you can, say which notice this is about and ` +
     `how you are connected to the family in the details below; it helps the ` +
     `request move faster, but is not required.`);

  const syncFamilyNote = () => {
    familyNote.hidden = select.value !== 'family_takedown';
  };
  select.addEventListener('change', syncFamilyNote);
  syncFamilyNote();

  const backdrop = el('div', { class: 'modal-backdrop' });
  const close = () => backdrop.remove();
  const submit = el('button', { class: 'btn btn--primary' }, 'Send report');

  submit.addEventListener('click', async () => {
    error.hidden = true;
    submit.disabled = true;
    try {
      await store.submitReport(notice.id, select.value, detail.value);
      close();
      toast(select.value === 'family_takedown'
        ? `Request sent. A platform administrator aims to review it within ${FAMILY_TAKEDOWN_TARGET}.`
        : 'Report sent. A platform administrator will look at it.');
    } catch (err) {
      error.hidden = false;
      error.textContent =
        err?.code === 'auth/operation-not-allowed' || err?.code === 'auth/admin-restricted-operation'
          ? 'Reporting is not available yet: anonymous sign-in is not enabled ' +
            'on this Firebase project. See docs/phase-2-notes.md.'
          : friendlyError(err);
      submit.disabled = false;
    }
  });

  backdrop.append(el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
    el('h2', { text: 'Report a problem with this notice' }),
    el('p', { class: 'muted' },
      'This goes to a platform administrator, not to the masjid. Nothing ' +
      'identifying you is collected beyond an anonymous session used to stop ' +
      'the form being abused.'),
    el('label', { class: 'label', for: 'report-reason', text: 'What is the problem?' }),
    select,
    familyNote,
    el('label', { class: 'label', for: 'report-detail', text: 'Details (optional)' }),
    detail,
    error,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn', onclick: close }, 'Cancel'),
      submit,
    ]),
  ]));
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
}
