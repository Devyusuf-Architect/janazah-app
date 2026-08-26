// Evidence that the person registering an organization actually represents it.
//
// Everything here is a *signal*, shown to a human reviewer. Nothing in this
// file approves or rejects anything, and there is deliberately no combined
// score: a number invites a reviewer to stop reading, and the failure mode of
// this system is a stranger publishing a funeral notice for someone else's
// family. A person decides, every time.
//
// The signals are also computed at read time from data already stored
// (`website` on the organization, `workEmail` on the private application)
// rather than stored as a flag the client wrote. A stored boolean would be
// forgeable by anyone willing to edit JavaScript, which is exactly the class
// of problem firestore.rules exists to remove.

/** What the applicant says they are. Free text is a last resort, not a default. */
export const APPLICANT_ROLES = [
  { value: 'imam', label: 'Imam' },
  { value: 'board_member', label: 'Board member or trustee' },
  { value: 'administrator', label: 'Administrator or office staff' },
  { value: 'funeral_coordinator', label: 'Funeral or Janazah coordinator' },
  { value: 'volunteer', label: 'Authorized volunteer' },
  { value: 'other', label: 'Other' },
];

export function roleLabel(value, other = '') {
  if (value === 'other') return other?.trim() || 'Other';
  return APPLICANT_ROLES.find((r) => r.value === value)?.label || value || '';
}

/** How the applicant offers to prove it. Multi-select; none of it is required. */
export const VERIFICATION_METHODS = [
  { value: 'work_email',
    label: 'I have an email address at the organization’s domain' },
  { value: 'listed_on_website',
    label: 'I am named on the organization’s website' },
  { value: 'staff_page',
    label: 'I can give you a link to the staff or contact page listing me' },
  { value: 'phone_callback',
    label: 'You can call the organization’s public number and ask for me' },
  { value: 'community_reference',
    label: 'Another verified organization can vouch for us' },
  { value: 'document',
    label: 'I can send a document on the organization’s letterhead' },
];

export function methodLabel(value) {
  return VERIFICATION_METHODS.find((m) => m.value === value)?.label || value;
}

// Consumer mailbox providers. An address at one of these says nothing about
// who the sender works for, which is the whole point of noting it.
const PUBLIC_EMAIL_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.ca', 'yahoo.co.uk',
  'hotmail.com', 'hotmail.ca', 'hotmail.co.uk', 'outlook.com', 'live.com',
  'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me',
  'protonmail.com', 'gmx.com', 'gmx.net', 'mail.com', 'yandex.com',
  'zoho.com', 'rogers.com', 'sympatico.ca', 'shaw.ca', 'telus.net',
  'bell.net', 'videotron.ca', 'comcast.net', 'verizon.net', 'sbcglobal.net',
]);

export function isPublicEmailProvider(domain) {
  return PUBLIC_EMAIL_PROVIDERS.has(String(domain || '').trim().toLowerCase());
}

/** The registrable-looking domain of an email address, or ''. */
export function emailDomain(email) {
  const at = String(email || '').trim().toLowerCase().lastIndexOf('@');
  if (at < 1) return '';
  return String(email).trim().toLowerCase().slice(at + 1).replace(/\.$/, '');
}

/** The host of a website, with the scheme, path and a leading www. removed. */
export function websiteDomain(website) {
  const raw = String(website || '').trim().toLowerCase();
  if (!raw) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
  let host = '';
  try {
    host = new URL(withScheme).hostname;
  } catch {
    return '';
  }
  return host.replace(/^www\./, '').replace(/\.$/, '');
}

/**
 * Compare the work email domain against the website domain.
 *
 * Deliberately conservative in both directions. A match is evidence, not
 * proof: domains are cheap. A mismatch is a prompt to check, not a reason to
 * refuse: plenty of real masjids run on a donated Gmail account, and refusing
 * them would push exactly the communities this is built for off the platform.
 *
 * @returns {{ level: 'match'|'public'|'mismatch'|'unknown', label: string, detail: string }}
 */
export function domainSignal({ website, workEmail } = {}) {
  const site = websiteDomain(website);
  const mail = emailDomain(workEmail);

  if (!mail) {
    return {
      level: 'unknown',
      label: 'No work email given',
      detail: 'Verify another way before approving.',
    };
  }
  if (isPublicEmailProvider(mail)) {
    return {
      level: 'public',
      label: 'Public email provider. Manual verification recommended',
      detail: `${mail} is a consumer mailbox and says nothing about who the `
            + 'applicant works for. This is common and is not a reason to decline.',
    };
  }
  if (!site) {
    return {
      level: 'unknown',
      label: 'No website to compare against',
      detail: `The work email is at ${mail}, but no organization website was `
            + 'given, so there is nothing to check it against.',
    };
  }
  // Subdomains count: mail at office.testmasjid.ca against testmasjid.ca.
  const match = mail === site || mail.endsWith(`.${site}`) || site.endsWith(`.${mail}`);
  return match
    ? {
      level: 'match',
      label: 'Official domain match',
      detail: `The work email is at ${mail}, which matches the website `
            + `${site}. Evidence, not proof: still confirm before approving.`,
    }
    : {
      level: 'mismatch',
      label: 'Work email domain does not match the website',
      detail: `The work email is at ${mail}; the website is ${site}. There may `
            + 'be an ordinary explanation. Ask.',
    };
}

/**
 * Every signal a reviewer sees for one application, in one place.
 *
 * Returns a list, not a verdict and not a total. Ordering is by how much
 * checking each one still needs, so the things a reviewer must not skip are
 * not sitting at the bottom of the panel.
 */
export function verificationSignals(org = {}, application = {}) {
  const signals = [domainSignal({
    website: org.website, workEmail: application.workEmail,
  })];

  signals.push(application.emailVerifiedAtSubmit
    ? {
      level: 'match',
      label: 'Sign-in email confirmed',
      detail: 'Firebase confirmed the applicant controls their sign-in '
            + 'address. This says nothing about the organization.',
    }
    : {
      level: 'unknown',
      label: 'Sign-in email not confirmed',
      detail: 'The applicant has not clicked the confirmation link sent to '
            + 'their sign-in address.',
    });

  if (application.staffPageUrl) {
    signals.push({
      level: 'unknown',
      label: 'Staff or contact page given',
      detail: `Open ${application.staffPageUrl} and check the applicant is `
            + 'named on it.',
    });
  }
  if (application.documentPath) {
    signals.push({
      level: 'unknown',
      label: 'Supporting document attached',
      detail: 'Private to platform administrators. Read it before deciding.',
    });
  }
  const methods = application.verificationMethods || [];
  if (methods.length) {
    signals.push({
      level: 'unknown',
      label: `${methods.length} verification ${methods.length === 1 ? 'route' : 'routes'} offered`,
      detail: methods.map(methodLabel).join('; '),
    });
  }
  return signals;
}

// --------------------------------------------------------------- duplicates
//
// Two records for the same masjid is not a cosmetic problem. Families follow
// one of them, the notices get published on the other, and the alert never
// arrives. It is also the shape a bad registration takes: somebody standing
// up a second "Masjid Al-Noor" they have nothing to do with.
//
// This only ever warns. It cannot block, and it must not: a genuinely new
// organization with a similar name in the same city is entirely possible, and
// refusing it would leave a real masjid unable to register at all.
//
// A limit worth being honest about: this compares against *verified*
// organizations only, because firestore.rules correctly hides pending ones
// from everybody but their own staff. A duplicate of a registration that is
// still in the queue is caught by the administrator reviewing it, not here.

/** Strip the words almost every masjid name contains, so the rest can be compared. */
const NAME_NOISE = new Set([
  'the', 'of', 'and', 'al', 'ul', 'e', 'masjid', 'mosque', 'jamia', 'jame',
  'jamiah', 'musalla', 'musallah', 'islamic', 'islam', 'muslim', 'centre',
  'center', 'society', 'association', 'community', 'institute',
  'foundation', 'organization', 'organisation', 'inc', 'incorporated',
  'trust', 'council', 'funeral', 'home', 'services', 'service',
]);

export function nameTokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !NAME_NOISE.has(word));
}

/**
 * Do two organization names share their distinguishing words?
 *
 * "Masjid Al-Noor" and "Al Noor Islamic Centre" both reduce to {noor}, which
 * is the case worth catching. "Masjid Al-Noor" and "Masjid Al-Huda" reduce to
 * {noor} and {huda} and are correctly left alone.
 */
export function namesLookAlike(a, b) {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return false;
  const shared = left.filter((word) => right.includes(word));
  // Every distinguishing word of the shorter name appears in the longer one.
  return shared.length === Math.min(left.length, right.length);
}

/**
 * Existing organizations that might already be the one being registered.
 *
 * Matched on name, or on being close enough on the map that two separate
 * organizations at that distance would be surprising. Same city is required
 * for a name match so that "Al-Noor" in Toronto does not flag "Al-Noor" in
 * Vancouver, which really are different masjids.
 *
 * @returns {Array<object>} Possible matches, never a decision about them.
 */
export function findPossibleDuplicates(candidate, organizations = []) {
  const city = String(candidate.city || '').trim().toLowerCase();
  const { lat, lng } = candidate;
  return organizations.filter((org) => {
    if (!org || org.id === candidate.id) return false;
    const sameCity = city && String(org.city || '').trim().toLowerCase() === city;
    if (sameCity && namesLookAlike(candidate.name, org.name)) return true;
    if (Number.isFinite(lat) && Number.isFinite(lng)
        && Number.isFinite(org.lat) && Number.isFinite(org.lng)) {
      // Roughly 250 m, compared without trigonometry because precision here
      // is not worth a dependency: this is a prompt to look, not a test.
      return Math.abs(org.lat - lat) < 0.0025 && Math.abs(org.lng - lng) < 0.0035;
    }
    return false;
  });
}
