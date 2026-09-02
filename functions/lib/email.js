// What Ta'ziyah says when it writes to somebody, and whether it can write at
// all.
//
// Two things live here and nothing else: the SMTP settings read out of the
// environment, and the text of each message. Both are pure functions over
// their inputs, so the wording is testable without a mail server and the
// "not configured" path is testable without unsetting anything.
//
// The one rule the sending path must obey is in index.js rather than here: an
// email failure never fails the write that prompted it. Approving a masjid is
// the act; telling them about it is a courtesy that follows, and a courtesy
// that throws would leave an organization unverified because a mail host was
// briefly down.
//
// On addresses: nothing in this module is ever returned to a browser. The
// recipient is resolved on the server, used, and dropped. Ta'ziyah keeps user
// email addresses out of public documents deliberately, and a "who did this
// go to" field on a public organization would undo that quietly.

/**
 * SMTP settings, or null when the project has not been given any.
 *
 * Null is a first-class answer, not a failure. A deployment with no mail
 * credentials is a perfectly working Ta'ziyah that does not send email, and
 * every caller here treats it that way.
 *
 * Host, user and password are the three that must be present. The port has a
 * sensible default and the from address falls back to the authenticating
 * user, which is what most SMTP providers require anyway.
 */
export function smtpSettings(env = {}) {
  const host = String(env.SMTP_HOST || '').trim();
  const user = String(env.SMTP_USER || '').trim();
  const pass = String(env.SMTP_PASSWORD || '').trim();
  if (!host || !user || !pass) return null;

  const port = Number.parseInt(String(env.SMTP_PORT || ''), 10) || 587;
  return {
    host,
    port,
    // 465 is implicit TLS; 587 and 25 start in the clear and upgrade.
    secure: port === 465,
    auth: { user, pass },
    from: String(env.SMTP_FROM || '').trim() || user,
  };
}

/** Which verification outcomes are worth an email at all. */
export const NOTIFIED_STATUSES = ['verified', 'rejected', 'needs_information'];

const SIGN_OFF = (siteUrl) => `Ta'ziyah\n${siteUrl}`;

const trim = (value) => String(value || '').trim();

/**
 * The message for one verification decision, or null when the status is not
 * one people are written to about.
 *
 * Deliberately plain. Somebody reading this is running a masjid, not being
 * marketed to, and the message has one job: say what happened, to which
 * organization, with the reviewer's own words when there are any.
 *
 * @param {string} status  verified, rejected or needs_information.
 * @param {object} ctx
 * @param {string} ctx.orgName
 * @param {string} [ctx.reason]  The reviewer's note (statusReason).
 * @param {string} ctx.siteUrl
 * @returns {{subject: string, text: string}|null}
 */
export function verificationEmail(status, { orgName, reason = '', siteUrl } = {}) {
  const name = trim(orgName) || 'Your organization';
  const site = trim(siteUrl) || 'https://taziyah.com';
  const note = trim(reason);

  if (status === 'verified') {
    return {
      subject: `${name} is verified on Ta'ziyah`,
      text: [
        'Assalamu alaikum,',
        `${name} has been verified on Ta'ziyah. It can now publish Janazah `
          + 'notices, and it appears in the public directory of masjids.',
        note ? `Note from the reviewer: ${note}` : null,
        `Sign in at ${site} to publish.`,
        SIGN_OFF(site),
      ].filter(Boolean).join('\n\n'),
    };
  }

  if (status === 'rejected') {
    return {
      subject: `About the Ta'ziyah registration for ${name}`,
      text: [
        'Assalamu alaikum,',
        `The registration for ${name} on Ta'ziyah was not approved, so it `
          + 'cannot publish Janazah notices.',
        note ? `Reason given: ${note}` : null,
        'If this is a mistake, or you can provide something further, update '
          + `the registration at ${site} and ask for it to be looked at again.`,
        SIGN_OFF(site),
      ].filter(Boolean).join('\n\n'),
    };
  }

  if (status === 'needs_information') {
    return {
      subject: `More information is needed for ${name}`,
      text: [
        'Assalamu alaikum,',
        `Before ${name} can be verified on Ta'ziyah, the reviewers need more `
          + 'information. Nothing is wrong with the registration; it is simply '
          + 'not yet possible to confirm.',
        note ? `What is needed: ${note}` : null,
        `Sign in at ${site} to update the registration and reply.`,
        SIGN_OFF(site),
      ].filter(Boolean).join('\n\n'),
    };
  }

  return null;
}

/**
 * A one-off note an administrator writes to an organization.
 *
 * The administrator's own subject and body are used as written. The wrapper
 * exists only so the recipient can tell what the message is about and where
 * it came from, since it arrives from a platform address they may not
 * recognise.
 */
export function messageEmail({ orgName, subject, body, siteUrl } = {}) {
  const name = trim(orgName) || 'your organization';
  const site = trim(siteUrl) || 'https://taziyah.com';
  return {
    subject: trim(subject),
    text: [
      'Assalamu alaikum,',
      trim(body),
      `This message is from the Ta'ziyah administrators, about ${name}.`,
      SIGN_OFF(site),
    ].join('\n\n'),
  };
}

/**
 * Where a message about an organization should go.
 *
 * contactEmail is what the organization itself put on its registration and is
 * the address it expects to be reached at. The owner's sign-in address is the
 * fallback, read from Auth rather than from the organization document,
 * because it is never written onto one.
 *
 * @param {{auth: object}} deps
 * @param {object} org  The organization document data.
 * @returns {Promise<string|null>}
 */
export async function resolveRecipient({ auth }, org) {
  const contact = trim(org?.contactEmail);
  if (contact) return contact;

  const ownerUid = trim(org?.ownerUid);
  if (!ownerUid) return null;
  try {
    const user = await auth.getUser(ownerUid);
    return trim(user?.email) || null;
  } catch {
    return null;
  }
}
