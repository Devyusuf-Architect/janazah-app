// Platform administrator: verification queue, notice takedown, audit review.

import {
  collection, query, orderBy, limit, getDocs, where,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { el, toast, friendlyError, askReason, showModal } from '../ui.js';
import { statusBadge, renderAuditTable } from './org.js';
import { publicNoticeView } from '../notice-view.js';
import { ORG_TYPES } from '../model.js';
import { renderAdminSample } from './admin-sample.js';
import * as store from '../store.js';

const EMPTY_COPY = {
  pending: 'No registrations are waiting for review.',
  verified: 'No verified masjids or funeral coordinators yet.',
  rejected: 'No declined registrations.',
  suspended: 'No suspended organizations.',
};

let unwatchers = [];

export function teardownAdmin() {
  unwatchers.forEach((fn) => fn());
  unwatchers = [];
}

export function renderAdmin(mount, ctx) {
  teardownAdmin();
  mount.replaceChildren();

  mount.append(el('div', { class: 'page-head' }, [
    el('h1', { text: 'Platform administration' }),
  ]));

  const tabs = el('div', { class: 'tabs' });
  const panel = el('div', {});
  mount.append(tabs, panel);

  const views = {
    'Verification requests': () => queueView(panel, 'pending', ctx),
    'Verified masjids': () => queueView(panel, 'verified', ctx),
    'Declined': () => queueView(panel, 'rejected', ctx),
    'Suspended': () => queueView(panel, 'suspended', ctx),
    'Reports': () => reportsView(panel),
    'Audit log': () => auditView(panel),
    'Sample data': () => renderAdminSample(panel, ctx),
  };

  let active = 'Verification requests';
  const paint = () => {
    tabs.replaceChildren(...Object.keys(views).map((name) =>
      el('button', {
        class: `tab${name === active ? ' tab--active' : ''}`,
        onclick: () => { active = name; paint(); },
      }, name)));
    teardownAdmin();
    views[active]();
  };
  paint();
}

function queueView(panel, status, ctx) {
  panel.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
  unwatchers.push(store.watchOrganizationsByStatus(status, (orgs) => {
    panel.replaceChildren();
    if (!orgs.length) {
      panel.append(el('div', { class: 'empty' }, [
        el('p', { text: EMPTY_COPY[status] || `No ${status} organizations.` }),
      ]));
      return;
    }
    for (const org of orgs) panel.append(orgReviewCard(org));
  }));
}

function orgReviewCard(org) {
  const decide = async (nextStatus, { title, body, label, confirmText, required = true }) => {
    const reason = await askReason({
      title,
      body: body || `Organization: ${org.name}`,
      label,
      confirmText,
      required,
    });
    if (reason === null) return;
    try {
      await store.setVerificationStatus(org.id, nextStatus, reason);
      toast(`${org.name} is now ${nextStatus}.`);
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  };

  const actions = [];
  if (org.verificationStatus !== 'verified') {
    actions.push(el('button', {
      class: 'btn btn--primary btn--small',
      onclick: () => decide('verified', {
        title: 'Approve this organization?',
        body: `${org.name} will be able to publish Janazah notices immediately.`,
        label: 'What did you check? (recorded in the audit trail)',
        confirmText: 'Approve',
      }),
    }, org.verificationStatus === 'pending' ? 'Approve' : 'Verify'));
  }
  if (org.verificationStatus === 'pending') {
    actions.push(el('button', {
      class: 'btn btn--small',
      onclick: () => decide('rejected', {
        title: 'Reject this registration?',
        body: `${org.name} will not be able to publish. The reason below is `
            + 'shown to the applicant.',
        label: 'Reason shown to the applicant',
        confirmText: 'Reject',
      }),
    }, 'Reject'));
  }
  if (org.verificationStatus === 'verified') {
    actions.push(el('button', {
      class: 'btn btn--danger btn--small',
      onclick: () => decide('suspended', {
        title: 'Suspend this organization?',
        body: 'Publishing stops immediately. Existing notices stay visible.',
        label: 'Reason',
        confirmText: 'Suspend',
      }),
    }, 'Suspend'));
  }
  if (org.verificationStatus === 'suspended') {
    actions.push(el('button', {
      class: 'btn btn--small',
      onclick: () => decide('verified', {
        title: 'Reinstate this organization?',
        label: 'Reason',
        confirmText: 'Reinstate',
      }),
    }, 'Reinstate'));
  }
  actions.push(el('button', {
    class: 'btn btn--small',
    onclick: () => reviewNotices(org),
  }, 'Review notices'));

  return el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('h2', { text: org.name }),
        el('p', { class: 'muted', text: `${org.address}, ${org.city}, ${org.province} ${org.postalCode || ''}` }),
      ]),
      statusBadge(org.verificationStatus),
    ]),
    el('dl', { class: 'kv' }, [
      el('dt', { text: 'Type' }),
      el('dd', { text: ORG_TYPES.find((t) => t.value === org.type)?.label || org.type }),
      el('dt', { text: 'Contact' }),
      el('dd', { text: org.contactEmail || 'not given' }),
      el('dt', { text: 'Website' }),
      el('dd', {}, org.website
        ? el('a', { class: 'link', href: org.website, target: '_blank', rel: 'noopener noreferrer' }, org.website)
        : 'not given'),
      el('dt', { text: 'Coordinates' }),
      el('dd', { class: 'mono', text: `${org.lat}, ${org.lng} (cell ${org.cell})` }),
      el('dt', { text: 'Owner' }),
      el('dd', { class: 'mono', text: org.ownerUid }),
      el('dt', { text: 'Submitted' }),
      el('dd', { text: org.createdAt?.toDate ? org.createdAt.toDate().toLocaleString('en-CA') : '—' }),
    ]),
    org.statusReason ? el('p', { class: 'muted', text: `Last note: ${org.statusReason}` }) : null,
    el('div', { class: 'card-actions' }, actions),
  ]);
}

async function reviewNotices(org) {
  const body = el('div', {}, [el('p', { class: 'muted', text: 'Loading…' })]);
  showModal(`Notices from ${org.name}`, body, { wide: true });
  try {
    const snap = await getDocs(query(
      collection(db, 'notices'),
      where('orgId', '==', org.id),
      orderBy('createdAt', 'desc'),
      limit(50),
    ));
    const notices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!notices.length) {
      body.replaceChildren(el('p', { class: 'muted', text: 'No notices.' }));
      return;
    }
    body.replaceChildren(...notices.map((notice) => el('div', { class: 'card card--flat' }, [
      publicNoticeView(notice),
      el('div', { class: 'card-actions' }, [
        el('span', { class: `badge badge--${notice.status === 'cancelled' ? 'error' : 'ok'}`, text: notice.status }),
        notice.status === 'published' ? el('button', {
          class: 'btn btn--danger btn--small',
          onclick: async (event) => {
            const reason = await askReason({
              title: 'Take down this notice?',
              body: 'It is marked cancelled and stays visible so that anyone ' +
                    'holding the link sees the takedown. This cannot be undone.',
              label: 'Reason shown to the community',
              confirmText: 'Take down',
            });
            if (reason === null) return;
            try {
              await store.cancelNotice(notice.id, notice, reason, { asAdmin: true });
              event.target.disabled = true;
              toast('Notice taken down.');
            } catch (err) { toast(friendlyError(err), 'error'); }
          },
        }, 'Take down') : null,
      ]),
    ])));
  } catch (err) {
    body.replaceChildren(el('p', { class: 'form-error', text: friendlyError(err) }));
  }
}

const REPORT_REASON_LABELS = {
  family_takedown: 'Family takedown request',
  incorrect_details: 'Details are wrong',
  already_cancelled: 'Already cancelled',
  duplicate: 'Duplicate notice',
  privacy: 'Shares something unapproved',
  fraudulent: 'Believed fake',
  rate_limit: 'Notification rate limit tripped',
  other: 'Other',
};

const REPORT_STATUS_TONE = { open: 'warn', resolved: 'ok', dismissed: 'muted' };

async function reportsView(panel) {
  panel.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));

  let reports;
  try {
    const snap = await getDocs(query(
      collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(100)));
    reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    panel.replaceChildren(el('p', { class: 'form-error', text: friendlyError(err) }));
    return;
  }

  const render = () => {
    panel.replaceChildren();
    // A family asking for their own relative's notice to come down should
    // never be sitting below a queue of general reports; put it first among
    // the open ones rather than relying on an administrator to scroll to it.
    const open = reports
      .filter((r) => r.status === 'open')
      .sort((a, b) => (b.reason === 'family_takedown') - (a.reason === 'family_takedown'));
    const closed = reports.filter((r) => r.status !== 'open');

    panel.append(el('p', { class: 'hint hint--boxed' },
      'Reports come from community members over an anonymous session, and ' +
      'from the system when an organization trips the notification rate ' +
      'limit. Resolving one is recorded in the audit trail.'));

    if (!open.length) {
      panel.append(el('div', { class: 'empty' }, [el('p', { text: 'Nothing open.' })]));
    }
    for (const report of open) panel.append(reportCard(report, render));

    if (closed.length) {
      panel.append(el('h3', { text: `Closed (${closed.length})` }));
      for (const report of closed) panel.append(reportCard(report, render));
    }
  };
  render();
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
      report.status = status;
      report.resolution = resolution;
      toast(`Report ${status}.`);
      refresh();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  };

  const created = report.createdAt?.toDate
    ? report.createdAt.toDate().toLocaleString('en-CA') : '—';

  const isFamilyRequest = report.reason === 'family_takedown';

  return el('div', {
    class: `card${isFamilyRequest && report.status === 'open' ? ' card--urgent' : ''}`,
  }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('h3', { text: REPORT_REASON_LABELS[report.reason] || report.reason }),
        el('p', { class: 'report-card__meta muted small' }, [
          el('span', { class: 'mono', text: `notice ${report.noticeId}` }),
          el('span', { text: created }),
          el('span', {
            text: report.reportedBy === 'system' ? 'raised by the system' : 'reported by a member',
          }),
        ]),
      ]),
      el('span', {
        class: `badge badge--${REPORT_STATUS_TONE[report.status] || 'muted'}`,
        text: report.status,
      }),
    ]),
    report.detail ? el('p', { text: report.detail }) : null,
    report.resolution
      ? el('p', { class: 'muted', text: `Outcome: ${report.resolution}` })
      : null,
    el('div', { class: 'card-actions' }, [
      el('a', {
        class: 'btn btn--small', href: `/n/${report.noticeId}`,
        target: '_blank', rel: 'noopener noreferrer',
      }, 'Open the notice'),
      report.status === 'open'
        ? el('button', {
            class: 'btn btn--small btn--primary',
            onclick: () => decide('resolved'),
          }, 'Resolve')
        : null,
      report.status === 'open'
        ? el('button', { class: 'btn btn--small', onclick: () => decide('dismissed') }, 'Dismiss')
        : null,
    ]),
  ]);
}

async function auditView(panel) {
  panel.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
  try {
    const snap = await getDocs(query(
      collection(db, 'auditLog'), orderBy('at', 'desc'), limit(200)));
    panel.replaceChildren(
      el('p', { class: 'hint hint--boxed' },
        'Append-only. Rules forbid update and delete for every caller, and force ' +
        'the actor and timestamp to the authenticated session.'),
      renderAuditTable(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
  } catch (err) {
    panel.replaceChildren(el('p', { class: 'form-error', text: friendlyError(err) }));
  }
}
