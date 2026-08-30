// The notice type as this client sees it, and the mapping from a Firestore
// document to it.
//
// The field list is NOTICE_PUBLIC_KEYS from public/js/model.js, which is the
// same list firestore.rules enforces and tests/public-surface.test.js pins in
// both directions. Nothing private can arrive here, because nothing private
// can be written to the public document in the first place.

import type { DocumentSnapshot, Timestamp } from '@react-native-firebase/firestore';

export type NoticeStatus = 'draft' | 'published' | 'cancelled';

export type Place = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  cell?: string;
};

export type Notice = {
  id: string;
  orgId: string;
  orgName: string;
  orgType?: string;
  status: NoticeStatus;
  isPublic: boolean;
  /** Absent unless the family asked for it to be shown, or after redaction. */
  deceasedName: string | null;
  showDeceasedName: boolean;
  janazahAt: Date | null;
  timeZone: string;
  timeLabel: string;
  prayerLocation: Place | null;
  burialLocation: Omit<Place, 'cell'> | null;
  instructions: string;
  version: number;
  publishedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string;
  correctionNote: string;
  redactedAt: Date | null;
};

const asDate = (value: unknown): Date | null => {
  if (!value) return null;
  const stamp = value as Timestamp;
  if (typeof stamp?.toDate === 'function') return stamp.toDate();
  if (value instanceof Date) return value;
  return null;
};

const asPlace = (value: unknown): Place | null => {
  const place = value as Partial<Place> | null | undefined;
  if (!place || typeof place.lat !== 'number' || typeof place.lng !== 'number') {
    // A notice without usable coordinates still has a name and an address,
    // which is what a reader actually needs. Distance and map pins are the
    // only things that require the numbers.
    if (!place?.name && !place?.address) return null;
  }
  return {
    name: place?.name ?? '',
    address: place?.address ?? '',
    lat: typeof place?.lat === 'number' ? place.lat : Number.NaN,
    lng: typeof place?.lng === 'number' ? place.lng : Number.NaN,
    ...(place?.cell ? { cell: place.cell } : {}),
  };
};

export function toNotice(
  snapshot: DocumentSnapshot,
): Notice | null {
  const data = snapshot.data();
  if (!data) return null;

  return {
    id: snapshot.id,
    orgId: String(data.orgId ?? ''),
    orgName: String(data.orgName ?? ''),
    orgType: data.orgType ? String(data.orgType) : undefined,
    status: (data.status as NoticeStatus) ?? 'draft',
    isPublic: data.isPublic === true,
    // showDeceasedName is the family's decision and the only thing that makes
    // a name displayable. A name present with the flag false is not shown,
    // ever, on any screen.
    deceasedName: typeof data.deceasedName === 'string' ? data.deceasedName : null,
    showDeceasedName: data.showDeceasedName === true,
    janazahAt: asDate(data.janazahAt),
    timeZone: String(data.timeZone ?? ''),
    timeLabel: String(data.timeLabel ?? ''),
    prayerLocation: asPlace(data.prayerLocation),
    burialLocation: asPlace(data.burialLocation),
    instructions: String(data.instructions ?? ''),
    version: Number(data.version ?? 1),
    publishedAt: asDate(data.publishedAt),
    cancelledAt: asDate(data.cancelledAt),
    cancelReason: String(data.cancelReason ?? ''),
    correctionNote: String(data.correctionNote ?? ''),
    redactedAt: asDate(data.redactedAt),
  };
}

/** The name to print, or null. The flag decides, never the presence of a value. */
export const displayName = (notice: Notice): string | null =>
  (notice.showDeceasedName && notice.deceasedName ? notice.deceasedName : null);

export const isCancelled = (notice: Notice): boolean =>
  notice.status === 'cancelled';

/** A notice corrected after publication. version 1 has never been edited. */
export const isCorrected = (notice: Notice): boolean =>
  notice.status === 'published' && notice.version > 1;

export type Organization = {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  province: string;
  country?: string;
  lat: number;
  lng: number;
  cell?: string;
  website?: string;
  phone?: string;
  verificationStatus: string;
};

export function toOrganization(
  snapshot: DocumentSnapshot,
): Organization | null {
  const data = snapshot.data();
  if (!data) return null;
  return {
    id: snapshot.id,
    name: String(data.name ?? ''),
    type: String(data.type ?? 'masjid'),
    address: String(data.address ?? ''),
    city: String(data.city ?? ''),
    province: String(data.province ?? ''),
    country: data.country ? String(data.country) : undefined,
    lat: Number(data.lat),
    lng: Number(data.lng),
    cell: data.cell ? String(data.cell) : undefined,
    website: data.website ? String(data.website) : undefined,
    phone: data.phone ? String(data.phone) : undefined,
    verificationStatus: String(data.verificationStatus ?? 'pending'),
  };
}

/** The badge means the organization was verified, never the notice. */
export const isVerified = (org: Organization | null | undefined): boolean =>
  org?.verificationStatus === 'verified';
