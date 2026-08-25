// An in-memory stand-in for the Firestore data layer.
//
// Everything above this file is the real application: the same views, the same
// notice rendering, the same distance maths, the same stylesheet. Only the
// reads and writes are faked, so the preview cannot drift from the product in
// any way a visitor would notice.
//
// The notices themselves come from demo/sample-data.js, shared with the local
// demo and the screenshots so all three show the same clearly fictional set.

import { SAMPLE_ORGS, SAMPLE_NOTICES } from './sample-data.js';

const ORGS = SAMPLE_ORGS.filter((o) => o.verificationStatus === 'verified');
const NOTICES = SAMPLE_NOTICES;

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
