// An in-memory stand-in for the Firestore data layer.
//
// Everything above this file is the real application: the same views, the same
// notice rendering, the same distance maths, the same stylesheet. Only the
// reads and writes are faked, so the preview cannot drift from the product in
// any way a visitor would notice.

const ZONE = 'America/Toronto';

/** A Date at a given hour, `dayOffset` days from today. */
function at(dayOffset, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const ORGS = [
  {
    id: 'org-alnoor', name: 'Masjid Al-Noor', type: 'masjid',
    city: 'Toronto', province: 'ON', lat: 43.6772, lng: -79.3480,
    verificationStatus: 'verified',
  },
  {
    id: 'org-icm', name: 'Islamic Centre of Mississauga', type: 'masjid',
    city: 'Mississauga', province: 'ON', lat: 43.5601, lng: -79.6444,
    verificationStatus: 'verified',
  },
  {
    id: 'org-scar', name: 'Masjid Ar-Rahma', type: 'masjid',
    city: 'Scarborough', province: 'ON', lat: 43.7731, lng: -79.2578,
    verificationStatus: 'verified',
  },
];

const NOTICES = [
  {
    id: 'n-ahmad', orgId: 'org-alnoor', orgName: 'Masjid Al-Noor', orgType: 'masjid',
    status: 'published', isPublic: true, version: 1,
    deceasedName: 'Ahmad Ibrahim Al-Sayyid', showDeceasedName: true,
    janazahAt: at(0, 13, 30), timeZone: ZONE, timeLabel: 'After Dhuhr',
    prayerLocation: {
      name: 'Masjid Al-Noor, main prayer hall',
      address: '480 Danforth Avenue, Toronto',
      lat: 43.6772, lng: -79.3480, cell: 'dpz89',
    },
    burialLocation: {
      name: 'Meadowvale Cemetery', address: '7732 Mavis Road, Brampton',
      lat: 43.6900, lng: -79.7350,
    },
    instructions: 'Please arrive ten minutes early. Parking is available behind '
      + 'the building and on the side street. The burial follows immediately '
      + 'after the prayer.',
  },
  {
    id: 'n-withheld', orgId: 'org-alnoor', orgName: 'Masjid Al-Noor', orgType: 'masjid',
    status: 'published', isPublic: true, version: 1,
    showDeceasedName: false,
    janazahAt: at(0, 18, 15), timeZone: ZONE,
    prayerLocation: {
      name: 'Masjid Al-Noor, main prayer hall',
      address: '480 Danforth Avenue, Toronto',
      lat: 43.6772, lng: -79.3480, cell: 'dpz89',
    },
    instructions: 'The family has asked that the name not be shared publicly.',
  },
  {
    id: 'n-cancelled', orgId: 'org-scar', orgName: 'Masjid Ar-Rahma', orgType: 'masjid',
    status: 'cancelled', isPublic: true, version: 2,
    deceasedName: 'Ibrahim Musa', showDeceasedName: true,
    janazahAt: at(1, 10, 30), timeZone: ZONE,
    cancelReason: 'The prayer has moved to another masjid at the family’s request.',
    prayerLocation: {
      name: 'Masjid Ar-Rahma', address: '1 Progress Avenue, Scarborough',
      lat: 43.7731, lng: -79.2578, cell: 'dpz8g',
    },
  },
  {
    id: 'n-fatima', orgId: 'org-icm', orgName: 'Islamic Centre of Mississauga', orgType: 'masjid',
    status: 'published', isPublic: true, version: 2,
    deceasedName: 'Fatima Yusuf', showDeceasedName: true,
    janazahAt: at(1, 11, 0), timeZone: ZONE,
    correctionNote: 'Prayer time moved from 10:30 to 11:00.',
    prayerLocation: {
      name: 'Islamic Centre of Mississauga',
      address: '2550 Dundas Street West, Mississauga',
      lat: 43.5601, lng: -79.6444, cell: 'dpz2v',
    },
    burialLocation: {
      name: 'Islamic Cemetery of Mississauga',
      address: '1201 Britannia Road West, Mississauga',
      lat: 43.6100, lng: -79.7100,
    },
  },
  {
    id: 'n-later', orgId: 'org-scar', orgName: 'Masjid Ar-Rahma', orgType: 'masjid',
    status: 'published', isPublic: true, version: 1,
    deceasedName: 'Khadija Rahman', showDeceasedName: true,
    janazahAt: at(2, 14, 0), timeZone: ZONE, timeLabel: 'After Asr',
    prayerLocation: {
      name: 'Masjid Ar-Rahma', address: '1 Progress Avenue, Scarborough',
      lat: 43.7731, lng: -79.2578, cell: 'dpz8g',
    },
    burialLocation: {
      name: 'Pine Hills Cemetery', address: '625 Birchmount Road, Scarborough',
      lat: 43.7250, lng: -79.2740,
    },
  },
];

/** Sorted the way the real query returns them: soonest first. */
const feed = () => [...NOTICES].sort((a, b) => a.janazahAt - b.janazahAt);

export function watchPublicNotices(cb) {
  // Async, like a real snapshot, so the loading state is not skipped.
  const timer = setTimeout(() => cb(feed()), 550);
  return () => clearTimeout(timer);
}

export async function verifiedOrganizations() {
  await new Promise((r) => setTimeout(r, 200));
  return [...ORGS].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getNotice(id) {
  await new Promise((r) => setTimeout(r, 250));
  return NOTICES.find((n) => n.id === id) || null;
}

export async function ensureSignedIn() {
  return { uid: 'preview-visitor' };
}

/** Accepted and discarded: there is no administrator queue in a preview. */
export async function submitReport() {
  await new Promise((r) => setTimeout(r, 350));
}

// Present so the module shape matches; unused by the community views.
export const isPlatformAdmin = async () => false;
export const findPossibleDuplicates = async () => [];
