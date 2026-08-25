// Showing fictional notices in the deployed app, for testers.
//
// Switched by APP.sampleData in config.js. While it is on, the four public
// reads in store.js fold this data in alongside whatever the database
// returns; while it is off, this module is inert and nothing here can reach a
// page. Turning it off is the entire removal process, because nothing is ever
// written anywhere.
//
// The data itself is public/js/sample-data.js, which tests/sample-data.test.js
// pins as visibly fictional: "Sample ..." organizations, "Fulan ..." names,
// example streets. It is the same data the local demo and the standalone
// preview use, so there is one copy and it is the checked one.
//
// Sample records keep a `sample-` id prefix, matching what
// scripts/sample-data-live.mjs writes, so the two approaches are
// indistinguishable to the rest of the app and neither can be mistaken for a
// real record by id.

import { APP } from './config.js';
import { SAMPLE_ORGS, SAMPLE_NOTICES } from './sample-data.js';

const PREFIX = 'sample-';

export const isSampleMode = () => APP.sampleData === true;

const id = (raw) => `${PREFIX}${raw}`;

/** Sample organizations, shaped like the documents store.js returns. */
export function sampleOrgs() {
  if (!isSampleMode()) return [];
  return SAMPLE_ORGS.map(({ id: rawId, ...org }) => ({
    ...org,
    id: id(rawId),
    verificationStatus: 'verified',
    staffUids: [],
    ownerUid: PREFIX,
  }));
}

/**
 * Sample notices, shaped like the documents store.js returns.
 *
 * janazahAt is a real Date rather than a Firestore Timestamp. Every reader in
 * the app already handles both, because `janazahAt?.toDate ? ... : ...`
 * appears wherever a notice time is read: the feed's date grouping, the
 * notice view and the dashboard all do it, since a locally-written document
 * has a Date until the server round-trips it.
 */
export function sampleNotices() {
  if (!isSampleMode()) return [];
  return SAMPLE_NOTICES.map(({ id: rawId, orgId, ...notice }) => ({
    ...notice,
    id: id(rawId),
    orgId: id(orgId),
    createdBy: PREFIX,
  }));
}

export const sampleNoticeById = (noticeId) =>
  sampleNotices().find((n) => n.id === noticeId) || null;

export const sampleOrgById = (orgId) =>
  sampleOrgs().find((o) => o.id === orgId) || null;

/**
 * Merge sample records into a live result.
 *
 * Real notices come first: if a masjid has actually published something, that
 * is what a reader needs to see, and the samples sit underneath as filler.
 */
export function withSamples(live, samples) {
  if (!isSampleMode()) return live;
  const seen = new Set(live.map((doc) => doc.id));
  return [...live, ...samples.filter((doc) => !seen.has(doc.id))];
}
