// Who may do what to an organization, as this client understands it.
//
// Nothing here grants anything. Every rule below is a mirror of a clause in
// firestore.rules, and the rules are what actually decide: a build of this
// app with these functions replaced by `() => true` would still be refused by
// Firestore on every write. The point of the mirror is that the app should
// not offer somebody a button that is going to fail, and should not hide a
// section from the person it belongs to.
//
// Pure on purpose. No Firebase import, no React, so the drift between these
// and the rules can be tested from Node against firestore.rules itself. See
// test/org-role.test.ts, which reads the rules file and checks the two agree.

import type { Organization } from './notice';

export type OrgRole = 'owner' | 'staff' | null;

/**
 * The caller's standing in this organization.
 *
 * Owner beats staff: firestore.rules gives the owner a superset of what a
 * staff member may do (the staff list, and withdrawal), so somebody who is
 * both is the owner.
 */
export function orgRole(
  org: Organization | null | undefined,
  uid: string | null | undefined,
): OrgRole {
  if (!org || !uid) return null;
  if (org.ownerUid === uid) return 'owner';
  return org.staffUids.includes(uid) ? 'staff' : null;
}

/** What to call it on screen. Nothing here is a permission. */
export const roleLabel = (role: OrgRole): string =>
  role === 'owner' ? 'Owner' : role === 'staff' ? 'Staff' : '';

/**
 * Profile edits: owner or staff, whatever the verification status.
 *
 * A pending organization can still correct its own address, which is often
 * exactly what an administrator asked for.
 */
export const canEditOrg = (role: OrgRole): boolean =>
  role === 'owner' || role === 'staff';

/**
 * Publishing: staff of a *verified* organization, and nobody else.
 *
 * isOrgVerified() guards every notice create and update in the rules, so a
 * pending, suspended, rejected or withdrawn organization publishes nothing
 * however this app is built.
 */
export const canManageNotices = (
  role: OrgRole,
  org: Organization | null | undefined,
): boolean => canEditOrg(role) && org?.verificationStatus === 'verified';

/**
 * The states a registration can be taken back from.
 *
 * Only ones nobody has approved. Never verified, so an organization cannot
 * leave with published notices behind it, and never suspended, so withdrawal
 * cannot be used to step out from under a platform decision. Both of those
 * stay with a platform administrator.
 */
export const WITHDRAWABLE_STATUSES = ['pending', 'needs_information', 'rejected'];

/** Withdrawal is the owner's alone. A staff member cannot end a registration. */
export const canWithdrawOrg = (
  role: OrgRole,
  org: Organization | null | undefined,
): boolean =>
  role === 'owner'
  && !!org
  && WITHDRAWABLE_STATUSES.includes(org.verificationStatus);

/**
 * The fields this app lets somebody edit.
 *
 * A subset of what the rules permit, not a restatement of it: verification
 * status, ownership, the staff list and the created/verified stamps are all
 * absent, and absent here means there is no code path that sends them.
 */
export const EDITABLE_ORG_FIELDS = [
  'name', 'address', 'city', 'province', 'postalCode',
  'contactEmail', 'phone', 'website',
] as const;

export type EditableOrgField = typeof EDITABLE_ORG_FIELDS[number];

/** A field whose change should move the map pin as well. */
export const ADDRESS_FIELDS: EditableOrgField[] = [
  'address', 'city', 'province', 'postalCode',
];

export type OrgDraft = Record<EditableOrgField, string>;

export function draftFrom(org: Organization): OrgDraft {
  return {
    name: org.name,
    address: org.address,
    city: org.city,
    province: org.province,
    postalCode: org.postalCode ?? '',
    contactEmail: org.contactEmail ?? '',
    phone: org.phone ?? '',
    website: org.website ?? '',
  };
}

/** Only what actually changed, so an untouched field is never rewritten. */
export function changedFields(org: Organization, draft: OrgDraft): Partial<OrgDraft> {
  const before = draftFrom(org);
  const patch: Partial<OrgDraft> = {};
  for (const field of EDITABLE_ORG_FIELDS) {
    const next = draft[field].trim();
    if (next !== before[field].trim()) patch[field] = next;
  }
  return patch;
}

export const movedAddress = (patch: Partial<OrgDraft>): boolean =>
  ADDRESS_FIELDS.some((field) => field in patch);

/**
 * What is wrong with a draft, in the order somebody should fix it.
 *
 * The name check mirrors validOrgShape(), which rejects an empty name and one
 * over 140 characters. Better to say so on the screen than to send a write
 * that Firestore refuses with "permission denied", which reads as a bug.
 */
export function draftProblem(draft: OrgDraft): string | null {
  const name = draft.name.trim();
  if (!name) return 'A masjid needs a name.';
  if (name.length > 140) return 'That name is too long. Keep it under 140 characters.';
  if (!draft.address.trim()) return 'An address is needed so people can find it.';
  if (!draft.city.trim()) return 'A city is needed.';
  if (!draft.province.trim()) return 'A province is needed.';

  const email = draft.contactEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'That does not look like an email address.';
  }

  const site = draft.website.trim();
  if (site && !/^https?:\/\/\S+$/i.test(site)) {
    return 'A website needs to start with http:// or https://';
  }
  return null;
}

/** The address as one line, for a geocoder. */
export const addressLine = (draft: OrgDraft): string =>
  [draft.address, draft.city, draft.province, draft.postalCode]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
