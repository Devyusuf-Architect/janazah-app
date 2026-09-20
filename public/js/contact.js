// The one place the operator's real contact details are set.
//
// PIPEDA requires an accountable individual, and Google Play requires a
// support contact and a privacy contact that a person can actually reach.
// Both pages used to carry a paragraph of prose saying "replace this before
// launch", which is the kind of note that survives a launch.
//
// This replaces that with four values and a check. Fill them in, and the
// privacy page, the terms page and the public deletion page all render a real
// contact block. Leave them empty, and every one of those pages says plainly
// that a contact address has not been published yet, rather than implying one
// exists. mobile/scripts/release-check.mjs fails while they are empty, so a
// release cannot quietly go out without them.
//
// Nothing here is invented. These are deliberately blank rather than filled
// with a plausible-looking address: a privacy policy naming a person who has
// not agreed to be accountable, or an inbox nobody reads, is worse than one
// that admits the gap.

export const CONTACT = {
  /** The individual accountable for privacy. PIPEDA requires a named one. */
  accountable: '',
  /** Where privacy requests go. An address a person reads, not a form. */
  privacyEmail: '',
  /** Where everything else goes. May be the same address. */
  supportEmail: '',
  /** A postal address. Play's data safety contact section asks for one. */
  postalAddress: '',
};

export const isContactComplete = () =>
  Object.values(CONTACT).every((value) => value.trim().length > 0);

/**
 * What to say when it is not set.
 *
 * Used by every page that would otherwise print a contact address, so there
 * is one sentence rather than three that drift.
 */
export const CONTACT_PENDING =
  'A direct contact address for Ta’ziyah has not been published yet. Until it '
  + 'is, use “Report a problem” on any notice, which reaches a platform '
  + 'administrator and needs no account, or contact the masjid that published '
  + 'the notice.';
