// Organizations: every masjid and funeral coordinator on the platform, at
// every stage of its life.
//
// The Verification section next door is the same data narrowed to the two
// statuses that need a decision today. This one is the register: search it,
// open one, read what was submitted, see who works there and what it has
// published, and change its standing. Both share the decision buttons and the
// review panel below, so an approval is the same act with the same audit
// trail wherever it is made from.
//
// Every decision here writes through store.setVerificationStatus, which
// changes the organization document. The audit entry is written by a Cloud
// Functions trigger watching that document (functions/index.js,
// onOrgAuditWritten), so it cannot be skipped by this screen, or by a bug in
// it, or by anyone driving the API directly.

import { el, toast, friendlyError, askReason, showModal } from '../../ui.js';
import { statusBadge, renderAuditTable } from '../org.js';
import { publicNoticeView } from '../../notice-view.js';
import { ORG_TYPES, VERIFICATION_STATUS_LABEL } from '../../model.js';
import { verificationSignals, roleLabel, methodLabel } from '../../verification.js';
import { verificationDocumentUrl } from '../../upload.js';
import * as store from '../../store.js';
import {
  sectionHead, emptyState, loading, errorState, toolbar, searchField, filterChips,
  dataTable, fmtDate, fmtDateTime, uidChip, caveat, actionError,
} from './common.js';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Awaiting review' },
  { value: 'needs_information', label: 'Awaiting information' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Declined' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'archived', label: 'Archived' },
];

const typeLabel = (type) => ORG_TYPES.find((t) => t.value === type)?.label || type;

const addressOf = (org) => [org.address, org.city, org.province, org.postalCode]
  .filter(Boolean).join(', ');

export function renderOrganizations(panel, actx) {
  const state = { orgs: null, error: null, status: 'all', term: '' };

  panel.replaceChildren(
    sectionHead('Organizations',
      'Every masjid and funeral coordinator registered with Ta’ziyah, whatever '
      + 'stage it has reached.'),
    loading(),
  );

  const body = el('div', { class: 'admin-body' });

  const paint = () => {
    panel.replaceChildren(
      sectionHead('Organizations',
        'Every masjid and funeral coordinator registered with Ta’ziyah, whatever '
        + 'stage it has reached.'),
      toolbar([
        searchField('Search by name, city or address', (term) => {
          state.term = term.toLowerCase();
          paintBody();
        }),
        filterChips(
          STATUS_FILTERS.map((f) => ({
            ...f,
            count: state.orgs
              ? state.orgs.filter((o) => f.value === 'all'
                  || o.verificationStatus === f.value).length
              : undefined,
          })),
          state.status,
          (value) => { state.status = value; paintBody(); },
        ),
      ]),
      body,
    );
    paintBody();
  };

  const paintBody = () => {
    body.replaceChildren();
    if (state.error) { body.append(errorState(friendlyError(state.error, 'load'))); return; }
    if (!state.orgs) { body.append(loading()); return; }

    const matches = state.orgs
      .filter((o) => state.status === 'all' || o.verificationStatus === state.status)
      .filter((o) => !state.term
        || `${o.name} ${o.city || ''} ${o.address || ''}`.toLowerCase().includes(state.term));

    if (!matches.length) {
      body.append(emptyState(state.orgs.length
        ? 'No organizations match this filter.'
        : 'No organizations have registered yet.'));
      return;
    }

    for (const org of matches) body.append(orgRow(org, actx));
  };

  paint();
  actx.watch(store.watchAllOrganizations((orgs, err) => {
    state.orgs = orgs || [];
    state.error = err || null;
    paint();
  }));
}

/** A compact row in the register. Detail lives one click away, in a modal. */
function orgRow(org, actx) {
  return el('article', { class: 'admin-row' }, [
    el('div', { class: 'admin-row__main' }, [
      el('div', { class: 'admin-row__title' }, [
        el('h3', { text: org.name }),
        statusBadge(org.verificationStatus),
      ]),
      el('p', { class: 'admin-row__meta muted small' }, [
        el('span', { text: typeLabel(org.type) }),
        el('span', { text: addressOf(org) || 'no address recorded' }),
        el('span', { text: `registered ${fmtDate(org.createdAt)}` }),
      ]),
      org.statusReason
        ? el('p', { class: 'admin-row__note', text: `Last note: ${org.statusReason}` })
        : null,
    ]),
    el('div', { class: 'admin-row__actions' }, [
      el('button', {
        class: 'btn btn--small', onclick: () => openOrganization(org, actx),
      }, 'Open'),
    ]),
  ]);
}

/**
 * One organization, in full: what it is, what it submitted, who works there,
 * what it has published, and everything that has ever been done to it.
 *
 * The applicant's own details come from the private application
 * subcollection, which firestore.rules makes readable by platform
 * administrators and the applicant alone, and are never rendered on the
 * organization's public page.
 */
export function openOrganization(org, actx) {
  const body = el('div', { class: 'admin-detail' });
  showModal(org.name, body, { wide: true });

  const views = {
    Overview: () => overviewPane(org, actx),
    Verification: () => verificationPane(org),
    Staff: () => staffPane(org),
    Notices: () => noticesPane(org),
    Activity: () => activityPane(org),
  };

  let active = 'Overview';
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

function overviewPane(org, actx) {
  return el('div', {}, [
    el('div', { class: 'admin-row__title' }, [
      el('h3', { text: org.name }),
      statusBadge(org.verificationStatus),
    ]),
    el('dl', { class: 'admin-kv' }, [
      ['Type', typeLabel(org.type)],
      ['Address', addressOf(org) || 'not given'],
      ['Phone', org.phone || 'not given'],
      ['Contact email', org.contactEmail || 'not given'],
      ['Website', org.website || 'not given'],
      ['Coordinates', `${org.lat}, ${org.lng} (cell ${org.cell})`],
      ['Owner', org.ownerUid],
      ['Staff accounts', String((org.staffUids || []).length)],
      ['Registered', fmtDateTime(org.createdAt)],
      ['Status', VERIFICATION_STATUS_LABEL[org.verificationStatus] || org.verificationStatus],
      ['Verified', org.verifiedAt ? fmtDateTime(org.verifiedAt) : 'not verified'],
      ['Last note', org.statusReason || 'none'],
    ].flatMap(([label, value]) => [
      el('dt', { text: label }),
      el('dd', { class: label === 'Owner' || label === 'Coordinates' ? 'mono' : '', text: value }),
    ])),
    el('div', { class: 'admin-actions' }, [
      ...decisionButtons(org, actx),
      messageButton(org),
    ]),
  ]);
}

/** Subject and body limits, matching lib/admin-management.js on the server. */
const MESSAGE_MAX = { subject: 150, body: 4000 };

/**
 * Write to one organization directly.
 *
 * Approvals, declines and requests for information send their own email off
 * the verification decision. This is for everything else an administrator
 * needs to say, which is not a status change and should not be made into one.
 *
 * The address is never on this screen. It is resolved on the server from the
 * organization's contact email, or its owner's sign-in address if there is
 * none, and the reply here says only that it went. Ta'ziyah keeps user email
 * addresses out of anything a browser can read, and an administrator screen
 * is still a browser.
 */
function messageButton(org) {
  return el('button', {
    class: 'btn btn--small',
    type: 'button',
    onclick: () => {
      const subject = el('input', {
        class: 'field', type: 'text', id: 'org-message-subject',
        maxlength: String(MESSAGE_MAX.subject),
      });
      const body = el('textarea', {
        class: 'field', rows: 8, id: 'org-message-body',
        maxlength: String(MESSAGE_MAX.body),
      });
      const error = el('p', { class: 'form-error', hidden: true });

      const send = el('button', { class: 'btn btn--primary', type: 'button' }, 'Send');
      const content = el('div', {}, [
        el('p', { class: 'muted' },
          `Sent to ${org.name} at the contact address on its registration, or `
          + 'to its owner’s account address if it has none. The message is '
          + 'plain text and is recorded in the audit trail.'),
        el('label', { class: 'label', for: 'org-message-subject', text: 'Subject' }),
        subject,
        el('label', { class: 'label', for: 'org-message-body', text: 'Message' }),
        body,
        error,
      ]);

      const close = showModal(`Message ${org.name}`, content, {
        actions: [
          el('button', {
            class: 'btn', type: 'button', onclick: () => close(),
          }, 'Back'),
          send,
        ],
      });

      send.addEventListener('click', async () => {
        error.hidden = true;
        if (!subject.value.trim() || !body.value.trim()) {
          error.hidden = false;
          error.textContent = 'A subject and a message are both needed.';
          return;
        }
        send.disabled = true;
        try {
          await store.sendOrganizationMessage(
            org.id, subject.value.trim(), body.value.trim());
          close();
          toast(`Message sent to ${org.name}.`);
        } catch (err) {
          error.hidden = false;
          error.textContent = actionError(err);
        } finally {
          send.disabled = false;
        }
      });
    },
  }, 'Send a message');
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
 */
async function verificationPane(org) {
  const [application, review] = await Promise.all([
    store.getApplication(org.id), store.getReviewNotes(org.id),
  ]);

  if (!application) {
    return el('p', { class: 'muted' },
      'No application was recorded for this organization. It may have been '
      + 'registered before applications were collected, or the second write '
      + 'failed. Ask the owner to complete one before approving.');
  }

  const signals = verificationSignals(org, application);

  const row = (label, value) => (value
    ? el('div', { class: 'review-row' }, [el('dt', { text: label }), el('dd', { text: value })])
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
      toast(friendlyError(err, 'admin'), 'error');
    } finally {
      saveNotes.disabled = false;
    }
  });

  return el('div', {}, [
    el('h3', { text: 'Signals' }),
    el('p', { class: 'hint' },
      'Evidence to read, not a verdict. Nothing here approves or declines '
      + 'anything on its own.'),
    el('ul', { class: 'signal-list' }, signals.map((s) => el('li', {
      class: `signal signal--${s.level}`,
    }, [
      el('strong', { text: s.label }),
      el('p', { class: 'muted', text: s.detail }),
    ]))),

    el('h3', { text: 'The applicant' }),
    el('p', { class: 'hint' },
      'Private to platform administrators. Not on the public page, before or '
      + 'after approval.'),
    el('dl', {}, [
      row('Name', application.applicantName),
      row('Role', roleLabel(application.applicantRole, application.applicantRoleOther)),
      row('Account email', application.applicantEmail),
      row('Work email', application.workEmail),
      row('Phone', application.phone),
      row('Involvement', application.roleExplanation),
      row('Staff page', application.staffPageUrl),
      row('Submitted', application.submittedAt ? fmtDateTime(application.submittedAt) : null),
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
              toast(friendlyError(err, 'admin'), 'error');
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
    el('p', { class: 'hint' },
      'Administrators only. The applicant cannot read these, enforced by '
      + 'firestore.rules rather than by this screen.'),
    notes,
    el('div', { class: 'admin-actions' }, [saveNotes]),
  ]);
}

async function staffPane(org) {
  const requests = await store.listStaffRequests(org.id).catch(() => []);
  const staff = org.staffUids || [];
  const byUid = new Map(requests.map((r) => [r.uid, r]));

  const staffRows = staff.map((uid) => el('tr', {}, [
    el('td', {}, uidChip(uid)),
    el('td', { text: byUid.get(uid)?.email || (uid === org.ownerUid ? '' : 'not recorded') }),
    el('td', { text: uid === org.ownerUid ? 'Owner' : 'Staff' }),
  ]));

  const pending = requests.filter((r) => r.status === 'pending');

  return el('div', {}, [
    el('h3', { text: `Staff (${staff.length})` }),
    staff.length
      ? dataTable(['Account', 'Email', 'Role'], staffRows)
      : emptyState('This organization has no staff accounts, which should not '
        + 'be possible: the owner is added at registration.'),
    caveat('Email addresses shown here come from join requests. An owner who '
      + 'registered the organization themselves never filed one, so their '
      + 'address is not stored against the organization and is left blank.'),

    el('h3', { text: `Join requests (${requests.length})` }),
    requests.length
      ? dataTable(['Account', 'Email', 'Status', 'Requested'], requests.map((r) => el('tr', {}, [
        el('td', {}, uidChip(r.uid)),
        el('td', { text: r.email || 'not given' }),
        el('td', { text: r.status }),
        el('td', { class: 'nowrap', text: fmtDate(r.requestedAt) }),
      ])))
      : emptyState('Nobody has asked to join this organization.'),
    pending.length
      ? el('p', { class: 'hint' },
        `${pending.length} request${pending.length === 1 ? ' is' : 's are'} waiting. `
        + 'Approving or rejecting one is done from the Staff section, where every '
        + 'organization’s requests are in one queue.')
      : null,
  ]);
}

async function noticesPane(org) {
  const notices = await store.listOrgNotices(org.id, 50);
  if (!notices.length) return emptyState('This organization has published nothing.');
  return el('div', {}, notices.map((notice) => el('div', { class: 'admin-card admin-card--flat' }, [
    publicNoticeView(notice, { compact: true }),
    el('p', { class: 'admin-row__meta muted small' }, [
      el('span', { text: notice.status }),
      el('span', { text: `version ${notice.version || 1}` }),
      el('span', { class: 'mono', text: notice.id }),
    ]),
  ])));
}

async function activityPane(org) {
  const entries = await store.auditForOrg(org.id, 100);
  if (!entries.length) return emptyState('Nothing has been recorded against this organization yet.');
  return el('div', {}, [
    el('p', { class: 'hint' },
      'Written by the server on every change to this organization, its staff '
      + 'and its notices. Nothing on this screen can add to it or edit it.'),
    renderAuditTable(entries),
  ]);
}

/**
 * The decisions available on an organization, given where it stands.
 *
 * Which buttons appear is presentation. What an administrator may actually
 * do is decided by firestore.rules on the write itself, so a button that is
 * absent here is not the thing stopping anybody.
 */
export function decisionButtons(org, actx) {
  const decide = async (nextStatus, { title, body, label, confirmText }) => {
    const reason = await askReason({
      title, body: body || `Organization: ${org.name}`, label, confirmText,
    });
    if (reason === null) return;
    try {
      await store.setVerificationStatus(org.id, nextStatus, reason);
      toast(`${org.name} is now ${VERIFICATION_STATUS_LABEL[nextStatus] || nextStatus}.`);
      actx?.refresh?.();
    } catch (err) {
      toast(friendlyError(err, 'admin'), 'error');
    }
  };

  const actions = [];
  const status = org.verificationStatus;

  // An archived organization accepts no ordinary status change at all
  // (firestore.rules refuses it): it has to be restored first.
  if (status !== 'verified' && status !== 'archived') {
    actions.push(el('button', {
      class: 'btn btn--primary btn--small',
      onclick: () => decide('verified', {
        title: 'Approve this organization?',
        body: `${org.name} will be able to publish Janazah notices immediately.`,
        label: 'What did you check? (recorded in the audit trail)',
        confirmText: 'Approve',
      }),
    }, status === 'pending' ? 'Approve' : 'Verify'));
  }

  if (status === 'pending' || status === 'needs_information') {
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

  if (status === 'verified') {
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

  if (status === 'suspended' || status === 'rejected') {
    actions.push(el('button', {
      class: 'btn btn--small',
      onclick: () => decide('verified', {
        title: status === 'suspended'
          ? 'Reinstate this organization?'
          : 'Approve this previously declined registration?',
        label: 'Reason',
        confirmText: status === 'suspended' ? 'Reinstate' : 'Approve',
      }),
    }, status === 'suspended' ? 'Reinstate' : 'Reconsider and approve'));
  }

  const isSample = org.id.startsWith('sample-');

  if (status === 'archived') {
    actions.push(el('button', {
      class: 'btn btn--primary btn--small',
      onclick: () => restoreOrganizationAction(org, actx),
    }, 'Restore'));
  } else if (!isSample) {
    actions.push(el('button', {
      class: 'btn btn--danger btn--small',
      onclick: () => archiveOrganizationAction(org, actx),
    }, 'Archive'));
  }

  return actions;
}

/**
 * Hide a real organization and everything it has already published. Routed
 * through the archiveOrganization Cloud Function
 * (functions/lib/admin-management.js) rather than a plain document write,
 * because archiving also has to pull every one of the organization's
 * published notices back to draft in the same atomic step, which is not
 * something a client write to the organization document alone can do.
 *
 * A stronger prompt than Suspend on purpose: this also touches every notice
 * the organization has published, not only the organization itself.
 */
async function archiveOrganizationAction(org, actx) {
  const reason = await askReason({
    title: 'Archive this organization?',
    body: `This organization and every notice it has published will stop `
      + 'appearing anywhere on Ta’ziyah. This can be undone at any time from '
      + 'here.',
    label: 'Reason (recorded in the audit trail)',
    confirmText: 'Archive',
  });
  if (reason === null) return;
  try {
    const result = await store.archiveOrganization(org.id, reason);
    toast(result.noticesArchived
      ? `${org.name} is archived, along with ${result.noticesArchived} published `
        + `notice${result.noticesArchived === 1 ? '' : 's'}.`
      : `${org.name} is archived.`);
    actx?.refresh?.();
  } catch (err) {
    toast(actionError(err), 'error');
  }
}

/**
 * Put an archived organization, and exactly the notices archiving pulled to
 * draft, back the way they were. Lighter friction than Archive: this is the
 * explicit undo path, not an action that should make an administrator
 * hesitate.
 */
async function restoreOrganizationAction(org, actx) {
  const confirmed = await askReason({
    title: 'Restore this organization?',
    body: `${org.name} and the notices archiving moved to draft will reappear `
      + 'as they were before.',
    label: 'Note (optional, recorded in the audit trail)',
    confirmText: 'Restore',
    required: false,
  });
  if (confirmed === null) return;
  try {
    const result = await store.restoreOrganization(org.id);
    toast(result.noticesRestored
      ? `${org.name} is restored, along with ${result.noticesRestored} `
        + `notice${result.noticesRestored === 1 ? '' : 's'}.`
      : `${org.name} is restored.`);
    actx?.refresh?.();
  } catch (err) {
    toast(actionError(err), 'error');
  }
}

/** The review card used by the Verification queue. */
export function reviewCard(org, actx) {
  return el('article', { class: 'admin-card admin-card--review' }, [
    el('div', { class: 'admin-card__head' }, [
      el('div', {}, [
        el('h2', { class: 'admin-card__title', text: org.name }),
        el('p', { class: 'admin-row__meta muted small' }, [
          el('span', { text: typeLabel(org.type) }),
          el('span', { text: addressOf(org) || 'no address recorded' }),
          el('span', { text: `submitted ${fmtDate(org.createdAt)}` }),
        ]),
      ]),
      statusBadge(org.verificationStatus),
    ]),
    el('div', { class: 'admin-card__body' }, [
      org.statusReason
        ? el('p', { class: 'admin-row__note', text: `Last note: ${org.statusReason}` })
        : null,
      el('div', { class: 'admin-actions' }, [
        el('button', {
          class: 'btn btn--small',
          onclick: () => openOrganization(org, actx),
        }, 'Verification details'),
        ...decisionButtons(org, actx),
      ]),
    ]),
  ]);
}
