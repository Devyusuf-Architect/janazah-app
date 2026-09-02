// The audit log: everything that has ever been done, and by whom.
//
// Append-only, and not by convention. firestore.rules forbids create, update
// and delete on /auditLog to every caller without exception, so no account,
// administrator included, can add an entry or remove one. Entries are written
// by Cloud Functions triggers through the Admin SDK, which fire on the
// document write itself: there is no code path in this app that changes a
// notice, an organization, a staff request or a report without producing one.

import { el, friendlyError } from '../../ui.js';
import { renderAuditTable } from '../org.js';
import * as store from '../../store.js';
import {
  sectionHead, emptyState, loading, errorState, toolbar, searchField, filterChips,
} from './common.js';

const GROUPS = [
  { value: 'all', label: 'Everything', match: () => true },
  { value: 'notice', label: 'Notices', match: (a) => a.startsWith('notice.') },
  { value: 'org', label: 'Organizations', match: (a) => a.startsWith('org.') },
  { value: 'staff', label: 'Staff', match: (a) => a.startsWith('staff.') },
  { value: 'report', label: 'Reports', match: (a) => a.startsWith('report.') },
  {
    value: 'notification',
    label: 'Notifications',
    match: (a) => a.startsWith('notification.'),
  },
  {
    value: 'admin',
    label: 'Administration',
    match: (a) => a.startsWith('admin.'),
  },
];

export function renderAudit(panel, actx) {
  const state = { entries: null, error: null, group: 'all', term: '' };

  const head = () => sectionHead('Audit log',
    'Written by the server on every change. No account can add to it, edit it '
    + 'or delete from it, this one included.');

  const body = el('div', { class: 'admin-body' });

  const paint = () => {
    panel.replaceChildren(
      head(),
      toolbar([
        searchField('Search by action, account or target', (term) => {
          state.term = term.toLowerCase();
          paintBody();
        }),
        filterChips(GROUPS.map((g) => ({
          value: g.value,
          label: g.label,
          count: state.entries
            ? state.entries.filter((e) => g.match(e.action || '')).length
            : undefined,
        })), state.group, (value) => { state.group = value; paintBody(); }),
      ]),
      body,
    );
    paintBody();
  };

  const paintBody = () => {
    body.replaceChildren();
    if (state.error) { body.append(errorState(friendlyError(state.error, 'load'))); return; }
    if (!state.entries) { body.append(loading()); return; }

    const group = GROUPS.find((g) => g.value === state.group);
    const matches = state.entries
      .filter((e) => group.match(e.action || ''))
      .filter((e) => !state.term || [
        e.action, e.actorEmail, e.actorUid, e.targetType, e.targetId, e.orgId,
      ].filter(Boolean).join(' ').toLowerCase().includes(state.term));

    if (!matches.length) {
      body.append(emptyState(state.entries.length
        ? 'No entries match this filter.'
        : 'Nothing has been recorded yet.'));
      return;
    }

    body.append(renderAuditTable(matches));
    body.append(el('p', { class: 'hint' },
      `${matches.length} of the ${state.entries.length} most recent entries.`));
  };

  paint();
  store.auditRecent(300)
    .then((entries) => { state.entries = entries; paint(); })
    .catch((err) => { state.error = err; paint(); });

  actx.watch(() => {});
}
