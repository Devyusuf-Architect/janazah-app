// Sign in and sign up for coordinators and platform admins.

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  updateProfile, sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../firebase.js';
import { el, toast, friendlyError } from '../ui.js';

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
      text: 'Multi-factor authentication is not enabled in this phase. It needs ' +
            'the Identity Platform upgrade and is planned before public launch.',
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
      error.hidden = false;
      error.textContent = friendlyError(err);
    } finally {
      submit.disabled = false;
    }
  });

  mount.append(form);
}

export const signOutUser = () => signOut(auth);
