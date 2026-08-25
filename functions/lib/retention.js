// Retention policy.
//
// PIPEDA expects a stated retention period and no more collection than the
// purpose needs. A deceased person's name is personal information about an
// identifiable individual, and their family has an interest in it not
// remaining searchable forever, so the public record is deliberately
// short-lived. The audit trail keeps the notice id, never the name, so an
// investigation is still possible without preserving the person's details.
//
// The numbers here are the policy. Changing one is a policy decision, so
// change it here and in docs/phase-5-notes.md and the privacy page together.

export const RETENTION = {
  /** Family contacts and internal notes are useless once the prayer is over. */
  privateDetailsDays: 7,
  /** After this, the deceased's name is removed from the public notice. */
  publicNameDays: 30,
  /** Delivery bookkeeping. Only ever counts and ids. */
  notificationRunsDays: 30,
  /** Resolved reports, kept long enough to spot a pattern of abuse. */
  resolvedReportsDays: 90,
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const daysAgo = (days, now = Date.now()) => new Date(now - days * DAY_MS);

/**
 * The fields a redaction clears, and the marker it leaves behind.
 *
 * The notice itself survives: someone holding an old link should see that a
 * Janazah took place and was announced, not a dead page. What goes is the
 * name and anything free-text that a family might not want to persist.
 */
export function redactionPatch(serverTimestamp) {
  return {
    deceasedName: null,
    showDeceasedName: false,
    instructions: '',
    correctionNote: '',
    redactedAt: serverTimestamp,
  };
}

/** Whether a notice still holds anything a redaction would remove. */
export function needsRedaction(notice) {
  if (notice.redactedAt) return false;
  return Boolean(notice.deceasedName) || Boolean(notice.instructions)
    || Boolean(notice.correctionNote);
}
