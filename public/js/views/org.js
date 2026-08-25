// Organization registration, profile, and staff authorization.

import { el, toast, readForm, friendlyError, showModal } from '../ui.js';
import { ORG_TYPES } from '../model.js';
import * as store from '../store.js';
import { auditForOrg } from '../audit.js';

const STATUS_COPY = {
  pending: {
    tone: 'warn',
    text: 'Awaiting verification by a platform administrator. You can prepare ' +
          'drafts, but you cannot publish until this is approved.',
  },
  verified: { tone: 'ok', text: 'Verified. This organization can publish Janazah notices.' },
  rejected: { tone: 'error', text: 'Verification was declined.' },
  suspended: {
    tone: 'error',
    text: 'Suspended. Publishing is disabled while this is under review.',
  },
};

export function statusBadge(status) {
  const copy = STATUS_COPY[status] || { tone: 'muted' };
  return el('span', { class: `badge badge--${copy.tone}`, text: status });
}

/**
 * The full-screen state a coordinator sees when their only organization is
 * not verified. A status strip on a card is enough once someone knows the
 * system; the first thing after submitting an application should say plainly
 * what happens next instead of leaving them looking for a publish button that
 * is not going to appear.
 *
 * Publishing is blocked by firestore.rules (isOrgVerified on every notice
 * create and update), not by this screen. This only explains it.
 */
function verificationStateScreen(org, ctx) {
  const submitted = org.createdAt?.toDate
    ? org.createdAt.toDate().toLocaleDateString('en-CA',
        { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const STATE = {
    pending: {
      tone: 'warn',
      heading: 'Verification pending',
      lede: 'Your registration has been received and is waiting for a platform '
          + 'administrator to review it. Until it is approved, this '
          + 'organization cannot publish Janazah notices.',
      next: [
        'An administrator checks that the organization is real and that you are entitled to register it.',
        'They may contact you at the address you gave for verification.',
        'When it is approved, publishing unlocks here with no further action from you.',
      ],
      nextHeading: 'What happens next',
    },
    rejected: {
      tone: 'error',
      heading: 'Application not approved',
      lede: 'A platform administrator reviewed this registration and did not '
          + 'approve it. This organization cannot publish Janazah notices.',
      next: [
        'If the reason above is something you can correct, update the organization’s details and contact the administrators to ask for another review.',
        'If you believe this was a mistake, reply to the address you registered with.',
      ],
      nextHeading: 'What you can do',
    },
    suspended: {
      tone: 'error',
      heading: 'Publishing suspended',
      lede: 'A platform administrator has suspended this organization. '
          + 'Publishing is disabled while it is under review. Notices already '
          + 'published stay visible.',
      next: [
        'The reason is shown above where one was given.',
        'Contact the platform administrators to resolve it. Publishing resumes as soon as the suspension is lifted.',
      ],
      nextHeading: 'What you can do',
    },
  }[org.verificationStatus];

  if (!STATE) return null;

  return el('div', { class: 'card verify-state' }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('h1', { text: STATE.heading }),
        el('p', { class: 'muted', text: org.name }),
      ]),
      statusBadge(org.verificationStatus),
    ]),
    el('p', { text: STATE.lede }),

    org.statusReason
      ? el('div', { class: `notice-strip notice-strip--${STATE.tone}` }, [
          el('strong', { text: 'Administrator’s note' }),
          el('p', { text: org.statusReason }),
        ])
      : null,

    el('dl', { class: 'kv' }, [
      el('dt', { text: 'Organization' }),
      el('dd', { text: org.name }),
      el('dt', { text: 'Type' }),
      el('dd', { text: ORG_TYPES.find((t) => t.value === org.type)?.label || org.type }),
      el('dt', { text: 'Address' }),
      el('dd', { text: `${org.address}, ${org.city}, ${org.province}` }),
      el('dt', { text: 'Submitted' }),
      el('dd', { text: submitted || '—' }),
      el('dt', { text: 'Status' }),
      el('dd', { text: org.verificationStatus }),
    ]),

    el('h2', { text: STATE.nextHeading }),
    el('ol', { class: 'list' }, STATE.next.map((t) => el('li', { text: t }))),

    el('div', { class: 'card-actions' }, [
      org.ownerUid === ctx.user.uid
        ? el('button', { class: 'btn', onclick: () => manageStaff(org, ctx) }, 'Manage staff')
        : null,
      el('button', { class: 'btn', onclick: () => ctx.refresh() }, 'Check again'),
      el('a', { class: 'btn btn--link', href: '/janazahs' }, 'View the public feed'),
    ]),
  ]);
}

export function renderOrgs(mount, ctx) {
  mount.replaceChildren();
  const { orgs } = ctx;

  // Someone whose single organization is not verified has nothing to do on a
  // list screen: give them the state itself, in full, rather than a card in a
  // list of one. With more than one organization the list is the right view,
  // since the statuses may differ.
  if (orgs.length === 1 && orgs[0].verificationStatus !== 'verified') {
    const screen = verificationStateScreen(orgs[0], ctx);
    if (screen) {
      mount.append(screen);
      mount.append(el('button', {
        class: 'btn btn--link',
        onclick: () => renderRegisterForm(mount, ctx),
      }, 'Register another organization'));
      return;
    }
  }

  mount.append(el('div', { class: 'page-head' }, [
    el('h1', { text: 'Organizations' }),
    el('button', {
      class: 'btn btn--primary',
      onclick: () => renderRegisterForm(mount, ctx),
    }, 'Register an organization'),
  ]));

  if (!orgs.length) {
    mount.append(el('div', { class: 'empty' }, [
      el('p', { text: 'You are not yet staff of any organization.' }),
      el('p', {
        class: 'muted',
        text: 'Register one, or ask an existing organization’s owner to add you.',
      }),
      el('button', {
        class: 'btn',
        onclick: () => renderJoinForm(mount, ctx),
      }, 'Request access to an existing organization'),
    ]));
    return;
  }

  for (const org of orgs) {
    const copy = STATUS_COPY[org.verificationStatus] || {};
    const card = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [
          el('h2', { text: org.name }),
          el('p', { class: 'muted', text: `${org.address}, ${org.city}, ${org.province}` }),
        ]),
        statusBadge(org.verificationStatus),
      ]),
      el('p', { class: `notice-strip notice-strip--${copy.tone || 'muted'}`, text: copy.text || '' }),
      org.statusReason
        ? el('p', { class: 'muted', text: `Administrator note: ${org.statusReason}` })
        : null,
      el('dl', { class: 'kv' }, [
        el('dt', { text: 'Type' }),
        el('dd', { text: ORG_TYPES.find((t) => t.value === org.type)?.label || org.type }),
        el('dt', { text: 'Alert cell' }),
        el('dd', { class: 'mono', text: org.cell || '—' }),
        el('dt', { text: 'Staff' }),
        el('dd', { text: `${org.staffUids?.length || 0} authorized` }),
      ]),
      el('div', { class: 'card-actions' }, [
        org.ownerUid === ctx.user.uid
          ? el('button', { class: 'btn', onclick: () => manageStaff(org, ctx) }, 'Manage staff')
          : null,
        el('button', { class: 'btn', onclick: () => viewAudit(org) }, 'Audit trail'),
      ]),
    ]);
    mount.append(card);
  }

  mount.append(el('button', {
    class: 'btn btn--link',
    onclick: () => renderJoinForm(mount, ctx),
  }, 'Request access to another organization'));
}

function field(id, label, attrs = {}, hint = null) {
  return el('div', { class: 'field-group' }, [
    el('label', { class: 'label', for: id, text: label }),
    el('input', { class: 'field', id, name: id, ...attrs }),
    hint ? el('p', { class: 'hint', text: hint }) : null,
  ]);
}

function renderRegisterForm(mount, ctx) {
  mount.replaceChildren();
  const error = el('p', { class: 'form-error', hidden: true });
  const form = el('form', { class: 'card card--narrow' });

  form.append(
    el('h1', { text: 'Register an organization' }),
    el('p', {
      class: 'muted',
      text: 'Submitting this does not grant publishing. The organization is ' +
            'saved as pending until a platform administrator approves it, and ' +
            'there is no way to approve your own. Give details that make ' +
            'verification straightforward.',
    }),
    field('name', 'Organization name', { required: true, maxlength: 140 }),
    el('div', { class: 'field-group' }, [
      el('label', { class: 'label', for: 'type', text: 'Type' }),
      el('select', { class: 'field', id: 'type', name: 'type' },
        ORG_TYPES.map((t) => el('option', { value: t.value, text: t.label }))),
    ]),
    field('address', 'Street address', { required: true }),
    el('div', { class: 'field-row' }, [
      field('city', 'City', { required: true }),
      field('province', 'Province', { required: true, maxlength: 40 }),
      field('postalCode', 'Postal code', { maxlength: 7 }),
    ]),
    el('div', { class: 'field-row' }, [
      field('lat', 'Latitude', { required: true, type: 'number', step: 'any', placeholder: '43.6532' }),
      field('lng', 'Longitude', { required: true, type: 'number', step: 'any', placeholder: '-79.3832' }),
    ]),
    el('p', {
      class: 'hint',
      text: 'Coordinates decide which nearby alerts this organization triggers. ' +
            'Right-click the building in Google Maps and copy the pair it shows.',
    }),
    // Required: it is how an administrator reaches the applicant during
    // review, and the only contact they have that is not a raw account id.
    // Note what this hint does not claim: the organization record becomes
    // publicly readable once verified (firestore.rules, /organizations get),
    // so promising this address stays administrator-only would be false. It
    // is kept off the notice itself, which is what actually holds.
    field('contactEmail', 'Contact email for verification',
      { type: 'email', required: true },
      'How a platform administrator reaches you about this application. Not ' +
      'shown on published notices. Use an address belonging to the ' +
      'organization where you can.'),
    field('website', 'Website', { type: 'url' }),
    error,
    el('div', { class: 'form-actions' }, [
      el('button', { class: 'btn btn--primary', type: 'submit' }, 'Submit for verification'),
      el('button', { class: 'btn', type: 'button', onclick: () => ctx.refresh() }, 'Cancel'),
    ]),
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    try {
      await store.registerOrganization(readForm(form));
      toast('Submitted. A platform administrator will review it.');
      await ctx.refresh();
    } catch (err) {
      error.hidden = false;
      error.textContent = friendlyError(err);
    } finally {
      submit.disabled = false;
    }
  });

  mount.append(form);
}

async function renderJoinForm(mount, ctx) {
  mount.replaceChildren(el('p', { class: 'muted', text: 'Loading organizations…' }));
  let orgs = [];
  try {
    orgs = await store.verifiedOrganizations();
  } catch (err) {
    mount.replaceChildren(el('p', { class: 'form-error', text: friendlyError(err) }));
    return;
  }

  const mine = new Set(ctx.orgs.map((o) => o.id));
  const available = orgs.filter((o) => !mine.has(o.id));

  mount.replaceChildren();
  const card = el('div', { class: 'card card--narrow' }, [
    el('h1', { text: 'Request staff access' }),
    el('p', {
      class: 'muted',
      text: 'The organization’s owner approves or declines the request. ' +
            'Both the request and the decision are recorded in the audit trail.',
    }),
  ]);

  if (!available.length) {
    card.append(el('p', { class: 'muted', text: 'No other verified organizations yet.' }));
  } else {
    const list = el('ul', { class: 'list' });
    for (const org of available) {
      list.append(el('li', { class: 'list-row' }, [
        el('div', {}, [
          el('strong', { text: org.name }),
          el('p', { class: 'muted', text: `${org.city}, ${org.province}` }),
        ]),
        el('button', {
          class: 'btn',
          onclick: async (event) => {
            event.target.disabled = true;
            try {
              await store.requestStaffAccess(org.id);
              toast(`Request sent to ${org.name}.`);
            } catch (err) {
              toast(friendlyError(err), 'error');
              event.target.disabled = false;
            }
          },
        }, 'Request access'),
      ]));
    }
    card.append(list);
  }

  card.append(el('button', { class: 'btn', onclick: () => ctx.refresh() }, 'Back'));
  mount.append(card);
}

async function manageStaff(org, ctx) {
  const body = el('div', {}, [el('p', { class: 'muted', text: 'Loading…' })]);
  showModal(`Staff of ${org.name}`, body, { wide: true });

  let requests = [];
  try {
    requests = await store.listStaffRequests(org.id);
  } catch (err) {
    body.replaceChildren(el('p', { class: 'form-error', text: friendlyError(err) }));
    return;
  }

  const render = () => {
    body.replaceChildren();
    body.append(el('h3', { text: 'Authorized staff' }));
    const staffList = el('ul', { class: 'list' });
    for (const uid of org.staffUids || []) {
      staffList.append(el('li', { class: 'list-row' }, [
        el('span', { class: 'mono', text: uid + (uid === org.ownerUid ? '  (owner)' : '') }),
        uid === org.ownerUid ? null : el('button', {
          class: 'btn btn--danger btn--small',
          onclick: async () => {
            try {
              await store.removeStaff(org.id, uid, org.staffUids);
              org.staffUids = org.staffUids.filter((u) => u !== uid);
              toast('Staff member removed.');
              render();
            } catch (err) { toast(friendlyError(err), 'error'); }
          },
        }, 'Remove'),
      ]));
    }
    body.append(staffList);

    const pending = requests.filter((r) => r.status === 'pending');
    body.append(el('h3', { text: `Pending requests (${pending.length})` }));
    if (!pending.length) {
      body.append(el('p', { class: 'muted', text: 'None.' }));
      return;
    }
    const reqList = el('ul', { class: 'list' });
    for (const req of pending) {
      reqList.append(el('li', { class: 'list-row' }, [
        el('div', {}, [
          el('strong', { text: req.displayName || req.email || req.uid }),
          el('p', { class: 'muted mono', text: req.uid }),
        ]),
        el('div', { class: 'row-actions' }, [
          el('button', {
            class: 'btn btn--primary btn--small',
            onclick: async () => {
              try {
                await store.approveStaffRequest(org.id, req.uid, org.staffUids);
                org.staffUids = [...new Set([...org.staffUids, req.uid])];
                req.status = 'approved';
                toast('Approved.');
                render();
              } catch (err) { toast(friendlyError(err), 'error'); }
            },
          }, 'Approve'),
          el('button', {
            class: 'btn btn--small',
            onclick: async () => {
              try {
                await store.rejectStaffRequest(org.id, req.uid);
                req.status = 'rejected';
                toast('Declined.');
                render();
              } catch (err) { toast(friendlyError(err), 'error'); }
            },
          }, 'Decline'),
        ]),
      ]));
    }
    body.append(reqList);
  };

  render();
}

async function viewAudit(org) {
  const body = el('div', {}, [el('p', { class: 'muted', text: 'Loading…' })]);
  showModal(`Audit trail: ${org.name}`, body, { wide: true });
  try {
    const entries = await auditForOrg(org.id);
    body.replaceChildren(renderAuditTable(entries));
  } catch (err) {
    body.replaceChildren(el('p', { class: 'form-error', text: friendlyError(err) }));
  }
}

export function renderAuditTable(entries) {
  if (!entries.length) return el('p', { class: 'muted', text: 'No entries yet.' });
  const rows = entries.map((e) => {
    const at = e.at?.toDate ? e.at.toDate().toLocaleString('en-CA') : '—';
    const detail = e.details && Object.keys(e.details).length
      ? JSON.stringify(e.details) : '';
    return el('tr', {}, [
      el('td', { class: 'mono nowrap', text: at }),
      el('td', { text: e.action }),
      el('td', { text: e.actorEmail || e.actorUid }),
      el('td', { class: 'mono', text: `${e.targetType}/${e.targetId}` }),
      el('td', { class: 'muted small', text: detail }),
    ]);
  });
  return el('div', { class: 'table-scroll' }, [
    el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'When' }), el('th', { text: 'Action' }),
        el('th', { text: 'Who' }), el('th', { text: 'Target' }),
        el('th', { text: 'Details' }),
      ])),
      el('tbody', {}, rows),
    ]),
  ]);
}
