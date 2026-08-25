# Organization verification, and what the Admin Portal will read

How a masjid or funeral coordinator goes from "signed up" to "can publish",
and the contract the Admin Portal is being built against. Nothing here is
new architecture: the states, the fields and the rules that enforce them
already existed. This writes down the workflow they add up to.

---

## The states

`verificationStatus` on `/organizations/{orgId}`, one of four values, pinned
by `validOrgShape()` in `firestore.rules`:

| Status | Can publish | Meaning |
| --- | --- | --- |
| `pending` | no | Registered, waiting for a platform administrator |
| `verified` | **yes** | Approved. The only status that can publish |
| `rejected` | no | Reviewed and declined |
| `suspended` | no | Was verified; publishing stopped pending review |

Publishing is gated by `isOrgVerified(orgId)` on **both** notice create and
notice update. A pending, rejected or suspended organization cannot create a
notice and cannot edit one it created earlier.

## The flow

```
Sign up (Google or email/password)     one Firebase Auth account, all roles
  → Register organization               store.registerOrganization()
  → status: pending                     forced by rules, not by the client
  → "Verification pending" screen       views/org.js verificationStateScreen()
  → appears in the Admin Portal queue   store.watchOrganizationsByStatus('pending')
  → administrator approves or rejects   store.setVerificationStatus()
      approved → status: verified       coordinator dashboard unlocks
      rejected → status: rejected       reason shown to the applicant
```

## Why a coordinator cannot approve themselves

This is enforced in `firestore.rules`, not in the UI. Hiding a button stops
nobody who can open a console.

**At create** — the registration rule requires:

```
&& request.resource.data.verificationStatus == 'pending'
&& !('verifiedAt' in request.resource.data)
&& !('verifiedBy' in request.resource.data)
```

So a registration cannot arrive already verified, and cannot smuggle in
verification metadata.

**At update** — the owner and staff rules both forbid touching any of it:

```
&& !changed(['verificationStatus', 'verifiedAt', 'verifiedBy',
             'statusReason', 'ownerUid', 'createdAt', 'createdBy'])
```

Only the platform-admin rule may change those fields, and even then
`verifiedBy` must equal the calling administrator's own uid, so the
server-written audit trail attributes the decision to a real account rather
than to whatever the client claimed.

Proved against the real rules engine in `tests/rules.test.js`, under
"verification cannot be self-granted": an owner cannot verify their own
organization; a rejected organization cannot promote itself back into the
queue or erase the administrator's reason; a suspended one cannot reinstate
itself; a non-owner staff member cannot change the status at all; and an
administrator cannot attribute a decision to someone else.

## What the Admin Portal reads

Everything the requested queue needs is already stored and already readable
by a platform administrator. No new collection, no new field.

| Requested column | Where it comes from |
| --- | --- |
| Masjid / organization name | `name` |
| Organization type | `type` (`masjid` / `funeral_home` / `other`) |
| Address | `address` |
| City / province | `city`, `province`, plus optional `postalCode` |
| Primary coordinator contact | `contactEmail` (required at registration) |
| Date submitted | `createdAt` |
| Current verification status | `verificationStatus` |
| Who submitted it | `createdBy` / `ownerUid` |
| Registration extras | `website`, `lat`/`lng`, `cell` |

Query: `store.watchOrganizationsByStatus(status, cb)`, which is a live
`onSnapshot` over `where('verificationStatus', '==', status)`. The
`allow list` rule permits it for a platform administrator.

Actions, all through `store.setVerificationStatus(orgId, status, reason)`:

- **Approve** → `verified`, stamping `verifiedAt` and `verifiedBy` (the
  administrator's own uid) and recording the reason.
- **Reject** → `rejected` with a reason, which the applicant sees on their
  pending/declined screen.
- **Suspend** → `suspended` with a reason. Publishing stops; notices already
  published stay visible, because a shared link going dead is worse than one
  that explains itself.
- **Reinstate** → back to `verified`.

Every one of those writes is audited server-side by the `onOrgAuditWritten`
Cloud Functions trigger (`functions/lib/audit-log.js`), not by the browser,
so an administrator cannot make a decision without it being recorded.

## What is deliberately not built yet

- **The submitter's account email.** The queue shows `contactEmail` and the
  raw `ownerUid`. Resolving a uid to its Firebase Auth email needs the Admin
  SDK, so it belongs in a Cloud Function when the Admin Portal is built,
  not in a client-readable field on a document that becomes public once
  verified.
- **Re-submission after rejection.** A declined applicant can edit their
  organization's profile and ask for another look, but there is no
  "resubmit" button that moves `rejected` back to `pending`; only an
  administrator can. That is intentional until there is a reason to
  automate it.
