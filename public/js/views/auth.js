// Sign in and sign up for coordinators and platform admins.

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  updateProfile, sendPasswordResetEmail, getMultiFactorResolver,
  TotpMultiFactorGenerator,
} from 'firebase/auth';
import { auth } from '../firebase.js';
import { el, toast, friendlyError } from '../ui.js';

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

export function renderAuth(mount) {
  mount.replaceChildren();

  let mode = 'signin';
  const error = el('p', { class: 'form-error', hidden: true });

  const form = el('form', { class: 'card card--narrow' });
  const nameField = el('div', { class: 'field-group', hidden: true }, [
    el('label', { class: 'label', for: 'displayName', text: 'Your name' }),
    el('input', { class: 'field', id: 'displayName', name: 'displayName', autocomplete: 'name' }),
  ]);

  const title = el('h1', { text: 'Sign in' });
  const blurb = el('p', {
    class: 'muted',
    text: 'For masjid staff, funeral coordinators and platform administrators.',
  });
  const submit = el('button', { class: 'btn btn--primary', type: 'submit' }, 'Sign in');
  const toggle = el('button', { class: 'btn btn--link', type: 'button' }, 'Create an account');

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
      el('p', {
        class: 'hint',
        text: 'At least 8 characters. Use a password manager; this account can ' +
              'publish notices in your masjid’s name.',
      }),
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
