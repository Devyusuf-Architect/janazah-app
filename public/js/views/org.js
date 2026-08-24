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

export function renderOrgs(mount, ctx) {
  mount.replaceChildren();
  const { orgs } = ctx;

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
      text: 'A platform administrator reviews every registration before it can ' +
            'publish. Give details that make verification straightforward.',
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
    field('contactEmail', 'Contact email for verification', { type: 'email' },
      'Used by the platform administrator only. Not shown on public notices.'),
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
      toast('Registered. A platform administrator will review it.');
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
