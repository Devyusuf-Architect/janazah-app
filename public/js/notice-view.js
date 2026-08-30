// The public face of a notice, rendered identically wherever it appears: the
// coordinator's preview, the administrator's review screen, and the community
// feed. One implementation, so a preview cannot drift from what is published.

import { el, icon } from './ui.js';
import { formatJanazahTime, FORBIDDEN_PUBLIC_FIELDS } from './model.js';
import { directionsUrl } from './geo.js';

/**
 * @param {object} notice        A public notice document.
 * @param {object} [options]
 * @param {string} [options.distanceLabel]  Approximate distance, Phase 3.
 * @param {boolean} [options.compact]       Trim to feed-card density.
 */
export function publicNoticeView(notice, { distanceLabel = null, compact = false } = {}) {
  const cancelled = notice.status === 'cancelled';

  const view = el('article', {
    class: `public-notice${compact ? ' public-notice--compact' : ''}` +
           `${cancelled ? ' public-notice--cancelled' : ''}`,
  }, [
    cancelled
      ? el('p', { class: 'notice-strip notice-strip--error' },
          `Cancelled${notice.cancelReason ? `: ${notice.cancelReason}` : '.'}`)
      : null,
    notice.correctionNote && !cancelled
      ? el('p', { class: 'notice-strip notice-strip--warn', text: `Updated: ${notice.correctionNote}` })
      : null,

    el('div', { class: 'public-notice__head' }, [
      el('p', { class: 'public-notice__org', text: notice.orgName || '' }),
      distanceLabel ? el('span', { class: 'badge badge--muted', text: distanceLabel }) : null,
    ]),

    el('h3', {
      class: 'public-notice__title',
      text: notice.showDeceasedName && notice.deceasedName
        ? `Janazah for ${notice.deceasedName}`
        : 'Janazah notice',
    }),
    el('p', { class: 'public-notice__time' }, [
      icon('clock'),
      el('span', { text: formatJanazahTime(notice) }),
    ]),

    compact
      ? venueLine(notice.prayerLocation)
      : el('div', { class: 'kv' }, [
        locationRow('Prayer', notice.prayerLocation, 'Directions to prayer'),
        notice.burialLocation
          ? locationRow('Burial', notice.burialLocation, 'Directions to burial')
          : null,
      ]),

    !compact && notice.instructions
      ? el('p', { class: 'instructions', text: notice.instructions })
      : null,
  ]);

  // Guard rather than trust. Rules already reject these keys at write time; if
  // one ever appears on a document headed for a public surface, say so loudly
  // instead of quietly rendering it.
  const leaked = Object.keys(notice).filter((k) => FORBIDDEN_PUBLIC_FIELDS.includes(k));
  if (leaked.length) {
    view.prepend(el('p', { class: 'notice-strip notice-strip--error' },
      `Private fields present on a public document: ${leaked.join(', ')}. Do not publish.`));
  }
  return view;
}

/**
 * The compact-card version of the prayer location: just the venue, not the
 * street address, and not burial details or a directions link. Those are one
 * tap away on the full notice, which is exactly where a list reader who wants
 * them will end up.
 */
function venueLine(place) {
  if (!place?.name) return null;
  return el('p', { class: 'public-notice__venue' }, [
    icon('pin', { size: 15 }),
    el('span', { text: place.name }),
  ]);
}

/** One location, with its own directions link. */
function locationRow(label, place, linkText) {
  if (!place) return null;
  return el('div', { class: 'kv-row' }, [
    icon('pin'),
    el('div', {}, [
      el('p', { class: 'kv-label', text: label }),
      el('p', { class: 'kv-value', text: place.name }),
      el('p', { class: 'kv-sub', text: place.address }),
      el('a', {
        class: 'link-inline', target: '_blank', rel: 'noopener noreferrer',
        href: directionsUrl(place),
      }, [icon('route', { size: 15 }), el('span', { text: linkText })]),
    ]),
  ]);
}
