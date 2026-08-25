// Account security for coordinators and administrators.
//
// A compromised coordinator account can publish a fraudulent Janazah in a
// masjid's name, which is the worst thing this system can be made to do. A
// second factor is the cheapest defence against it, so this screen exists
// even though it is not the most interesting part of the app.
//
// Time-based codes rather than SMS: no phone number is collected, and SMS is
// the weakest of the common second factors.

import {
  multiFactor, TotpMultiFactorGenerator, sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../firebase.js';
import { el, toast, friendlyError } from '../ui.js';

const ISSUER = "Ta'ziyah";

/** Identity Platform is a paid-tier switch; say so rather than failing oddly. */
function unavailableMessage(err) {
  const code = err?.code || '';
  if (code === 'auth/operation-not-allowed' || code === 'auth/unsupported-first-factor'
      || /identity platform|not enabled|admin-restricted/i.test(err?.message || '')) {
    return 'Two-step sign-in is not switched on for this project yet. It needs ' +
           'the Identity Platform upgrade with TOTP enabled. See ' +
           'docs/phase-5-notes.md.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'For security, sign out and sign in again before changing this.';
  }
  return friendlyError(err);
}

export function renderAccount(mount, ctx) {
  mount.replaceChildren();

  mount.append(el('div', { class: 'page-head' }, [
    el('h1', { text: 'Account security' }),
  ]));

  const enrolled = enrolledFactors();

  mount.append(el('div', { class: 'card card--narrow' }, [
    el('h2', { text: 'Signed in as' }),
    el('p', { class: 'mono', text: ctx.user.email || ctx.user.uid }),
    el('button', {
      class: 'btn',
      onclick: async () => {
        try {
          await sendPasswordResetEmail(auth, ctx.user.email);
          toast('A password reset link is on its way.');
        } catch (err) {
          toast(friendlyError(err), 'error');
        }
      },
    }, 'Change password'),
  ]));

  const card = el('div', { class: 'card card--narrow' }, [
    el('h2', { text: 'Two-step sign-in' }),
    el('p', { class: 'muted' },
      'An authenticator app generates a six-digit code that is needed alongside ' +
      'your password. This account can publish notices in your masjid’s name, ' +
      'so it is worth the extra step.'),
  ]);

  if (enrolled.length) {
    card.append(
      el('p', { class: 'notice-strip notice-strip--ok', text: 'Two-step sign-in is on.' }),
      el('ul', { class: 'list' }, enrolled.map((factor) => el('li', { class: 'list-row' }, [
        el('div', {}, [
          el('strong', { text: factor.displayName || 'Authenticator app' }),
          el('p', {
            class: 'muted small',
            text: factor.enrollmentTime
              ? `Added ${new Date(factor.enrollmentTime).toLocaleDateString('en-CA')}`
              : '',
          }),
        ]),
        el('button', {
          class: 'btn btn--small btn--danger',
          onclick: () => unenrol(factor, mount, ctx),
        }, 'Remove'),
      ]))),
    );
  } else {
    card.append(
      el('p', { class: 'notice-strip notice-strip--warn', text: 'Two-step sign-in is off.' }),
      el('button', {
        class: 'btn btn--primary',
        onclick: (event) => beginEnrolment(event.target, mount, ctx),
      }, 'Set up two-step sign-in'),
    );
  }

  mount.append(card);
}

function enrolledFactors() {
  try {
    return multiFactor(auth.currentUser).enrolledFactors || [];
  } catch {
    return [];
  }
}

async function beginEnrolment(button, mount, ctx) {
  button.disabled = true;
  button.textContent = 'Preparing…';

  let secret;
  try {
    const session = await multiFactor(auth.currentUser).getSession();
    secret = await TotpMultiFactorGenerator.generateSecret(session);
  } catch (err) {
    toast(unavailableMessage(err), 'error');
    button.disabled = false;
    button.textContent = 'Set up two-step sign-in';
    return;
  }

  let uri = '';
  try {
    uri = secret.generateQrCodeUrl(auth.currentUser.email || 'coordinator', ISSUER);
  } catch {
    uri = '';
  }

  const error = el('p', { class: 'form-error', hidden: true });
  const code = el('input', {
    class: 'field', id: 'totp-code', inputmode: 'numeric', autocomplete: 'one-time-code',
    maxlength: 6, placeholder: '123456',
  });

  const confirm = el('button', { class: 'btn btn--primary' }, 'Turn on two-step sign-in');
  confirm.addEventListener('click', async () => {
    error.hidden = true;
    confirm.disabled = true;
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        secret, code.value.trim());
      await multiFactor(auth.currentUser).enroll(assertion, 'Authenticator app');
      toast('Two-step sign-in is on. Keep your recovery options safe.');
      renderAccount(mount, ctx);
    } catch (err) {
      error.hidden = false;
      error.textContent = err?.code === 'auth/invalid-verification-code'
        ? 'That code was not accepted. Codes change every 30 seconds, so try the current one.'
        : unavailableMessage(err);
      confirm.disabled = false;
    }
  });

  mount.replaceChildren(el('div', { class: 'card card--narrow' }, [
    el('h1', { text: 'Set up two-step sign-in' }),
    el('ol', { class: 'list' }, [
      el('li', { text: 'Open an authenticator app, such as the one built into your password manager.' }),
      el('li', { text: 'Add a new account using the key below.' }),
      el('li', { text: 'Enter the six-digit code it shows.' }),
    ]),

    el('label', { class: 'label', text: 'Setup key' }),
    el('p', { class: 'mono field', text: secret.secretKey }),
    el('p', { class: 'hint' },
      'Type this into your authenticator app. Some apps also accept the full ' +
      'setup link below.'),

    uri ? el('details', {}, [
      el('summary', { text: 'Show the full setup link' }),
      el('p', { class: 'mono small', style: 'word-break:break-all', text: uri }),
    ]) : null,

    el('div', { class: 'field-group' }, [
      el('label', { class: 'label', for: 'totp-code', text: 'Six-digit code' }),
      code,
    ]),
    error,
    el('div', { class: 'form-actions' }, [
      confirm,
      el('button', {
        class: 'btn', onclick: () => renderAccount(mount, ctx),
      }, 'Cancel'),
    ]),
  ]));
  code.focus();
}

async function unenrol(factor, mount, ctx) {
  try {
    await multiFactor(auth.currentUser).unenroll(factor);
    toast('Two-step sign-in removed.');
    renderAccount(mount, ctx);
  } catch (err) {
    toast(unavailableMessage(err), 'error');
  }
}
