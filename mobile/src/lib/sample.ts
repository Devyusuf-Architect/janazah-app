// Sample data on mobile.
//
// The web app ships with APP.sampleData true (public/js/config.js) so testers
// see a populated site. This build defaults it OFF, and that difference is
// deliberate: a Play reviewer opening the app must not be shown fictional
// funeral notices, and the mobile binary ships on its own schedule and cannot
// be corrected with a one-word edit and a redeploy the way the web app can.
//
// The administrator's switch still governs. platformSettings/sampleData is
// publicly readable by design, so when it is on, this app folds in the same
// fictional records the web site does, from the same file, and shows the same
// banner. When it has never been set, or cannot be read, samples stay off.
//
// The data is public/js/sample-data.js, which tests/sample-data.test.js pins
// as visibly fictional: "Sample ..." organizations, "Fulan ..." names, example
// streets. Sharing it rather than copying it is what keeps that check
// meaningful for this app too.

import { getDoc } from '@react-native-firebase/firestore';

import { platformSettingRef } from './collections';
import { toNotice, toOrganization, type Notice, type Organization } from './notice';
import { SAMPLE_NOTICES, SAMPLE_ORGS } from '../shared/samples';

/** Matches the prefix scripts/sample-data-live.mjs writes, and the rules. */
const PREFIX = 'sample-';

let enabled = false;

export const isSampleMode = (): boolean => enabled;

/**
 * Read the administrator's setting once, at launch.
 *
 * Failure means off. A network error at startup must never be the reason a
 * fictional Janazah appears.
 */
export async function initSampleMode(): Promise<boolean> {
  try {
    const snapshot = await getDoc(platformSettingRef('sampleData'));
    enabled = snapshot.exists() && snapshot.data()?.enabled === true;
  } catch {
    enabled = false;
  }
  return enabled;
}

/** Test seam. Nothing in the app calls this. */
export function setSampleMode(next: boolean): void { enabled = next; }

const sampleDate = (value: unknown): Date | null =>
  (value instanceof Date ? value : null);

/** The fictional notices, shaped like anything else the app renders. */
export function sampleNotices(): Notice[] {
  if (!enabled) return [];
  return SAMPLE_NOTICES.map((sample: Record<string, unknown>) => {
    const org = SAMPLE_ORGS.find(
      (o: Record<string, unknown>) => o.id === sample.orgId,
    );
    return {
      id: `${PREFIX}${String(sample.id)}`,
      orgId: `${PREFIX}${String(sample.orgId)}`,
      orgName: String(org?.name ?? ''),
      orgType: org?.type ? String(org.type) : undefined,
      status: (sample.status as Notice['status']) ?? 'published',
      isPublic: sample.status !== 'draft',
      deceasedName: typeof sample.deceasedName === 'string' ? sample.deceasedName : null,
      showDeceasedName: sample.showDeceasedName === true,
      janazahAt: sampleDate(sample.janazahAt),
      timeZone: String(sample.timeZone ?? ''),
      timeLabel: String(sample.timeLabel ?? ''),
      prayerLocation: (sample.prayerLocation as Notice['prayerLocation']) ?? null,
      burialLocation: (sample.burialLocation as Notice['burialLocation']) ?? null,
      instructions: String(sample.instructions ?? ''),
      version: 1,
      publishedAt: null,
      cancelledAt: null,
      cancelReason: String(sample.cancelReason ?? ''),
      correctionNote: String(sample.correctionNote ?? ''),
      redactedAt: null,
    } satisfies Notice;
  });
}

export function sampleOrganizations(): Organization[] {
  if (!enabled) return [];
  return SAMPLE_ORGS.map((org: Record<string, unknown>) => ({
    id: `${PREFIX}${String(org.id)}`,
    name: String(org.name ?? ''),
    type: String(org.type ?? 'masjid'),
    address: String(org.address ?? ''),
    city: String(org.city ?? ''),
    province: String(org.province ?? ''),
    lat: Number(org.lat),
    lng: Number(org.lng),
    cell: org.cell ? String(org.cell) : undefined,
    // Samples are shown as verified because that is what they are on the web
    // site: seedSampleData creates them pending and then verifies them, the
    // same two writes a real registration goes through.
    verificationStatus: 'verified',
  } satisfies Organization));
}

/** A record this platform created for testing, never a real one. */
export const isSampleId = (id: string): boolean => id.startsWith(PREFIX);

/** Fold samples in beside whatever the database returned. */
export function withSamples<T extends { id: string }>(live: T[], samples: T[]): T[] {
  if (!samples.length) return live;
  // A sample that has also been written to the database for real (by
  // scripts/sample-data-live.mjs) must appear once, not twice.
  const seen = new Set(live.map((item) => item.id));
  return [...live, ...samples.filter((item) => !seen.has(item.id))];
}

export { toNotice, toOrganization };
