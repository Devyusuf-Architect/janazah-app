// Reading the audit trail.
//
// Entries are written only by Cloud Functions triggers, through the Admin
// SDK, which bypasses rules entirely (functions/index.js, one trigger per
// collection whose changes matter: notices, organizations, staff requests,
// reports). That is what makes the trail unforgeable in fact rather than in
// intent: firestore.rules closes /auditLog to every client write, so there is
// no client code path, correct or malicious, that can produce a document
// change without a matching entry appearing, or that can write an entry that
// does not correspond to a real change.
//
// This file only reads. See functions/lib/audit-log.js for what gets written
// and why.

import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from './firebase.js';

/** Recent audit entries for one organization. Staff and platform admins only. */
export async function auditForOrg(orgId, max = 100) {
  const snap = await getDocs(query(
    collection(db, 'auditLog'),
    where('orgId', '==', orgId),
    orderBy('at', 'desc'),
    limit(max),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
