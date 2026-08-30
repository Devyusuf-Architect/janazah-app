// Verification vocabulary. Implementation: public/js/verification.js.
//
// Only the read-side helpers are used here. The mobile app never submits or
// reviews a verification application; it shows whether an organization is
// verified, which is a field a platform administrator alone can write.

import * as verification from '../../../public/js/verification.js';

export const APPLICANT_ROLES: { value: string; label: string }[] =
  verification.APPLICANT_ROLES;

export const roleLabel: (value: string, other?: string) => string =
  verification.roleLabel;

export const nameTokens: (name: string) => string[] = verification.nameTokens;
export const namesLookAlike: (a: string, b: string) => boolean =
  verification.namesLookAlike;
