// Platform administrator: verification queue, notice takedown, audit review.

import {
  collection, query, orderBy, limit, getDocs, where,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { el, toast, friendlyError, askReason, showModal } from '../ui.js';
import { statusBadge, renderAuditTable } from './org.js';
import { publicNoticeView } from '../notice-view.js';
import { ORG_TYPES, VERIFICATION_STATUS_LABEL } from '../model.js';
import {
  verificationSignals, roleLabel, methodLabel,
} from '../verification.js';
import { verificationDocumentUrl } from '../upload.js';
import { renderAdminSample } from './admin-sample.js';
import * as store from '../store.js';

const EMPTY_COPY = {
  pending: 'No registrations are waiting for review.',
  needs_information: 'Nobody has been asked for more information.',
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
    'Awaiting information': () => queueView(panel, 'needs_information', ctx),
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
  if (org.verificationStatus === 'pending' || org.verificationStatus === 'needs_information') {
    // The middle option, and the one that should be reached for most often.
    // Without it a reviewer holding an application they cannot yet confirm
    // has only two moves: approve on insufficient evidence, or decline a
    // masjid that has done nothing wrong. Both are worse than asking.
    actions.push(el('button', {
      class: 'btn btn--small',
      onclick: () => decide('needs_information', {
        title: 'Ask for more information?',
        body: `${org.name} stays unverified and cannot publish. Your question `
            + 'below is shown to the applicant, who can then update their '
            + 'application.',
        label: 'What do you need from them?',
        confirmText: 'Send the request',
      }),
    }, 'Request more information'));
  }
  if (org.verificationStatus === 'pending' || org.verificationStatus === 'needs_information') {
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
  if (org.verificationStatus === 'pending' || org.verificationStatus === 'needs_information'
      || org.verificationStatus === 'verified') {
    actions.push(el('button', {
      class: 'btn btn--small',
      onclick: () => reviewApplication(org),
    }, 'Verification details'));
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
      el('dt', { text: 'Phone' }),
      el('dd', { text: org.phone || org.contactEmail || 'not given' }),
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
      el('dt', { text: 'Status' }),
      el('dd', { text: VERIFICATION_STATUS_LABEL[org.verificationStatus] || org.verificationStatus }),
    ]),
    org.statusReason ? el('p', { class: 'muted', text: `Last note: ${org.statusReason}` }) : null,
    el('div', { class: 'card-actions' }, actions),
  ]);
}

/**
 * Everything held about one registration, in one place, for a human to read.
 *
 * Deliberately not a score. There is no number here, no traffic light that
 * resolves to a verdict, and no automatic action: every signal is a sentence
 * saying what was found and what still needs checking. The failure this
 * guards against is a stranger publishing a funeral notice in a real masjid's
 * name, and a reviewer who has stopped reading because a badge said 92% is
 * exactly how that happens.
 *
 * The applicant's details shown here come from the private application
 * subcollection, which firestore.rules makes readable by platform
 * administrators and the applicant alone. Nothing in this modal is reachable
 * from the organization's public page.
 */
async function reviewApplication(org) {
  const body = el('div', {}, [el('p', { class: 'muted', text: 'Loading…' })]);
  showModal(`Verification: ${org.name}`, body, { wide: true });

  let application = null;
  let review = null;
  try {
    [application, review] = await Promise.all([
      store.getApplication(org.id), store.getReviewNotes(org.id),
    ]);
  } catch (err) {
    body.replaceChildren(el('p', { class: 'form-error', text: friendlyError(err, 'orgLoad') }));
    return;
  }

  if (!application) {
    body.replaceChildren(el('p', {
      class: 'muted',
      text: 'No application was recorded for this organization. It may have '
          + 'been registered before applications were collected, or the '
          + 'second write failed. Ask the owner to complete one before '
          + 'approving.',
    }));
    return;
  }

  const signals = verificationSignals(org, application);

  const row = (label, value) => (value
    ? el('div', { class: 'review-row' }, [
      el('dt', { text: label }), el('dd', { text: value }),
    ])
    : null);

  const notes = el('textarea', {
    class: 'field', rows: 4, id: 'reviewNotes',
    placeholder: 'What you checked, who you spoke to, what is still open.',
  });
  notes.value = review?.notes || '';

  const saveNotes = el('button', { class: 'btn btn--small' }, 'Save notes');
  saveNotes.addEventListener('click', async () => {
    saveNotes.disabled = true;
    try {
      await store.saveReviewNotes(org.id, notes.value);
      toast('Notes saved.');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      saveNotes.disabled = false;
    }
  });

  body.replaceChildren(
    el('h3', { text: 'Signals' }),
    el('p', {
      class: 'hint',
      text: 'Evidence to read, not a verdict. Nothing here approves or '
          + 'declines anything on its own.',
    }),
    el('ul', { class: 'signal-list' }, signals.map((s) => el('li', {
      class: `signal signal--${s.level}`,
    }, [
      el('strong', { text: s.label }),
      el('p', { class: 'muted', text: s.detail }),
    ]))),

    el('h3', { text: 'The applicant' }),
    el('p', {
      class: 'hint',
      text: 'Private to platform administrators. Not on the public page, '
          + 'before or after approval.',
    }),
    el('dl', {}, [
      row('Name', application.applicantName),
      row('Role', roleLabel(application.applicantRole, application.applicantRoleOther)),
      row('Account email', application.applicantEmail),
      row('Work email', application.workEmail),
      row('Phone', application.phone),
      row('Involvement', application.roleExplanation),
      row('Staff page', application.staffPageUrl),
      row('Submitted', application.submittedAt?.toDate
        ? application.submittedAt.toDate().toLocaleString('en-CA') : null),
    ].filter(Boolean)),

    // Opened on demand, and never rendered as a link on the page. The URL is
    // short-lived and only an administrator can obtain one: storage.rules
    // refuses the read to everyone else, so a copied link is not a way to
    // hand this document to anybody.
    application.documentPath
      ? el('div', {}, [
        el('h3', { text: 'Supporting document' }),
        el('p', { class: 'hint', text: application.documentName || 'Attached file' }),
        el('button', {
          class: 'btn btn--small',
          onclick: async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            try {
              window.open(await verificationDocumentUrl(application.documentPath),
                '_blank', 'noopener,noreferrer');
            } catch (err) {
              console.error('verificationDocumentUrl', err);
              toast(friendlyError(err), 'error');
            } finally {
              button.disabled = false;
            }
          },
        }, 'Open the document'),
      ])
      : null,

    application.verificationMethods?.length
      ? el('div', {}, [
        el('h3', { text: 'Routes they offered' }),
        el('ul', { class: 'review-list' },
          application.verificationMethods.map((m) => el('li', { text: methodLabel(m) }))),
      ])
      : null,

    el('h3', { text: 'Internal notes' }),
    el('p', {
      class: 'hint',
      text: 'Administrators only. The applicant cannot read these, enforced '
          + 'by firestore.rules rather than by this screen.',
    }),
    notes,
    el('div', { class: 'card-actions' }, [saveNotes]),
  );
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
