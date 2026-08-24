// Platform administrator: verification queue, notice takedown, audit review.

import {
  collection, query, orderBy, limit, getDocs, where,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { el, toast, friendlyError, askReason, showModal } from '../ui.js';
import { statusBadge, renderAuditTable } from './org.js';
import { publicNoticeView } from '../notice-view.js';
import { ORG_TYPES } from '../model.js';
import * as store from '../store.js';

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
    'Verification queue': () => queueView(panel, 'pending', ctx),
    'Verified': () => queueView(panel, 'verified', ctx),
    'Suspended': () => queueView(panel, 'suspended', ctx),
    'Reports': () => reportsView(panel),
    'Audit log': () => auditView(panel),
  };

  let active = 'Verification queue';
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
        el('p', { text: `No ${status} organizations.` }),
      ]));
      return;
    }
    for (const org of orgs) panel.append(orgReviewCard(org));
  }));
}

function orgReviewCard(org) {
  const decide = async (nextStatus, { title, label, confirmText, required = true }) => {
    const reason = await askReason({ title, body: `Organization: ${org.name}`, label, confirmText, required });
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
        title: 'Verify this organization?',
        label: 'What did you check? (recorded in the audit trail)',
        confirmText: 'Verify',
      }),
    }, 'Verify'));
  }
  if (org.verificationStatus === 'pending') {
    actions.push(el('button', {
      class: 'btn btn--small',
      onclick: () => decide('rejected', {
        title: 'Decline this registration?',
        label: 'Reason shown to the applicant',
        confirmText: 'Decline',
      }),
    }, 'Decline'));
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
      el('dt', { text: 'Registered' }),
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

async function reportsView(panel) {
  panel.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
  try {
    const snap = await getDocs(query(
      collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(100)));
    const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!reports.length) {
      panel.replaceChildren(el('div', { class: 'empty' }, [
        el('p', { text: 'No reports. The community reporting form arrives with the public feed in Phase 2.' }),
      ]));
      return;
    }
    panel.replaceChildren(...reports.map((r) => el('div', { class: 'card' }, [
      el('h3', { text: r.reason }),
      el('p', { class: 'muted mono', text: `notice ${r.noticeId}` }),
      r.detail ? el('p', { text: r.detail }) : null,
      el('span', { class: 'badge badge--warn', text: r.status }),
    ])));
  } catch (err) {
    panel.replaceChildren(el('p', { class: 'form-error', text: friendlyError(err) }));
  }
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
