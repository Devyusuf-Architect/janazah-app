// Reports: what the community and the system have flagged.
//
// Two sources, one queue. A community member files a report over an anonymous
// session; the notification pipeline files one itself when an organization
// trips its rate limit (functions/lib/limits.js), which is the signature of a
// compromised coordinator account. Resolving or dismissing one writes to the
// report document, and the audit trigger watching that collection records the
// outcome against the administrator who decided it.

import { el, toast, friendlyError, askReason } from '../../ui.js';
import * as store from '../../store.js';
import {
  sectionHead, emptyState, loading, errorState, toolbar, filterChips, fmtDateTime,
} from './common.js';

export const REPORT_REASON_LABELS = {
  family_takedown: 'Family takedown request',
  incorrect_details: 'Details are wrong',
  already_cancelled: 'Already cancelled',
  duplicate: 'Duplicate notice',
  privacy: 'Shares something unapproved',
  fraudulent: 'Believed fake',
  rate_limit: 'Notification rate limit tripped',
  other: 'Other',
};

const STATUS_TONE = { open: 'warn', resolved: 'ok', dismissed: 'muted' };

const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

export function renderReports(panel, actx) {
  const state = { reports: null, error: null, filter: 'open' };

  const head = () => sectionHead('Reports',
    'Flagged by community members over an anonymous session, and by the system '
    + 'when an organization trips its notification rate limit.');

  const body = el('div', { class: 'admin-body' });

  const paint = () => {
    panel.replaceChildren(
      head(),
      toolbar([filterChips(FILTERS.map((f) => ({
        ...f,
        count: state.reports
          ? state.reports.filter((r) => f.value === 'all' || r.status === f.value).length
          : undefined,
      })), state.filter, (value) => { state.filter = value; paintBody(); })]),
      body,
    );
    paintBody();
  };

  const paintBody = () => {
    body.replaceChildren();
    if (state.error) { body.append(errorState(friendlyError(state.error, 'load'))); return; }
    if (!state.reports) { body.append(loading()); return; }

    // A family asking for their own relative's notice to come down should
    // never be sitting below a queue of general reports; put it first among
    // the open ones rather than relying on an administrator to scroll to it.
    const matches = state.reports
      .filter((r) => state.filter === 'all' || r.status === state.filter)
      .sort((a, b) => ((b.reason === 'family_takedown' && b.status === 'open')
        - (a.reason === 'family_takedown' && a.status === 'open')));

    if (!matches.length) {
      body.append(emptyState(state.filter === 'open'
        ? 'Nothing is open.'
        : 'No reports match this filter.'));
      return;
    }

    for (const report of matches) body.append(reportCard(report, load));
  };

  const load = async () => {
    try {
      state.reports = await store.listReports(200);
      state.error = null;
    } catch (err) {
      state.error = err;
    }
    paint();
  };

  paint();
  load();
  // Registered so that the shell's teardown has something to call even though
  // this section polls once rather than subscribing. Keeps every section's
  // contract with the shell identical.
  actx.watch(() => {});
}

function reportCard(report, refresh) {
  const decide = async (status) => {
    const resolution = await askReason({
      title: status === 'resolved' ? 'Resolve this report?' : 'Dismiss this report?',
      body: status === 'resolved'
        ? 'Use this once you have acted on it, for example by taking the notice down.'
        : 'Use this when no action is needed.',
      label: 'What did you do? (recorded in the audit trail)',
      confirmText: status === 'resolved' ? 'Resolve' : 'Dismiss',
    });
    if (resolution === null) return;
    try {
      await store.resolveReport(report.id, status, resolution);
      toast(`Report ${status}.`);
      refresh();
    } catch (err) {
      toast(friendlyError(err, 'admin'), 'error');
    }
  };

  const isFamilyRequest = report.reason === 'family_takedown';

  return el('article', {
    class: `admin-card${isFamilyRequest && report.status === 'open' ? ' admin-card--urgent' : ''}`,
  }, [
    el('div', { class: 'admin-card__head' }, [
      el('div', {}, [
        el('h2', {
          class: 'admin-card__title',
          text: REPORT_REASON_LABELS[report.reason] || report.reason,
        }),
        el('p', { class: 'admin-row__meta muted small' }, [
          el('span', { class: 'mono', text: `notice ${report.noticeId}` }),
          el('span', { text: fmtDateTime(report.createdAt) }),
          el('span', {
            text: report.reportedBy === 'system'
              ? 'raised by the system' : 'reported by a member',
          }),
        ]),
      ]),
      el('span', {
        class: `badge badge--${STATUS_TONE[report.status] || 'muted'}`,
        text: report.status,
      }),
    ]),
    el('div', { class: 'admin-card__body' }, [
      report.detail ? el('p', { text: report.detail }) : null,
      report.resolution
        ? el('p', { class: 'muted', text: `Outcome: ${report.resolution}` })
        : null,
      el('div', { class: 'admin-actions' }, [
        el('a', {
          class: 'btn btn--small', href: `/n/${report.noticeId}`,
          target: '_blank', rel: 'noopener noreferrer',
        }, 'Open the notice'),
        report.status === 'open'
          ? el('button', {
            class: 'btn btn--small btn--primary', onclick: () => decide('resolved'),
          }, 'Resolve')
          : null,
        report.status === 'open'
          ? el('button', {
            class: 'btn btn--small', onclick: () => decide('dismissed'),
          }, 'Dismiss')
          : null,
      ]),
    ]),
  ]);
}
