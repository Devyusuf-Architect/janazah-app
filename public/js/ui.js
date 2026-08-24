// Small DOM helpers. No framework: this app is a handful of forms and lists,
// and a build step would cost more than it saves.

/** Escape text for interpolation into innerHTML. */
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined && v !== false) {
      node.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

let toastTimer;
export function toast(message, kind = 'info') {
  const bar = $('#toast');
  bar.textContent = message;
  bar.className = `toast toast--${kind} is-visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => bar.classList.remove('is-visible'), 5200);
}

/** Read a form into a plain object, with checkboxes as booleans. */
export function readForm(formEl) {
  const out = {};
  for (const field of formEl.elements) {
    if (!field.name) continue;
    out[field.name] = field.type === 'checkbox' ? field.checked : field.value;
  }
  return out;
}

export function fillForm(formEl, values) {
  for (const field of formEl.elements) {
    if (!field.name || !(field.name in values)) continue;
    if (field.type === 'checkbox') field.checked = !!values[field.name];
    else field.value = values[field.name] ?? '';
  }
}

/** Promise-based confirmation. Resolves to the typed reason, or null. */
export function askReason({ title, body, label, confirmText, required = true }) {
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'modal-backdrop' });
    const input = el('textarea', { class: 'field', rows: 3, id: 'reason-input' });
    const err = el('p', { class: 'form-error', hidden: true });

    const close = (value) => { backdrop.remove(); resolve(value); };

    backdrop.append(el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
      el('h2', { text: title }),
      body ? el('p', { class: 'muted', text: body }) : null,
      el('label', { class: 'label', for: 'reason-input', text: label }),
      input,
      err,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Back'),
        el('button', {
          class: 'btn btn--danger',
          type: 'button',
          onclick: () => {
            const value = input.value.trim();
            if (required && !value) {
              err.hidden = false;
              err.textContent = 'A reason is required. It is recorded in the audit trail.';
              return;
            }
            close(value);
          },
        }, confirmText),
      ]),
    ]));

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(null); }
    });
    document.body.append(backdrop);
    input.focus();
  });
}

export function showModal(title, contentNode, { wide = false } = {}) {
  const backdrop = el('div', { class: 'modal-backdrop' });
  const close = () => backdrop.remove();
  backdrop.append(el('div', { class: `modal${wide ? ' modal--wide' : ''}`, role: 'dialog', 'aria-modal': 'true' }, [
    el('h2', { text: title }),
    contentNode,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn', type: 'button', onclick: close }, 'Close'),
    ]),
  ]));
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  return close;
}

/** Turn a Firebase error into something a coordinator can act on. */
export function friendlyError(err) {
  const code = err?.code || '';
  if (code === 'permission-denied') {
    return 'Permission denied. Your organization may not be verified yet, ' +
      'or you may not be authorized to publish for it.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'Email or password is incorrect.';
  }
  if (code === 'auth/email-already-in-use') return 'That email already has an account.';
  if (code === 'auth/weak-password') return 'Password must be at least 6 characters.';
  if (code === 'auth/invalid-email') return 'That email address is not valid.';
  if (code === 'failed-precondition' && /index/i.test(err.message || '')) {
    return 'A Firestore index is still building. Wait a minute and retry, ' +
      'or run: firebase deploy --only firestore:indexes';
  }
  return err?.message || 'Something went wrong.';
}
