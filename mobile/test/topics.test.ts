// Which topics a device subscribes to.
//
// Every failure here is silent. A device subscribed to the wrong cells does
// not error; it simply never hears about a funeral two streets away. So these
// check the three agreements this module depends on: with the web client,
// with the Cloud Function that validates a subscription, and with the Cloud
// Function that decides where a notice is published.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { desiredTopics, topicDelta, cellTopic, orgTopic } from '../src/lib/topics.ts';
import type { LocationPrefs, Point } from '../src/lib/nearby.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const TORONTO: Point = { lat: 43.6532, lng: -79.3832, at: Date.now() };

const prefs = (over: Partial<LocationPrefs> = {}): LocationPrefs => ({
  enabled: true,
  radiusKm: 10,
  alertScope: 'nearby',
  followAlerts: true,
  ...over,
});

test('a followed masjid is a topic, wherever it is', () => {
  const topics = desiredTopics(prefs({ enabled: false }), null, ['org-a', 'org-b']);
  assert.deepEqual(topics, ['org_org-a', 'org_org-b']);
});

test('turning followed-masjid alerts off unsubscribes rather than filters', () => {
  // The device stops being told, which is the only version of "off" that is
  // actually true. Discarding on arrival would still have cost the reader a
  // buzz and a look at their phone.
  const topics = desiredTopics(
    prefs({ enabled: false, followAlerts: false }), null, ['org-a'],
  );
  assert.deepEqual(topics, []);
});

test('narrowing the scope to follows drops every area topic', () => {
  const topics = desiredTopics(prefs({ alertScope: 'follows' }), TORONTO, ['org-a']);
  assert.deepEqual(topics, ['org_org-a']);
});

test('an area subscription needs both the feature on and a position', () => {
  assert.deepEqual(desiredTopics(prefs(), null, []), []);
  assert.deepEqual(desiredTopics(prefs({ enabled: false }), TORONTO, []), []);
  assert.ok(desiredTopics(prefs(), TORONTO, []).length > 0);
});

test('every topic this device asks for is one the server would accept', () => {
  // functions/lib/topics.js rejects anything else outright, so a mismatch is
  // a subscription call that fails rather than a wrong subscription.
  const topics = desiredTopics(prefs({ radiusKm: 50 }), TORONTO, ['org-a', 'Org_B-1']);
  const GEOHASH = /^[0-9bcdefghjkmnpqrstuvwxyz]+$/;
  const ORG_ID = /^[A-Za-z0-9_-]{1,64}$/;

  for (const topic of topics) {
    assert.ok(topic.length <= 80, `${topic} is longer than the server allows`);
    if (topic.startsWith('cell_')) {
      const hash = topic.slice(5);
      assert.ok(hash.length >= 2 && hash.length <= 5, `${topic} is outside the grid`);
      assert.ok(GEOHASH.test(hash), `${topic} is not a geohash`);
    } else {
      assert.ok(topic.startsWith('org_'), `${topic} is neither a cell nor an org`);
      assert.ok(ORG_ID.test(topic.slice(4)), `${topic} has an unusable id`);
    }
  }
});

test('the cell set stays small enough to subscribe to in one call', () => {
  // The server caps a single call at 60 changes, and the device sends them in
  // chunks of 50. A radius that produced hundreds of cells would turn one
  // subscription into a long sequence of round trips on a phone.
  for (const radiusKm of [5, 10, 20, 50, 0]) {
    const topics = desiredTopics(prefs({ radiusKm }), TORONTO, []);
    assert.ok(topics.length <= 40,
      `radius ${radiusKm} produced ${topics.length} topics`);
  }
});

test('the grid matches the one the Cloud Function publishes to', () => {
  // A device subscribed at a precision the function never publishes to hears
  // nothing at all, and nothing anywhere would report it.
  const server = readFileSync(
    resolve(repoRoot, 'functions/lib/topics.js'), 'utf8',
  );
  const min = server.match(/MIN_CELL_PRECISION\s*=\s*(\d+)/);
  const max = server.match(/MAX_CELL_PRECISION\s*=\s*(\d+)/);
  assert.ok(min && max, 'the precision range is not declared on the server');

  const topics = desiredTopics(prefs({ radiusKm: 5 }), TORONTO, []);
  for (const topic of topics.filter((t) => t.startsWith('cell_'))) {
    const length = topic.slice(5).length;
    assert.ok(length >= Number(min![1]) && length <= Number(max![1]),
      `${topic} is at a precision the server never publishes to`);
  }
});

test('the topic names match the server\'s, character for character', () => {
  const server = readFileSync(
    resolve(repoRoot, 'functions/lib/topics.js'), 'utf8',
  );
  assert.match(server, /cellTopic = \(hash\) => `cell_\$\{hash\}`/);
  assert.match(server, /orgTopic = \(orgId\) => `org_\$\{orgId\}`/);
  assert.equal(cellTopic('dpz83'), 'cell_dpz83');
  assert.equal(orgTopic('abc'), 'org_abc');
});

test('moving a little sends a difference, not a whole re-subscribe', () => {
  const before = ['cell_dpz8', 'cell_dpz9', 'org_a'];
  const after = ['cell_dpz9', 'cell_dpzb', 'org_a'];
  assert.deepEqual(topicDelta(before, after), {
    subscribe: ['cell_dpzb'],
    unsubscribe: ['cell_dpz8'],
  });
});

test('no change is no call at all', () => {
  const same = ['cell_dpz8', 'org_a'];
  assert.deepEqual(topicDelta(same, same), { subscribe: [], unsubscribe: [] });
});

test('the channel id matches the one the server sends on', () => {
  // Naming a channel Android does not know drops every message into the
  // default one, at whatever importance the system chose, with no error
  // anywhere.
  const server = readFileSync(resolve(repoRoot, 'functions/lib/notify.js'), 'utf8');
  const channel = server.match(/ANDROID_CHANNEL\s*=\s*'([^']+)'/);
  assert.ok(channel, 'the server does not declare a channel');

  const client = readFileSync(
    resolve(here, '../src/lib/notifications.ts'), 'utf8',
  );
  assert.match(client, new RegExp(`CHANNEL_ID = '${channel![1]}'`),
    'the app creates a different channel from the one the server sends on');
});

test('the status bar icon the server names is one the build actually produces', () => {
  // functions/lib/notify.js names a drawable. If the expo-notifications
  // plugin is not configured with an icon, that drawable does not exist and
  // Android falls back to a grey square, which is what a broken notification
  // looks like to a reader.
  //
  // Verified against a real prebuild: the plugin generates
  // res/drawable-*/notification_icon.png from the configured file.
  const server = readFileSync(resolve(repoRoot, 'functions/lib/notify.js'), 'utf8');
  const icon = server.match(/icon:\s*'([^']+)'/);
  assert.ok(icon, 'the server does not name a status bar icon');
  assert.equal(icon![1], 'notification_icon',
    'the expo-notifications plugin generates this exact drawable name');

  const config = readFileSync(resolve(here, '../app.config.ts'), 'utf8');
  assert.match(config, /'expo-notifications'[\s\S]{0,200}notification-icon\.png/,
    'expo-notifications must be configured with an icon or no drawable exists');
});
