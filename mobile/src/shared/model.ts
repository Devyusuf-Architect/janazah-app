// Notice shape, validation and the public field allowlist.
// Implementation: public/js/model.js.
//
// NOTICE_PUBLIC_KEYS is the same list firestore.rules enforces and
// tests/public-surface.test.js pins in both directions. This app reads it
// rather than restating it, so adding a public field cannot leave the mobile
// client behind.

import * as model from '../../../public/js/model.js';

export const NOTICE_PUBLIC_KEYS: readonly string[] = model.NOTICE_PUBLIC_KEYS;
export const FORBIDDEN_PUBLIC_FIELDS: readonly string[] =
  model.FORBIDDEN_PUBLIC_FIELDS;

export const ORG_TYPES: { value: string; label: string }[] = model.ORG_TYPES;
export const VERIFICATION_STATUS_LABEL: Record<string, string> =
  model.VERIFICATION_STATUS_LABEL;

export const normaliseName: (name: string) => string = model.normaliseName;

export const DUPLICATE_WINDOW_HOURS: number = model.DUPLICATE_WINDOW_HOURS;
export const DUPLICATE_RADIUS_KM: number = model.DUPLICATE_RADIUS_KM;

/** Prayer time as a readable string in the notice's own zone. */
export const formatJanazahTime: (notice: unknown) => string =
  model.formatJanazahTime;
