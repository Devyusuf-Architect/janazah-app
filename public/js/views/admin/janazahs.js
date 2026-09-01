// Janazahs: every notice on the platform, including the ones no visitor can
// see.
//
// What an administrator can do here is bounded by firestore.rules, not by
// which buttons this file draws. There are exactly three writes: correct the
// text of a notice, hide it by returning it to a draft, and cancel it. All
// three go through store.js, all three advance the version counter by one so
// a simultaneous edit by the masjid fails loudly rather than being
// overwritten, and all three are recorded by the audit trigger watching the
// notice document, which no code on this screen can reach or skip.
//
// Cancellation stays terminal and stays the organization's own language for
// what it means: the notice remains readable so that anybody holding a shared
// link sees the cancellation instead of a dead page. Hiding is the smaller,
// reversible action, and it reuses the draft status rather than inventing a
// second notion of hidden.

import { el, toast, friendlyError, askReason, showModal, readForm } from '../../ui.js';
import { publicNoticeView } from '../../notice-view.js';
import {
  formatJanazahTime, timeZoneOptions, defaultTimeZone, toLocalInputValue,
} from '../../model.js';
import * as store from '../../store.js';
import {
  sectionHead, emptyState, loading, errorState, toolbar, searchField, filterChips,
  fmtDateTime,
} from './common.js';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Hidden and drafts' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_TONE = { published: 'ok', cancelled: 'error', draft: 'muted' };
const STATUS_WORD = { published: 'published', cancelled: 'cancelled', draft: 'not public' };

const whenOf = (notice) => {
  const at = notice.janazahAt?.toDate ? notice.janazahAt.toDate() : notice.janazahAt;
  return at instanceof Date ? at.getTime() : 0;
};

export function renderJanazahs(panel, actx) {
  const state = { notices: null, error: null, status: 'all', when: 'all', term: '' };

  const head = () => sectionHead('Janazahs',
    'Every notice published through Ta’ziyah, drafts and cancellations '
    + 'included. Corrections here are recorded against your account.');

  const body = el('div', { class: 'admin-body' });

  const paint = () => {
    panel.replaceChildren(
      head(),
      toolbar([
        searchField('Search by name, masjid, venue or id', (term) => {
          state.term = term.toLowerCase();
          paintBody();
        }),
        filterChips(STATUS_FILTERS.map((f) => ({
          ...f,
          count: state.notices
            ? state.notices.filter((n) => f.value === 'all' || n.status === f.value).length
            : undefined,
        })), state.status, (value) => { state.status = value; paintBody(); }),
        filterChips([
          { value: 'all', label: 'Any date' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ], state.when, (value) => { state.when = value; paintBody(); }),
      ]),
      body,
    );
    paintBody();
  };

  const paintBody = () => {
    body.replaceChildren();
    if (state.error) { body.append(errorState(friendlyError(state.error, 'load'))); return; }
    if (!state.notices) { body.append(loading()); return; }

    const now = Date.now();
    const matches = state.notices
      .filter((n) => state.status === 'all' || n.status === state.status)
      .filter((n) => state.when === 'all'
        || (state.when === 'upcoming' ? whenOf(n) >= now : whenOf(n) < now))
      .filter((n) => !state.term || [
        n.deceasedName, n.orgName, n.prayerLocation?.name, n.prayerLocation?.address, n.id,
      ].filter(Boolean).join(' ').toLowerCase().includes(state.term));

    if (!matches.length) {
      body.append(emptyState(state.notices.length
        ? 'No Janazah notices match this filter.'
        : 'No Janazah notices have been published yet.'));
      return;
    }

    for (const notice of matches) body.append(noticeRow(notice, actx));
  };

  paint();
  actx.watch(store.watchAllNotices((notices, err) => {
    state.notices = notices || [];
    state.error = err || null;
    paint();
  }));
}

function noticeRow(notice, actx) {
  return el('article', { class: 'admin-row' }, [
    el('div', { class: 'admin-row__main' }, [
      el('div', { class: 'admin-row__title' }, [
        el('h3', {
          text: notice.deceasedName && notice.showDeceasedName
            ? `Janazah for ${notice.deceasedName}`
            : 'Janazah notice',
        }),
        el('span', {
          class: `badge badge--${STATUS_TONE[notice.status] || 'muted'}`,
          text: STATUS_WORD[notice.status] || notice.status,
        }),
      ]),
      el('p', { class: 'admin-row__meta muted small' }, [
        el('span', { text: notice.orgName || 'organization not named' }),
        el('span', { text: formatJanazahTime(notice) }),
        el('span', { text: notice.prayerLocation?.name || 'no venue' }),
      ]),
      notice.cancelReason
        ? el('p', { class: 'admin-row__note', text: `Cancelled: ${notice.cancelReason}` })
        : null,
    ]),
    el('div', { class: 'admin-row__actions' }, [
      el('button', {
        class: 'btn btn--small', onclick: () => openNotice(notice, actx),
      }, 'Open'),
    ]),
  ]);
}

/** One notice in full, with everything an administrator may do to it. */
function openNotice(notice, actx) {
  const body = el('div', { class: 'admin-detail' });
  showModal(notice.orgName ? `Notice from ${notice.orgName}` : 'Janazah notice',
    body, { wide: true });

  const views = {
    Notice: () => detailPane(notice, actx),
    History: () => historyPane(notice),
  };

  let active = 'Notice';
  const pane = el('div', { class: 'admin-detail__pane' });
  const tabs = el('div', { class: 'admin-subtabs' });

  const paint = () => {
    tabs.replaceChildren(...Object.keys(views).map((name) => el('button', {
      class: `admin-subtab${name === active ? ' admin-subtab--active' : ''}`,
      type: 'button',
      'aria-pressed': String(name === active),
      onclick: () => { active = name; paint(); },
    }, name)));
    pane.replaceChildren(loading());
    Promise.resolve(views[active]())
      .then((node) => pane.replaceChildren(node))
      .catch((err) => pane.replaceChildren(errorState(friendlyError(err, 'load'))));
  };

  body.replaceChildren(tabs, pane);
  paint();
}

function detailPane(notice, actx) {
  return el('div', {}, [
    publicNoticeView(notice),
    el('dl', { class: 'admin-kv' }, [
      ['Status', STATUS_WORD[notice.status] || notice.status],
      ['Organization', `${notice.orgName || 'not named'} (${notice.orgId})`],
      ['Notice id', notice.id],
      ['Version', String(notice.version || 1)],
      ['Created', fmtDateTime(notice.createdAt)],
      ['Published', notice.publishedAt ? fmtDateTime(notice.publishedAt) : 'never'],
      ['Last edited', notice.updatedAt ? fmtDateTime(notice.updatedAt) : 'never'],
      ['Last edited by', notice.lastEditedBy || 'nobody'],
    ].flatMap(([label, value]) => [
      el('dt', { text: label }),
      el('dd', {
        class: ['Notice id', 'Organization', 'Last edited by'].includes(label) ? 'mono' : '',
        text: value,
      }),
    ])),
    // Family contacts and internal coordination notes live in the notice's
    // private subcollection. They are not read here, and not shown here: an
    // administrator moderating a public notice has no need of the family's
    // phone number, and a screen that displays it every time somebody opens a
    // notice turns "available if genuinely needed" into "routinely on show".
    el('p', { class: 'admin-caveat' },
      'Family contacts and the organization’s internal notes are not shown '
      + 'here. Moderating a public notice does not require them.'),
    el('div', { class: 'admin-actions' }, noticeActions(notice, actx)),
  ]);
}

function noticeActions(notice, actx) {
  const actions = [];
  const refresh = () => actx?.refresh?.();

  if (notice.status !== 'cancelled') {
    actions.push(el('button', {
      class: 'btn btn--small btn--primary',
      onclick: () => correctNotice(notice, refresh),
    }, 'Correct the details'));
  }

  if (notice.status === 'published') {
    actions.push(el('button', {
      class: 'btn btn--small',
      onclick: () => setVisibility(notice, false, refresh),
    }, 'Hide from the feed'));
  }

  if (notice.status === 'draft') {
    actions.push(el('button', {
      class: 'btn btn--small',
      onclick: () => setVisibility(notice, true, refresh),
    }, 'Restore to the feed'));
  }

  if (notice.status === 'published') {
    actions.push(el('button', {
      class: 'btn btn--small btn--danger',
      onclick: () => takeDown(notice, refresh),
    }, 'Cancel the notice'));
  }

  actions.push(el('a', {
    class: 'btn btn--small', href: `/n/${notice.id}`,
    target: '_blank', rel: 'noopener noreferrer',
  }, 'Open the public page'));

  return actions;
}

async function setVisibility(notice, visible, refresh) {
  const reason = await askReason({
    title: visible ? 'Restore this notice to the feed?' : 'Hide this notice from the feed?',
    body: visible
      ? 'It becomes public again immediately, at the same link.'
      : 'It stops appearing in the feed and stops being publicly readable, and '
        + 'can be restored. Use this while something is being checked. If the '
        + 'Janazah is genuinely not happening, cancel it instead, so that '
        + 'anybody holding the link is told.',
    label: 'Why? (recorded in the audit trail)',
    confirmText: visible ? 'Restore it' : 'Hide it',
  });
  if (reason === null) return;
  try {
    await store.adminSetNoticeVisibility(notice.id, notice, visible);
    toast(visible ? 'Notice restored to the feed.' : 'Notice hidden from the feed.');
    refresh();
  } catch (err) {
    console.error('adminSetNoticeVisibility', err);
    toast(friendlyError(err), 'error');
  }
}

async function takeDown(notice, refresh) {
  const reason = await askReason({
    title: 'Cancel this notice?',
    body: 'It is marked cancelled and stays visible so that anyone holding the '
        + 'link sees the cancellation. This cannot be undone.',
    label: 'Reason shown to the community',
    confirmText: 'Cancel the notice',
  });
  if (reason === null) return;
  try {
    await store.cancelNotice(notice.id, notice, reason, { asAdmin: true });
    toast('Notice cancelled.');
    refresh();
  } catch (err) {
    toast(friendlyError(err), 'error');
  }
}

/**
 * Correcting somebody else's notice.
 *
 * The correction note is required rather than optional. It is shown to
 * everybody reading the notice, and a funeral notice that quietly changes
 * under a family is worse than one that says what changed and when.
 *
 * The map coordinates are not editable here. Correcting the wording of an
 * address is a typo fix; moving the pin is a different venue, and that
 * belongs to the organization's own composer, which has the address picker.
 */
function correctNotice(notice, refresh) {
  const at = notice.janazahAt?.toDate ? notice.janazahAt.toDate() : notice.janazahAt;
  const zones = timeZoneOptions();

  const form = el('form', { class: 'admin-form' }, [
    field('deceasedName', 'Name of the deceased', notice.deceasedName || ''),
    el('label', { class: 'check' }, [
      el('input', {
        type: 'checkbox', name: 'showDeceasedName', id: 'showDeceasedName',
        ...(notice.showDeceasedName ? { checked: true } : {}),
      }),
      el('span', { text: 'Show the name publicly' }),
    ]),
    field('janazahAt', 'Janazah date and prayer time',
      at instanceof Date ? toLocalInputValue(at) : '', { type: 'datetime-local' }),
    el('div', { class: 'field-group' }, [
      el('label', { class: 'label', for: 'timeZone', text: 'Time zone' }),
      el('select', { class: 'field', id: 'timeZone', name: 'timeZone' },
        zones.map((zone) => el('option', {
          value: zone,
          ...(zone === defaultTimeZone(notice.timeZone, zones) ? { selected: true } : {}),
        }, zone))),
    ]),
    field('prayerName', 'Prayer location name', notice.prayerLocation?.name || ''),
    field('prayerAddress', 'Prayer location address', notice.prayerLocation?.address || ''),
    notice.burialLocation
      ? field('burialName', 'Burial location name', notice.burialLocation.name || '')
      : null,
    notice.burialLocation
      ? field('burialAddress', 'Burial location address', notice.burialLocation.address || '')
      : null,
    field('instructions', 'Instructions', notice.instructions || '', { textarea: true }),
    field('correctionNote', 'What changed, shown on the notice', '', { textarea: true }),
    el('p', { class: 'hint' },
      'Map coordinates stay as the organization set them. If the venue itself '
      + 'is wrong, hide the notice and ask them to republish it.'),
  ]);

  const error = el('p', { class: 'form-error', hidden: true });
  const save = el('button', { class: 'btn btn--primary', type: 'button' }, 'Save the correction');
  const close = showModal(`Correct: ${notice.orgName || 'notice'}`,
    el('div', {}, [form, error]), {
      wide: true,
      actions: [el('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Back'), save],
    });

  save.addEventListener('click', async () => {
    const values = readForm(form);
    const when = new Date(values.janazahAt);
    if (Number.isNaN(when.getTime())) {
      error.hidden = false;
      error.textContent = 'Enter a valid Janazah date and prayer time.';
      return;
    }
    if (!values.correctionNote.trim()) {
      error.hidden = false;
      error.textContent = 'Say what changed. It is shown on the notice and '
        + 'recorded in the audit trail.';
      return;
    }
    if (!values.prayerName.trim() || !values.prayerAddress.trim()) {
      error.hidden = false;
      error.textContent = 'A notice needs a prayer location name and address.';
      return;
    }

    const patch = {
      deceasedName: values.deceasedName.trim() || null,
      showDeceasedName: !!values.showDeceasedName,
      janazahAt: when,
      timeZone: values.timeZone,
      instructions: values.instructions.trim(),
      prayerLocation: {
        ...notice.prayerLocation,
        name: values.prayerName.trim(),
        address: values.prayerAddress.trim(),
      },
    };
    if (notice.burialLocation) {
      patch.burialLocation = {
        ...notice.burialLocation,
        name: values.burialName.trim(),
        address: values.burialAddress.trim(),
      };
    }

    save.disabled = true;
    try {
      await store.adminCorrectNotice(notice.id, notice, patch, values.correctionNote);
      toast('Notice corrected.');
      close();
      refresh();
    } catch (err) {
      console.error('adminCorrectNotice', err);
      error.hidden = false;
      error.textContent = friendlyError(err);
      save.disabled = false;
    }
  });
}

function field(name, label, value, { type = 'text', textarea = false } = {}) {
  const input = textarea
    ? el('textarea', { class: 'field', id: name, name, rows: 3 })
    : el('input', { class: 'field', id: name, name, type });
  input.value = value;
  return el('div', { class: 'field-group' }, [
    el('label', { class: 'label', for: name, text: label }),
    input,
  ]);
}

async function historyPane(notice) {
  const entries = await store.auditForNotice(notice.orgId, notice.id, 200);
  if (!entries.length) {
    return emptyState('Nothing has been recorded against this notice yet. Entries '
      + 'are written by the server a moment after each change.');
  }
  const { renderAuditTable } = await import('../org.js');
  return el('div', {}, [
    el('p', { class: 'hint' },
      'Written by the server on every change to this notice. Append-only: no '
      + 'account, administrator or otherwise, can edit or delete an entry.'),
    renderAuditTable(entries),
  ]);
}
