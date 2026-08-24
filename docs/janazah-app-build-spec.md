# Janazah App — Build Spec for Claude Code

## 0. Architecture decision (read this before starting)

Two apps share one backend:

- **Admin/Coordinator web app** — masjid registration, notice publishing, staff management. Pure PWA is fine here, no background location needed.
- **Community member app** — feed, follow, nearby alerts. The proximity alert ("even if the user doesn't follow that masjid, even if the phone is locked") requires real background location and reliable push delivery. iOS Safari PWAs cannot run background location; they only read location while the page is open. Android Chrome PWAs have more headroom but still aren't reliable for this.

**Recommendation:** build the backend and admin side first as a web app on your existing Netlify/Firebase pattern. Build the community member side as an Expo (React Native) app from day one, sharing the same Firebase project. Do not start the member side as a PWA and plan to "convert it later" — background location and push entitlements are set up differently enough that it becomes a rewrite, not a port.

If Phase 1 needs to ship as a pure PWA for speed, scope the nearby alert down explicitly: "checks proximity when the app is opened or in the last N minutes," not "even if the phone is locked." Say that to whoever reviews the MVP so expectations match what's actually possible.

## 1. Stack

- Firebase Auth (email/password + MFA for masjid admins, phone or Google for community members)
- Firestore (data + security rules)
- Cloud Functions (Node.js) for: notification fan-out, verification workflow, notice audit log, cancellation propagation
- Firebase Cloud Messaging (FCM) for push, works for both the Expo app and the admin PWA
- Firestore geohash field + a library like `geofirestore` (or hand-rolled geohash range queries) for nearby queries — Firestore has no native geoquery
- Expo (React Native) for the community member app
- Netlify for the admin/coordinator PWA, same pattern as your existing projects
- Google Maps or Apple Maps deep link for "open directions," no need to embed a map SDK for MVP

## 2. Firestore data model

```
/masajid/{masjidId}
  name, address, geohash, lat, lng
  verificationStatus: "pending" | "verified" | "rejected" | "suspended"
  verifiedAt, verifiedBy (admin uid)
  authorizedStaff: [uid, uid, ...]
  createdAt

/masajid/{masjidId}/staffRequests/{requestId}
  uid, requestedAt, status

/notices/{noticeId}
  masjidId
  status: "draft" | "published" | "updated" | "cancelled"
  deceasedName (nullable, only if approved for public sharing)
  janazahDateTime
  prayerLocation: { masjidId, address, lat, lng, geohash }
  burialLocation: { name, address, lat, lng } (nullable)
  instructions (public text, free of private family info)
  createdBy (uid), createdAt
  editHistory: [{ uid, timestamp, field, oldValue, newValue }]
  publishedAt, cancelledAt

/users/{uid}
  followedMasajid: [masjidId, ...]
  notificationDistanceKm: 5 | 10 | 20 | number
  nearbyAlertsEnabled: boolean
  fcmTokens: [token, ...]
  lastKnownGeohash, lastLocationUpdatedAt (only if nearbyAlertsEnabled = true)
  role: "member" | "masjid_staff" | "admin"

/reports/{reportId}
  noticeId, reportedBy, reason, status, createdAt, resolvedBy, resolvedAt

/auditLog/{logId}
  actorUid, action, targetType, targetId, timestamp, details
```

Notes:

- Never store a user's location history, only the most recent point needed to evaluate nearby alerts, overwritten each update. This satisfies "no travel history" from the requirements doc and is also the safer default under Canadian privacy law (PIPEDA).
- `deceasedName` and `instructions` are the only free-text fields exposed publicly. Enforce server-side that nothing else on the notice document is readable by non-staff (see security rules below).

## 3. Cloud Functions to build

1. **onNoticePublished** — triggered on notice create/update to `status: published`. Runs a geohash-range query against users with `nearbyAlertsEnabled: true`, computes real distance (geohash range then haversine filter to cut false positives), sends FCM to matched users plus all followers of that masjid, dedupes so followers within range don't get double notifications.
2. **onNoticeCancelled** — sends an update push to every uid that received the original notice (track `notifiedUids` on the notice document so cancellations reach the right people, not a re-run of the geo query with today's date).
3. **verifyMasjidRequest** — admin-only callable function, flips `verificationStatus`, writes to auditLog.
4. **reportNotice** — callable function, community members submit, writes to `/reports`, notifies admins.
5. **auditWrite** — Firestore trigger on any write to `/notices/*` and `/masajid/*`, appends to `/auditLog`.

## 4. Security rules, the load-bearing parts

- `/notices/{id}`: public read only for fields needed by the feed (use a Cloud Function-maintained public view or Firestore field-level discipline, since native Firestore rules can't do field-level read restriction directly — either split into a `notices` doc + a `noticesPrivate` subcollection, or run all public reads through a callable function that strips private fields).
- Write access to `/notices` restricted to uids present in `masajid/{masjidId}.authorizedStaff`.
- `/users/{uid}.lastKnownGeohash` readable only by that user and by Cloud Functions (via Admin SDK, which bypasses rules), never by other clients. This is what "a user's location should never be shown to masajid or other community members" means in rules terms.
- `verificationStatus` writable only by users with `role: "admin"` custom claim.

## 5. Notification distance and timing, since the requirements doc leaves this open

Reasonable MVP defaults to ship with, adjustable later:

- Distance options: 5, 10, 20 km, plus "no limit within my region."
- Nearby check runs at publish time (event-driven), not on a schedule, since Janazahs are usually announced same-day. No advance-notice window needed for v1 beyond "as soon as published."
- Re-evaluate a user's nearby matches only when their location updates by a meaningful amount (use geohash prefix change as the trigger, not a fixed timer) to control Cloud Function costs.

## 6. Phased build order for Claude Code

**Phase 1 — Backend + admin PWA**
Firebase project setup, Firestore schema, security rules, masjid registration/verification flow, notice CRUD with preview, staff authorization, audit log. Deploy admin PWA to Netlify, same pattern as your prior projects.

**Phase 2 — Community feed, no location yet**
Public notice feed, follow/unfollow masajid, directions deep links, share notice. Can still be a simple web view at this stage.

**Phase 3 — Notification pipeline**
FCM setup, onNoticePublished and onNoticeCancelled functions, geohash query implementation, distance preference UI.

**Phase 4 — Expo app with background location**
Wrap community member experience in Expo, request background location permission with clear consent screen, wire FCM token registration, test on both platforms since Android and iOS background location behave differently.

**Phase 5 — Trust and safety**
Report flow, MFA for masjid admins, rate limiting on notice creation, review of what fields are actually public vs private before first real launch.

## 7. What to paste into Claude Code as the opening prompt

"Build Phase 1 of the attached spec: Firebase project structure, Firestore schema exactly as specified, security rules enforcing the field-level privacy notes, and an admin PWA (single HTML file or small Vite app, your call) for masjid registration and notice publish/update/cancel with preview. Use my existing Firebase project [project id] under a new set of collections, don't touch the existing boys-quiz or pickleball collections. Stop after Phase 1 for review before starting Phase 2."
