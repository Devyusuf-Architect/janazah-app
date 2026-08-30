// The "Near me" panel: consent, distance preference, and the on-device match.
//
// The consent copy is part of the feature, not decoration. Someone is being
// asked for their location by an app about funerals, and they are owed a plain
// statement of what happens to it before the browser prompt appears.

import { el, toast } from '../ui.js';
import { formatDistance } from '../geo.js';
import { alertsPanel } from './alerts-panel.js';
import * as loc from '../location.js';
import * as alerts from '../alerts.js';
import * as push from '../push.js';

/**
 * @param {object} deps
 * @param {() => object[]} deps.getNotices  Current feed contents.
 * @param {() => void}     deps.onChange    Re-render the feed.
 * @param {(n, km) => Node} deps.renderCard
 */
export function renderNearby(mount, { getNotices, onChange, renderCard }) {
  const settings = loc.settings();

  if (!loc.canUseLocation()) {
    mount.append(el('div', { class: 'empty' }, [
      el('h2', { text: 'Location is not available here' }),
      el('p', { class: 'muted' },
        window.isSecureContext
          ? 'This browser does not offer location access.'
          : 'Browsers only allow location over a secure (https) connection.'),
    ]));
    return;
  }

  if (!settings.enabled) {
    mount.append(consentPanel(onChange));
    return;
  }

  mount.append(settingsPanel(settings, onChange));

  if (!settings.last) {
    mount.append(el('div', { class: 'empty' }, [
      el('p', { text: 'No location yet for this device.' }),
      el('button', {
        class: 'btn btn--primary',
        onclick: (e) => refresh(e.target, onChange),
      }, 'Find Janazahs near me'),
    ]));
    return;
  }

  const matches = loc.nearbyNotices(getNotices(), settings.last, settings.radiusKm);

  if (loc.isStale(settings.last)) {
    mount.append(el('p', { class: 'notice-strip notice-strip--warn' },
      'This is based on where you were last, which was a while ago. ' +
      'Refresh if you have moved.'));
  }

  if (!matches.length) {
    mount.append(el('div', { class: 'empty' }, [
      el('p', {
        text: settings.radiusKm === 0
          ? 'There are currently no published Janazahs near you.'
          : `No Janazahs within ${settings.radiusKm} km of where you are.`,
      }),
      el('p', { class: 'muted', text: 'Try a wider distance, or check all notices.' }),
    ]));
    return;
  }

  for (const { notice, km } of matches) {
    mount.append(renderCard(notice, formatDistance(km)));
  }
}

/** Exported for the community dashboard, which shows this without a notice list. */
export function consentPanel(onChange) {
  const error = el('p', { class: 'form-error', hidden: true });

  const enable = el('button', { class: 'btn btn--primary' }, 'Use my location');
  enable.addEventListener('click', async () => {
    error.hidden = true;
    enable.disabled = true;
    enable.textContent = 'Finding your location…';
    try {
      loc.update({ enabled: true });
      await loc.requestPosition();
      push.syncTopics().catch((err) => console.error('syncTopics', err));
      toast('Showing Janazahs near you.');
      onChange();
    } catch (err) {
      loc.disable();
      error.hidden = false;
      error.textContent = err.message;
      enable.disabled = false;
      enable.textContent = 'Use my location';
    }
  });

  return el('div', { class: 'card consent' }, [
    el('h2', { text: 'Find Janazahs near you' }),
    el('p',
      { text: 'With your permission, this page can check which Janazahs are ' +
              'close to where you are right now, so you hear about one nearby ' +
              'even if you do not follow that masjid.' }),

    el('h3', { text: 'What happens to your location' }),
    el('ul', { class: 'list list--plain consent__list' }, [
      el('li', { text: 'It is used in your browser only, to measure distance to notices this page already shows.' }),
      el('li', { text: 'It is never sent to us, to any masjid, or to anyone else.' }),
      el('li', { text: 'Only your most recent position is kept, on this device, and it is overwritten each time. No history of where you have been is created.' }),
      el('li', { text: 'Turning this off erases the stored position immediately.' }),
      el('li', { text: 'Nobody can see which Janazahs you looked at or attended.' }),
    ]),

    el('p', { class: 'hint hint--boxed' },
      'Your browser will ask for permission next. You can decline, and the ' +
      'rest of this page keeps working.'),

    error,
    el('div', { class: 'form-actions' }, [enable]),
  ]);
}

/** Exported for the community dashboard; see consentPanel above. */
export function settingsPanel(settings, onChange) {
  const radius = el('select', { class: 'field field--inline', id: 'radius' },
    loc.RADIUS_OPTIONS.map((opt) => el('option', {
      value: String(opt.km), text: opt.label, selected: opt.km === settings.radiusKm,
    })));
  radius.addEventListener('change', () => {
    loc.update({ radiusKm: Number(radius.value) });
    // A different radius means a different set of area topics.
    push.syncTopics().catch((err) => console.error('syncTopics', err));
    onChange();
  });

  const lastSeen = settings.last
    ? new Date(settings.last.at).toLocaleTimeString('en-CA',
        { hour: 'numeric', minute: '2-digit' })
    : null;

  return el('div', { class: 'card card--flat nearby-settings' }, [
    el('div', { class: 'nearby-settings__row' }, [
      el('div', {}, [
        el('label', { class: 'label label--inline', for: 'radius', text: 'Within' }),
        radius,
      ]),
      el('div', { class: 'row-actions' }, [
        el('button', {
          class: 'btn btn--small',
          onclick: (e) => refresh(e.target, onChange),
        }, 'Update my location'),
        el('button', {
          class: 'btn btn--small btn--danger',
          onclick: () => {
            loc.disable();
            alerts.clearSeen();
            // Drop the area subscriptions too; follows are unaffected.
            push.syncTopics().catch((err) => console.error('syncTopics', err));
            toast('Location turned off and the stored position erased.');
            onChange();
          },
        }, 'Turn off'),
      ]),
    ]),
    lastSeen
      ? el('p', { class: 'hint', text: `Based on where you were at ${lastSeen}. Nothing is stored anywhere but this device.` })
      : null,
    alertsPanel(onChange),
  ]);
}

async function refresh(button, onChange) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Finding your location…';
  try {
    await loc.requestPosition();
    // Moving changes which area covers this device.
    push.syncTopics().catch((err) => console.error('syncTopics', err));
    onChange();
  } catch (err) {
    toast(err.message, 'error');
    button.disabled = false;
    button.textContent = original;
  }
}
