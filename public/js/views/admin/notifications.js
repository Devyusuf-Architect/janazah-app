// Notifications: what the platform has been sending, and how far it reaches.
//
// The notification pipeline itself is server-side (functions/index.js) and
// deliberately knows nothing about where anybody is: a device works out which
// coarse area topics cover its own chosen radius and subscribes itself, and
// the function publishes a notice to the topics covering the notice's own
// location. No user position is received, stored or logged, so there is
// nothing on this screen about who was notified, and there could not be.
//
// What there is: the two settings that shape delivery, the suppressions the
// rate limiter has applied, and the pipeline's own audit entries.

import { el } from '../../ui.js';
import * as store from '../../store.js';
import { platformSettings } from '../../platform-settings.js';
import { REPORT_REASON_LABELS } from './reports.js';
import {
  sectionHead, emptyState, loading, errorState, dataTable, fmtDateTime, caveat,
} from './common.js';

const NOTIFICATION_ACTIONS = {
  'notification.published': 'Notice published',
  'notification.corrected': 'Correction sent',
  'notification.cancelled': 'Cancellation sent',
  'notification.suppressed': 'Suppressed by the rate limit',
};

export function renderNotifications(panel, actx) {
  panel.replaceChildren(
    sectionHead('Notifications',
      'What the alert pipeline has done, and the two settings that shape it.'),
    loading(),
  );

  const body = el('div', { class: 'admin-body' });

  const paint = (entries, reports, error) => {
    const settings = platformSettings();

    const sends = entries.filter((e) => e.action?.startsWith('notification.'));
    const suppressed = sends.filter((e) => e.action === 'notification.suppressed');
    const rateReports = reports.filter((r) => r.reason === 'rate_limit');

    panel.replaceChildren(
      sectionHead('Notifications',
        'What the alert pipeline has done, and the two settings that shape it.'),
      body,
    );

    body.replaceChildren(
      el('section', { class: 'admin-card' }, [
        el('div', { class: 'admin-card__head' }, [
          el('div', {}, [
            el('h2', { class: 'admin-card__title', text: 'How far alerts reach' }),
            el('p', { class: 'admin-card__sub muted', text:
              'Set in Platform Settings, and applied by every client.' }),
          ]),
        ]),
        el('div', { class: 'admin-card__body' }, [
          el('dl', { class: 'admin-kv' }, [
            el('dt', { text: 'Default alert radius' }),
            el('dd', { text: `${settings.notificationRadiusKm} km` }),
            el('dt', { text: 'Marked as imminent' }),
            el('dd', {
              text: settings.reminderMinutes
                ? `${settings.reminderMinutes} minutes before the prayer`
                : 'never',
            }),
          ]),
          el('p', { class: 'hint' },
            'The radius is the starting point for a device that has not chosen '
            + 'one of its own. It is not a cap: anybody can widen or narrow '
            + 'their own alerts in Settings, and this platform never learns '
            + 'where they are.'),
        ]),
      ]),

      el('section', { class: 'admin-card' }, [
        el('div', { class: 'admin-card__head' }, [
          el('div', {}, [
            el('h2', { class: 'admin-card__title', text: 'Rate limit' }),
            el('p', { class: 'admin-card__sub muted', text:
              'A burst of notifications from one organization is the signature '
              + 'of a compromised coordinator account.' }),
          ]),
        ]),
        el('div', { class: 'admin-card__body' }, [
          rateReports.length
            ? dataTable(['When', 'Notice', 'Status', 'Detail'],
              rateReports.map((r) => el('tr', {}, [
                el('td', { class: 'nowrap', text: fmtDateTime(r.createdAt) }),
                el('td', { class: 'mono', text: r.noticeId }),
                el('td', { text: r.status }),
                el('td', { class: 'small', text: r.detail || REPORT_REASON_LABELS[r.reason] }),
              ])))
            : emptyState('No organization has tripped the notification rate limit.'),
          suppressed.length
            ? el('p', { class: 'hint' },
              `${suppressed.length} notification${suppressed.length === 1 ? ' was' : 's were'} `
              + 'suppressed. The notices themselves were still published.')
            : null,
        ]),
      ]),

      el('section', { class: 'admin-card' }, [
        el('div', { class: 'admin-card__head' }, [
          el('div', {}, [
            el('h2', { class: 'admin-card__title', text: 'Recent delivery' }),
            el('p', { class: 'admin-card__sub muted', text:
              'Written by the pipeline itself, per notice, never per person.' }),
          ]),
        ]),
        el('div', { class: 'admin-card__body' }, [
          error ? errorState(error) : null,
          sends.length
            ? dataTable(['When', 'What', 'Notice', 'Topics', 'Failed'],
              sends.slice(0, 50).map((e) => el('tr', {}, [
                el('td', { class: 'nowrap', text: fmtDateTime(e.at) }),
                el('td', { text: NOTIFICATION_ACTIONS[e.action] || e.action }),
                el('td', { class: 'mono', text: e.targetId || '' }),
                el('td', { text: String(e.details?.topics ?? '') }),
                el('td', { text: String(e.details?.failed ?? '') }),
              ])))
            : emptyState('The alert pipeline has not sent anything yet.'),
          caveat('Topics are coarse areas, counted here and never named. There '
            + 'is no record anywhere of which devices a notification reached, '
            + 'because such a record would be a list of who was near a '
            + 'particular funeral.'),
        ]),
      ]),
    );
  };

  Promise.all([
    store.auditRecent(200).catch(() => []),
    store.listReports(200).catch(() => []),
  ]).then(([entries, reports]) => paint(entries, reports, null))
    .catch((err) => paint([], [], String(err?.message || err)));

  actx.watch(() => {});
}
