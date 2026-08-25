// The alerts control.
//
// Two different things can be switched on here and they are not the same, so
// the wording separates them rather than blurring them into "notifications":
//
//   Push          reaches the device when this page is closed. Needs a Web
//                 Push certificate, a supported browser, and on iPhone the
//                 page installed to the Home Screen.
//   Page alerts   the Phase 3 fallback, which works only while a tab is open.
//
// Push is offered when it is genuinely available. When it is not, the fallback
// is offered with its limitation stated plainly rather than implied.

import { el, toast } from '../ui.js';
import * as loc from '../location.js';
import * as pageAlerts from '../alerts.js';
import * as push from '../push.js';

/**
 * @param {() => void} onChange  Re-render the surrounding view.
 */
export function alertsPanel(onChange) {
  const container = el('div', { class: 'alerts-panel' });
  render(container, onChange);
  return container;
}

async function render(container, onChange) {
  container.replaceChildren(el('p', { class: 'hint', text: 'Checking alert options…' }));

  const pushSupported = await push.supported();
  const configured = push.isConfigured();

  container.replaceChildren();

  if (push.iosNeedsInstall()) {
    container.append(el('div', { class: 'notice-strip notice-strip--warn' }, [
      el('strong', { text: 'To get alerts on iPhone, add this page to your Home Screen.' }),
      el('p', { class: 'small', text: 'Tap the Share button, then “Add to Home Screen”, then open it from there and turn alerts on. Apple only allows notifications for pages installed this way.' }),
    ]));
  }

  if (configured && pushSupported) {
    container.append(pushToggle(onChange));
  } else {
    container.append(el('p', { class: 'hint' },
      configured
        ? 'This browser cannot receive notifications when the page is closed.'
        : 'Notifications to a closed page are not set up for this site yet.'));
    container.append(pageAlertToggle(onChange));
  }
}

function pushToggle(onChange) {
  const enabled = push.isEnabled();
  const blocked = push.permission() === 'denied';

  if (blocked && !enabled) {
    return el('p', { class: 'hint' },
      'Notifications are blocked for this site in your browser settings. ' +
      'Allow them there to turn alerts on.');
  }

  const checkbox = el('input', { type: 'checkbox', id: 'push-toggle', checked: enabled });
  const status = el('p', { class: 'hint' },
    enabled
      ? 'On. You will be alerted about new Janazahs in your area and from the ' +
        'masjids you follow, even when this page is closed.'
      : 'Alerts arrive even when this page is closed. Your location is not ' +
        'sent: this device subscribes itself to a general area, and notices ' +
        'are published to that area.');

  checkbox.addEventListener('change', async () => {
    checkbox.disabled = true;
    try {
      if (checkbox.checked) {
        await push.enable();
        toast('Alerts on for this device.');
      } else {
        await push.disable();
        toast('Alerts off. This device has been unsubscribed.');
      }
      onChange();
    } catch (err) {
      checkbox.checked = !checkbox.checked;
      toast(err.message, 'error');
      checkbox.disabled = false;
    }
  });

  const rows = [
    el('label', { class: 'check', for: 'push-toggle' }, [
      checkbox,
      el('span', { text: 'Alert me about Janazahs, even when this page is closed' }),
    ]),
    status,
  ];

  if (enabled) {
    rows.push(scopeControl());
    const settings = loc.settings();
    if (settings.alertScope !== 'follows' && (!settings.enabled || !settings.last)) {
      rows.push(el('p', { class: 'notice-strip notice-strip--warn' },
        'Location is off, so you will only be alerted about masjids you ' +
        'follow. Turn location on above to hear about Janazahs near you.'));
    }
  }

  return el('div', {}, rows);
}

/**
 * How much to be alerted about. In a busy city the difference between these
 * two is the difference between a useful app and one whose notifications get
 * switched off in the first week.
 */
function scopeControl() {
  const settings = loc.settings();
  const select = el('select', { class: 'field field--inline', id: 'alert-scope' },
    loc.ALERT_SCOPES.map((opt) => el('option', {
      value: opt.value, text: opt.label, selected: opt.value === settings.alertScope,
    })));

  select.addEventListener('change', async () => {
    loc.update({ alertScope: select.value });
    try {
      await push.syncTopics();
      toast(select.value === 'follows'
        ? 'You will only be alerted about masjids you follow.'
        : 'You will be alerted about Janazahs near you too.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  return el('div', { class: 'field-group' }, [
    el('label', { class: 'label', for: 'alert-scope', text: 'Alert me about' }),
    select,
    el('p', { class: 'hint' },
      'In a busy area, alerts for every Janazah nearby can add up. Narrowing ' +
      'this stops them at the source rather than sending and hiding them.'),
  ]);
}

function pageAlertToggle(onChange) {
  if (!pageAlerts.notificationsSupported()) {
    return el('p', { class: 'hint', text: 'This browser does not support alerts.' });
  }
  if (pageAlerts.notificationPermission() === 'denied') {
    return el('p', { class: 'hint' },
      'Alerts are blocked for this site in your browser settings.');
  }

  const settings = loc.settings();
  const checkbox = el('input', {
    type: 'checkbox',
    id: 'alerts-toggle',
    checked: settings.alertsEnabled && pageAlerts.notificationPermission() === 'granted',
  });

  checkbox.addEventListener('change', async () => {
    if (!checkbox.checked) {
      loc.update({ alertsEnabled: false });
      onChange();
      return;
    }
    const granted = await pageAlerts.requestNotificationPermission();
    if (granted !== 'granted') {
      checkbox.checked = false;
      toast('Your browser declined alerts for this site.', 'warn');
      return;
    }
    pageAlerts.primeSeen(window.__janazahNotices || []);
    loc.update({ alertsEnabled: true });
    toast('Alerts on while this page is open.');
    onChange();
  });

  return el('div', {}, [
    el('label', { class: 'check', for: 'alerts-toggle' }, [
      checkbox,
      el('span', { text: 'Alert me while this page is open' }),
    ]),
    el('p', { class: 'hint' },
      'This only works while a tab is open. It will not reach a locked phone.'),
  ]);
}
