// Retention periods, in days.
//
// Mirrors functions/lib/retention.js. The scheduled function is what enforces
// these; this copy exists so the privacy page states the same numbers rather
// than a hand-written guess that drifts. Change both together, and say so in
// docs/phase-5-notes.md.

export const RETENTION_DAYS = {
  privateDetailsDays: 7,
  publicNameDays: 30,
  notificationRunsDays: 30,
  resolvedReportsDays: 90,
};
