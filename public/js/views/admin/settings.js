// Platform settings: the handful of things an administrator can change about
// how Ta'ziyah behaves, without a deploy.
//
// What is deliberately not here: anything secret, anything that decides who
// may read or write anything, and anything whose wrong value is a breach
// rather than a bad configuration. Sign-in methods, security rules, API keys,
// admin membership and retention policy are all out of scope by design, and
// the ones that are configurable at all are configured somewhere a browser
// cannot reach.
//
// Everything below is stored in one Firestore document, so a change reaches
// every client the same way: the web app, and anything else built against the
// same backend, read the same values from the same place. Nothing is kept on
// the device.
//
// firestore.rules is what actually constrains a write. The bounds repeated in
// this form are there so somebody typing gets told immediately, not so that
// they are the check that matters.

import { el, toast, friendlyError, readForm } from '../../ui.js';
import * as store from '../../store.js';
import {
  platformSettings, setPlatformSettings, normalizeSettings,
  RADIUS_BOUNDS, REMINDER_BOUNDS, ANNOUNCEMENT_MAX, CONTACT_EMAIL_MAX,
  SETTABLE_ORG_TYPES,
} from '../../platform-settings.js';
import { ORG_TYPES } from '../../model.js';
import { renderAdminSample } from '../admin-sample.js';
import { sectionHead, fmtDateTime, caveat } from './common.js';

export function renderSettings(panel, actx) {
  const current = platformSettings();

  const head = sectionHead('Platform settings',
    'Applied to every client that reads this platform, immediately, with no '
    + 'deploy. Nothing here is a secret or a security control.');

  const body = el('div', { class: 'admin-body' });
  panel.replaceChildren(head, body);

  const form = el('form', { class: 'admin-form' });
  const error = el('p', { class: 'form-error', hidden: true });
  const save = el('button', { class: 'btn btn--primary', type: 'submit' }, 'Save settings');

  form.append(
    settingsCard('Alerts', [
      numberField('notificationRadiusKm', 'Default alert radius (km)',
        current.notificationRadiusKm, RADIUS_BOUNDS,
        'Where a device starts before anybody chooses their own distance. Not '
        + 'a cap, and not a way to find out where anyone is.'),
      numberField('reminderMinutes', 'Mark a Janazah as imminent this long before (minutes)',
        current.reminderMinutes, REMINDER_BOUNDS,
        'A notice within this window is flagged as starting soon wherever it '
        + 'appears. Zero switches the flag off.'),
    ]),

    settingsCard('Who may register', [
      el('p', { class: 'label', text: 'Organization types offered on the registration form' }),
      el('div', { class: 'admin-checks' }, SETTABLE_ORG_TYPES.map((type) => el('label', {
        class: 'check',
      }, [
        el('input', {
          type: 'checkbox', name: `type_${type}`, id: `type_${type}`,
          ...(current.organizationTypes.includes(type) ? { checked: true } : {}),
        }),
        el('span', { text: ORG_TYPES.find((t) => t.value === type)?.label || type }),
      ]))),
      el('p', { class: 'hint' },
        'At least one has to stay on, or nobody can register at all. Turning '
        + 'one off hides it from the form; organizations already registered '
        + 'under it are untouched.'),
    ]),

    settingsCard('Optional fields on a notice', [
      checkField('optionalDeceasedName', 'Offer the name of the deceased',
        current.optionalDeceasedName),
      checkField('optionalBurialLocation', 'Offer a burial location',
        current.optionalBurialLocation),
      checkField('optionalInstructions', 'Offer instructions for those attending',
        current.optionalInstructions),
      el('p', { class: 'hint' },
        'These control what the composer offers. A notice that already carries '
        + 'one of these keeps it and keeps showing it.'),
    ]),

    settingsCard('Contact', [
      textField('supportEmail', 'Support contact address', current.supportEmail,
        CONTACT_EMAIL_MAX, 'Shown to anybody who needs help with the platform.'),
      textField('privacyEmail', 'Privacy contact address', current.privacyEmail,
        CONTACT_EMAIL_MAX,
        'Shown on the privacy page, for a request about somebody’s own data.'),
    ]),

    settingsCard('Announcement', [
      checkField('announcementEnabled', 'Show an announcement to everybody',
        current.announcementEnabled),
      textField('announcementMessage', 'The announcement', current.announcementMessage,
        ANNOUNCEMENT_MAX,
        'One short sentence, shown at the top of every page while it is on. '
        + 'This is read by every visitor, signed in or not, so it is for '
        + 'service news and never for anything about a person.',
        { textarea: true }),
    ]),

    error,
    el('div', { class: 'admin-actions' }, [save]),
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = readForm(form);
    const types = SETTABLE_ORG_TYPES.filter((t) => values[`type_${t}`]);

    if (!types.length) {
      show(error, 'Leave at least one organization type on, or nobody can register.');
      return;
    }
    const message = values.announcementMessage.trim();
    if (values.announcementEnabled && !message) {
      show(error, 'Write the announcement, or turn it off.');
      return;
    }

    const next = normalizeSettings({
      notificationRadiusKm: Number(values.notificationRadiusKm),
      reminderMinutes: Number(values.reminderMinutes),
      organizationTypes: types,
      supportEmail: values.supportEmail,
      privacyEmail: values.privacyEmail,
      optionalDeceasedName: !!values.optionalDeceasedName,
      optionalBurialLocation: !!values.optionalBurialLocation,
      optionalInstructions: !!values.optionalInstructions,
      announcementEnabled: !!values.announcementEnabled,
      announcementMessage: message,
    });

    error.hidden = true;
    save.disabled = true;
    try {
      await store.writePlatformSettings(next);
      setPlatformSettings(next);
      toast('Platform settings saved.');
      renderSettings(panel, actx);
    } catch (err) {
      console.error('writePlatformSettings', err);
      show(error, friendlyError(err, 'admin'));
      save.disabled = false;
    }
  });

  const sample = el('div', { class: 'admin-sample' });
  renderAdminSample(sample, actx);

  body.append(
    form,
    el('section', { class: 'admin-card' }, [
      el('div', { class: 'admin-card__head' }, [
        el('div', {}, [
          el('h2', { class: 'admin-card__title', text: 'Sample data' }),
          el('p', { class: 'admin-card__sub muted', text:
            'The fictional notices and masjids shown to testers.' }),
        ]),
      ]),
      el('div', { class: 'admin-card__body' }, [sample]),
    ]),
    caveat('Sign-in methods, security rules, retention policy and who is a '
      + 'platform administrator are not editable from here, on purpose. Getting '
      + 'one of them wrong is not a bad setting, it is an open door, so they '
      + 'live somewhere a browser session cannot reach.'),
  );

  // Read once more from the database rather than trusting the cache the page
  // booted with: somebody else may have changed a setting since.
  store.readPlatformSettings().then((stored) => {
    if (!stored) return;
    const fresh = normalizeSettings(stored);
    if (JSON.stringify(fresh) === JSON.stringify(platformSettings())) {
      if (stored.updatedAt) {
        body.append(el('p', { class: 'hint', text: `Last changed ${fmtDateTime(stored.updatedAt)}.` }));
      }
      return;
    }
    setPlatformSettings(fresh);
    renderSettings(panel, actx);
  }).catch(() => { /* the defaults on screen are still correct */ });

  actx.watch(() => {});
}

const show = (node, message) => { node.hidden = false; node.textContent = message; };

function settingsCard(title, children) {
  return el('section', { class: 'admin-card' }, [
    el('div', { class: 'admin-card__head' }, [
      el('div', {}, [el('h2', { class: 'admin-card__title', text: title })]),
    ]),
    el('div', { class: 'admin-card__body' }, children.filter(Boolean)),
  ]);
}

function numberField(name, label, value, { min, max }, hint) {
  const input = el('input', {
    class: 'field field--inline', id: name, name, type: 'number', min, max, step: 1,
  });
  input.value = String(value);
  return el('div', { class: 'field-group' }, [
    el('label', { class: 'label', for: name, text: label }),
    input,
    hint ? el('p', { class: 'hint', text: hint }) : null,
  ]);
}

function textField(name, label, value, maxlength, hint, { textarea = false } = {}) {
  const input = textarea
    ? el('textarea', { class: 'field', id: name, name, rows: 2, maxlength })
    : el('input', { class: 'field', id: name, name, type: 'text', maxlength });
  input.value = value || '';
  return el('div', { class: 'field-group' }, [
    el('label', { class: 'label', for: name, text: label }),
    input,
    hint ? el('p', { class: 'hint', text: hint }) : null,
  ]);
}

function checkField(name, label, checked) {
  return el('label', { class: 'check' }, [
    el('input', { type: 'checkbox', id: name, name, ...(checked ? { checked: true } : {}) }),
    el('span', { text: label }),
  ]);
}
