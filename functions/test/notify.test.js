// Notification logic.
//
// Two failure modes matter more than the rest: telling people about something
// they should not hear about, and putting private information into a message
// delivered to devices we know nothing about. Both are covered here.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  kindOfChange, buildMessage, topicsForNotice, publicProjection, formatTime, KIND,
} from '../lib/notify.js';
import { cellTopicsForHash, isValidTopic, cellTopic, orgTopic } from '../lib/topics.js';

const notice = (over = {}) => ({
  orgId: 'org1',
  orgName: 'Test Masjid',
  status: 'published',
  version: 1,
  janazahAt: new Date('2026-12-01T18:30:00Z'),
  timeZone: 'America/Toronto',
  prayerLocation: {
    name: 'Main Hall', address: '100 Example St', lat: 43.6532, lng: -79.3832, cell: 'dpz83',
  },
  ...over,
});

describe('kindOfChange', () => {
  test('a notice published outright notifies', () => {
    assert.equal(kindOfChange(null, notice()), KIND.PUBLISHED);
  });

  test('a draft becoming published notifies', () => {
    assert.equal(
      kindOfChange(notice({ status: 'draft' }), notice()), KIND.PUBLISHED);
  });

  test('a draft saved but not published notifies nobody', () => {
    assert.equal(kindOfChange(null, notice({ status: 'draft' })), null);
    assert.equal(
      kindOfChange(notice({ status: 'draft' }), notice({ status: 'draft', version: 2 })), null);
  });

  test('a correction notifies as an update', () => {
    assert.equal(
      kindOfChange(notice(), notice({ version: 2 })), KIND.UPDATED);
  });

  test('a write that does not advance the version notifies nobody', () => {
    // Guards against a stray field write re-notifying everyone.
    assert.equal(kindOfChange(notice(), notice()), null);
  });

  test('cancelling a published notice notifies', () => {
    assert.equal(
      kindOfChange(notice(), notice({ status: 'cancelled', version: 2 })), KIND.CANCELLED);
  });

  test('cancelling something never published notifies nobody', () => {
    assert.equal(
      kindOfChange(notice({ status: 'draft' }), notice({ status: 'cancelled', version: 2 })),
      null);
  });

  test('a second write to an already cancelled notice notifies nobody', () => {
    assert.equal(
      kindOfChange(notice({ status: 'cancelled' }), notice({ status: 'cancelled', version: 3 })),
      null);
  });

  test('a deletion notifies nobody', () => {
    assert.equal(kindOfChange(notice(), null), null);
  });
});

describe('cell topics', () => {
  test('a notice publishes to every precision of its own cell', () => {
    assert.deepEqual(cellTopicsForHash('dpz83'),
      ['cell_dp', 'cell_dpz', 'cell_dpz8', 'cell_dpz83']);
  });

  test('a shorter cell yields fewer topics', () => {
    assert.deepEqual(cellTopicsForHash('dpz'), ['cell_dp', 'cell_dpz']);
  });

  test('rubbish yields no topics rather than a malformed one', () => {
    for (const bad of ['', null, undefined, 'ail o', 'DPZ83', 'dpz8!', 42]) {
      assert.deepEqual(cellTopicsForHash(bad), [], String(bad));
    }
  });

  test('topics include the masjid so followers are reached', () => {
    const topics = topicsForNotice(notice());
    assert.ok(topics.includes(orgTopic('org1')));
    assert.ok(topics.includes(cellTopic('dpz83')));
  });

  test('a notice with no cell still reaches its followers', () => {
    const topics = topicsForNotice(notice({ prayerLocation: { lat: 1, lng: 1 } }));
    assert.deepEqual(topics, [orgTopic('org1')]);
  });
});

describe('isValidTopic', () => {
  test('accepts our own topic shapes', () => {
    assert.ok(isValidTopic('cell_dp'));
    assert.ok(isValidTopic('cell_dpz83'));
    assert.ok(isValidTopic('org_abc123'));
  });

  test('rejects anything else', () => {
    const bad = [
      'cell_d',                 // below the coarsest precision
      'cell_dpz831',            // finer than we ever subscribe to
      'cell_dpza',              // a, i, l, o are not in the geohash alphabet
      'cell_',
      'org_',
      'org_../../etc',
      'all',
      'cell_dp; DROP',
      '',
      null,
      42,
      `org_${'x'.repeat(200)}`,
    ];
    for (const topic of bad) assert.equal(isValidTopic(topic), false, String(topic));
  });
});

describe('buildMessage', () => {
  const opts = { origin: 'https://example.web.app' };

  test('links to the notice and tags by its id', () => {
    const msg = buildMessage('n1', notice(), KIND.PUBLISHED, opts);
    assert.equal(msg.webpush.fcmOptions.link, 'https://example.web.app/n/n1');
    assert.equal(msg.webpush.notification.tag, 'janazah-n1');
    assert.equal(msg.data.noticeId, 'n1');
  });

  test('withholds the name unless it was approved for sharing', () => {
    const withheld = buildMessage(
      'n1', notice({ deceasedName: 'A Name', showDeceasedName: false }), KIND.PUBLISHED, opts);
    assert.ok(!withheld.webpush.notification.title.includes('A Name'));
    assert.ok(!JSON.stringify(withheld).includes('A Name'));

    const shared = buildMessage(
      'n1', notice({ deceasedName: 'A Name', showDeceasedName: true }), KIND.PUBLISHED, opts);
    assert.ok(shared.webpush.notification.title.includes('A Name'));
  });

  test('says what happened for each kind', () => {
    const t = (kind, n = notice()) =>
      buildMessage('n1', n, kind, opts).webpush.notification.title;
    assert.match(t(KIND.PUBLISHED), /^Janazah/);
    assert.match(t(KIND.UPDATED), /updated/i);
    assert.match(t(KIND.CANCELLED, notice({ status: 'cancelled' })), /cancelled/i);
  });

  test('a cancellation carries its reason', () => {
    const msg = buildMessage('n1',
      notice({ status: 'cancelled', cancelReason: 'Moved to another masjid.' }),
      KIND.CANCELLED, opts);
    assert.match(msg.webpush.notification.body, /Moved to another masjid/);
  });

  test('refuses to send anything carrying a private-looking field', () => {
    // Rules already forbid these on the public document. This is the second
    // gate, because a notification cannot be recalled once delivered.
    assert.throws(
      () => buildMessage('n1', notice({ familyContactPhone: '555-0100' }), KIND.PUBLISHED, opts),
      /refusing to notify/);
    assert.throws(
      () => buildMessage('n1', notice({ internalNotes: 'private' }), KIND.PUBLISHED, opts),
      /refusing to notify/);
  });

  test('renotifies for a correction but not for a first publication', () => {
    assert.equal(
      buildMessage('n1', notice(), KIND.PUBLISHED, opts).webpush.notification.renotify, false);
    assert.equal(
      buildMessage('n1', notice(), KIND.UPDATED, opts).webpush.notification.renotify, true);
  });
});

describe('formatTime', () => {
  test('renders in the notice’s own zone, not the server’s', () => {
    const toronto = formatTime(notice());
    const vancouver = formatTime(notice({ timeZone: 'America/Vancouver' }));
    assert.notEqual(toronto, vancouver);
    assert.match(toronto, /1:30/);   // 18:30 UTC is 13:30 in Toronto
    assert.match(vancouver, /10:30/);
  });

  test('appends a prayer-relative label when there is one', () => {
    assert.match(formatTime(notice({ timeLabel: 'After Dhuhr' })), /\(After Dhuhr\)$/);
  });

  test('survives a missing or unusable time', () => {
    assert.equal(formatTime({ janazahAt: null }), '');
    assert.equal(formatTime({ janazahAt: 'not a date' }), '');
  });
});

describe('publicProjection', () => {
  test('keeps public fields and drops everything else', () => {
    const projected = publicProjection({
      ...notice(),
      familyContactPhone: '555-0100',
      internalNotes: 'private',
      createdBy: 'uid',
    });
    assert.equal(projected.orgName, 'Test Masjid');
    assert.equal(projected.familyContactPhone, undefined);
    assert.equal(projected.internalNotes, undefined);
    assert.equal(projected.createdBy, undefined);
  });
});
