// Users and Staff: the two views of who has access to what.
//
// A caveat that belongs at the top rather than buried in the UI: Ta'ziyah has
// no /users collection, deliberately. It keeps no server-side profile of
// anybody, and a browser cannot enumerate Firebase Authentication accounts.
// So this is not a user directory and does not pretend to be one. What it can
// show, honestly and completely, is every account that has been attached to
// an organization or granted platform administration: owners, staff, people
// who have asked to join, and administrators. Somebody who signed up, follows
// three masjids and reads the feed appears nowhere here, and there is no
// screen in this portal that would show them, because nothing about them is
// stored.
//
//   Users  the roll: one row per account, and everywhere it appears.
//   Staff  the work: join requests waiting on a decision, and the ability to
//          remove somebody's access to an organization.
//
// Removing staff and deciding a join request both write to documents watched
// by audit triggers (functions/index.js), so both are recorded against the
// administrator who did them without this file writing anything itself.

import { el, toast, friendlyError, askReason } from '../../ui.js';
import * as store from '../../store.js';
import {
  sectionHead, emptyState, loading, errorState, toolbar, searchField, filterChips,
  dataTable, fmtDate, uidChip, caveat,
} from './common.js';

/**
 * Everything knowable about the people on this platform, gathered from the
 * places it is actually stored.
 *
 * One read of the organizations, then one read of each organization's join
 * requests, which is where an email address is recorded. Bounded by how many
 * organizations exist, which is the right order of magnitude for a portal.
 */
async function gatherPeople(orgs) {
  const requestsByOrg = await Promise.all(orgs.map((org) =>
    store.listStaffRequests(org.id).then((rs) => ({ org, requests: rs })).catch(() => ({ org, requests: [] }))));

  const admins = await store.listPlatformAdmins().catch(() => []);
  const adminUids = new Set(admins.map((a) => a.uid));

  /** @type {Map<string, {uid, email, isAdmin, memberships, requests}>} */
  const people = new Map();
  const ensure = (uid) => {
    if (!people.has(uid)) {
      people.set(uid, {
        uid,
        email: '',
        isAdmin: adminUids.has(uid),
        memberships: [],
        requests: [],
      });
    }
    return people.get(uid);
  };

  for (const admin of admins) {
    const person = ensure(admin.uid);
    person.isAdmin = true;
    if (admin.email) person.email = admin.email;
  }

  for (const org of orgs) {
    for (const uid of org.staffUids || []) {
      ensure(uid).memberships.push({
        org, role: uid === org.ownerUid ? 'Owner' : 'Staff',
      });
    }
  }

  for (const { org, requests } of requestsByOrg) {
    for (const request of requests) {
      const person = ensure(request.uid);
      if (request.email && !person.email) person.email = request.email;
      person.requests.push({ org, request });
    }
  }

  return {
    people: [...people.values()].sort((a, b) =>
      (b.memberships.length - a.memberships.length)
      || (a.email || a.uid).localeCompare(b.email || b.uid)),
    requestsByOrg,
    admins,
  };
}

// ------------------------------------------------------------------ users

export function renderUsers(panel, actx) {
  const state = { data: null, error: null, role: 'all', term: '' };

  const head = () => sectionHead('Users',
    'Every account attached to an organization or granted platform '
    + 'administration.');

  const body = el('div', { class: 'admin-body' });

  const ROLES = [
    { value: 'all', label: 'Everyone' },
    { value: 'owner', label: 'Owners' },
    { value: 'staff', label: 'Staff' },
    { value: 'admin', label: 'Administrators' },
    { value: 'pending', label: 'Waiting to join' },
  ];

  const matchesRole = (person) => {
    if (state.role === 'all') return true;
    if (state.role === 'admin') return person.isAdmin;
    if (state.role === 'owner') return person.memberships.some((m) => m.role === 'Owner');
    if (state.role === 'staff') return person.memberships.some((m) => m.role === 'Staff');
    return person.requests.some(({ request }) => request.status === 'pending');
  };

  const paint = () => {
    panel.replaceChildren(
      head(),
      caveat('This is not a list of everybody who has an account. Ta’ziyah '
        + 'stores no profile of a community member, so somebody who signed up to '
        + 'follow a masjid is not recorded anywhere and cannot be listed here. '
        + 'Nobody’s location, travel or attendance is stored either, by anyone, '
        + 'and no screen in this portal can show it.'),
      toolbar([
        searchField('Search by email or account id', (term) => {
          state.term = term.toLowerCase();
          paintBody();
        }),
        filterChips(ROLES, state.role, (value) => { state.role = value; paintBody(); }),
      ]),
      body,
    );
    paintBody();
  };

  const paintBody = () => {
    body.replaceChildren();
    if (state.error) { body.append(errorState(friendlyError(state.error, 'load'))); return; }
    if (!state.data) { body.append(loading()); return; }

    const matches = state.data.people
      .filter(matchesRole)
      .filter((p) => !state.term
        || `${p.email} ${p.uid}`.toLowerCase().includes(state.term));

    if (!matches.length) {
      body.append(emptyState('No accounts match this filter.'));
      return;
    }

    body.append(dataTable(
      ['Account', 'Email', 'Organizations', 'Platform admin', 'Waiting to join'],
      matches.map((person) => el('tr', {}, [
        el('td', {}, uidChip(person.uid)),
        el('td', { text: person.email || 'not recorded' }),
        el('td', {}, person.memberships.length
          ? el('span', {
            text: person.memberships
              .map((m) => `${m.org.name} (${m.role.toLowerCase()})`).join(', '),
          })
          : el('span', { class: 'muted', text: 'none' })),
        el('td', { text: person.isAdmin ? 'yes' : '' }),
        el('td', {
          text: person.requests.filter(({ request }) => request.status === 'pending')
            .map(({ org }) => org.name).join(', '),
        }),
      ])),
    ));
    body.append(el('p', { class: 'hint' },
      `${matches.length} account${matches.length === 1 ? '' : 's'} shown. An email `
      + 'address is only recorded when somebody asked to join an organization, or '
      + 'when it was entered alongside their administrator record.'));
  };

  paint();
  actx.watch(store.watchAllOrganizations(async (orgs, err) => {
    if (err) { state.error = err; paint(); return; }
    try {
      state.data = await gatherPeople(orgs || []);
      state.error = null;
    } catch (loadError) {
      state.error = loadError;
    }
    paint();
  }));
}

// ------------------------------------------------------------------ staff

export function renderStaff(panel, actx) {
  const state = { data: null, error: null, filter: 'pending' };

  const head = () => sectionHead('Staff',
    'Who may publish for each organization, and who has asked to.');

  const body = el('div', { class: 'admin-body' });

  const FILTERS = [
    { value: 'pending', label: 'Requests waiting' },
    { value: 'decided', label: 'Requests decided' },
    { value: 'rosters', label: 'Staff by organization' },
  ];

  const paint = () => {
    panel.replaceChildren(
      head(),
      toolbar([filterChips(FILTERS.map((f) => ({
        ...f,
        count: state.data ? countFor(f.value) : undefined,
      })), state.filter, (value) => { state.filter = value; paintBody(); })]),
      body,
    );
    paintBody();
  };

  const allRequests = () => (state.data?.requestsByOrg || [])
    .flatMap(({ org, requests }) => requests.map((request) => ({ org, request })));

  const countFor = (value) => {
    if (value === 'rosters') return state.data.requestsByOrg.length;
    const pending = allRequests().filter(({ request }) => request.status === 'pending');
    return value === 'pending' ? pending.length : allRequests().length - pending.length;
  };

  const paintBody = () => {
    body.replaceChildren();
    if (state.error) { body.append(errorState(friendlyError(state.error, 'load'))); return; }
    if (!state.data) { body.append(loading()); return; }

    if (state.filter === 'rosters') { paintRosters(); return; }

    const wanted = state.filter === 'pending' ? 'is' : 'is not';
    const rows = allRequests().filter(({ request }) =>
      (wanted === 'is') === (request.status === 'pending'));

    if (!rows.length) {
      body.append(emptyState(state.filter === 'pending'
        ? 'Nobody is waiting to join an organization.'
        : 'No join request has been decided yet.'));
      return;
    }

    for (const { org, request } of rows) body.append(requestRow(org, request, actx));
  };

  const paintRosters = () => {
    const orgs = state.data.requestsByOrg.map(({ org }) => org);
    if (!orgs.length) { body.append(emptyState('No organizations are registered yet.')); return; }

    for (const org of orgs) {
      const staff = org.staffUids || [];
      body.append(el('section', { class: 'admin-card' }, [
        el('div', { class: 'admin-card__head' }, [
          el('div', {}, [
            el('h2', { class: 'admin-card__title', text: org.name }),
            el('p', { class: 'admin-card__sub muted', text:
              `${staff.length} account${staff.length === 1 ? '' : 's'} may publish for this organization.` }),
          ]),
        ]),
        el('div', { class: 'admin-card__body' }, [
          dataTable(['Account', 'Role', ''], staff.map((uid) => el('tr', {}, [
            el('td', {}, uidChip(uid)),
            el('td', { text: uid === org.ownerUid ? 'Owner' : 'Staff' }),
            el('td', {}, uid === org.ownerUid
              // The owner is the account the organization belongs to, and
              // firestore.rules pins ownerUid as immutable. Removing them
              // would leave an organization nobody can administer.
              ? el('span', { class: 'muted small', text: 'cannot be removed' })
              : el('button', {
                class: 'btn btn--small btn--danger',
                onclick: () => removeStaff(org, uid, actx),
              }, 'Remove access')),
          ]))),
        ]),
      ]));
    }
  };

  paint();
  actx.watch(store.watchAllOrganizations(async (orgs, err) => {
    if (err) { state.error = err; paint(); return; }
    try {
      state.data = await gatherPeople(orgs || []);
      state.error = null;
    } catch (loadError) {
      state.error = loadError;
    }
    paint();
  }));
}

function requestRow(org, request, actx) {
  const decided = request.status !== 'pending';
  return el('article', { class: 'admin-row' }, [
    el('div', { class: 'admin-row__main' }, [
      el('div', { class: 'admin-row__title' }, [
        el('h3', { text: request.email || request.displayName || 'An account' }),
        el('span', {
          class: `badge badge--${request.status === 'approved' ? 'ok' : request.status === 'rejected' ? 'error' : 'warn'}`,
          text: request.status,
        }),
      ]),
      el('p', { class: 'admin-row__meta muted small' }, [
        el('span', { text: `wants to publish for ${org.name}` }),
        el('span', { text: `asked ${fmtDate(request.requestedAt)}` }),
        el('span', { class: 'mono', text: request.uid }),
      ]),
    ]),
    decided ? null : el('div', { class: 'admin-row__actions' }, [
      el('button', {
        class: 'btn btn--small btn--primary',
        onclick: () => decideRequest(org, request, true, actx),
      }, 'Approve'),
      el('button', {
        class: 'btn btn--small',
        onclick: () => decideRequest(org, request, false, actx),
      }, 'Reject'),
    ]),
  ]);
}

async function decideRequest(org, request, approve, actx) {
  const reason = await askReason({
    title: approve
      ? `Let this account publish for ${org.name}?`
      : `Reject this request to join ${org.name}?`,
    body: approve
      ? 'They will be able to publish, correct and cancel Janazah notices for '
        + 'this organization immediately.'
      : 'They keep their account and can ask again.',
    label: 'What did you check? (recorded in the audit trail)',
    confirmText: approve ? 'Approve' : 'Reject',
  });
  if (reason === null) return;
  try {
    if (approve) {
      await store.approveStaffRequest(org.id, request.uid, org.staffUids || []);
    } else {
      await store.rejectStaffRequest(org.id, request.uid);
    }
    toast(approve ? 'Access granted.' : 'Request rejected.');
    actx?.refresh?.();
  } catch (err) {
    console.error('decideStaffRequest', err);
    toast(friendlyError(err), 'error');
  }
}

async function removeStaff(org, uid, actx) {
  const reason = await askReason({
    title: `Remove this account from ${org.name}?`,
    body: 'They stop being able to publish, correct or cancel notices for this '
        + 'organization. Notices they already published are untouched.',
    label: 'Why? (recorded in the audit trail)',
    confirmText: 'Remove access',
  });
  if (reason === null) return;
  try {
    await store.removeStaff(org.id, uid, org.staffUids || []);
    toast('Access removed.');
    actx?.refresh?.();
  } catch (err) {
    console.error('removeStaff', err);
    toast(friendlyError(err), 'error');
  }
}
