// The sample notices used by the preview, the local demo and the screenshots.
//
// One source, because three copies drifted apart once already and because
// what goes in here needs care.
//
// Everything is deliberately and visibly fictional:
//
//   Names        "Fulan ibn Fulan" is the Arabic equivalent of "John Doe", so
//                the audience for this app reads it as a placeholder at a
//                glance. No invented person is given a name that could be
//                mistaken for someone's late relative.
//   Masajid      Named "Sample Masjid", so no real institution is shown
//                announcing a funeral that never happened.
//   Addresses    Example streets. Not real ones: a real address on a fake
//                Janazah notice could send someone to a real building.
//
// Coordinates are real Toronto-area points, because the distance and nearby
// logic has to be exercised against a real map, and a coordinate on its own
// names nobody.

const ZONE = 'America/Toronto';

/** A Date at a given hour, `dayOffset` days from today. */
export function at(dayOffset, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export const SAMPLE_ORGS = [
  {
    id: 'org-riverbend',
    name: 'Sample Masjid, Riverbend',
    type: 'masjid',
    address: '10 Example Avenue',
    city: 'Toronto', province: 'ON', postalCode: 'M4K 1P6',
    lat: 43.6772, lng: -79.3480, cell: 'dpz89',
    contactEmail: 'office@example.org',
    verificationStatus: 'verified',
  },
  {
    id: 'org-westbrook',
    name: 'Sample Islamic Centre, Westbrook',
    type: 'masjid',
    address: '200 Example Road',
    city: 'Mississauga', province: 'ON', postalCode: 'L5K 2L3',
    lat: 43.5601, lng: -79.6444, cell: 'dpz2v',
    contactEmail: 'info@example.org',
    verificationStatus: 'verified',
  },
  {
    id: 'org-eastvale',
    name: 'Sample Masjid, Eastvale',
    type: 'masjid',
    address: '35 Example Street',
    city: 'Scarborough', province: 'ON', postalCode: 'M1P 2L7',
    lat: 43.7731, lng: -79.2578, cell: 'dpz8g',
    contactEmail: 'salam@example.org',
    verificationStatus: 'verified',
  },
  {
    id: 'org-pending',
    name: 'Sample Muslim Association, Northfield',
    type: 'other',
    address: '4 Example Crescent',
    city: 'Brampton', province: 'ON', postalCode: 'L6X 5A5',
    lat: 43.6890, lng: -79.7600, cell: 'dpz1r',
    contactEmail: 'contact@example.org',
    verificationStatus: 'pending',
  },
];

const RIVERBEND_PRAYER = {
  name: 'Sample Masjid, Riverbend, main prayer hall',
  address: '10 Example Avenue, Toronto',
  lat: 43.6772, lng: -79.3480, cell: 'dpz89',
};

const EASTVALE_PRAYER = {
  name: 'Sample Masjid, Eastvale',
  address: '35 Example Street, Scarborough',
  lat: 43.7731, lng: -79.2578, cell: 'dpz8g',
};

/**
 * Notices, in the shape the public document takes. `at()` is called when this
 * module loads, so the set always sits around today rather than ageing out.
 */
export const SAMPLE_NOTICES = [
  {
    id: 'n-one',
    orgId: 'org-riverbend', orgName: 'Sample Masjid, Riverbend', orgType: 'masjid',
    status: 'published', isPublic: true, version: 1,
    deceasedName: 'Fulan ibn Fulan', showDeceasedName: true,
    janazahAt: at(0, 13, 30), timeZone: ZONE, timeLabel: 'After Dhuhr',
    prayerLocation: RIVERBEND_PRAYER,
    burialLocation: {
      name: 'Sample Cemetery, Northfield',
      address: '900 Example Road, Brampton',
      lat: 43.6900, lng: -79.7350,
    },
    instructions: 'Please arrive ten minutes early. Parking is available behind '
      + 'the building and on the side street. The burial follows immediately '
      + 'after the prayer.',
  },
  {
    // The family did not approve sharing the name, so there is none to show.
    id: 'n-withheld',
    orgId: 'org-riverbend', orgName: 'Sample Masjid, Riverbend', orgType: 'masjid',
    status: 'published', isPublic: true, version: 1,
    showDeceasedName: false,
    janazahAt: at(0, 18, 15), timeZone: ZONE,
    prayerLocation: RIVERBEND_PRAYER,
    instructions: 'The family has asked that the name not be shared publicly.',
  },
  {
    id: 'n-cancelled',
    orgId: 'org-eastvale', orgName: 'Sample Masjid, Eastvale', orgType: 'masjid',
    status: 'cancelled', isPublic: true, version: 2,
    deceasedName: 'Fulan ibn Fulan al-Thani', showDeceasedName: true,
    janazahAt: at(1, 10, 30), timeZone: ZONE,
    cancelReason: 'The prayer has moved to another masjid at the family’s request.',
    prayerLocation: EASTVALE_PRAYER,
  },
  {
    id: 'n-corrected',
    orgId: 'org-westbrook', orgName: 'Sample Islamic Centre, Westbrook', orgType: 'masjid',
    status: 'published', isPublic: true, version: 2,
    deceasedName: 'Fulanah bint Fulan', showDeceasedName: true,
    janazahAt: at(1, 11, 0), timeZone: ZONE,
    correctionNote: 'Prayer time moved from 10:30 to 11:00.',
    prayerLocation: {
      name: 'Sample Islamic Centre, Westbrook',
      address: '200 Example Road, Mississauga',
      lat: 43.5601, lng: -79.6444, cell: 'dpz2v',
    },
    burialLocation: {
      name: 'Sample Cemetery, Westbrook',
      address: '450 Example Boulevard, Mississauga',
      lat: 43.6100, lng: -79.7100,
    },
  },
  {
    id: 'n-later',
    orgId: 'org-eastvale', orgName: 'Sample Masjid, Eastvale', orgType: 'masjid',
    status: 'published', isPublic: true, version: 1,
    deceasedName: 'Fulanah bint Fulan al-Thani', showDeceasedName: true,
    janazahAt: at(2, 14, 0), timeZone: ZONE, timeLabel: 'After Asr',
    prayerLocation: EASTVALE_PRAYER,
    burialLocation: {
      name: 'Sample Cemetery, Eastvale',
      address: '120 Example Drive, Scarborough',
      lat: 43.7250, lng: -79.2740,
    },
  },
];

/** Private details, which must never reach a public notice or a notification. */
export const SAMPLE_PRIVATE = {
  noticeId: 'n-one',
  familyContactName: 'Fulan ibn Fulan (son)',
  familyContactPhone: '555-0142',
  internalNotes: 'Family has asked that no photographs be taken.',
};
