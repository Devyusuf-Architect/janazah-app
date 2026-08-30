// Every Firestore path and query shape in one place.
//
// This is the mobile counterpart of public/js/store.js, and it exists for the
// same stated reason: the query shapes firestore.rules depends on must live
// somewhere they can be read together. Two of them are not optional.
//
//   Public notices MUST be queried with where('isPublic','==',true). For a
//   list, Firestore matches the rule against the query's filters rather than
//   against the documents it would return, so an unfiltered read is rejected
//   outright. isPublic is a denormalised mirror of status, kept honest by
//   validNoticeShape() in the rules.
//
//   The organizations directory MUST be queried with
//   where('verificationStatus','==','verified') unless the caller is staff or
//   an administrator, for the same reason.
//
// Nothing here grants anything. The rules decide; this only asks in a shape
// they can evaluate.

import {
  collection, collectionGroup, doc, query, where, orderBy, limit,
  startAfter, getDocs, getDoc, Timestamp,
  type QueryDocumentSnapshot,
} from '@react-native-firebase/firestore';

import { db } from './firebase';
import { CURRENT_WINDOW_HOURS } from '@shared/config';

export type DocSnapshot = QueryDocumentSnapshot;

export const noticesRef = () => collection(db, 'notices');
export const noticeRef = (id: string) => doc(db, 'notices', id);
export const organizationsRef = () => collection(db, 'organizations');
export const organizationRef = (id: string) => doc(db, 'organizations', id);
export const adminRef = (uid: string) => doc(db, 'admins', uid);
export const reportsRef = () => collection(db, 'reports');
export const userRef = (uid: string) => doc(db, 'users', uid);
export const platformSettingRef = (key: string) => doc(db, 'platformSettings', key);

/**
 * The moment before which a notice has stopped being "current".
 *
 * Matches APP.currentWindowHours on the web, so both clients agree on what is
 * still worth showing after the prayer has taken place.
 */
export function feedCutoff(now = Date.now()): Timestamp {
  return Timestamp.fromMillis(now - CURRENT_WINDOW_HOURS * 3600 * 1000);
}

/** Upcoming public notices, soonest first. One page. */
export function upcomingNoticesQuery(
  pageSize: number,
  after?: DocSnapshot,
) {
  const clauses = [
    where('isPublic', '==', true),
    where('janazahAt', '>=', feedCutoff()),
    orderBy('janazahAt', 'asc'),
    ...(after ? [startAfter(after)] : []),
    limit(pageSize),
  ];
  return query(noticesRef(), ...clauses);
}

/**
 * Upcoming public notices from a specific set of organizations.
 *
 * Firestore's `in` operator accepts at most 30 values, so callers must chunk.
 * chunkOrgIds below is the only supported way to do that.
 */
export const MAX_IN_VALUES = 30;

export function chunkOrgIds(orgIds: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < orgIds.length; i += MAX_IN_VALUES) {
    chunks.push(orgIds.slice(i, i + MAX_IN_VALUES));
  }
  return chunks;
}

export function orgNoticesQuery(orgIds: string[], pageSize: number) {
  if (orgIds.length === 0 || orgIds.length > MAX_IN_VALUES) {
    throw new RangeError(
      `orgNoticesQuery takes 1 to ${MAX_IN_VALUES} organization ids; use chunkOrgIds`,
    );
  }
  return query(
    noticesRef(),
    where('isPublic', '==', true),
    where('orgId', 'in', orgIds),
    where('janazahAt', '>=', feedCutoff()),
    orderBy('janazahAt', 'asc'),
    limit(pageSize),
  );
}

/** The public directory of verified organizations. */
export function verifiedOrganizationsQuery() {
  return query(
    organizationsRef(),
    where('verificationStatus', '==', 'verified'),
  );
}

/**
 * Organizations the signed-in user is staff of.
 *
 * Read so the app can recognise a coordinator and point them at the web
 * console. The mobile app publishes nothing in version 1, and being able to
 * read this grants nothing: publishing is gated on the rules, not on which
 * screen a client chooses to show.
 */
export function myOrganizationsQuery(uid: string) {
  return query(organizationsRef(), where('staffUids', 'array-contains', uid));
}

export { getDocs, getDoc, collectionGroup, Timestamp };
