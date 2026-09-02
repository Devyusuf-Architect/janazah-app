// The email Ta'ziyah sends, and the case where it sends none.
//
// Two failures are being guarded against here, and the second is the more
// important one.
//
// The first is wording. These messages reach somebody running a masjid, often
// about a decision they have been waiting on, and they have to say what
// happened, about which organization, in the reviewer's own words when there
// are any.
//
// The second is that email must never be load-bearing. If no SMTP credentials
// are configured, or the wrong ones are, approving a masjid still has to
// work. That is a whole-system property, so smtpSettings returning null is
// tested as an ordinary answer rather than as an error condition.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  smtpSettings, verificationEmail, messageEmail, resolveRecipient,
  NOTIFIED_STATUSES,
} from '../lib/email.js';

describe('smtpSettings', () => {
  const full = {
    SMTP_HOST: 'smtp.example.com',
    SMTP_USER: 'notices@taziyah.com',
    SMTP_PASSWORD: 'not-a-real-password',
  };

  test('a fully configured project gets settings', () => {
    const settings = smtpSettings(full);
    assert.equal(settings.host, 'smtp.example.com');
    assert.equal(settings.auth.user, 'notices@taziyah.com');
  });

  test('no credentials at all is null, not a throw', () => {
    // This is the state of a project that has never been given SMTP details,
    // which is every project until somebody sets them. It has to be an
    // ordinary answer the caller can act on, because the caller is in the
    // middle of approving a masjid.
    assert.equal(smtpSettings({}), null);
    assert.equal(smtpSettings(), null);
  });

  test('any one credential missing is null, not a half-configured send', () => {
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']) {
      assert.equal(smtpSettings({ ...full, [key]: '' }), null, `${key} empty`);
      assert.equal(smtpSettings({ ...full, [key]: '   ' }), null, `${key} blank`);
      const without = { ...full };
      delete without[key];
      assert.equal(smtpSettings(without), null, `${key} absent`);
    }
  });

  test('the port defaults to 587 and STARTTLS', () => {
    const settings = smtpSettings(full);
    assert.equal(settings.port, 587);
    assert.equal(settings.secure, false);
  });

  test('port 465 is implicit TLS', () => {
    assert.equal(smtpSettings({ ...full, SMTP_PORT: '465' }).secure, true);
  });

  test('a nonsense port falls back rather than sending to port NaN', () => {
    assert.equal(smtpSettings({ ...full, SMTP_PORT: 'soon' }).port, 587);
  });

  test('the from address falls back to the authenticating user', () => {
    assert.equal(smtpSettings(full).from, 'notices@taziyah.com');
    assert.equal(
      smtpSettings({ ...full, SMTP_FROM: 'Taziyah <no-reply@taziyah.com>' }).from,
      'Taziyah <no-reply@taziyah.com>');
  });
});

describe('verificationEmail', () => {
  const ctx = { orgName: 'Masjid al-Noor', siteUrl: 'https://taziyah.com' };

  test('only the three decisions people are written to about produce mail', () => {
    assert.deepEqual(NOTIFIED_STATUSES, ['verified', 'rejected', 'needs_information']);
    for (const status of ['pending', 'suspended', 'unknown', '', null]) {
      assert.equal(verificationEmail(status, ctx), null, `${status} must send nothing`);
    }
  });

  for (const status of NOTIFIED_STATUSES) {
    test(`${status} names the organization, in the subject and the body`, () => {
      const mail = verificationEmail(status, ctx);
      assert.match(mail.subject, /Masjid al-Noor/);
      assert.match(mail.text, /Masjid al-Noor/);
    });

    test(`${status} links to the site`, () => {
      assert.match(verificationEmail(status, ctx).text, /https:\/\/taziyah\.com/);
    });

    test(`${status} carries the reviewer's reason when there is one`, () => {
      const mail = verificationEmail(status, { ...ctx, reason: 'Confirmed by phone.' });
      assert.match(mail.text, /Confirmed by phone\./);
    });

    test(`${status} says nothing about a reason when there is none`, () => {
      const mail = verificationEmail(status, ctx);
      assert.doesNotMatch(mail.text, /Reason given:|What is needed:|Note from the reviewer:/);
    });

    test(`${status} uses no em dash`, () => {
      // House style, and it renders as a stray rule in plain-text mail.
      const mail = verificationEmail(status, { ...ctx, reason: 'A note.' });
      assert.equal(mail.subject.includes('—'), false);
      assert.equal(mail.text.includes('—'), false);
    });

    test(`${status} falls back to a real link when no origin was configured`, () => {
      const mail = verificationEmail(status, { orgName: 'Masjid al-Noor' });
      assert.match(mail.text, /https:\/\/taziyah\.com/);
    });
  }

  test('approval says the organization can publish', () => {
    assert.match(verificationEmail('verified', ctx).text, /publish Janazah/);
  });

  test('a decline says it cannot publish, and how to come back', () => {
    const mail = verificationEmail('rejected', ctx);
    assert.match(mail.text, /cannot publish/);
    assert.match(mail.text, /looked at again/);
  });

  test('a request for information does not read as a rejection', () => {
    const mail = verificationEmail('needs_information', ctx);
    assert.match(mail.text, /Nothing is wrong with the registration/);
  });

  test('a missing organization name does not produce "undefined"', () => {
    const mail = verificationEmail('verified', { siteUrl: 'https://taziyah.com' });
    assert.equal(mail.text.includes('undefined'), false);
    assert.equal(mail.subject.includes('undefined'), false);
  });
});

describe('messageEmail', () => {
  test('the administrator subject and body are used as written', () => {
    const mail = messageEmail({
      orgName: 'Masjid al-Noor',
      subject: 'About your Friday timings',
      body: 'Could you confirm the phone number on your registration?',
      siteUrl: 'https://taziyah.com',
    });
    assert.equal(mail.subject, 'About your Friday timings');
    assert.match(mail.text, /Could you confirm the phone number/);
  });

  test('it says where it came from and what it is about', () => {
    const mail = messageEmail({
      orgName: 'Masjid al-Noor', subject: 'Hello', body: 'Hello.',
      siteUrl: 'https://taziyah.com',
    });
    assert.match(mail.text, /Masjid al-Noor/);
    assert.match(mail.text, /Ta'ziyah administrators/);
  });

  test('no em dash reaches the recipient', () => {
    const mail = messageEmail({
      orgName: 'Masjid al-Noor', subject: 'Hello', body: 'Hello.',
      siteUrl: 'https://taziyah.com',
    });
    assert.equal(mail.text.includes('—'), false);
  });
});

describe('resolveRecipient', () => {
  const auth = (users) => ({
    getUser: async (uid) => {
      if (!users[uid]) throw new Error('auth/user-not-found');
      return users[uid];
    },
  });

  test('the contact address on the registration wins', async () => {
    const to = await resolveRecipient(
      { auth: auth({ owner: { email: 'owner@example.com' } }) },
      { contactEmail: 'office@masjid.example', ownerUid: 'owner' });
    assert.equal(to, 'office@masjid.example');
  });

  test('with no contact address, the owner account address is used', async () => {
    const to = await resolveRecipient(
      { auth: auth({ owner: { email: 'owner@example.com' } }) },
      { ownerUid: 'owner' });
    assert.equal(to, 'owner@example.com');
  });

  test('a blank contact address is not an address', async () => {
    const to = await resolveRecipient(
      { auth: auth({ owner: { email: 'owner@example.com' } }) },
      { contactEmail: '   ', ownerUid: 'owner' });
    assert.equal(to, 'owner@example.com');
  });

  test('nowhere to send resolves to null rather than throwing', async () => {
    assert.equal(await resolveRecipient({ auth: auth({}) }, { ownerUid: 'gone' }), null);
    assert.equal(await resolveRecipient({ auth: auth({}) }, {}), null);
    assert.equal(await resolveRecipient({ auth: auth({}) }, null), null);
  });

  test('an owner account with no address resolves to null', async () => {
    const to = await resolveRecipient({ auth: auth({ owner: {} }) }, { ownerUid: 'owner' });
    assert.equal(to, null);
  });
});
