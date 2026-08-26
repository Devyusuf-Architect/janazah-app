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

// Inline SVG icons. No dependency, no icon font, no network request, and they
// inherit colour and size from their surroundings. Marked aria-hidden so the
// button's text remains its accessible name.
const ICON_PATHS = {
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  pin: 'M12 21s7-5.686 7-11a7 7 0 1 0-14 0c0 5.314 7 11 7 11Z|M12 10.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z',
  route: 'M9 20 3 17V4l6 3m0 13 6-3m-6 3V7m6 10 6 3V7l-6-3m0 13V4',
  share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0',
  bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Zm0 0v7',
  warning: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01',
  check: 'M20 6 9 17l-5-5',
  plus: 'M12 5v14M5 12h14',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  grid: 'M3 6h18M3 12h18M3 18h18',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  building: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 10h.01M15 10h.01M12 13h.01',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  x: 'M18 6 6 18M6 6l12 12',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
};

/** @param {keyof ICON_PATHS} name */
export function icon(name, { size = 18 } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  for (const d of (ICON_PATHS[name] || '').split('|')) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Placeholder cards, so a slow network shows shape rather than the word "Loading". */
export function skeleton(count = 3) {
  return el('div', { class: 'skeletons', 'aria-hidden': 'true' },
    Array.from({ length: count }, () => el('div', { class: 'skeleton-card' }, [
      el('span', { class: 'skeleton skeleton--sm' }),
      el('span', { class: 'skeleton skeleton--lg' }),
      el('span', { class: 'skeleton skeleton--md' }),
      el('span', { class: 'skeleton skeleton--md' }),
    ])));
}

let toastTimer;
export function toast(message, kind = 'info') {
  const bar = $('#toast');
  bar.textContent = message;
  bar.className = `toast toast--${kind} is-visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => bar.classList.remove('is-visible'), 5200);
}

/**
 * Append children, skipping absent ones.
 *
 * Native append() renders null as the text "null", which is how a stray
 * "null" ends up on a page built from conditional fragments.
 */
export function append(parent, ...children) {
  for (const child of children.flat()) {
    if (child == null) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return parent;
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

// What "permission denied" means depends entirely on what was being
// attempted, and the wrong one of these is worse than no message at all.
// Telling someone filling in a registration form that their organization
// "may not be verified yet" is both meaningless (they are creating it; there
// is nothing to verify yet) and discouraging at exactly the moment they are
// deciding whether to trust the platform.
const PERMISSION_DENIED = {
  register:
    'Your registration could not be saved. Nothing you entered is wrong, and ' +
    'this is not something you can fix by changing it. Please try again in a ' +
    'moment. If it keeps happening, the platform administrators need to know.',
  load:
    'Some of this page could not be loaded. Your account is fine; this is a ' +
    'problem on our side.',
  publish:
    'This organization cannot publish yet. It needs to be approved by a ' +
    'platform administrator first, and you need to be authorized to publish ' +
    'for it.',
  // Following is a community action. It needs no account, no membership of
  // the organization and no coordinator rights, so a failure here must never
  // borrow the publishing message: it would tell someone who just wants to
  // keep up with a masjid that they are not authorized to publish for it,
  // which is both untrue and alarming.
  follow:
    'We could not follow this masjid right now. Please try again in a moment.',
  orgList:
    'The list of masjids could not be loaded right now. Please try again in a ' +
    'moment.',
  // Specifically the "which organizations am I staff of" lookup. An empty
  // result is normal for a new coordinator and is never an error; this is
  // only for the query genuinely failing, which they cannot fix and which
  // must not stop them registering.
  orgLoad:
    'We could not check which masjids you belong to. That is a problem on our ' +
    'side, not with your account, and it does not stop you registering below.',
  default:
    'Permission denied. Your organization may not be verified yet, or you ' +
    'may not be authorized to publish for it.',
};

/**
 * Turn a Firebase error into something a coordinator can act on.
 *
 * @param {*} err
 * @param {'register'|'load'|'publish'} [context]  Which PERMISSION_DENIED
 *   message fits what was being attempted. Only affects that one code.
 */
export function friendlyError(err, context) {
  const code = err?.code || '';
  if (code === 'permission-denied') {
    return PERMISSION_DENIED[context] || PERMISSION_DENIED.default;
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'Email or password is incorrect.';
  }
  // Firebase refuses OAuth on any origin not listed under Authentication >
  // Settings > Authorized domains. Naming the actual domain turns this from
  // a dead end into a one-line fix, and it is the failure that greets you
  // the first time the app is served from anywhere but Firebase Hosting.
  if (code === 'auth/unauthorized-domain') {
    return `Google sign-in is not allowed from ${location.hostname}. Add that ` +
      'domain in the Firebase console under Authentication, Settings, ' +
      'Authorized domains.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'That sign-in method is not switched on for this project yet.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'You already have an account with that email address, created a ' +
      'different way. Sign in with your email and password instead.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Your browser blocked the sign-in window. Allow pop-ups for this ' +
      'site, or try again and we will send you to Google instead.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Could not reach the sign-in service. Check your connection and try again.';
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
