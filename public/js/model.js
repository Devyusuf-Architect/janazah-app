// Shapes and validation for the two documents that matter.
//
// The key lists here MUST stay in step with the allowlists in firestore.rules.
// The rules are the enforcement; this is the client-side mirror so that a
// mistake surfaces as a readable message instead of a permission-denied.

import { geohash } from './geo.js';
import { APP } from './config.js';

export const ORG_TYPES = [
  { value: 'masjid', label: 'Masjid' },
  { value: 'funeral_home', label: 'Funeral home' },
  { value: 'other', label: 'Other Muslim organization' },
];

export const VERIFICATION_STATUSES = ['pending', 'verified', 'rejected', 'suspended'];

// Mirror of noticePublicKeys() in firestore.rules.
export const NOTICE_PUBLIC_KEYS = [
  'orgId', 'orgName', 'orgType', 'status', 'isPublic',
  'deceasedName', 'showDeceasedName',
  'janazahAt', 'timeZone', 'timeLabel',
  'prayerLocation', 'burialLocation', 'instructions',
  'version', 'createdBy', 'createdAt', 'updatedAt',
  'lastEditedBy', 'publishedAt', 'cancelledAt', 'cancelReason',
  'correctionNote',
];

// Fields that must never appear on the public notice document. Kept as an
// explicit list so the guard below can name the offender rather than failing
// with a generic message.
export const FORBIDDEN_PUBLIC_FIELDS = [
  'familyContactName', 'familyContactPhone', 'familyPhone', 'phone',
  'internalNotes', 'notes', 'nextOfKin', 'homeAddress', 'email',
];

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Last line of defence before a write to the public notice document.
 * Rules will reject a bad shape anyway; this turns that into a useful error.
 */
export function assertPublicNoticeShape(data) {
  for (const key of Object.keys(data)) {
    if (FORBIDDEN_PUBLIC_FIELDS.includes(key)) {
      throw new ValidationError(
        `"${key}" is private and cannot be written to a public notice. ` +
        'Put it in the private details of the notice instead.', key);
    }
    if (!NOTICE_PUBLIC_KEYS.includes(key)) {
      throw new ValidationError(
        `"${key}" is not an allowed field on a public notice.`, key);
    }
  }
  if (data.isPublic !== (data.status === 'published' || data.status === 'cancelled')) {
    throw new ValidationError('isPublic must agree with status.', 'isPublic');
  }
}

/** Validate the coordinator's form input. Returns a list of messages. */
export function validateNoticeForm(form) {
  const errors = [];
  if (!form.orgId) errors.push('Select the organization publishing this notice.');
  if (!form.janazahAt || Number.isNaN(new Date(form.janazahAt).getTime())) {
    errors.push('Enter the Janazah date and prayer time.');
  }
  if (!form.prayerName?.trim()) errors.push('Enter the prayer location name.');
  if (!form.prayerAddress?.trim()) errors.push('Enter the prayer location address.');
  if (!Number.isFinite(Number(form.prayerLat)) || !Number.isFinite(Number(form.prayerLng))) {
    errors.push('Enter valid coordinates for the prayer location.');
  }
  if (form.showDeceasedName && !form.deceasedName?.trim()) {
    errors.push(
      'You ticked "approved for public sharing" but left the name blank.');
  }
  if (!form.showDeceasedName && form.deceasedName?.trim()) {
    errors.push(
      'A name was entered but not marked approved for public sharing. ' +
      'Either confirm approval or clear the name.');
  }
  if ((form.instructions || '').length > 2000) {
    errors.push('Instructions are longer than 2000 characters.');
  }
  const burialPartial =
    [form.burialName, form.burialAddress].filter((v) => v?.trim()).length;
  if (burialPartial === 1) {
    errors.push('Give both a name and an address for the burial location, or neither.');
  }
  return errors;
}

/**
 * Build the public notice document from validated form input.
 * The deceased's name is included only when explicitly approved; otherwise it
 * is dropped here rather than written and hidden later.
 */
export function buildPublicNotice(form, { org, uid, status }) {
  const prayerLat = Number(form.prayerLat);
  const prayerLng = Number(form.prayerLng);

  const doc = {
    orgId: org.id,
    orgName: org.name,
    orgType: org.type,
    status,
    isPublic: status === 'published' || status === 'cancelled',
    janazahAt: new Date(form.janazahAt),
    timeZone: form.timeZone || APP.defaultTimeZone,
    prayerLocation: {
      name: form.prayerName.trim(),
      address: form.prayerAddress.trim(),
      lat: prayerLat,
      lng: prayerLng,
      cell: geohash(prayerLat, prayerLng, APP.cellPrecision),
    },
    version: 1,
    createdBy: uid,
  };

  if (form.timeLabel?.trim()) doc.timeLabel = form.timeLabel.trim();
  if (form.instructions?.trim()) doc.instructions = form.instructions.trim();

  if (form.showDeceasedName && form.deceasedName?.trim()) {
    doc.deceasedName = form.deceasedName.trim();
    doc.showDeceasedName = true;
  } else {
    doc.showDeceasedName = false;
  }

  if (form.burialName?.trim() && form.burialAddress?.trim()) {
    const burial = {
      name: form.burialName.trim(),
      address: form.burialAddress.trim(),
    };
    if (Number.isFinite(Number(form.burialLat)) && form.burialLat !== '') {
      burial.lat = Number(form.burialLat);
    }
    if (Number.isFinite(Number(form.burialLng)) && form.burialLng !== '') {
      burial.lng = Number(form.burialLng);
    }
    doc.burialLocation = burial;
  }

  return doc;
}

/** The staff-only side of a notice. Never merged into the public document. */
export function buildPrivateDetails(form) {
  const priv = {};
  if (form.familyContactName?.trim()) priv.familyContactName = form.familyContactName.trim();
  if (form.familyContactPhone?.trim()) priv.familyContactPhone = form.familyContactPhone.trim();
  if (form.internalNotes?.trim()) priv.internalNotes = form.internalNotes.trim();
  return priv;
}

/** Turn a form back out of an existing notice, for the correction screen. */
export function noticeToForm(notice) {
  const at = notice.janazahAt?.toDate ? notice.janazahAt.toDate() : notice.janazahAt;
  return {
    orgId: notice.orgId,
    deceasedName: notice.deceasedName || '',
    showDeceasedName: !!notice.showDeceasedName,
    janazahAt: at ? toLocalInputValue(at) : '',
    timeZone: notice.timeZone || APP.defaultTimeZone,
    timeLabel: notice.timeLabel || '',
    prayerName: notice.prayerLocation?.name || '',
    prayerAddress: notice.prayerLocation?.address || '',
    prayerLat: notice.prayerLocation?.lat ?? '',
    prayerLng: notice.prayerLocation?.lng ?? '',
    burialName: notice.burialLocation?.name || '',
    burialAddress: notice.burialLocation?.address || '',
    burialLat: notice.burialLocation?.lat ?? '',
    burialLng: notice.burialLocation?.lng ?? '',
    instructions: notice.instructions || '',
  };
}

/** Format a Date for a datetime-local input without shifting the zone. */
export function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Render the prayer time in the notice's own zone, not the reader's.
 * A Janazah at 1:30pm in Toronto must not read as 10:30am to someone in
 * Vancouver looking at the same notice.
 */
export function formatJanazahTime(notice) {
  const date = notice.janazahAt?.toDate ? notice.janazahAt.toDate() : notice.janazahAt;
  if (!date) return '';
  const zone = notice.timeZone || APP.defaultTimeZone;
  let formatted;
  try {
    formatted = new Intl.DateTimeFormat('en-CA', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      timeZone: zone,
    }).format(date);
  } catch {
    formatted = date.toLocaleString('en-CA');
  }
  return notice.timeLabel ? `${formatted} (${notice.timeLabel})` : formatted;
}
