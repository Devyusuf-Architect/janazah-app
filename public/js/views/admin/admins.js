// Admin management: who holds platform administration, and how it is given
// and taken away.
//
// firestore.rules still has `allow write: if false` on /admins, for every
// caller without exception, and nothing on this screen writes there. The two
// controls below call Cloud Functions instead (functions/index.js,
// grantAdmin and revokeAdmin), which use the Admin SDK and check the caller's
// own administrator record on the server before doing anything.
//
// That is a stronger arrangement than a rule on a collection browsers can
// write to, not a way around one. The rule that decides who may hand out
// administration lives in code nobody can reach by holding a session token,
// the check is made against the caller's verified uid rather than anything
// the page sends, and every grant and revoke lands in the audit log written
// by the same Admin SDK.
//
// Two things this screen deliberately will not do. It will not offer to
// revoke your own access, because a platform with no administrators can only
// be repaired from the Firebase console. And it cannot invite anybody: an
// account has to exist before it can be given anything, so the person has to
// sign up first, and the function says so plainly when they have not.

import { el, toast, friendlyError, askReason } from '../../ui.js';
import * as store from '../../store.js';
import {
  sectionHead, emptyState, loading, errorState, dataTable, uidChip, fmtDate,
  actionError,
} from './common.js';

export function renderAdmins(panel, actx, ctx) {
  const head = () => sectionHead('Admin management',
    'Who holds platform administration, and how it is given and taken away.');

  const body = el('div', { class: 'admin-body' });
  panel.replaceChildren(head(), body);
  body.append(loading());

  const load = () => {
    store.listPlatformAdmins()
      .then((admins) => paint(admins.sort((a, b) =>
        (a.email || a.uid).localeCompare(b.email || b.uid)), null))
      .catch((err) => paint([], err));
  };

  const revoke = async (admin) => {
    const confirmed = await askReason({
      title: 'Remove this administrator?',
      body: `${admin.email || admin.uid} will lose the ability to verify `
        + 'organizations, moderate notices and change platform settings. Their '
        + 'account itself is untouched, and everything they have already done '
        + 'stays in the audit log under their name.',
      label: 'Why (recorded in the audit trail)',
      confirmText: 'Remove access',
    });
    if (confirmed === null) return;
    try {
      await store.revokePlatformAdmin(admin.uid, confirmed);
      toast(`${admin.email || admin.uid} is no longer an administrator.`);
      load();
    } catch (err) {
      toast(actionError(err), 'error');
    }
  };

  const grantCard = () => {
    const input = el('input', {
      class: 'field',
      type: 'email',
      id: 'grant-admin-email',
      placeholder: 'name@example.com',
      autocomplete: 'off',
      'aria-describedby': 'grant-admin-hint',
    });
    const error = el('p', { class: 'form-error', hidden: true });
    const button = el('button', { class: 'btn btn--primary', type: 'submit' },
      'Make administrator');

    const form = el('form', { class: 'admin-grant' }, [
      el('label', { class: 'label', for: 'grant-admin-email', text: 'Email address' }),
      input,
      el('p', { class: 'hint', id: 'grant-admin-hint' },
        'The address they sign in to Ta’ziyah with. They must already have an '
        + 'account: administration can only be given to an account that '
        + 'exists, and there is no way to invite somebody who has never '
        + 'signed in.'),
      error,
      el('div', { class: 'admin-actions' }, [button]),
    ]);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.hidden = true;
      const email = input.value.trim();
      if (!email) {
        error.hidden = false;
        error.textContent = 'Enter the email address of the person to make an administrator.';
        return;
      }
      button.disabled = true;
      try {
        const result = await store.grantPlatformAdmin(email);
        toast(`${result?.email || email} is now a platform administrator.`);
        input.value = '';
        load();
      } catch (err) {
        // The function's own wording is shown as it stands. It names the
        // actual problem, most often that nobody has signed up with this
        // address yet, which is something the administrator can act on.
        error.hidden = false;
        error.textContent = actionError(err);
      } finally {
        button.disabled = false;
      }
    });

    return el('section', { class: 'admin-card' }, [
      el('div', { class: 'admin-card__head' }, [
        el('div', {}, [
          el('h2', { class: 'admin-card__title', text: 'Add an administrator' }),
          el('p', { class: 'admin-card__sub muted', text:
            'Granting this gives one person the run of the platform. Give it '
            + 'to as few people as the work allows.' }),
        ]),
      ]),
      el('div', { class: 'admin-card__body' }, [form]),
    ]);
  };

  const paint = (admins, error) => {
    const rows = admins.map((admin) => {
      const isSelf = admin.uid === ctx?.user?.uid;
      return el('tr', {}, [
        el('td', {}, uidChip(admin.uid)),
        el('td', { text: admin.email || 'not recorded' }),
        el('td', { class: 'nowrap', text: admin.grantedAt ? fmtDate(admin.grantedAt) : 'before this was recorded' }),
        el('td', {}, isSelf
          // No revoke control for yourself, at all. The server refuses it too,
          // so this is not the thing enforcing it; it is here so nobody is
          // ever one careless click from locking the platform out.
          ? el('span', { class: 'muted small', text: 'you' })
          : el('button', {
            class: 'btn btn--danger btn--small',
            type: 'button',
            onclick: () => revoke(admin),
          }, 'Remove')),
      ]);
    });

    body.replaceChildren(
      el('section', { class: 'admin-card' }, [
        el('div', { class: 'admin-card__head' }, [
          el('div', {}, [
            el('h2', { class: 'admin-card__title', text: 'Platform administrators' }),
            el('p', { class: 'admin-card__sub muted', text:
              'Everyone who can verify an organization, moderate a notice and '
              + 'change platform settings.' }),
          ]),
        ]),
        el('div', { class: 'admin-card__body' }, [
          error
            ? errorState(friendlyError(error, 'load'))
            : (admins.length
              ? dataTable(['Account', 'Email', 'Granted', ''], rows)
              : emptyState('No administrator records could be read.')),
        ]),
      ]),

      grantCard(),

      el('section', { class: 'admin-card' }, [
        el('div', { class: 'admin-card__head' }, [
          el('div', {}, [
            el('h2', { class: 'admin-card__title', text: 'How this is protected' }),
          ]),
        ]),
        el('div', { class: 'admin-card__body' }, [
          el('p', {},
            'The security rules still refuse every write to the administrator '
            + 'records from every account, including yours. Nothing on this '
            + 'page writes to them.'),
          el('p', {},
            'The two controls above call the server instead, which checks that '
            + 'you are an administrator before it acts, using your signed-in '
            + 'identity rather than anything this page tells it. So a session '
            + 'taken over in a browser cannot mint a second administrator by '
            + 'talking to the database directly.'),
          el('p', {},
            'You cannot remove your own access here, and the server refuses it '
            + 'as well. A platform left with no administrators can only be put '
            + 'right from the Firebase console, and that is not a state one '
            + 'click should be able to reach.'),
          el('p', {},
            'Every grant and every removal is written to the audit log by the '
            + 'server, under the name of whoever did it. That log is '
            + 'append-only and no account can edit it.'),
        ]),
      ]),
    );
  };

  load();
  actx.watch(() => {});
}
