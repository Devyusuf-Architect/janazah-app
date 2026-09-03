// Furniture shared by every section of the admin portal.
//
// It exists so the eleven sections look like one tool rather than eleven
// screens that happen to sit behind the same sidebar. The heading size, the
// gap between cards, the shape of an empty state and the way a table scrolls
// are decided once here, and every section gets them by using these rather
// than by remembering to match.
//
// Nothing in this file reads or writes Firestore. Data access is store.js,
// for the whole app and for this portal too.

import { el, icon, friendlyError, skeleton } from '../../ui.js';

/**
 * The top of a section: what it is, one sentence on what it is for, and
 * whatever controls belong to the section as a whole.
 *
 * One h1 per section, sized as a working heading rather than a landing-page
 * one. The portal is a tool somebody is inside for an hour, not a page they
 * arrive at.
 */
export function sectionHead(title, subtitle, actions = []) {
  return el('header', { class: 'admin-head' }, [
    el('div', { class: 'admin-head__text' }, [
      el('h1', { class: 'admin-head__title', text: title }),
      subtitle ? el('p', { class: 'admin-head__sub', text: subtitle }) : null,
    ]),
    actions.length ? el('div', { class: 'admin-head__actions' }, actions) : null,
  ]);
}

/**
 * Nothing here, said in one line.
 *
 * Deliberately small. The old portal answered "no registrations are waiting"
 * with a three-inch dashed box in the middle of an empty page, which reads as
 * a fault rather than as the ordinary, common, good state of a review queue.
 */
export function emptyState(message, action = null) {
  return el('div', { class: 'admin-empty' }, [
    el('p', { text: message }),
    action,
  ]);
}

/**
 * A section's data has not arrived yet. Reuses the same skeleton-card
 * pattern the homepage and the public feed already show while a live
 * subscription is still connecting, rather than the bare "Loading…" text the
 * admin portal showed before - a screen with no visual weight reads as
 * broken more than it reads as "wait".
 */
export function loading(count = 3) {
  return el('div', { class: 'admin-loading' }, [skeleton(count)]);
}

export function errorState(message) {
  return el('p', { class: 'admin-error form-error', text: message });
}

/** A row of filters and a search box, laid out the same way in every section. */
export function toolbar(children) {
  return el('div', { class: 'admin-toolbar' }, children.filter(Boolean));
}

/**
 * A search field. Returns the wrapper; the caller reads `.value` off the
 * input it is handed in the callback.
 */
export function searchField(placeholder, onChange) {
  const input = el('input', {
    class: 'field admin-search__input',
    type: 'search',
    placeholder,
    'aria-label': placeholder,
  });
  input.addEventListener('input', () => onChange(input.value.trim()));
  return el('div', { class: 'admin-search' }, [icon('search', { size: 15 }), input]);
}

/**
 * A segmented filter. `options` is [{ value, label, count }]; count is shown
 * only when it is a number, so a filter over data that has not arrived yet
 * does not flash zeroes.
 *
 * The chip marks itself selected rather than waiting to be redrawn. Every
 * section here repaints its list on a filter change but leaves the toolbar
 * alone, deliberately: rebuilding it would throw away the search box, and
 * with it whatever the reviewer had typed and the cursor sitting in it. That
 * left the filter working but never looking chosen, which reads as a control
 * that did not respond.
 */
export function filterChips(options, active, onPick) {
  const group = el('div', { class: 'admin-chips', role: 'group' });
  const chips = options.map((opt, index) => el('button', {
    class: `admin-chip${opt.value === active ? ' admin-chip--active' : ''}`,
    type: 'button',
    'aria-pressed': String(opt.value === active),
    onclick: () => {
      chips.forEach((chip, i) => {
        chip.classList.toggle('admin-chip--active', i === index);
        chip.setAttribute('aria-pressed', String(i === index));
      });
      onPick(opt.value);
    },
  }, [
    el('span', { text: opt.label }),
    typeof opt.count === 'number'
      ? el('span', { class: 'admin-chip__count', text: String(opt.count) })
      : null,
  ].filter(Boolean)));
  group.append(...chips);
  return group;
}

/** One number worth knowing, with a route to whatever it counts. */
export function statTile({ label, value, note, tone = '', onclick = null }) {
  const children = [
    el('p', { class: 'admin-stat__value', text: value === null ? '–' : String(value) }),
    el('p', { class: 'admin-stat__label', text: label }),
    note ? el('p', { class: 'admin-stat__note', text: note }) : null,
  ].filter(Boolean);

  if (!onclick) return el('div', { class: `admin-stat ${tone}` }, children);
  return el('button', {
    class: `admin-stat admin-stat--link ${tone}`, type: 'button', onclick,
  }, children);
}

export const statGrid = (tiles) => el('div', { class: 'admin-stats' }, tiles);

/** A titled block within a section, so cards are not left floating loose. */
export function panelCard(title, children, { actions = [], subtitle = null } = {}) {
  return el('section', { class: 'admin-card' }, [
    title
      ? el('div', { class: 'admin-card__head' }, [
        el('div', {}, [
          el('h2', { class: 'admin-card__title', text: title }),
          subtitle ? el('p', { class: 'admin-card__sub muted', text: subtitle }) : null,
        ]),
        actions.length ? el('div', { class: 'admin-card__actions' }, actions) : null,
      ])
      : null,
    el('div', { class: 'admin-card__body' }, [].concat(children).filter(Boolean)),
  ]);
}

/**
 * A table that scrolls sideways rather than squeezing.
 *
 * The established pattern in this app (.table-scroll), reused rather than
 * reinvented: an admin table with eight columns on a phone has to go
 * somewhere, and shrinking the type until it fits is the one option that
 * helps nobody.
 */
export function dataTable(headings, rows) {
  return el('div', { class: 'table-scroll' }, [
    el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, headings.map((h) => el('th', { text: h })))),
      el('tbody', {}, rows),
    ]),
  ]);
}

const DATE_OPTS = { year: 'numeric', month: 'short', day: 'numeric' };
const TIME_OPTS = { ...DATE_OPTS, hour: 'numeric', minute: '2-digit' };

const asDate = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export function fmtDate(value, fallback = 'not recorded') {
  const date = asDate(value);
  return date ? date.toLocaleDateString('en-CA', DATE_OPTS) : fallback;
}

export function fmtDateTime(value, fallback = 'not recorded') {
  const date = asDate(value);
  return date ? date.toLocaleString('en-CA', TIME_OPTS) : fallback;
}

export { asDate };

/** Short, stable identifier display. A raw uid in a table is unreadable. */
export function uidChip(uid) {
  if (!uid) return el('span', { class: 'muted', text: 'unknown' });
  return el('span', { class: 'mono admin-uid', title: uid, text: uid });
}

/**
 * A note explaining a limit of the portal itself, rather than of the data.
 *
 * Used where a section is honestly incomplete. Saying so in place is better
 * than a screen that looks authoritative and quietly is not.
 */
export const caveat = (text) => el('p', { class: 'admin-caveat' }, text);

/**
 * What to show an administrator when an action they took did not work.
 *
 * A callable Cloud Function writes its own refusals for the person reading
 * them: "no Ta'ziyah account exists for that address" says exactly what to do
 * next, and replacing it with a generic line would throw that away. Anything
 * else, in practice a Firestore write refused by the rules, goes through the
 * admin message in ui.js, which names the real cause (rules older than the
 * app) rather than blaming the account.
 */
export function actionError(err) {
  if (typeof err?.code === 'string' && err.code.startsWith('functions/')) {
    return err.message || 'That did not work. Please try again.';
  }
  return friendlyError(err, 'admin');
}
