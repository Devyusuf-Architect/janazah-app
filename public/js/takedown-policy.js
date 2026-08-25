// The family takedown request target.
//
// Shared between the report dialog (public/js/views/feed.js) and the privacy
// page, the same way retention-policy.js is shared, so the number stated to
// someone submitting a request matches the number promised in writing.
//
// This is a policy choice, not a fact about the system: it is what the
// operator commits to aiming for, not a guarantee enforced anywhere in code.
// Change it here if the real turnaround time is different.

export const FAMILY_TAKEDOWN_TARGET = 'one business day';
