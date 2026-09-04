// The dashboard: what needs attention, and what the platform currently is.
//
// Every number here is a route somewhere, not decoration. If a count cannot
// be acted on from the tile it sits in, it should not be a tile.
//
// Nothing on this screen is derived from anybody's location, movements or
// attendance. None of those are stored by this platform, anywhere, so there
// is no version of this dashboard that could show them.

import { el, friendlyError } from '../../ui.js';
import * as store from '../../store.js';
import { publicNoticeView } from '../../notice-view.js';
import { renderAuditTable } from '../org.js';
import {
  sectionHead, emptyState, loading, errorState, statGrid, statTile, fmtDate,
} from './common.js';

const whenOf = (notice) => {
  const at = notice.janazahAt?.toDate ? notice.janazahAt.toDate() : notice.janazahAt;
  return at instanceof Date ? at.getTime() : 0;
};

export function renderDashboard(panel, actx) {
  const state = { orgs: null, notices: null, reports: null, audit: null, error: null };

  const head = () => sectionHead('Dashboard',
    'Where the platform stands, and what is waiting on somebody.');

  const body = el('div', { class: 'admin-body' });
  panel.replaceChildren(head(), loading());

  const paint = () => {
    panel.replaceChildren(head(), body);
    body.replaceChildren();

    if (state.error) { body.append(errorState(friendlyError(state.error, 'load'))); return; }
    if (!state.orgs || !state.notices) { body.append(loading()); return; }

    const pending = state.orgs.filter((o) => o.verificationStatus === 'pending');
    const awaiting = state.orgs.filter((o) => o.verificationStatus === 'needs_information');
    const verified = state.orgs.filter((o) => o.verificationStatus === 'verified');
    const suspended = state.orgs.filter((o) => o.verificationStatus === 'suspended');
    const archived = state.orgs.filter((o) => o.verificationStatus === 'archived');
    const openReports = (state.reports || []).filter((r) => r.status === 'open');

    const now = Date.now();
    const upcoming = state.notices
      .filter((n) => n.status === 'published' && whenOf(n) >= now)
      .sort((a, b) => whenOf(a) - whenOf(b));

    const staffAccounts = new Set(state.orgs.flatMap((o) => o.staffUids || []));

    body.append(statGrid([
      statTile({
        label: 'Verification requests',
        value: pending.length,
        note: awaiting.length ? `${awaiting.length} awaiting information` : 'nothing waiting',
        tone: pending.length ? 'admin-stat--attention' : '',
        onclick: () => actx.go('verification'),
      }),
      statTile({
        label: 'Open reports',
        value: state.reports ? openReports.length : null,
        note: openReports.some((r) => r.reason === 'family_takedown')
          ? 'includes a family takedown request'
          : 'nothing outstanding',
        tone: openReports.length ? 'admin-stat--attention' : '',
        onclick: () => actx.go('reports'),
      }),
      statTile({
        label: 'Upcoming Janazahs',
        value: upcoming.length,
        note: upcoming.length ? `next on ${fmtDate(upcoming[0].janazahAt)}` : 'none scheduled',
        onclick: () => actx.go('janazahs'),
      }),
      statTile({
        label: 'Verified organizations',
        value: verified.length,
        note: [
          suspended.length ? `${suspended.length} suspended` : 'none suspended',
          archived.length ? `${archived.length} archived` : null,
        ].filter(Boolean).join(', '),
        onclick: () => actx.go('organizations'),
      }),
      statTile({
        label: 'Coordinator accounts',
        value: staffAccounts.size,
        note: 'attached to an organization',
        onclick: () => actx.go('users'),
      }),
    ]));

    body.append(el('div', { class: 'admin-columns' }, [
      el('section', { class: 'admin-card' }, [
        el('div', { class: 'admin-card__head' }, [
          el('div', {}, [
            el('h2', { class: 'admin-card__title', text: 'Next Janazahs' }),
            el('p', { class: 'admin-card__sub muted', text:
              'The published notices closest to happening.' }),
          ]),
          el('button', {
            class: 'btn btn--small', onclick: () => actx.go('janazahs'),
          }, 'All notices'),
        ]),
        el('div', { class: 'admin-card__body' }, upcoming.length
          ? upcoming.slice(0, 5).map((notice) => el('div', { class: 'admin-mini' }, [
            publicNoticeView(notice, { compact: true }),
          ]))
          : [emptyState('No published Janazah notices are ahead of us.')]),
      ]),

      el('section', { class: 'admin-card' }, [
        el('div', { class: 'admin-card__head' }, [
          el('div', {}, [
            el('h2', { class: 'admin-card__title', text: 'Recent activity' }),
            el('p', { class: 'admin-card__sub muted', text:
              'The last few entries in the audit log.' }),
          ]),
          el('button', {
            class: 'btn btn--small', onclick: () => actx.go('audit'),
          }, 'Full log'),
        ]),
        el('div', { class: 'admin-card__body' }, [
          state.audit === null
            ? loading()
            : (state.audit.length
              ? renderAuditTable(state.audit.slice(0, 8))
              : emptyState('Nothing has been recorded yet.')),
        ]),
      ]),
    ]));

    if (pending.length) {
      body.append(el('section', { class: 'admin-card admin-card--urgent' }, [
        el('div', { class: 'admin-card__head' }, [
          el('div', {}, [
            el('h2', { class: 'admin-card__title', text:
              `${pending.length} registration${pending.length === 1 ? '' : 's'} waiting for review` }),
            el('p', { class: 'admin-card__sub muted', text:
              'None of these can publish a Janazah notice until somebody decides.' }),
          ]),
          el('button', {
            class: 'btn btn--small btn--primary', onclick: () => actx.go('verification'),
          }, 'Review them'),
        ]),
        el('div', { class: 'admin-card__body' }, [
          el('ul', { class: 'list list--plain' }, pending.slice(0, 5).map((org) => el('li', {}, [
            el('strong', { text: org.name }),
            el('span', { class: 'muted small', text: ` registered ${fmtDate(org.createdAt)}` }),
          ]))),
        ]),
      ]));
    }
  };

  paint();

  actx.watch(store.watchAllOrganizations((orgs, err) => {
    state.orgs = orgs || [];
    if (err) state.error = err;
    paint();
  }));
  actx.watch(store.watchAllNotices((notices, err) => {
    state.notices = notices || [];
    if (err) state.error = err;
    paint();
  }, 300));

  store.listReports(200)
    .then((reports) => { state.reports = reports; paint(); })
    .catch((err) => { console.error('listReports', err); state.reports = []; paint(); });
  store.auditRecent(20)
    .then((entries) => { state.audit = entries; paint(); })
    .catch((err) => { console.error('auditRecent', err); state.audit = []; paint(); });
}
