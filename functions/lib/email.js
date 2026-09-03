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

/**
 * Which verification outcomes are worth an email at all.
 *
 * suspended is here deliberately, alongside the three original decisions: an
 * organization that stops being able to publish without warning needs to
 * know that as much as one that was just approved. pending is not, on
 * either side of it: it is both the very first state a registration ever
 * has (nothing has been decided yet, so there is nothing to report) and, on
 * the way back up from rejected or needs_information, an intermediate stop
 * with no decision of its own. Reinstatement goes straight from suspended to
 * verified (see decisionButtons in the admin portal), so it is already
 * covered by the verified case above.
 */
export const NOTIFIED_STATUSES = ['verified', 'rejected', 'needs_information', 'suspended'];

const SIGN_OFF = (siteUrl) => `Ta'ziyah\n${siteUrl}`;
const GREETING = 'Assalamu alaikum,';

const trim = (value) => String(value || '').trim();

/**
 * Every email this file sends is built from the same three pieces: a fixed
 * greeting, whatever the caller has to say, and a fixed sign-off naming the
 * site. Pulling that into one place means a change to the greeting or the
 * sign-off, should one ever be needed, happens once rather than once per
 * message, and a new kind of email gets the same shape for free instead of
 * needing to remember it.
 *
 * Paragraphs that are null or empty are dropped, so a caller can build its
 * list with conditional entries (`note ? '...' : null`) without filtering it
 * itself.
 *
 * @param {string} subject
 * @param {(string|null|undefined)[]} paragraphs  Body paragraphs, greeting
 *   and sign-off excluded; both are added here.
 * @param {string} siteUrl
 * @returns {{subject: string, text: string}}
 */
function composeEmail(subject, paragraphs, siteUrl) {
  const site = trim(siteUrl) || 'https://taziyah.com';
  return {
    subject,
    text: [GREETING, ...paragraphs, SIGN_OFF(site)]
      .filter((p) => trim(p).length > 0)
      .join('\n\n'),
  };
}

/**
 * The message for one verification decision, or null when the status is not
 * one people are written to about.
 *
 * Deliberately plain. Somebody reading this is running a masjid, not being
 * marketed to, and the message has one job: say what happened, to which
 * organization, with the reviewer's own words when there are any.
 *
 * @param {string} status  verified, rejected, needs_information or suspended.
 * @param {object} ctx
 * @param {string} ctx.orgName
 * @param {string} [ctx.reason]  The reviewer's note (statusReason).
 * @param {string} ctx.siteUrl
 * @returns {{subject: string, text: string}|null}
 */
export function verificationEmail(status, { orgName, reason = '', siteUrl } = {}) {
  const name = trim(orgName) || 'Your organization';
  const note = trim(reason);

  if (status === 'verified') {
    return composeEmail(`${name} is verified on Ta'ziyah`, [
      `${name} has been verified on Ta'ziyah. It can now publish Janazah `
        + 'notices, and it appears in the public directory of masjids.',
      note ? `Note from the reviewer: ${note}` : null,
      `Sign in at ${trim(siteUrl) || 'https://taziyah.com'} to publish.`,
    ], siteUrl);
  }

  if (status === 'rejected') {
    return composeEmail(`About the Ta'ziyah registration for ${name}`, [
      `The registration for ${name} on Ta'ziyah was not approved, so it `
        + 'cannot publish Janazah notices.',
      note ? `Reason given: ${note}` : null,
      'If this is a mistake, or you can provide something further, update '
        + `the registration at ${trim(siteUrl) || 'https://taziyah.com'} `
        + 'and ask for it to be looked at again.',
    ], siteUrl);
  }

  if (status === 'needs_information') {
    return composeEmail(`More information is needed for ${name}`, [
      `Before ${name} can be verified on Ta'ziyah, the reviewers need more `
        + 'information. Nothing is wrong with the registration; it is simply '
        + 'not yet possible to confirm.',
      note ? `What is needed: ${note}` : null,
      `Sign in at ${trim(siteUrl) || 'https://taziyah.com'} to update the `
        + 'registration and reply.',
    ], siteUrl);
  }

  if (status === 'suspended') {
    return composeEmail(`Publishing is suspended for ${name}`, [
      `${name} has been suspended on Ta'ziyah. It can no longer publish `
        + 'Janazah notices. Notices it already published stay visible, so a '
        + 'family holding a link is not left with a dead page.',
      note ? `Reason given: ${note}` : null,
      `If you believe this is a mistake, sign in at `
        + `${trim(siteUrl) || 'https://taziyah.com'} and reach the `
        + 'administrators.',
    ], siteUrl);
  }

  return null;
}

/**
 * Sent once, the moment a registration is submitted, so an applicant knows it
 * was received rather than wondering whether the form worked. It reports
 * receipt only; the decision itself still comes from verificationEmail
 * above, whenever a reviewer reaches one.
 */
export function applicationReceivedEmail({ orgName, siteUrl } = {}) {
  const name = trim(orgName) || 'Your organization';
  return composeEmail(`${name}'s registration was received`, [
    `Thank you for registering ${name} on Ta'ziyah. A reviewer will check `
      + 'the application and you will hear back once a decision is made.',
    `Sign in at ${trim(siteUrl) || 'https://taziyah.com'} at any time to see `
      + 'where the application stands.',
  ], siteUrl);
}

/** Sent to someone whose staff join request was approved. */
export function staffGrantedEmail({ orgName, siteUrl } = {}) {
  const name = trim(orgName) || 'the organization';
  return composeEmail(`You now have staff access to ${name}`, [
    `Your request to join ${name} on Ta'ziyah has been approved. You can `
      + 'now publish, correct and cancel its Janazah notices.',
    `Sign in at ${trim(siteUrl) || 'https://taziyah.com'} to get started.`,
  ], siteUrl);
}

/** Sent to someone removed from an organization's staff list. */
export function staffRevokedEmail({ orgName, siteUrl } = {}) {
  const name = trim(orgName) || 'the organization';
  return composeEmail(`Your staff access to ${name} has ended`, [
    `Your staff access to ${name} on Ta'ziyah has been removed. You can no `
      + 'longer publish, correct or cancel its notices.',
    'If this was not expected, reach out to someone else on staff there.',
  ], siteUrl);
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
  return composeEmail(trim(subject), [
    trim(body),
    `This message is from the Ta'ziyah administrators, about ${name}.`,
  ], siteUrl);
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
