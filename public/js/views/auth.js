// Sign in and sign up. Shared by the console (coordinators, platform
// administrators) and the public site (community members): the same Firebase
// project, the same accounts, the same rules-enforced roles either way. Only
// the copy differs, via `variant`, since "this account can publish notices in
// your masjid's name" is true for one audience and not the other.

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  updateProfile, sendPasswordResetEmail, getMultiFactorResolver,
  GoogleAuthProvider, signInWithPopup,
  TotpMultiFactorGenerator,
} from 'firebase/auth';
import { auth } from '../firebase.js';
import { el, toast, friendlyError } from '../ui.js';

const COPY = {
  coordinator: {
    blurb: 'For masjid staff, funeral coordinators and platform administrators.',
    passwordHint: 'At least 8 characters. Use a password manager; this account can ' +
      'publish notices in your masjid’s name.',
  },
  community: {
    blurb: 'For a personal dashboard: followed masajid, alert settings and ' +
      'account security in one place. Reading notices never requires this.',
    passwordHint: 'At least 8 characters. Use a password manager.',
  },
};

/**
 * Second step of sign-in for an account with two-step sign-in on.
 * Resolves once the code is accepted; rejects if the person backs out.
 */
function askForCode(resolver) {
  return new Promise((resolve, reject) => {
    const error = el('p', { class: 'form-error', hidden: true });
    const code = el('input', {
      class: 'field', id: 'mfa-code', inputmode: 'numeric',
      autocomplete: 'one-time-code', maxlength: 6, placeholder: '123456',
    });
    const backdrop = el('div', { class: 'modal-backdrop' });
    const submit = el('button', { class: 'btn btn--primary' }, 'Verify');

    submit.addEventListener('click', async () => {
      error.hidden = true;
      submit.disabled = true;
      try {
        const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID)
          || resolver.hints[0];
        const assertion = TotpMultiFactorGenerator.assertionForSignIn(
          hint.uid, code.value.trim());
        await resolver.resolveSignIn(assertion);
        backdrop.remove();
        resolve();
      } catch (err) {
        error.hidden = false;
        error.textContent = err?.code === 'auth/invalid-verification-code'
          ? 'That code was not accepted. Codes change every 30 seconds.'
          : friendlyError(err);
        submit.disabled = false;
      }
    });

    backdrop.append(el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
      el('h2', { text: 'Enter your six-digit code' }),
      el('p', { class: 'muted', text: 'From your authenticator app.' }),
      code,
      error,
      el('div', { class: 'modal-actions' }, [
        el('button', {
          class: 'btn',
          onclick: () => { backdrop.remove(); reject(new Error('cancelled')); },
        }, 'Cancel'),
        submit,
      ]),
    ]));
    document.body.append(backdrop);
    code.focus();
  });
}

export function renderAuth(mount, { variant = 'coordinator', initialMode = 'signin' } = {}) {
  mount.replaceChildren();
  const copy = COPY[variant] || COPY.coordinator;

  let mode = initialMode === 'signup' ? 'signup' : 'signin';
  const error = el('p', { class: 'form-error', hidden: true });

  const form = el('form', { class: 'card card--narrow' });
  const nameField = el('div', { class: 'field-group', hidden: mode !== 'signup' }, [
    el('label', { class: 'label', for: 'displayName', text: 'Your name' }),
    el('input', { class: 'field', id: 'displayName', name: 'displayName', autocomplete: 'name' }),
  ]);

  const title = el('h1', { text: mode === 'signup' ? 'Create an account' : 'Sign in' });
  const blurb = el('p', { class: 'muted', text: copy.blurb });
  const submit = el('button', { class: 'btn btn--primary', type: 'submit' },
    mode === 'signup' ? 'Create account' : 'Sign in');
  const toggle = el('button', { class: 'btn btn--link', type: 'button' },
    mode === 'signup' ? 'I already have an account' : 'Create an account');
  const passwordHint = el('p', { class: 'hint', text: copy.passwordHint });

  const google = el('button', { class: 'btn btn--google', type: 'button' }, [
    googleMark(),
    el('span', { text: 'Continue with Google' }),
  ]);
  google.addEventListener('click', async () => {
    error.hidden = true;
    google.disabled = true;
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        error.hidden = false;
        error.textContent = friendlyError(err);
      }
    } finally {
      google.disabled = false;
    }
  });

  toggle.addEventListener('click', () => {
    mode = mode === 'signin' ? 'signup' : 'signin';
    const signup = mode === 'signup';
    title.textContent = signup ? 'Create an account' : 'Sign in';
    submit.textContent = signup ? 'Create account' : 'Sign in';
    toggle.textContent = signup ? 'I already have an account' : 'Create an account';
    nameField.hidden = !signup;
    error.hidden = true;
  });

  form.append(
    title,
    blurb,
    google,
    el('div', { class: 'auth-divider' }, [el('span', { text: 'or' })]),
    nameField,
    el('div', { class: 'field-group' }, [
      el('label', { class: 'label', for: 'email', text: 'Email' }),
      el('input', {
        class: 'field', id: 'email', name: 'email', type: 'email',
        required: true, autocomplete: 'email',
      }),
    ]),
    el('div', { class: 'field-group' }, [
      el('label', { class: 'label', for: 'password', text: 'Password' }),
      el('input', {
        class: 'field', id: 'password', name: 'password', type: 'password',
        required: true, minlength: 8, autocomplete: 'current-password',
      }),
      passwordHint,
    ]),
    error,
    el('div', { class: 'form-actions' }, [submit, toggle]),
    el('button', { class: 'btn btn--link btn--quiet', type: 'button', id: 'reset' }, 'Forgot password'),
    el('p', {
      class: 'hint hint--boxed',
      text: 'If two-step sign-in is on for your account, you will be asked for ' +
            'a six-digit code next. You can turn it on under Account once ' +
            'signed in.',
    }),
  );

  form.querySelector('#reset').addEventListener('click', async () => {
    const email = form.elements.email.value.trim();
    if (!email) { toast('Enter your email first, then choose Forgot password.', 'warn'); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      toast('If that account exists, a reset link is on its way.');
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    submit.disabled = true;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const displayName = form.elements.displayName.value.trim();
        if (displayName) await updateProfile(cred.user, { displayName });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      if (err?.code === 'auth/multi-factor-auth-required') {
        try {
          await askForCode(getMultiFactorResolver(auth, err));
          return;
        } catch (cancelled) {
          if (cancelled?.message !== 'cancelled') {
            error.hidden = false;
            error.textContent = friendlyError(cancelled);
          }
          return;
        }
      }
      error.hidden = false;
      error.textContent = friendlyError(err);
    } finally {
      submit.disabled = false;
    }
  });

  mount.append(form);
}

export const signOutUser = () => signOut(auth);

/** The four-colour "G", inline so sign-in needs no icon font or network request. */
function googleMark() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 18 18');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z"/>' +
    '<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.85.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z"/>' +
    '<path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z"/>' +
    '<path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z"/>';
  return svg;
}
