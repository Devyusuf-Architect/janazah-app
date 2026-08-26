// Verification signals shown to a human reviewer.
//
// The thing being protected: a stranger must not end up publishing funeral
// notices in a real masjid's name. These signals are what an administrator
// reads before deciding, so a signal that reads confidently while being wrong
// is worse than no signal at all.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  emailDomain, websiteDomain, isPublicEmailProvider, domainSignal,
  verificationSignals, roleLabel, methodLabel, APPLICANT_ROLES,
  findPossibleDuplicates, namesLookAlike, nameTokens,
} from '../public/js/verification.js';

describe('reading domains', () => {
  test('an email domain is the part after the last @', () => {
    assert.equal(emailDomain('imam@testmasjid.ca'), 'testmasjid.ca');
    assert.equal(emailDomain('  Imam@TestMasjid.CA '), 'testmasjid.ca');
    assert.equal(emailDomain('odd@name@testmasjid.ca'), 'testmasjid.ca');
  });

  test('anything that is not an address has no domain', () => {
    for (const bad of ['', null, undefined, 'not an email', '@nolocalpart.com']) {
      assert.equal(emailDomain(bad), '', `${bad} should have no domain`);
    }
  });

  test('a website domain drops the scheme, the path and a leading www', () => {
    assert.equal(websiteDomain('https://www.testmasjid.ca/about'), 'testmasjid.ca');
    assert.equal(websiteDomain('testmasjid.ca'), 'testmasjid.ca');
    assert.equal(websiteDomain('http://TestMasjid.ca'), 'testmasjid.ca');
  });

  test('an unparseable website yields nothing rather than a guess', () => {
    assert.equal(websiteDomain(''), '');
    assert.equal(websiteDomain('http://'), '');
  });
});

describe('the domain comparison signal', () => {
  test('matching domains read as an official domain match', () => {
    const s = domainSignal({ website: 'https://testmasjid.ca', workEmail: 'imam@testmasjid.ca' });
    assert.equal(s.level, 'match');
    assert.match(s.label, /Official domain match/);
  });

  test('a subdomain still counts as a match', () => {
    assert.equal(domainSignal({
      website: 'testmasjid.ca', workEmail: 'imam@office.testmasjid.ca',
    }).level, 'match');
  });

  test('a consumer mailbox is flagged for manual verification, not refused', () => {
    // The requirement is explicit: never auto-reject. Plenty of real masjids
    // run on a donated Gmail account.
    const s = domainSignal({ website: 'testmasjid.ca', workEmail: 'themasjid@gmail.com' });
    assert.equal(s.level, 'public');
    assert.match(s.label, /Public email provider\. Manual verification recommended/);
    assert.match(s.detail, /not a reason to decline/i);
  });

  test('common consumer providers are recognised', () => {
    for (const d of ['gmail.com', 'outlook.com', 'yahoo.ca', 'icloud.com', 'proton.me']) {
      assert.ok(isPublicEmailProvider(d), `${d} should be recognised as a public provider`);
    }
    assert.equal(isPublicEmailProvider('testmasjid.ca'), false);
  });

  test('a mismatch says to ask rather than declaring fraud', () => {
    const s = domainSignal({ website: 'testmasjid.ca', workEmail: 'imam@othersite.org' });
    assert.equal(s.level, 'mismatch');
    assert.match(s.detail, /ordinary explanation/i);
  });

  test('missing data is reported as missing, never as a match', () => {
    assert.equal(domainSignal({ website: 'testmasjid.ca' }).level, 'unknown');
    assert.equal(domainSignal({ workEmail: 'imam@testmasjid.ca' }).level, 'unknown');
    assert.equal(domainSignal({}).level, 'unknown');
  });

  test('no signal ever carries a decision or a number', () => {
    // A numerical trust score was explicitly ruled out: it invites a reviewer
    // to stop reading.
    const cases = [
      { website: 'testmasjid.ca', workEmail: 'imam@testmasjid.ca' },
      { website: 'testmasjid.ca', workEmail: 'a@gmail.com' },
      {},
    ];
    for (const c of cases) {
      const s = domainSignal(c);
      assert.ok(!('score' in s), 'a signal must not carry a score');
      assert.ok(!('approve' in s) && !('reject' in s),
        'a signal must not carry a decision');
    }
  });
});

describe('the full signal panel', () => {
  test('an unconfirmed sign-in email is never silently omitted', () => {
    const signals = verificationSignals({}, {});
    assert.ok(signals.some((s) => /not confirmed/i.test(s.label)));
  });

  test('Firebase email confirmation is kept separate from organization verification', () => {
    // Section 4 of the requirement: confirming you own an inbox is not
    // evidence you run a masjid, and the reviewer must not read it that way.
    const signals = verificationSignals({}, { emailVerifiedAtSubmit: true });
    const s = signals.find((x) => /Sign-in email confirmed/.test(x.label));
    assert.match(s.detail, /says nothing about the organization/i);
  });

  test('a staff page and a document each become their own thing to check', () => {
    const signals = verificationSignals({}, {
      staffPageUrl: 'https://testmasjid.ca/staff', documentPath: 'orgs/x/doc.pdf',
    });
    assert.ok(signals.some((s) => /Staff or contact page/.test(s.label)));
    assert.ok(signals.some((s) => /Supporting document/.test(s.label)));
  });

  test('the document signal says it is administrator-only', () => {
    const s = verificationSignals({}, { documentPath: 'orgs/x/doc.pdf' })
      .find((x) => /Supporting document/.test(x.label));
    assert.match(s.detail, /Private to platform administrators/);
  });

  test('offered verification routes are listed, not counted towards anything', () => {
    const signals = verificationSignals({}, {
      verificationMethods: ['work_email', 'phone_callback'],
    });
    const s = signals.find((x) => /routes offered/.test(x.label));
    assert.match(s.detail, /email address at the organization/);
    assert.match(s.detail, /call the organization/);
  });
});

describe('labels', () => {
  test('"Other" falls back to what the applicant typed', () => {
    assert.equal(roleLabel('other', 'Volunteer funeral coordinator'),
      'Volunteer funeral coordinator');
    assert.equal(roleLabel('other', '  '), 'Other');
  });

  test('every listed role has a label', () => {
    for (const r of APPLICANT_ROLES) assert.ok(roleLabel(r.value).trim());
  });

  test('an unknown method is shown as itself rather than blank', () => {
    assert.equal(methodLabel('made_up'), 'made_up');
  });
});

describe('the signals are computed, not stored', () => {
  const rules = readFileSync('firestore.rules', 'utf8');

  test('no client-writable field records a verification verdict', () => {
    // A boolean the browser wrote is forgeable by anyone willing to edit
    // JavaScript. The reviewer's panel derives everything from website and
    // workEmail at read time instead.
    for (const forged of ['domainMatch', 'trustScore', 'verified:', 'isTrusted']) {
      assert.ok(!rules.includes(forged),
        `${forged} must not be a stored, client-writable field`);
    }
  });

  test('the application key allowlist holds no verdict field', () => {
    const block = rules.slice(rules.indexOf('function applicationKeys()'));
    const keys = block.slice(0, block.indexOf('}'));
    for (const forged of ['Status', 'Score', 'approved', 'trust']) {
      assert.ok(!keys.includes(forged), `applicationKeys must not contain ${forged}`);
    }
  });
});

describe('spotting an organization that is already registered', () => {
  const existing = [
    { id: 'a', name: 'Al-Noor Islamic Centre', city: 'Toronto', lat: 43.6532, lng: -79.3832 },
    { id: 'b', name: 'Masjid Al-Huda', city: 'Toronto', lat: 43.7000, lng: -79.4000 },
    { id: 'c', name: 'Al-Noor Masjid', city: 'Vancouver', lat: 49.2827, lng: -123.1207 },
  ];

  test('the same masjid under a differently arranged name is flagged', () => {
    // Two records for one masjid means families follow the wrong one and the
    // alert never arrives.
    const hits = findPossibleDuplicates(
      { name: 'Masjid Al-Noor', city: 'Toronto' }, existing);
    assert.deepEqual(hits.map((o) => o.id), ['a']);
  });

  test('a genuinely different masjid in the same city is left alone', () => {
    assert.equal(findPossibleDuplicates(
      { name: 'Masjid Ar-Rahma', city: 'Toronto' }, existing).length, 0);
  });

  test('the same name in another city is not a duplicate', () => {
    // Al-Noor in Toronto and Al-Noor in Vancouver really are different masjids.
    const hits = findPossibleDuplicates(
      { name: 'Masjid Al-Noor', city: 'Toronto' }, existing);
    assert.ok(!hits.some((o) => o.id === 'c'));
  });

  test('an address at effectively the same spot is flagged whatever it is called', () => {
    const hits = findPossibleDuplicates(
      { name: 'Something Else Entirely', city: 'Etobicoke', lat: 43.6533, lng: -79.3833 },
      existing);
    assert.deepEqual(hits.map((o) => o.id), ['a']);
  });

  test('an organization does not flag itself when its own details are edited', () => {
    assert.equal(findPossibleDuplicates(
      { id: 'a', name: 'Al-Noor Islamic Centre', city: 'Toronto', lat: 43.6532, lng: -79.3832 },
      existing).length, 0);
  });

  test('the generic half of a name is not what gets compared', () => {
    // Nearly every masjid is an "Islamic Centre" somewhere. Matching on that
    // would flag every registration in the city and the warning would be
    // ignored, which is worse than not having one.
    assert.deepEqual(nameTokens('The Islamic Centre of Greater Toronto'),
      ['greater', 'toronto']);
    assert.equal(namesLookAlike('Islamic Centre of Toronto', 'Islamic Society of Ottawa'), false);
  });

  test('a name of nothing but generic words never matches anything', () => {
    assert.equal(namesLookAlike('Islamic Centre', 'Masjid'), false);
  });

  test('nothing here decides anything', () => {
    // The requirement is a warning with a route to "request access", never a
    // block: a real masjid with a similar name must still be able to register.
    const hits = findPossibleDuplicates({ name: 'Masjid Al-Noor', city: 'Toronto' }, existing);
    assert.ok(Array.isArray(hits), 'the result is a list to show, not a verdict');
  });
});
